// SPDX-License-Identifier: GPL-2.0-or-later

import assert from "node:assert/strict";
import test from "node:test";

import {
  CHORES,
  choresEarned,
  dailyOperation,
  dayDate,
  dayNumber,
  resultOf,
  rewardWithStreak,
  scoreOf,
  streakOf,
} from "../server/daily.js";
import { hashPassword } from "../server/auth.js";
import { loadContent, makeWorld } from "../server/content.js";
import { openStore } from "../server/store.js";

const content = loadContent();

test("days are counted in UTC and have a date", () => {
  assert.equal(dayNumber(Date.UTC(2026, 9, 26, 23, 59, 59)), dayNumber(Date.UTC(2026, 9, 26, 0, 0, 1)));
  assert.equal(dayNumber(Date.UTC(2026, 9, 27)), dayNumber(Date.UTC(2026, 9, 26)) + 1);
  assert.equal(dayDate(dayNumber(Date.UTC(2026, 9, 26, 15))), "2026-10-26");
});

test("a day has one operation, one seed and three different chores, the same for everyone and every time", () => {
  const today = dayNumber(Date.UTC(2026, 9, 26));
  const first = dailyOperation(content, today);
  const again = dailyOperation(content, today);
  const summary = (operation) => [operation.mission, operation.seed, operation.chores.map((chore) => chore.id)];
  assert.deepEqual(summary(first), summary(again));
  assert.equal(new Set(first.chores.map((chore) => chore.id)).size, 3);
  assert.ok(content.pack.missions.includes(first.mission));
  assert.ok(first.name.length > 0 && first.seed > 0);
  const missions = new Set();
  const chores = new Set();
  for (let day = today; day < today + 60; day += 1) {
    const operation = dailyOperation(content, day);
    missions.add(operation.mission);
    for (const chore of operation.chores) chores.add(chore.id);
  }
  assert.ok(missions.size >= 20, `the operations vary over two months: ${missions.size}`);
  assert.equal(chores.size, CHORES.length, "every chore comes up");
});

test("a chore is earned by a win that does what it says, and only then", () => {
  const good = {
    outcome: "success",
    seconds: 100,
    lost: 0,
    squad: 4,
    spotted: 1,
    bystandersHarmed: 0,
    itemsLooted: 4,
    enemiesDisabled: 9,
    persuaded: 1,
    objectives: 3,
  };
  const byId = Object.fromEntries(CHORES.map((chore) => [chore.id, chore]));
  for (const chore of CHORES) assert.equal(chore.done(good), chore.id !== "survivor", `${chore.id} on a clean win`);
  assert.equal(byId.survivor.done({ ...good, lost: 2 }), true);
  assert.equal(byId.flawless.done({ ...good, lost: 1 }), false);
  assert.equal(byId.quick.done({ ...good, seconds: 300 }), false);
  assert.equal(byId.quiet.done({ ...good, spotted: 4 }), false);
  assert.equal(byId.gentle.done({ ...good, bystandersHarmed: 1 }), false);
  for (const chore of CHORES) assert.equal(chore.done({ ...good, outcome: "failure" }), false, `${chore.id} on a loss`);
  const operation = { chores: [byId.flawless, byId.quick, byId.survivor] };
  assert.deepEqual(choresEarned(operation, good).map((chore) => chore.id), ["flawless", "quick"]);
});

test("the score rewards a quick win with the whole squad, any win counts, and a loss scores nothing", () => {
  const win = { outcome: "success", seconds: 120, lost: 0 };
  assert.equal(scoreOf(win), Math.round(3000 + (5000 * 600) / 720));
  assert.ok(scoreOf({ ...win, seconds: 60 }) > scoreOf(win));
  assert.ok(scoreOf({ ...win, seconds: 900 }) > 0, "a slow win still scores");
  assert.ok(scoreOf({ ...win, lost: 1 }) < scoreOf(win));
  // The win in the game's own report: 13:49 with one operative lost.
  assert.ok(scoreOf({ outcome: "success", seconds: 829, lost: 1 }) > 3000);
  assert.equal(scoreOf({ ...win, outcome: "failure" }), 0);
  assert.equal(scoreOf({ ...win, outcome: "timeout" }), 0);
  assert.equal(scoreOf({ outcome: "success", seconds: 10_000, lost: 4 }), 500, "never below 500 for a win");
});

