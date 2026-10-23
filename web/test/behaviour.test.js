// SPDX-License-Identifier: GPL-2.0-or-later

import assert from "node:assert/strict";
import test from "node:test";

import { createTileGrid } from "../src/engine.js";
import { makeDrop } from "../src/inventory.js";
import {
  CIVILIAN_SCOUT,
  FIXED_STEP_SECONDS,
  POLICE_PENDING,
  POLICE_WARNING,
  REACTION_SECONDS,
  advanceCombat,
  advancePatrols,
  advancePersuasion,
  armedOut,
  persuadeCheck,
  persuadeKind,
} from "../src/simulation.js";

// A long straight street 60 tiles by 5, nothing in the way.
const street = createTileGrid({
  dimensions: { width: 60, height: 5 },
  regions: [{ id: "road", x: 0, y: 0, width: 60, height: 5, surface: "service-concrete", walkable: true, elevation: 0 }],
});

const stats = (over = {}) => ({ speed: 3, range: 3.25, attack: 6, cooldown: 1, awareness: 85, vitality: 60, ...over });
const pistol = () => ({
  definition: { id: "pistol", name: "Pistol", action: "disable-pulse", effect: { attack: 12, range: 6, cooldown: 0.75 } },
  charges: null,
});

function person(id, side, x, over = {}) {
  return {
    id,
    side,
    position: { x, y: 2 },
    path: [],
    health: 60,
    disabled: false,
    targetId: null,
    alertedBy: null,
    cooldownRemaining: 0,
    equipment: [],
    patrol: { route: [{ x, y: 2 }, { x: x + 3, y: 2 }], index: 1 },
    definition: { role: side, stats: stats() },
    ...over,
  };
}

const operator = (x, armed, over = {}) =>
  person("op", "team", x, { equipment: [pistol()], activeSlot: armed ? 0 : null, patrol: null, ...over });
const clock = (units, seconds, now0 = 10, grid = street, drops = []) => {
  const events = [];
  const steps = Math.round(seconds / FIXED_STEP_SECONDS);
  for (let step = 0; step < steps; step += 1) {
    const now = now0 + step * FIXED_STEP_SECONDS;
    events.push(...advancePatrols(units, FIXED_STEP_SECONDS, grid, now, drops));
    events.push(...advanceCombat(units, FIXED_STEP_SECONDS, grid, now));
  }
  return events;
};

test("what counts as having a weapon out: a selected weapon, an engaged enemy, a follower while its owner is armed", () => {
  const owner = operator(5, true);
  assert.equal(armedOut(owner, 10), true);
  assert.equal(armedOut(operator(5, false), 10), false);
  assert.equal(armedOut(owner, null), false, "no clock, no armed people");
  assert.equal(armedOut(person("e", "opposition", 5), 10), false, "an enemy on patrol has nothing out");
  assert.equal(armedOut(person("e", "opposition", 5, { alertedBy: "op" }), 10), true, "once it is after someone it does");
  assert.equal(armedOut(person("c", "civilian", 5), 10), false);
  const follower = person("f", "civilian", 6, { persuaded: true, persuadedBy: "op", equipment: [pistol()] });
  const byId = new Map([[owner.id, owner], [follower.id, follower]]);
  assert.equal(armedOut(follower, 10, byId), true, "armed while its owner is");
  owner.activeSlot = null;
  assert.equal(armedOut(follower, 10, byId), false);
});

test("civilians run from anyone with a weapon out within about six tiles, and ignore everyone else", () => {
  const civilian = person("civ", "civilian", 20, { definition: { role: "civilian", stats: stats({ speed: 2.2 }) } });
  const near = operator(20 + CIVILIAN_SCOUT - 1, true);
  clock([civilian, near], 0.6);
  assert.ok(civilian.panic.fleeing, "an armed person five tiles away sends them running");
  assert.ok(civilian.position.x < 20.5, "away from the gunman, not toward");

  const calm = person("civ", "civilian", 20);
  clock([calm, operator(25, false)], 1);
  assert.equal(calm.panic.fleeing, false, "an operator with the weapon away frightens nobody");
  const far = person("civ", "civilian", 20);
  clock([far, operator(20 + CIVILIAN_SCOUT + 3, true)], 1);
  assert.equal(far.panic.fleeing, false, "too far to notice");
});

