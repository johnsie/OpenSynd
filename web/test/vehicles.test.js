// SPDX-License-Identifier: GPL-2.0-or-later

import assert from "node:assert/strict";
import test from "node:test";

import { createTileGrid } from "../src/engine.js";
import {
  ENTER_RANGE,
  RUNOVER_COOLDOWN,
  runOverDamage,
  WRECK_SECONDS,
  advanceVehicles,
  canEnter,
  createRoadGrid,
  driveTo,
  ejectDriver,
  enterVehicle,
  isSquadVehicle,
  isVehicle,
  leaveVehicle,
  nearestRoadTile,
  newVehicleState,
  vehicleDefinition,
} from "../src/vehicles.js";

// A road along the middle (y 4-6) with pavement above and below, 40 tiles wide.
const grid = createTileGrid({
  dimensions: { width: 40, height: 11 },
  regions: [
    { id: "pavement", x: 0, y: 0, width: 40, height: 11, surface: "service-concrete", walkable: true, elevation: 0 },
    { id: "road", x: 0, y: 4, width: 40, height: 3, surface: "street", walkable: true, elevation: 0 },
  ],
});
const roads = createRoadGrid(grid);
const carDefinition = vehicleDefinition({
  id: "developer.city-car",
  name: "City Car",
  kind: "city-car",
  stats: { health: 90, speed: 6, seats: 3, blastRadius: 3, blastDamage: 50 },
  appearance: { primaryColor: "#888888", accentColor: "#44dddd" },
});

function car(id, x, y, driverId = null, over = {}) {
  return {
    id,
    side: "vehicle",
    position: { x, y },
    path: [],
    health: 90,
    disabled: false,
    targetId: null,
    definition: carDefinition,
    vehicle: newVehicleState(driverId),
    ...over,
  };
}
const person = (id, x, y, over = {}) => ({
  id,
  side: "civilian",
  position: { x, y },
  path: [],
  health: 40,
  disabled: false,
  definition: { role: "civilian", stats: { vitality: 40, speed: 2, awareness: 0, attack: 0, range: 1, cooldown: 1 } },
  ...over,
});
const operator = (id, x, y) => person(id, x, y, { side: "team", persuasions: null });

test("a vehicle definition gives a unit's stats from the vehicle's, and is recognised as a vehicle", () => {
  assert.equal(carDefinition.role, "vehicle");
  assert.equal(carDefinition.stats.vitality, 90);
  assert.equal(carDefinition.stats.speed, 6);
  assert.equal(isVehicle(car("c", 1, 5)), true);
  assert.equal(isVehicle(person("p", 1, 1)), false);
});

test("cars use roads only: the road grid blocks pavement", () => {
  assert.equal(roads[5][10].walkable, true);
  assert.equal(roads[2][10].walkable, false);
  assert.deepEqual(nearestRoadTile(roads, { x: 10, y: 1 }), { x: 10, y: 4 });
  assert.equal(nearestRoadTile(roads, { x: 10, y: 0 }, 2), null, "nothing within reach");
});

test("an AI driver drives the route along the road and carries the driver with it", () => {
  const driver = person("d", 5, 5, { inVehicle: "c" });
  const vehicle = car("c", 5, 5, "d");
  vehicle.vehicle.route = { route: [{ x: 5, y: 5 }, { x: 25, y: 5 }], index: 1 };
  const units = [vehicle, driver];
  for (let step = 0; step < 30; step += 1) advanceVehicles(units, 0.1, roads, grid);
  assert.ok(vehicle.position.x > 15, `drove ${vehicle.position.x - 5} tiles in 3 s at 6 tiles/s`);
  assert.equal(vehicle.position.y, 5, "stays on the road");
  assert.deepEqual(driver.position, vehicle.position, "the driver rides inside");
  assert.ok(vehicle.vehicle.heading.x > 0.9, "heading along the road");
  for (let step = 0; step < 100; step += 1) advanceVehicles(units, 0.1, roads, grid);
  assert.ok(vehicle.position.x <= 25.0001 && vehicle.position.x >= 4.9999, "never leaves its route");
});

test("a parked vehicle with no driver stays where it is", () => {
  const vehicle = car("c", 5, 5);
  vehicle.vehicle.route = { route: [{ x: 5, y: 5 }, { x: 25, y: 5 }], index: 1 };
  for (let step = 0; step < 20; step += 1) advanceVehicles([vehicle], 0.1, roads, grid);
  assert.deepEqual(vehicle.position, { x: 5, y: 5 });
});

test("shooting at a car throws its driver out, who runs from it", () => {
  const driver = person("d", 5, 5, { inVehicle: "c" });
  const vehicle = car("c", 5, 5, "d");
  const thrown = ejectDriver(vehicle, [vehicle, driver], grid);
  assert.equal(thrown, driver);
  assert.equal(driver.inVehicle, null);
  assert.notDeepEqual(driver.position, vehicle.position, "standing beside the car");
  assert.deepEqual(driver.fleeFrom, { x: 5, y: 5 }, "civilians flee from the car");
  assert.equal(vehicle.vehicle.driverId, null);
  assert.equal(ejectDriver(vehicle, [vehicle, driver], grid), null, "nobody left to throw out");
  const persuaded = person("p", 5, 5, { inVehicle: "c2", persuaded: true });
  const other = car("c2", 5, 5, "p");
  assert.equal(ejectDriver(other, [other, persuaded], grid), null, "a persuaded driver stays at the wheel");
});