test("streaks count days in a row, forgive one missed day a week, and a long break ends them", () => {
  const set = (...days) => new Set(days);
  assert.equal(streakOf(set(), 10), 0);
  assert.equal(streakOf(set(10), 10), 1);
  assert.equal(streakOf(set(8, 9, 10), 10), 3);
  assert.equal(streakOf(set(8, 9), 10), 2, "today's chores are not done yet: yesterday's streak stands");
  assert.equal(streakOf(set(7, 8, 9), 10), 3);
  assert.equal(streakOf(set(7, 8, 10), 10), 3, "one day off is forgiven");
  assert.equal(streakOf(set(5, 6, 8, 9, 10), 10), 5, "a streak survives one forgiven day");
  assert.equal(streakOf(set(4, 5, 7, 8, 10), 10), 3, "but not two in a week");
  const long = set(...[1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15, 16, 18, 19, 20]);
  assert.equal(streakOf(long, 20), 18, "one a week is forgiven, so two a week apart both are");
  assert.equal(streakOf(set(8, 9), 20), 0, "a long break ends it");
  assert.equal(rewardWithStreak(1000, 0), 1000);
  assert.equal(rewardWithStreak(1000, 3), 1300);
  assert.equal(rewardWithStreak(1000, 30), 1500, "capped at half as much again");
});

test("how an operation went is read from the world", () => {
  const world = makeWorld(content, "missions/restore-relay.mission.json");
  const squad = world.units.filter((unit) => unit.side === "team").map((unit) => unit.id);
  world.units.find((unit) => unit.id === squad[0]).disabled = true;
  world.opStats.spotted = 2;
  world.opStats.civiliansHarmed = 1;
  world.outcome = "success";
  world.missionSeconds = 91.6;
  const result = resultOf(world, squad);
  const summary = [result.outcome, result.seconds, result.lost, result.squad, result.spotted, result.bystandersHarmed];
  assert.deepEqual(summary, ["success", 92, 1, 4, 2, 1]);
  assert.equal(resultOf({ ...world, outcome: "active" }, squad).outcome, "timeout");
});

test("the store keeps runs, ranks each player's best, and pays a chore only once", async () => {
  const store = openStore();
  const record = await hashPassword("a good password");
  const anna = store.createAccount("Anna", record);
  const ben = store.createAccount("Ben", record);
  const cleo = store.createAccount("Cleo", record);
  const run = (account, day, score, seconds = 100, lost = 0) =>
    store.recordRun({
      account: account.id,
      day,
      mode: "daily",
      mission: "m",
      seed: 1,
      outcome: score > 0 ? "success" : "failure",
      seconds,
      lost,
      score,
      recording: { commands: [] },
    });
  run(anna, 10, 8000);
  const best = run(anna, 10, 9000);
  run(anna, 10, 7000);
  run(ben, 10, 9000, 90);
  run(cleo, 10, 0);
  run(ben, 11, 9500);
  const board = store.board("daily", 10, 10);
  const ranked = board.map((row) => [row.rank, row.name, row.score]);
  assert.deepEqual(ranked, [[1, "Ben", 9000], [2, "Anna", 9000]], "ties go to the quicker; losses are not ranked");
  assert.equal(board[1].run, best);
  assert.deepEqual(store.board("daily", 10, 11).map((row) => [row.name, row.score]), [["Ben", 9500], ["Anna", 9000]], "a week's best");
  assert.equal(store.bestRun(anna.id, "daily", 10).score, 9000);
  assert.equal(store.bestRun(anna.id, "daily", 12), null);
  assert.equal(store.runRecording(best).recording.commands.length, 0);
  assert.equal(store.claimChore(anna.id, 10, "quick", 800), true);
  assert.equal(store.claimChore(anna.id, 10, "quick", 800), false, "once a day");
  assert.equal(store.claimChore(anna.id, 11, "quick", 800), true, "the next day it can be again");
  assert.equal(store.funds(anna.id), 1600);
  assert.deepEqual([...store.choreDays(anna.id)].sort(), [10, 11]);
  assert.deepEqual(store.choresOn(anna.id, 10), ["quick"]);
  store.deleteAccount(anna.id);
  assert.equal(store.board("daily", 10, 10).length, 1, "a deleted account's runs go with it");
});

test("scores kept under an older formula are worked out again, once", async () => {
  const { openStore } = await import("../server/store.js");
  const { scoreFrom } = await import("../server/daily.js");
  const store = openStore();
  const account = store.createAccount("Anna", { salt: "s", hash: "h" }).id;
  const record = (outcome, seconds, lost, score) =>
    store.recordRun({ account, day: 1, mode: "daily", mission: "m", seed: 1, outcome, seconds, lost, score, recording: {} });
  const won = record("success", 829, 1, 0);
  const lost = record("failure", 100, 4, 0);
  assert.equal(store.rescoreOnce(2, scoreFrom), true);
  const scores = Object.fromEntries(store.board("daily", 1, 1, 10).map((row) => [row.run, row.score]));
  const idOf = (run) => run.id ?? run;
  assert.equal(scores[idOf(won)], scoreFrom(829, 1));
  assert.equal(idOf(lost) in scores, false, "a loss stays unscored");
  assert.equal(store.rescoreOnce(2, scoreFrom), false, "not again");
  store.close();
});
