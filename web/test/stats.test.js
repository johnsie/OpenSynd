// SPDX-License-Identifier: GPL-2.0-or-later

import assert from "node:assert/strict";
import test from "node:test";

import {
  adjustLevel,
  clampLevel,
  cooldownMultiplier,
  defaultLevels,
  isValidLevel,
  levelPoints,
  pointsLeft,
  effectiveLevels,
  focusDrainPerSecond,
  isValidMeter,
  nextFocus,
  nextStamina,
  staminaDrainPerSecond,
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

test("brain fatigue only happens when Brain is turned up, and faster the higher it goes", () => {
  assert.equal(focusDrainPerSecond({ brain: 1 }), 0);
  assert.equal(focusDrainPerSecond({ brain: 3 }), 0);
  assert.ok(focusDrainPerSecond({ brain: 4 }) > 0);
  assert.ok(Math.abs(focusDrainPerSecond({ brain: 5 }) - 2 * focusDrainPerSecond({ brain: 4 })) < 1e-12);

  assert.equal(nextFocus(1, { brain: 3 }, 100), 1, "baseline Brain never tires");
  assert.ok(Math.abs(nextFocus(1, { brain: 4 }, 90)) < 1e-9, "Brain 4 empties in 90 s");
  assert.ok(Math.abs(nextFocus(1, { brain: 5 }, 45)) < 1e-9, "Brain 5 empties in 45 s");
  // Turning Brain back down lets the mind recover, slowly.
  const recovered = nextFocus(0.2, { brain: 2 }, 30);
  assert.ok(recovered > 0.2 && recovered < 0.6);
  assert.equal(nextFocus(undefined, { brain: 3 }, 1), 1);
});

test("fatigue takes levels off the bars but never below level 1", () => {
  const fresh = effectiveLevels({ speed: 4, brain: 5 }, 1, 1);
  assert.deepEqual(fresh, { speed: 4, brain: 5 });

  const half = effectiveLevels({ speed: 4, brain: 5 }, 0.5, 0.5);
  assert.deepEqual(half, { speed: 3, brain: 4 });

  const spent = effectiveLevels({ speed: 4, brain: 5 }, 0, 0);
  assert.deepEqual(spent, { speed: 2, brain: 3 });
  assert.deepEqual(effectiveLevels({ speed: 2, brain: 1 }, 0, 0), { speed: 1, brain: 1 });
  // The two meters are independent.
  assert.deepEqual(effectiveLevels({ speed: 3, brain: 3 }, 0, 1), { speed: 1, brain: 3 });
  assert.deepEqual(effectiveLevels(undefined, 1, 1), { speed: 3, brain: 3 });
});

test("a strong, rested operator beats the baseline and a spent one falls to it or below", () => {
  const rested = effectiveLevels({ speed: 5, brain: 5 }, 1, 1);
  const spent = effectiveLevels({ speed: 5, brain: 5 }, 0, 0);
  assert.ok(speedMultiplier(rested) > speedMultiplier(spent));
  assert.ok(cooldownMultiplier(rested) < cooldownMultiplier(spent));
  assert.ok(Math.abs(speedMultiplier(spent) - 1) < 1e-9);
  assert.ok(Math.abs(cooldownMultiplier(spent) - 1) < 1e-9);
  assert.equal(isValidMeter(0.5), true);
  assert.equal(isValidMeter(1.1), false);
  assert.equal(isValidMeter(NaN), false);
});

test("training points limit how far the bars can be raised together", () => {
  const levels = defaultLevels();
  assert.equal(levelPoints(levels), 6);
  assert.equal(pointsLeft(levels, 8), 2);

  let next = adjustLevel(levels, "speed", 1, 8);
  next = adjustLevel(next, "speed", 1, 8);
  assert.deepEqual(next, { speed: 5, brain: 3 });
  assert.equal(pointsLeft(next, 8), 0);

  // Out of points: Brain cannot go up until Legs comes down.
  assert.equal(adjustLevel(next, "brain", 1, 8), next);
  const traded = adjustLevel(adjustLevel(next, "speed", -1, 8), "brain", 1, 8);
  assert.deepEqual(traded, { speed: 4, brain: 4 });

  // Lowering always works, and no budget means no limit.
  assert.deepEqual(adjustLevel({ speed: 5, brain: 5 }, "brain", -1, 8), { speed: 5, brain: 4 });
  assert.deepEqual(adjustLevel({ speed: 5, brain: 4 }, "brain", 1), { speed: 5, brain: 5 });
});

test("cyborg heart and brain research slow the drains and speed the recovery", () => {
  const levels = defaultLevels();
  const baseline = nextStamina(1, levels, true, 30);
  const researched = nextStamina(1, levels, true, 30, { heart: 5 });
  assert.ok(researched > baseline, "a stronger heart tires slower");
  assert.ok(nextStamina(0, levels, false, 30, { heart: 5 }) > nextStamina(0, levels, false, 30));

  const strained = { speed: 3, brain: 5 };
  assert.ok(nextFocus(1, strained, 20, { brain: 5 }) > nextFocus(1, strained, 20));
  assert.ok(nextFocus(0, { speed: 3, brain: 2 }, 20, { brain: 5 }) > nextFocus(0, { speed: 3, brain: 2 }, 20));
});