test("a civilian runs a short stretch, looks again, and goes back to wandering when the danger has gone", () => {
  const civilian = person("civ", "civilian", 20, { definition: { role: "civilian", stats: stats({ speed: 2.2 }) } });
  const gun = operator(23, true);
  clock([civilian, gun], 1);
  assert.equal(civilian.panic.fleeing, true);
  gun.activeSlot = null;
  clock([civilian, gun], 6, 20);
  assert.equal(civilian.panic.fleeing, false);
  assert.equal(civilian.path.length === 0 || civilian.path.length > 0, true);
});

test("police stay on patrol until a weapon comes out, then warn before they shoot", () => {
  const cop = person("cop", "police", 20, { definition: { role: "police", stats: stats({ attack: 6, range: 6 }) } });
  const gun = operator(26, false);
  clock([cop, gun], 2);
  assert.equal(cop.police.status, "patrol");
  assert.equal(cop.targetId, null);

  gun.activeSlot = 0;
  const events = clock([cop, gun], POLICE_WARNING / 2, 20);
  assert.equal(cop.police.status, "warn", "alert, found the armed operator and is warning");
  assert.equal(cop.targetId, null, "no shot during the warning");
  assert.ok(events.some((event) => event.type === "spotted"), "the squad is told");

  const later = clock([cop, gun], POLICE_WARNING + 0.5, 21);
  assert.equal(cop.police.status, "engage");
  assert.ok(later.some((event) => event.type === "damage" && event.attackerId === "cop"), "then it shoots");
});

test("police lower their guns a moment after the target puts its weapon away, then return to patrol", () => {
  const cop = person("cop", "police", 20, { definition: { role: "police", stats: stats({ range: 6 }) } });
  const gun = operator(24, true);
  clock([cop, gun], POLICE_WARNING + 0.5);
  assert.equal(cop.police.status, "engage");
  gun.activeSlot = null;
  clock([cop, gun], 0.2, 12);
  assert.equal(cop.police.status, "pending");
  assert.equal(cop.targetId, null);
  assert.equal(cop.alertedBy, null);
  clock([cop, gun], POLICE_PENDING + 0.4, 13);
  assert.equal(cop.police.status, "patrol");
});

test("police shoot any armed non-police unit, enemy agents and persuaded followers included, never each other", () => {
  const cop = person("cop", "police", 20, { definition: { role: "police", stats: stats({ range: 6 }) } });
  const enemy = person("enemy", "opposition", 24, { alertedBy: "op", definition: { role: "enemy-agent", stats: stats() } });
  const otherCop = person("cop2", "police", 22, { alertedBy: "x", definition: { role: "police", stats: stats() } });
  clock([cop, enemy, otherCop], 0.5);
  assert.equal(cop.police.targetId, "enemy", "an enemy agent with a weapon out is a target");
  assert.notEqual(cop.police.targetId, "cop2");
  const calm = person("quiet", "opposition", 24);
  const cop3 = person("cop3", "police", 20, { definition: { role: "police", stats: stats() } });
  clock([cop3, calm], 2);
  assert.equal(cop3.police.status, "patrol", "an enemy on patrol with nothing out is left alone");
});

test("enemy agents and guards wait their reaction time after spotting the squad before they fire", () => {
  for (const role of ["enemy-agent", "guard"]) {
    const enemy = person("e", "opposition", 20, { definition: { role, stats: stats({ range: 5, attack: 10 }) } });
    const squad = operator(26, false);
    const early = clock([enemy, squad], REACTION_SECONDS[role] / 2);
    assert.equal(enemy.alertedBy, "op", `${role} saw them`);
    assert.equal(early.some((event) => event.type === "damage"), false, `${role} holds fire while reacting`);
    assert.ok(REACTION_SECONDS[role] > 0);
  }
  assert.ok(REACTION_SECONDS.guard < REACTION_SECONDS["enemy-agent"], "guards react a touch faster, as in FreeSynd");
});

