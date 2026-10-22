// SPDX-License-Identifier: GPL-2.0-or-later

import assert from "node:assert/strict";
import test from "node:test";

import {
  EFFECT_DURATIONS,
  addEffect,
  advanceEffects,
  createEffects,
  effectProgress,
  walkBob,
} from "../src/effects.js";

test("effects age and expire after their duration", () => {
  const effects = createEffects();
  addEffect(effects, "pulse", { fromId: "a", toId: "b" });
  advanceEffects(effects, EFFECT_DURATIONS.pulse / 2);
  assert.equal(effects.length, 1);
  assert.equal(effectProgress(effects[0]), 0.5);
  advanceEffects(effects, EFFECT_DURATIONS.pulse);
  assert.equal(effects.length, 0);
});

test("unknown effect types are rejected", () => {
  assert.throws(() => addEffect(createEffects(), "explosion", {}), /Unknown effect/);
});

test("walk bob is still when idle or when reduced motion is on", () => {
  assert.equal(walkBob(1, false, false), 0);
  assert.equal(walkBob(1, true, true), 0);
  assert.ok(walkBob(0.2, true, false) <= 0);
});
