// SPDX-License-Identifier: GPL-2.0-or-later

import assert from "node:assert/strict";
import test from "node:test";

import { BURN_RUN_SECONDS, SMOULDER_SECONDS, VAPORIZE_SECONDS, deathKind, deathLook } from "../src/death.js";

test("the cause of death and the chest decide which death a person gets", () => {
  assert.equal(deathKind({}), "shot");
  assert.equal(deathKind({ lastDamageType: "bullet" }), "shot");
  assert.equal(deathKind({ lastDamageType: "collision" }), "shot");
  assert.equal(deathKind({ lastDamageType: "beam" }), "laser");
  assert.equal(deathKind({ lastDamageType: "burn" }), "burn");
  assert.equal(deathKind({ lastDamageType: "explosion" }), "burn");
  assert.equal(deathKind({ lastDamageType: "explosion", upgrades: { chest: 2 } }), "shot", "a version 2 chest survives the fire");
});

test("a shot person falls and then lies", () => {
  assert.equal(deathLook("shot", 0).fall, 0);
  assert.ok(deathLook("shot", 0.2).fall > 0 && deathLook("shot", 0.2).fall < 1);
  assert.equal(deathLook("shot", 5).fall, 1);
  assert.equal(deathLook("shot", 5).drawn, true);
  assert.equal(deathLook("shot", 0).blood, 0);
  assert.ok(deathLook("shot", 1).blood > 0 && deathLook("shot", 1).blood < 1, "a pool spreads");
  assert.equal(deathLook("shot", 6).blood, 1);
  assert.equal(deathLook("laser", 0.3).blood, 0);
  assert.equal(deathLook("burn", 5).blood, 0);
});

test("a laser vaporizes: an enemy leaves nothing, one of ours a scorch mark", () => {
  assert.ok(deathLook("laser", 0.1).flash > 0.5);
  assert.ok(deathLook("laser", VAPORIZE_SECONDS / 2).fade < 0.6);
  assert.equal(deathLook("laser", VAPORIZE_SECONDS + 0.1, false).drawn, false);
  assert.equal(deathLook("laser", VAPORIZE_SECONDS + 0.1, false).ash, false);
  assert.equal(deathLook("laser", VAPORIZE_SECONDS + 0.1, true).ash, true);
});

test("a person on fire runs about, collapses, smoulders for seven seconds and ends up charred", () => {
  const running = deathLook("burn", BURN_RUN_SECONDS / 2);
  assert.ok(running.flames === 1 && running.fall === 0 && running.run > 0 && running.run < 1);
  const down = deathLook("burn", BURN_RUN_SECONDS + 2);
  assert.equal(down.fall, 1);
  assert.ok(down.smoke > 0.5 && !down.charred);
  assert.equal(deathLook("burn", BURN_RUN_SECONDS + SMOULDER_SECONDS + 0.1).charred, true);
  assert.equal(deathLook("burn", BURN_RUN_SECONDS + SMOULDER_SECONDS + 0.1).smoke, 0);
});
