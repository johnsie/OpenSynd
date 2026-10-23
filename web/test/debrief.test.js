// SPDX-License-Identifier: GPL-2.0-or-later

import assert from "node:assert/strict";
import test from "node:test";

import { accuracyText, killsText, newDebriefCounts, recordKill, recordShot, totals } from "../src/debrief.js";

test("shots and hits are counted per operator and add up", () => {
  const counts = newDebriefCounts();
  recordShot(counts, "a", true);
  recordShot(counts, "a", false);
  recordShot(counts, "a", true);
  recordShot(counts, "b", false);
  assert.deepEqual(counts.shooters.a, { shots: 3, hits: 2, kills: 0 });
  assert.deepEqual(totals(counts), { shots: 4, hits: 2 });
});

test("accuracy reads as hits over shots, and says so when nothing was fired", () => {
  assert.equal(accuracyText(12, 7), "7 of 12 shots (58%)");
  assert.equal(accuracyText(1, 1), "1 of 1 shots (100%)");
  assert.equal(accuracyText(0, 0), "no shots");
});

test("kills are counted by kind, most numerous first, with the right plural", () => {
  const counts = newDebriefCounts();
  assert.equal(killsText(counts), "");
  recordKill(counts, "a", "guard");
  recordKill(counts, "a", "enemy-agent");
  recordKill(counts, "b", "enemy-agent");
  assert.equal(counts.shooters.a.kills, 2);
  assert.equal(killsText(counts), "2 enemy agents, 1 guard");
});
