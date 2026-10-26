// SPDX-License-Identifier: GPL-2.0-or-later

import assert from "node:assert/strict";
import test from "node:test";

import { choresEarned, dailyOperation, dayNumber, resultOf, rewardWithStreak } from "../server/daily.js";
import { content, withServer } from "./support.js";

const NOON = Date.UTC(2026, 9, 26, 12);

async function signedIn(call, connect, name = "Anna") {
  const signed = await call("/api/signup", { method: "POST", body: { name, password: "a good password" } });
  const client = await connect(signed.body.token);
  client.hello();
  await client.next("welcome");
  return { client, token: signed.body.token };
}

// Play the day's operation to a win (the objectives are done at once, as if the squad had done them) and return what was said.
async function winToday({ client, server, advance }) {
  client.send({ t: "create", mode: "daily" });
  const start = await client.next("start");
  const room = server.rooms.get(start.room);
  advance(1000);
  for (const objective of room.world.objectives) objective.complete = true;
  advance(200);
  return { start, room, end: await client.next("end") };
}

test("the day's page needs no sign-in, says what the day is, and counts down to the next", async () => {
  await withServer(async ({ call }) => {
    const page = (await call("/api/daily")).body;
    const operation = dailyOperation(content, dayNumber(NOON));
    assert.deepEqual([page.date, page.mission, page.name], ["2026-10-26", operation.mission, operation.name]);
    assert.deepEqual(page.chores.map((chore) => chore.id), operation.chores.map((chore) => chore.id));
    assert.ok(page.chores.every((chore) => chore.done === false && chore.reward > 0));
    assert.equal(page.resetsIn, 12 * 3600);
    assert.deepEqual([page.boards.today, page.you], [[], null], "no board yet, and nobody signed in");
  }, { clock: () => NOON });
});

test("the daily operation needs a signed-in player, and everyone gets the same operation and seed", async () => {
  await withServer(async ({ call, connect }) => {
    const guest = await connect();
    guest.hello();
    await guest.next("welcome");
    guest.send({ t: "create", mode: "daily" });
    assert.match((await guest.next("error")).message, /Sign in/);
    const one = await signedIn(call, connect, "Anna");
    const two = await signedIn(call, connect, "Ben");
    one.client.send({ t: "create", mode: "daily" });
    two.client.send({ t: "create", mode: "daily" });
    const [first, second] = [await one.client.next("start"), await two.client.next("start")];
    const operation = dailyOperation(content, dayNumber(NOON));
    assert.deepEqual([first.mission, first.seed], [operation.mission, operation.seed]);
    assert.deepEqual([second.mission, second.seed], [operation.mission, operation.seed]);
    assert.notEqual(first.room, second.room, "each plays on their own");
  }, { clock: () => NOON });
});

test("winning scores the run, pays the chores it earned once, ranks the player and keeps the run", async () => {
  await withServer(async (context) => {
    const { call, connect, server, advance } = context;
    const anna = await signedIn(call, connect);
    const { start, room, end } = await winToday({ client: anna.client, server, advance });
    assert.equal(end.outcome, "success");
    assert.ok(end.daily.score > 0 && end.daily.score <= 10_000);
    const operation = dailyOperation(content, dayNumber(NOON));
    const expected = choresEarned(operation, resultOf(room.world, start.squad)).map((chore) => chore.id);
    assert.deepEqual(end.daily.chores.map((chore) => chore.id), expected);
    assert.ok(expected.length > 0, "a quick clean win earns something");
    assert.equal(end.daily.streak, 1);
    const paid = end.daily.chores.reduce((total, chore) => total + chore.reward, 0);
    const owed = operation.chores.filter((chore) => expected.includes(chore.id));
    assert.equal(paid, owed.reduce((total, chore) => total + rewardWithStreak(chore.reward, 1), 0));
    assert.equal(end.daily.funds, paid);
    assert.deepEqual([end.daily.rank, end.daily.players], [1, 1]);

    const page = (await call("/api/daily", { token: anna.token })).body;
    assert.deepEqual(page.chores.filter((chore) => chore.done).map((chore) => chore.id), expected);
    assert.equal(page.you.best.score, end.daily.score);
    assert.deepEqual([page.you.streak, page.you.funds], [1, paid]);
    assert.deepEqual(page.boards.today.map((row) => [row.rank, row.name, row.score]), [[1, "Anna", end.daily.score]]);
    assert.equal(page.boards.week.length, 1);

    // The run is kept, and anyone may fetch it to watch.
    const kept = (await call(`/api/run/${page.boards.today[0].run}`)).body;
    assert.equal(kept.name, "Anna");
    assert.equal(kept.recording.mission, operation.mission);
    assert.equal((await call("/api/run/99999")).status, 404);

    // Playing it again the same day scores again but pays no chore twice.
    advance(10);
    const again = await winToday({ client: anna.client, server, advance });
    assert.deepEqual(again.end.daily.chores, [], "already paid today");
    assert.equal(again.end.daily.funds, paid);
  }, { clock: () => NOON });
});

test("a lost operation scores nothing and pays nothing, and a day later the chores can be earned again", async () => {
  let clock = NOON;
  await withServer(async (context) => {
    const { call, connect, server, advance } = context;
    const anna = await signedIn(call, connect);
    anna.client.send({ t: "create", mode: "daily" });
    const start = await anna.client.next("start");
    const room = server.rooms.get(start.room);
    for (const unit of room.world.units.filter((item) => item.side === "team")) {
      unit.disabled = true;
      unit.health = 0;
    }
    advance(200);
    const end = await anna.client.next("end");
    assert.equal(end.outcome, "failure");
    assert.deepEqual([end.daily.score, end.daily.chores, end.daily.funds, end.daily.rank], [0, [], 0, null]);
    assert.deepEqual((await call("/api/daily", { token: anna.token })).body.boards.today, [], "a loss is not on the board");

    clock += 86_400_000;
    const next = await winToday({ client: anna.client, server, advance });
    assert.ok(next.end.daily.chores.length > 0, "a new day, new chores");
    assert.equal((await call("/api/daily", { token: anna.token })).body.date, "2026-10-27");
  }, { clock: () => clock });
});

test("a player who plays the day's operation twice is on the board once, with their best", async () => {
  await withServer(async (context) => {
    const { call, connect, server, advance } = context;
    const ben = await signedIn(call, connect, "Ben");
    const first = await winToday({ client: ben.client, server, advance });
    const second = await winToday({ client: ben.client, server, advance });
    const board = (await call("/api/daily")).body.boards.today;
    assert.equal(board.length, 1);
    assert.equal(board[0].score, Math.max(first.end.daily.score, second.end.daily.score));
  }, { clock: () => NOON });
});
