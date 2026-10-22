// SPDX-License-Identifier: GPL-2.0-or-later

import assert from "node:assert/strict";
import test from "node:test";

import { ACHIEVEMENTS, newStats, newlyEarned } from "../src/achievements.js";

const ids = (list) => list.map((achievement) => achievement.id);

test("a fresh operation has earned nothing", () => {
  assert.deepEqual(newlyEarned(newStats(6), []), []);
});

test("achievements unlock as the operation goes on and pay only once", () => {
  const stats = newStats(2);
  stats.objectivesCompleted = 1;
  stats.watchersDisabled = 1;
  assert.deepEqual(ids(newlyEarned(stats, [])), ["first-signal", "first-contact"]);
  assert.deepEqual(ids(newlyEarned(stats, ["first-signal"])), ["first-contact"]);

  stats.itemsLooted = 1;
  stats.watchersDisabled = 2;
  assert.deepEqual(
    ids(newlyEarned(stats, ["first-signal", "first-contact"])),
    ["scavenger", "clear-the-streets"],
  );
});

test("finish-line achievements need a successful outcome", () => {
  const stats = newStats(3);
  stats.seconds = 200;
  assert.deepEqual(ids(newlyEarned(stats, [])), [], "an unfinished operation earns no finish awards");

  stats.outcome = "success";
  assert.deepEqual(ids(newlyEarned(stats, [])), ["whole-squad", "quick-work", "ghost", "clean-hands"]);

  stats.operatorsDisabled = 1;
  stats.spotted = 2;
  stats.civiliansHarmed = 1;
  stats.seconds = 500;
  assert.deepEqual(ids(newlyEarned(stats, [])), []);

  const failed = { ...newStats(3), outcome: "failure" };
  assert.deepEqual(ids(newlyEarned(failed, [])), []);
});

test("every achievement has a name, description and a positive reward", () => {
  assert.ok(ACHIEVEMENTS.length >= 6);
  for (const achievement of ACHIEVEMENTS) {
    assert.ok(achievement.name && achievement.description);
    assert.ok(achievement.reward > 0);
  }
  assert.equal(new Set(ACHIEVEMENTS.map((achievement) => achievement.id)).size, ACHIEVEMENTS.length);
});

test("clearing the streets needs at least one watcher to exist", () => {
  const stats = newStats(0);
  assert.deepEqual(ids(newlyEarned(stats, [])), []);
});

test("clean hands needs a win with no civilian or police casualties", () => {
  const stats = newStats(3);
  stats.outcome = "success";
  assert.ok(ids(newlyEarned(stats, [])).includes("clean-hands"));
  stats.civiliansHarmed = 1;
  assert.ok(!ids(newlyEarned(stats, [])).includes("clean-hands"));
  stats.civiliansHarmed = 0;
  stats.policeHarmed = 1;
  assert.ok(!ids(newlyEarned(stats, [])).includes("clean-hands"));
});