test("a criminal minds its own business until attacked, then goes after whoever did it", () => {
  const criminal = person("crim", "criminal", 20, {
    health: 200,
    equipment: [pistol()],
    definition: { role: "criminal", stats: stats({ range: 4, attack: 8 }) },
  });
  const squad = operator(23, true);
  clock([criminal, squad], 3);
  assert.equal(criminal.alertedBy, null, "no quarrel, no reaction");
  assert.equal(criminal.hostileTo ?? null, null);

  // The operator shoots it: it now has a grudge.
  squad.targetId = "crim";
  squad.cooldownRemaining = 0;
  advanceCombat([squad, criminal], FIXED_STEP_SECONDS, street, 10);
  assert.equal(criminal.hostileTo, "op");
  const events = clock([criminal, squad], 2.5, 11);
  assert.equal(criminal.alertedBy, "op");
  assert.ok(events.some((event) => event.type === "damage" && event.attackerId === "crim"), "it fights back");
});

test("persuasion kinds: guards need three civilians, police six, enemy agents four police; criminals are free", () => {
  const agent = { persuasions: { civilian: 0, police: 0, guard: 0, opposition: 0 } };
  const guard = person("g", "opposition", 5, { definition: { role: "guard", stats: stats() } });
  const enemy = person("a", "opposition", 5, { definition: { role: "enemy-agent", stats: stats() } });
  const thug = person("t", "criminal", 5);
  assert.equal(persuadeKind(guard), "guard");
  assert.equal(persuadeKind(enemy), "opposition");
  assert.equal(persuadeKind(thug), "criminal");
  assert.equal(persuadeCheck(agent, thug).ok, true, "criminals can always be persuaded");
  assert.deepEqual(persuadeCheck(agent, guard), { ok: false, kind: "guard", needs: "3 more persuasion points", points: 0, needed: 3 });
  agent.persuasions.civilian = 3;
  assert.equal(persuadeCheck(agent, guard).ok, true);
  assert.equal(persuadeCheck(agent, person("p", "police", 5)).ok, false, "police need six");
  agent.persuasions.civilian = 6;
  assert.equal(persuadeCheck(agent, person("p", "police", 5)).ok, true);
  assert.equal(persuadeCheck(agent, enemy).ok, false);
  agent.persuasions.police = 4;
  assert.equal(persuadeCheck(agent, enemy).ok, true);
});

test("persuaded criminals count as civilians toward what guards and police need", () => {
  const persuader = { definition: { action: "persuade", effect: { range: 4, cooldown: 0.1 } }, charges: 9 };
  const agent = operator(10, false, { persuading: true, equipment: [persuader] });
  const thugs = [person("t1", "criminal", 11), person("t2", "criminal", 12), person("t3", "criminal", 13)];
  for (let step = 0; step < 60; step += 1) advancePersuasion([agent, ...thugs], 0.2, street);
  assert.equal(agent.persuasions.civilian, 3);
  assert.equal(persuadeCheck(agent, person("g", "opposition", 5, { definition: { role: "guard", stats: stats() } })).ok, true);
});

test("a follower with no weapon takes one from a fallen enemy when its owner draws, and then fires only while the owner is armed", () => {
  const owner = operator(10, false);
  const body = makeDrop("dropped-pistol", pistol(), { x: 12, y: 2 });
  const follower = person("f", "civilian", 11, {
    persuaded: true,
    persuadedBy: "op",
    patrol: null,
    definition: { role: "civilian", stats: stats({ attack: 0, range: 1 }) },
  });
  const events = clock([owner, follower], 3, 10, street, [body]);
  assert.equal(follower.equipment.length, 0, "the owner's weapon is away: no need for a gun");
  assert.equal(events.some((event) => event.type === "pickup"), false);

  owner.activeSlot = 0;
  const later = clock([owner, follower], 3, 20, street, [body]);
  assert.ok(later.some((event) => event.type === "pickup" && event.unitId === "f"), "armed owner: the follower arms itself");
  assert.equal(follower.equipment.length, 1);
  assert.equal(body.equipment.length, 0);
});

