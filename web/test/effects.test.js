// SPDX-License-Identifier: GPL-2.0-or-later

import assert from "node:assert/strict";
import test from "node:test";

import {
  EFFECT_DURATIONS,
  addEffect,
  advanceEffects,
  createEffects,
  RECOIL_SECONDS,
  effectProgress,
  facingVector,
  recoilOffset,
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

test("each of the eight facings maps to a distinct screen direction", () => {
  const near = (value, expected) => assert.ok(Math.abs(value - expected) < 1e-9, `${value} vs ${expected}`);
  near(facingVector(0).x, 0);
  near(facingVector(0).y, 1);
  near(facingVector(2).x, 1);
  near(facingVector(2).y, 0);
  near(facingVector(4).y, -1);
  near(facingVector(6).x, -1);
  const unique = new Set([...Array(8).keys()].map((index) => facingVector(index).x.toFixed(3) + facingVector(index).y.toFixed(3)));
  assert.equal(unique.size, 8);
});

test("a shot kicks the unit back against its facing and settles within the recoil time", () => {
  const atShot = recoilOffset(10, 10, 2, 3);
  assert.ok(Math.abs(atShot.x + 3) < 1e-9 && Math.abs(atShot.y) < 1e-9, "facing right: kicked left");
  const halfway = recoilOffset(10 + RECOIL_SECONDS / 2, 10, 2, 3);
  assert.ok(Math.abs(halfway.x + 1.5) < 1e-9);
  assert.deepEqual(recoilOffset(10 + RECOIL_SECONDS + 0.01, 10, 2, 3), { x: 0, y: 0 });
  assert.deepEqual(recoilOffset(10, undefined, 2), { x: 0, y: 0 }, "never fired");
  assert.deepEqual(recoilOffset(10, 10, 2, 3, true), { x: 0, y: 0 }, "reduced motion: no kick");
  assert.deepEqual(recoilOffset(5, 10, 2, 3), { x: 0, y: 0 }, "a shot in the future is ignored");
});

test("a muzzle flash is a very short effect", () => {
  const effects = createEffects();
  addEffect(effects, "muzzle", { unitId: "a" });
  assert.ok(EFFECT_DURATIONS.muzzle < 0.15);
  advanceEffects(effects, EFFECT_DURATIONS.muzzle + 0.001);
  assert.equal(effects.length, 0);
});
