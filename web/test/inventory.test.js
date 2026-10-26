// SPDX-License-Identifier: GPL-2.0-or-later

import assert from "node:assert/strict";
import test from "node:test";

import {
  LOOT_RANGE,
  clearWeaponForAll,
  selectWeaponForAll,
  raiseWeapon,
  setPersuader,
  weaponDistance,
  findLoot,
  freeSlots,
  inLootReach,
  collectFallen,
  lootBody,
  lootableAt,
  lootableBody,
  nearestLootable,
} from "../src/inventory.js";

const item = (id, action = "disable-pulse", charges = null, effect = {}) => ({
  definition: { id, action, effect },
  charges,
});

const operator = (x, y, equipment = []) => ({ id: "op", side: "team", disabled: false, position: { x, y }, equipment });
const body = (x, y, equipment, overrides = {}) => ({
  id: "w",
  kind: "drop",
  side: "drop",
  disabled: true,
  position: { x, y },
  equipment,
  ...overrides,
});

test("only a drop that still holds an item can be picked up", () => {
  assert.equal(lootableBody(body(0, 0, [item("a")])), true);
  assert.equal(lootableBody(body(0, 0, [])), false);
  assert.equal(lootableBody(body(0, 0, [item("a")], { kind: undefined, side: "opposition" })), false, "a fallen person is not a drop");
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

test("a click on the ground where an enemy fell finds its gear", () => {
  const fallen = body(10, 5, [item("heavy")], { id: "fallen" });
  const empty = body(20, 5, [], { id: "empty" });
  const alive = body(30, 5, [item("x")], { id: "alive", kind: undefined });
  const units = [fallen, empty, alive];
  assert.equal(lootableAt(units, { x: 10, y: 5 }), fallen);
  assert.equal(lootableAt(units, { x: 10.5, y: 5.4 }), fallen, "close enough counts");
  assert.equal(lootableAt(units, { x: 12, y: 5 }), null, "too far");
  assert.equal(lootableAt(units, { x: 20, y: 5 }), null, "nothing left to take");
  assert.equal(lootableAt(units, { x: 30, y: 5 }), null, "a person is not a drop");
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
  assert.deepEqual(result, { selected: ["a", "b"], substituted: [], missing: [] });
  assert.equal(first.activeSlot, 0);
  assert.equal(second.activeSlot, 1, "the second operative carries it in slot 2");
});

test("an operative with several copies uses the fullest one; empty copies are skipped", () => {
  const stocked = carrier("a", [gun("pistol", 3), gun("pistol", 19), gun("pistol", 0)]);
  selectWeaponForAll([stocked], "pistol");
  assert.equal(stocked.activeSlot, 1);

  const dry = carrier("b", [gun("pistol", 0)]);
  assert.deepEqual(selectWeaponForAll([dry], "pistol"), { selected: [], substituted: [], missing: ["b"] });
  assert.equal(dry.activeSlot, null);
});

const armed = (id, charges, effect, carry = "pistol") => ({ definition: { id, action: "disable-pulse", effect, carry }, charges });

test("an operative without the weapon takes the most similar one they carry", () => {
  const pistol = { attack: 12, range: 8, cooldown: 0.5 };
  const flamer = { attack: 4, range: 3, cooldown: 0.2, damageType: "burn" };
  const lead = carrier("a", [armed("pistol", 10, pistol), armed("flamer", 5, flamer, "rifle")]);
  const other = carrier("b", [
    armed("flamer", 5, flamer, "rifle"),
    armed("machine", 30, { attack: 10, range: 9, cooldown: 0.4 }, "pistol"),
  ]);
  const result = selectWeaponForAll([lead, other], "pistol");
  assert.deepEqual(result, { selected: ["a"], substituted: ["b"], missing: [] });
  assert.equal(lead.activeSlot, 0);
  assert.equal(other.activeSlot, 1, "the machine pistol is nearer a pistol than the flamer is");
  assert.equal(weaponDistance({ effect: pistol }, { effect: pistol }), 0);
});

test("an operative with nothing loaded keeps what they had", () => {
  const lead = carrier("a", [armed("pistol", 10, { attack: 12, range: 8, cooldown: 0.5 })]);
  const dry = { ...carrier("b", [armed("rifle", 0, { attack: 20, range: 12, cooldown: 1 }, "rifle")]), activeSlot: 0 };
  const result = selectWeaponForAll([lead, dry], "pistol");
  assert.deepEqual(result, { selected: ["a"], substituted: [], missing: ["b"] });
  assert.equal(dry.activeSlot, 0);
});

test("putting a weapon away also puts away the stand-ins others raised for it", () => {
  const first = { ...carrier("a", [gun("pistol", 10), gun("rifle", 4)]), activeSlot: 0 };
  const second = { ...carrier("b", [gun("rifle", 4)]), activeSlot: 0 };
  clearWeaponForAll([first, second], "pistol");
  assert.equal(first.activeSlot, null);
  assert.equal(second.activeSlot, null, "their rifle was the stand-in for the pistol");
});

const grassGrid = Array.from({ length: 20 }, () => Array.from({ length: 20 }, () => ({ walkable: true })));
const faller = (equipment, extra = {}) => ({
  id: "f", side: "opposition", disabled: true, position: { x: 10, y: 10 }, equipment, definition: {}, ...extra,
});

test("a person shot down drops everything they carry, scattered on their own bits of floor", () => {
  const drops = [];
  const unit = faller([item("a"), item("b"), item("c")]);
  const events = collectFallen([unit], drops, grassGrid);
  assert.deepEqual(events, [{ type: "dropped", unitId: "f", items: [undefined, undefined, undefined] }]);
  assert.equal(unit.equipment.length, 0);
  assert.equal(drops.length, 3);
  assert.deepEqual(drops.map((drop) => drop.equipment[0].definition.id), ["a", "b", "c"]);
  for (const [index, drop] of drops.entries()) {
    assert.ok(Math.hypot(drop.position.x - 10, drop.position.y - 10) < 2, "close to where they fell");
    for (const other of drops.slice(index + 1)) {
      assert.ok(Math.hypot(drop.position.x - other.position.x, drop.position.y - other.position.y) > 0.4, "not on top of each other");
    }
    assert.equal(lootableBody(drop), true);
  }
  assert.deepEqual(collectFallen([unit], drops, grassGrid), [], "they drop it once");
  assert.equal(drops.length, 3);
});

test("a beam kills what it hits and its gear with it; fire and blasts do too, unless the chest is the second version", () => {
  const lasered = faller([item("a")], { lastDamageType: "beam" });
  const burned = faller([item("b")], { lastDamageType: "burn", id: "g" });
  const shielded = faller([item("c")], { lastDamageType: "explosion", id: "h", upgrades: { chest: 2 } });
  const drops = [];
  const events = collectFallen([lasered, burned, shielded], drops, grassGrid);
  assert.deepEqual(events.map((event) => [event.type, event.unitId]), [["destroyed", "f"], ["destroyed", "g"], ["dropped", "h"]]);
  assert.deepEqual(drops.map((drop) => drop.equipment[0].definition.id), ["c"]);
});

test("the living and the unarmed drop nothing; items do not land in walls", () => {
  const drops = [];
  assert.deepEqual(collectFallen([faller([item("a")], { disabled: false }), faller([])], drops, grassGrid), []);
  const walled = grassGrid.map((row, y) => row.map((tile, x) => ({ walkable: !(x === 10 && y === 10) ? !(x > 10) : true })));
  collectFallen([faller([item("a"), item("b")])], drops, walled);
  assert.ok(drops.every((drop) => Math.round(drop.position.x) <= 10), "only on walkable ground");
});

test("a policeman's sidearm, which is not in their hands in play, drops with the rest when they are shot down", () => {
  const cop = faller([], { sidearm: [item("machine-pistol", "disable-pulse", 60)] });
  const drops = [];
  const events = collectFallen([cop], drops, grassGrid);
  assert.equal(events[0].type, "dropped");
  assert.deepEqual(drops.map((drop) => drop.equipment[0].definition.id), ["machine-pistol"]);
  assert.deepEqual(cop.sidearm, []);
  assert.equal(drops[0].equipment[0].charges, 60);
});

import { dropItem } from "../src/inventory.js";

test("dropping an item frees its slot and leaves it on the ground beside the operative, to be picked up again", () => {
  const unit = { ...carrier("a", [gun("pistol", 20), gun("rifle", 5), gun("flamer", 3)]), activeSlot: 2, position: { x: 10, y: 10 } };
  const drops = [];
  const dropped = dropItem(unit, 1, drops, grassGrid);
  assert.equal(unit.equipment.length, 2);
  assert.deepEqual(unit.equipment.map((entry) => entry.definition.id), ["pistol", "flamer"]);
  assert.equal(unit.activeSlot, 1, "the selected weapon moves down with its slot");
  assert.equal(drops.length, 1);
  assert.equal(dropped.equipment[0].definition.id, "rifle");
  assert.equal(dropped.equipment[0].charges, 5, "its rounds go with it");
  assert.ok(Math.hypot(dropped.position.x - 10, dropped.position.y - 10) < 2);
  assert.equal(lootableBody(dropped), true);
  // Dropping the selected weapon puts it away.
  dropItem(unit, 1, drops, grassGrid);
  assert.equal(unit.activeSlot, null);
  // Two drops do not land on the same spot.
  assert.ok(Math.hypot(drops[0].position.x - drops[1].position.x, drops[0].position.y - drops[1].position.y) > 0.4);
  // Picking it up again fills a slot, and is not counted as loot.
  const { taken } = lootBody(unit, drops[0]);
  assert.equal(taken.length, 1);
  assert.deepEqual(unit.looted ?? [], []);
  const other = carrier("b", []);
  lootBody(other, drops[1]);
  assert.deepEqual(other.looted, ["flamer"], "someone else's pick-up is loot");
});

test("nothing is dropped from an empty slot or by someone who is down", () => {
  const unit = { ...carrier("a", [gun("pistol")]), position: { x: 5, y: 5 } };
  assert.equal(dropItem(unit, 3, [], grassGrid), null);
  assert.equal(dropItem({ ...unit, disabled: true }, 0, [], grassGrid), null);
  assert.equal(unit.equipment.length, 1);
});

test("with several operators selected, the one carrying the fewest items collects the gear", async () => {
  const { pickLooter, findLoot } = await import("../src/inventory.js");
  const at = (id, x, count, extra = {}) => ({
    id, position: { x, y: 0 }, equipment: Array.from({ length: count }, () => item("z")), ...extra,
  });
  const loaded = at("near", 1, 5);
  const light = at("far", 2, 1);
  const down = at("down", 1.5, 0, { disabled: true });
  const body = { kind: "drop", id: "d", position: { x: 1.2, y: 0 }, equipment: [item("a")] };
  assert.equal(pickLooter([loaded, light, down], body).id, "far", "fewest items, not nearest; the fallen never");
  assert.equal(pickLooter([at("a", 1, 2), at("b", 2, 2)], body).id, "a", "a tie goes to the nearer");
  const found = findLoot([loaded, light], [body]);
  assert.equal(found.operator.id, "far", "within reach of both: the lighter one takes it");
});

test("the Persuader and a weapon are one or the other", () => {
  const persuader = item("persuader", "persuade");
  const gun = () => item("pistol");
  const agent = (id) => ({ ...operator(0, 0, [gun(), persuader]), id });
  const lone = agent("a");
  raiseWeapon(lone, 0);
  assert.equal(lone.activeSlot, 0);
  setPersuader([lone], true);
  assert.equal(lone.persuading, true);
  assert.equal(lone.activeSlot, null, "switching the Persuader on puts the weapon away");
  raiseWeapon(lone, 0);
  assert.equal(lone.persuading, false, "raising a weapon switches the Persuader off");
  assert.equal(lone.activeSlot, 0);
  setPersuader([lone], false);
  assert.equal(lone.activeSlot, 0, "switching it off leaves the weapon alone");

  const squad = [agent("b"), agent("c")];
  setPersuader(squad, true);
  assert.deepEqual(squad.map((unit) => unit.persuading), [true, true]);
  selectWeaponForAll(squad, "pistol");
  assert.deepEqual(squad.map((unit) => [unit.activeSlot, unit.persuading]), [[0, false], [0, false]], "a group weapon choice too");

  const unarmed = { ...operator(0, 0, [gun()]), id: "d", activeSlot: 0 };
  assert.deepEqual(setPersuader([unarmed], true), [], "someone with no Persuader is left as they are");
  assert.equal(unarmed.activeSlot, 0);
});
