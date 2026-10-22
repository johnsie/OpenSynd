// SPDX-License-Identifier: GPL-2.0-or-later

import assert from "node:assert/strict";
import test from "node:test";

import {
  adjustLevel,
  clampLevel,
  cooldownMultiplier,
  defaultLevels,
  isValidLevel,
  maxCooldownMultiplier,
  speedMultiplier,
} from "../src/stats.js";

test("level 3 is the baseline and units without levels behave the same", () => {
  assert.deepEqual(defaultLevels(), { speed: 3, brain: 3 });
  assert.equal(speedMultiplier(defaultLevels()), 1);
  assert.equal(cooldownMultiplier(defaultLevels()), 1);
  assert.equal(speedMultiplier(undefined), 1);
  assert.equal(cooldownMultiplier(undefined), 1);
});

test("speed and brain scale in the right directions across the range", () => {
  assert.ok(Math.abs(speedMultiplier({ speed: 1 }) - 0.6) < 1e-9);
  assert.ok(Math.abs(speedMultiplier({ speed: 5 }) - 1.4) < 1e-9);
  assert.ok(Math.abs(cooldownMultiplier({ brain: 5 }) - 0.7) < 1e-9);
  assert.ok(Math.abs(cooldownMultiplier({ brain: 1 }) - 1.3) < 1e-9);
  assert.ok(Math.abs(maxCooldownMultiplier() - 1.3) < 1e-9);
});

test("levels are clamped to 1-5 and adjustments stop at the ends", () => {
  assert.equal(clampLevel(0), 1);
  assert.equal(clampLevel(9), 5);
  assert.equal(isValidLevel(3), true);
  assert.equal(isValidLevel(3.5), false);
  assert.equal(isValidLevel(6), false);

  const levels = defaultLevels();
  assert.deepEqual(adjustLevel(levels, "speed", 1), { speed: 4, brain: 3 });
  const capped = { speed: 5, brain: 1 };
  assert.equal(adjustLevel(capped, "speed", 1), capped);
  assert.equal(adjustLevel(capped, "brain", -1), capped);
  assert.equal(adjustLevel(capped, "other", 1), capped);
  assert.deepEqual(adjustLevel(capped, "brain", 1), { speed: 5, brain: 2 });
});