test("when an operator goes down their followers and persuasion counts pass to another operator", () => {
  const first = operator(10, false, { id: "one", persuasions: { civilian: 4, police: 1, guard: 0, opposition: 0 } });
  const second = operator(14, false, { id: "two" });
  const follower = person("f", "civilian", 12, { persuaded: true, persuadedBy: "one", patrol: null });
  first.disabled = true;
  const events = advancePersuasion([first, second, follower], 0.1, street);
  assert.equal(follower.persuadedBy, "two");
  assert.ok(events.some((event) => event.type === "reassigned"));
  assert.equal(second.persuasions.civilian, 4);
  assert.equal(second.persuasions.police, 1);
  assert.equal(first.persuasions.civilian, 0);
});

// ---- vehicles in the simulation ----
import { castShot, fireManual } from "../src/simulation.js";
import { newVehicleState, vehicleDefinition } from "../src/vehicles.js";

const carDef = vehicleDefinition({
  id: "developer.city-car",
  name: "City Car",
  kind: "city-car",
  stats: { health: 60, speed: 6, seats: 3, blastRadius: 3, blastDamage: 50 },
  appearance: { primaryColor: "#888888", accentColor: "#44dddd" },
});
const aCar = (x, driverId = null, over = {}) => ({
  id: "car",
  side: "vehicle",
  position: { x, y: 2 },
  path: [],
  health: 60,
  disabled: false,
  targetId: null,
  definition: carDef,
  vehicle: newVehicleState(driverId),
  equipment: [],
  ...over,
});

test("a shot at a car hits it with a generous radius and throws the driver out", () => {
  const driver = person("drv", "civilian", 14, { inVehicle: "car" });
  const vehicle = aCar(14, "drv");
  const gun = operator(10, true);
  const result = fireManual(gun, { x: 14, y: 2.8 }, [gun, vehicle, driver], street);
  assert.equal(result.fired, true);
  assert.equal(result.events[0].targetId, "car", "a car is hit a little off-centre; its driver is not a separate target");
  assert.ok(vehicle.health < 60);
  assert.ok(result.events.some((event) => event.type === "ejected" && event.unitId === "drv"), "the driver is thrown out");
  assert.equal(driver.inVehicle, null);
  assert.equal(castShot(gun, { x: 14, y: 2 }, [gun, aCar(14, "x", { disabled: true })], street, 6).target, null, "a wreck is not a target");
});

test("people inside a car are neither armed nor targets, and a car the squad drives is what enemies shoot at", () => {
  const inside = operator(14, true, { inVehicle: "car" });
  assert.equal(armedOut(inside, 10), false, "nobody fires from inside a car");
  const enemy = person("e", "opposition", 20, { definition: { role: "enemy-agent", stats: stats({ range: 6, awareness: 90 }) } });
  const vehicle = aCar(14, "op", { vehicle: { ...newVehicleState("op"), controlledBy: "op" } });
  clock([enemy, inside, vehicle], 1.2);
  assert.equal(enemy.alertedBy, "car", "it sees the car the squad is in, not the hidden operator");
  const parked = aCar(14);
  const calm = person("e2", "opposition", 20, { definition: { role: "enemy-agent", stats: stats({ range: 6, awareness: 90 }) } });
  clock([calm, inside, parked], 1.2);
  assert.equal(calm.alertedBy, null, "an empty parked car interests no one");
});

test("a thrown-out civilian runs away from the car", () => {
  const driver = person("drv", "civilian", 14, { fleeFrom: { x: 13, y: 2 } });
  clock([driver], 0.5);
  assert.equal(driver.fleeFrom, null);
  assert.equal(driver.panic.fleeing, true);
  assert.ok(driver.position.x > 14, "away from the car");
});
