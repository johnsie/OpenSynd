// SPDX-License-Identifier: GPL-2.0-or-later

import assert from "node:assert/strict";
import test from "node:test";

import {
  LOOT_RANGE,
  clearWeaponForAll,
  selectWeaponForAll,
  findLoot,
  freeSlots,
  inLootReach,
  lootBody,
  lootableAt,
  lootableBody,
  nearestLootable,
  useEnergyItem,
} from "../src/inventory.js";

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

test("a click on the ground where an enemy fell finds its gear", () => {
  const fallen = body(10, 5, [item("heavy")], { id: "fallen" });
  const empty = body(20, 5, [], { id: "empty" });
  const alive = body(30, 5, [item("x")], { id: "alive", disabled: false });
  const units = [fallen, empty, alive];
  assert.equal(lootableAt(units, { x: 10, y: 5 }), fallen);
  assert.equal(lootableAt(units, { x: 10.5, y: 5.4 }), fallen, "close enough counts");
  assert.equal(lootableAt(units, { x: 12, y: 5 }), null, "too far");
  assert.equal(lootableAt(units, { x: 20, y: 5 }), null, "nothing left to take");
  assert.equal(lootableAt(units, { x: 30, y: 5 }), null, "the watcher is still up");
});

test("the nearest lootable body is found across the map", () => {
  const near = body(10, 0, [item("a")], { id: "near" });
  const far = body(50, 0, [item("b")], { id: "far" });
  const picked = body(5, 0, [], { id: "picked" });
  assert.equal(nearestLootable(operator(0, 0), [far, picked, near]), near);
  assert.equal(nearestLootable(operator(0, 0), [picked]), null);
  assert.equal(nearestLootable(operator(100, 0), [far, near]), far);
});

const gun = (id, charges = null) => ({ definition: { id, action: "disable-pulse", effect: {} }, charges });
const carrier = (id, equipment) => ({ ...operator(0, 0, equipment), id, activeSlot: null });

test("choosing a weapon for several operatives picks their own copy of it, in whatever slot it is", () => {
  const first = carrier("a", [gun("pistol", 20), gun("rifle", 5)]);
  const second = carrier("b", [gun("rifle", 5), gun("pistol", 8)]);
  const result = selectWeaponForAll([first, second], "pistol");
  assert.deepEqual(result, { selected: ["a", "b"], missing: [] });
  assert.equal(first.activeSlot, 0);
  assert.equal(second.activeSlot, 1, "the second operative carries it in slot 2");
});

test("an operative with several copies uses the fullest one; empty copies are skipped", () => {
  const stocked = carrier("a", [gun("pistol", 3), gun("pistol", 19), gun("pistol", 0)]);
  selectWeaponForAll([stocked], "pistol");
  assert.equal(stocked.activeSlot, 1);

  const dry = carrier("b", [gun("pistol", 0)]);
  assert.deepEqual(selectWeaponForAll([dry], "pistol"), { selected: [], missing: ["b"] });
  assert.equal(dry.activeSlot, null);
});

test("operatives who do not carry the weapon keep their own choice", () => {
  const armed = carrier("a", [gun("pistol", 10)]);
  const other = { ...carrier("b", [gun("rifle", 4)]), activeSlot: 0 };
  const result = selectWeaponForAll([armed, other], "pistol");
  assert.deepEqual(result, { selected: ["a"], missing: ["b"] });
  assert.equal(other.activeSlot, 0, "left on the rifle");
});

test("putting a weapon away goes back to automatic only for those holding it", () => {
  const first = { ...carrier("a", [gun("pistol", 10), gun("rifle", 4)]), activeSlot: 0 };
  const second = { ...carrier("b", [gun("rifle", 4)]), activeSlot: 0 };
  clearWeaponForAll([first, second], "pistol");
  assert.equal(first.activeSlot, null);
  assert.equal(second.activeSlot, 0, "the rifle stays selected");
});
