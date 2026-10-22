// SPDX-License-Identifier: GPL-2.0-or-later

import assert from "node:assert/strict";
import test from "node:test";

import { LOOT_RANGE, findLoot, freeSlots, inLootReach, lootBody, lootableBody, useEnergyItem } from "../src/inventory.js";

const item = (id, action = "disable-pulse", charges = null, effect = {}) => ({
  definition: { id, action, effect },
  charges,
});

const operator = (x, y, equipment = []) => ({ id: "op", side: "team", disabled: false, position: { x, y }, equipment });
const body = (x, y, equipment, overrides = {}) => ({
  id: "w",
  side: "opposition",
  disabled: true,
  position: { x, y },
  equipment,
  ...overrides,
});

test("only disabled opponents that still carry something can be looted", () => {
  assert.equal(lootableBody(body(0, 0, [item("a")])), true);
  assert.equal(lootableBody(body(0, 0, [])), false);
  assert.equal(lootableBody(body(0, 0, [item("a")], { disabled: false })), false);
  assert.equal(lootableBody(body(0, 0, [item("a")], { side: "team" })), false);
});

test("looting needs the operator to stand close to the body", () => {
  assert.equal(inLootReach(operator(0, 0), body(LOOT_RANGE, 0, [])), true);
  assert.equal(inLootReach(operator(0, 0), body(LOOT_RANGE + 0.1, 0, [])), false);
});

test("looting moves the body's items into the operator's slots and records them", () => {
  const hero = operator(0, 0, [item("pulse")]);
  const corpse = body(1, 0, [item("heavy"), item("cloak")]);
  const { taken, left } = lootBody(hero, corpse);
  assert.deepEqual(taken.map((entry) => entry.definition.id), ["heavy", "cloak"]);
  assert.equal(left, 0);
  assert.deepEqual(corpse.equipment, []);
  assert.deepEqual(hero.equipment.map((entry) => entry.definition.id), ["pulse", "heavy", "cloak"]);
  assert.deepEqual(hero.looted, ["heavy", "cloak"]);
});

test("an operator holds at most eight items and the rest stay on the body", () => {
  const full = operator(0, 0, Array.from({ length: 7 }, (_, index) => item(`i${index}`)));
  assert.equal(freeSlots(full), 1);
  const corpse = body(1, 0, [item("heavy"), item("cloak")]);
  const { taken, left } = lootBody(full, corpse);
  assert.deepEqual(taken.map((entry) => entry.definition.id), ["heavy"]);
  assert.equal(left, 1);
  assert.equal(full.equipment.length, 8);
  assert.deepEqual(corpse.equipment.map((entry) => entry.definition.id), ["cloak"]);
  assert.equal(freeSlots(full), 0);

  // A second visit with no room takes nothing.
  assert.deepEqual(lootBody(full, corpse).taken, []);
  assert.equal(corpse.equipment.length, 1);
});

test("the nearest reachable body is chosen, and disabled operators cannot loot", () => {
  const near = body(1, 0, [item("a")], { id: "near" });
  const far = body(1.5, 0, [item("b")], { id: "far" });
  const out = body(10, 0, [item("c")], { id: "out" });
  const found = findLoot([operator(0, 0)], [far, out, near]);
  assert.equal(found.body.id, "near");
  assert.equal(findLoot([operator(0, 0)], [out]), null);
  assert.equal(findLoot([{ ...operator(0, 0), disabled: true }], [near]), null);
});

test("a stim restores stamina and focus, spends a charge, and refuses to waste itself", () => {
  const stim = item("stim", "restore-energy", 2, { restoreStamina: 0.5, restoreFocus: 0.25 });
  const hero = { ...operator(0, 0, [stim]), stamina: 0.2, focus: 0.5 };
  assert.equal(useEnergyItem(hero), stim);
  assert.ok(Math.abs(hero.stamina - 0.7) < 1e-9 && Math.abs(hero.focus - 0.75) < 1e-9);
  assert.equal(stim.charges, 1);
  assert.equal(useEnergyItem(hero), stim);
  assert.equal(stim.charges, 0);
  assert.equal(useEnergyItem(hero), null, "out of doses");

  const rested = { ...operator(0, 0, [item("s", "restore-energy", 1, { restoreStamina: 0.5 })]), stamina: 1, focus: 1 };
  assert.equal(useEnergyItem(rested), null, "nothing to restore");
  assert.equal(rested.equipment[0].charges, 1);
  assert.equal(useEnergyItem({ ...hero, disabled: true, equipment: [item("s", "restore-energy", 1, { restoreStamina: 1 })] }), null);
});