test("the squad takes a car: the driver is thrown out, operators and nearby followers get in", () => {
  const driver = person("d", 10, 5, { inVehicle: "c" });
  const vehicle = car("c", 10, 5, "d");
  const one = operator("one", 11, 4);
  const two = operator("two", 11.5, 6);
  const follower = person("f", 12, 5, { persuaded: true, persuadedBy: "one" });
  const far = operator("far", 30, 5);
  const units = [vehicle, driver, one, two, follower, far];
  assert.equal(canEnter(one, vehicle), true);
  assert.equal(canEnter(far, vehicle), false);
  const { entered, thrownOut } = enterVehicle(vehicle, [one, two, far], units, grid);
  assert.equal(thrownOut, driver);
  assert.deepEqual(entered.map((unit) => unit.id), ["one", "two", "f"], "the driver, the other operator in reach and the follower");
  assert.equal(far.inVehicle ?? null, null);
  assert.equal(vehicle.vehicle.controlledBy, "one");
  assert.equal(isSquadVehicle(vehicle), true);
  assert.equal(canEnter(far, vehicle), false);

  // Seats: 3 in this car, so a fourth cannot get in.
  const late = operator("late", 10, 5);
  assert.equal(canEnter(late, vehicle), false, "no seat left");
});

test("a controlled vehicle drives where it is told, along roads, with its passengers", () => {
  const vehicle = car("c", 10, 5);
  const one = operator("one", 10, 5);
  enterVehicle(vehicle, [one], [vehicle, one], grid);
  assert.equal(driveTo(vehicle, { x: 30, y: 1 }, roads), true, "the nearest road tile to the pavement point");
  for (let step = 0; step < 50; step += 1) advanceVehicles([vehicle, one], 0.1, roads, grid);
  assert.ok(vehicle.position.x > 29 && vehicle.position.y >= 4 && vehicle.position.y <= 6);
  assert.deepEqual(one.position, vehicle.position);
  const out = leaveVehicle(vehicle, [vehicle, one], grid);
  assert.deepEqual(out.map((unit) => unit.id), ["one"]);
  assert.equal(one.inVehicle, null);
  assert.equal(vehicle.vehicle.controlledBy, null);
  assert.notDeepEqual(one.position, vehicle.position);
});

test("a destroyed car drops its passengers, explodes once, and hurts everyone nearby, friend or foe", () => {
  const driver = person("d", 10, 5, { inVehicle: "c", health: 40 });
  const vehicle = car("c", 10, 5, "d");
  const bystander = person("b", 11, 5, { health: 30 });
  const distant = person("far", 30, 5);
  const units = [vehicle, driver, bystander, distant];
  vehicle.health = 0;
  vehicle.disabled = true;
  const events = advanceVehicles(units, 0.1, roads, grid);
  assert.equal(events.length, 1);
  const [blast] = events;
  assert.equal(blast.type, "blast");
  assert.equal(blast.source, "c");
  assert.deepEqual(blast.ejected, ["d"], "the driver was dropped first, then caught in the blast");
  assert.ok(blast.hits.some((hit) => hit.unitId === "d"));
  assert.ok(blast.hits.some((hit) => hit.unitId === "b" && hit.disabled), "30 health does not survive it");
  assert.equal(units.find((unit) => unit.id === "far").health, 40);
  assert.equal(vehicle.vehicle.wreckLeft, WRECK_SECONDS);
  assert.deepEqual(advanceVehicles(units, 0.1, roads, grid), [], "it only explodes once");
  for (let step = 0; step < 200; step += 1) advanceVehicles(units, 0.1, roads, grid);
  assert.equal(vehicle.vehicle.wreckLeft, 0, "the wreck stops burning");
});

test("a blast can destroy a neighbouring car, which then explodes in turn", () => {
  const first = car("a", 10, 5);
  const second = car("b", 11.5, 5, null, { health: 20 });
  const units = [first, second];
  first.health = 0;
  first.disabled = true;
  const events = [...advanceVehicles(units, 0.1, roads, grid), ...advanceVehicles(units, 0.1, roads, grid)];
  assert.deepEqual(events.map((event) => event.source), ["a", "b"], "the second car goes off after the first");
  assert.equal(second.disabled, true);
});

test("ENTER_RANGE is a short walk", () => {
  assert.ok(ENTER_RANGE >= 1.5 && ENTER_RANGE <= 4);
});

test("a moving car runs over people on foot: harder when faster, never twice in a second, never someone riding", () => {
  assert.equal(runOverDamage(6.5), 33);
  assert.ok(runOverDamage(8) > runOverDamage(4));
    const lorry = car("car", 10, 5, null, { path: [{ x: 30, y: 5 }] });
  const walker = person("walker", 10.3, 5);
  const rider = person("rider", 10.2, 5, { inVehicle: "car" });
  const events = advanceVehicles([lorry, walker, rider], 1 / 30, roads, grid);
  const hits = events.filter((event) => event.type === "runover");
  assert.equal(hits.length, 1);
  assert.equal(hits[0].unitId, "walker");
  assert.equal(walker.health, walker.definition.stats.vitality - runOverDamage(lorry.definition.stats.speed));
  assert.ok(walker.hitStun > 0);
  const again = advanceVehicles([lorry, walker, rider], 1 / 30, roads, grid).filter((event) => event.type === "runover");
  assert.equal(again.length, 0, "not hit twice at once");
  assert.ok(RUNOVER_COOLDOWN >= 1);
  lorry.path = [];
  walker.runOverLeft = 0;
  const parked = advanceVehicles([lorry, walker], 1 / 30, roads, grid).filter((event) => event.type === "runover");
  assert.equal(parked.length, 0, "a parked car hurts nobody");
});
