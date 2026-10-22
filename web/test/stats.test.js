// SPDX-License-Identifier: GPL-2.0-or-later

import assert from "node:assert/strict";
import test from "node:test";

import {
  adjustLevel,
  clampLevel,
  cooldownMultiplier,
  defaultLevels,
  isValidLevel,
  isValidStamina,
  nextStamina,
  staminaDrainPerSecond,
  staminaSpeedFactor,
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

test("walking drains stamina, resting recovers it slowly, and Legs slow the drain", () => {
  const levels = defaultLevels();
  assert.ok(Math.abs(nextStamina(1, levels, true, 60)) < 1e-9);
  let stamina = 1;
  for (let second = 0; second < 20; second += 1) stamina = nextStamina(stamina, levels, true, 1);
  assert.ok(Math.abs(stamina - (1 - 20 / 60)) < 1e-9);

  // Recovery is slower than the drain: 20 s of rest wins back about a quarter.
  const rested = nextStamina(stamina, levels, false, 20);
  assert.ok(rested > stamina && rested - stamina < 0.3);
  assert.ok(nextStamina(0, levels, false, 70) >= 1 - 1e-9);
  assert.equal(nextStamina(0.99, levels, false, 100), 1);
  assert.equal(nextStamina(0.01, levels, true, 100), 0);

  assert.ok(staminaDrainPerSecond({ speed: 5 }) < staminaDrainPerSecond({ speed: 3 }));
  assert.ok(staminaDrainPerSecond({ speed: 1 }) > staminaDrainPerSecond({ speed: 3 }));
});

test("tired legs walk slower but never stop", () => {
  assert.equal(staminaSpeedFactor(1), 1);
  assert.ok(Math.abs(staminaSpeedFactor(0) - 0.5) < 1e-9);
  assert.ok(staminaSpeedFactor(0.5) > staminaSpeedFactor(0.2));
  assert.equal(staminaSpeedFactor(undefined), 1);
  assert.equal(staminaSpeedFactor(-3), staminaSpeedFactor(0));
  assert.equal(isValidStamina(0.5), true);
  assert.equal(isValidStamina(1.1), false);
  assert.equal(isValidStamina(NaN), false);
});
