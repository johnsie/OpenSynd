// SPDX-License-Identifier: GPL-2.0-or-later

import assert from "node:assert/strict";
import test from "node:test";

import { createTileGrid } from "../src/engine.js";
import { ejectAll } from "../src/vehicles.js";
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
  keepRight,
  leaveVehicle,
  nearestRoadTile,
  newVehicleState,
  startTrain,
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
  assert.equal(vehicle.position.y, 6, "keeps to its lane, one tile to the right of the line it follows (heading east)");
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

  // FreeSynd has no seat limit: a fourth and a fifth agent get in the three-seat car, and the first stays the driver.
  const late = operator("late", 10, 5);
  const later = operator("later", 10.5, 5);
  assert.equal(canEnter(late, vehicle), true);
  assert.equal(enterVehicle(vehicle, [late], [...units, late], grid).entered.length, 1);
  assert.equal(enterVehicle(vehicle, [later], [...units, late, later], grid).entered.length, 1);
  assert.equal(vehicle.vehicle.occupantIds.length, 5);
  assert.equal(vehicle.vehicle.controlledBy, "one", "whoever got in first keeps the wheel");
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
  lorry.vehicle.controlledBy = "op"; // driven by the squad
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

  // The city's own cars, driven by civilians, never run anyone down.
  const taxi = car("taxi", 10, 5, "cabbie", { path: [{ x: 30, y: 5 }] });
  const cabbie = person("cabbie", 10, 5, { inVehicle: "taxi" });
  const bystander = person("bystander", 10.3, 5);
  const taxiEvents = advanceVehicles([taxi, cabbie, bystander], 1 / 30, roads, grid);
  assert.equal(taxiEvents.filter((event) => event.type === "runover").length, 0);
  // Nor do guards, police or enemy agents behind the wheel: only a car the squad drives hurts anyone.
  for (const side of ["opposition", "police", "criminal"]) {
    const wagon = car(`wagon-${side}`, 10, 5, `driver-${side}`, { path: [{ x: 30, y: 5 }] });
    const driver = person(`driver-${side}`, 10, 5, { inVehicle: wagon.id, side });
    const victim = person(`victim-${side}`, 10.3, 5);
    const outcome = advanceVehicles([wagon, driver, victim], 1 / 30, roads, grid);
    assert.equal(outcome.filter((event) => event.type === "runover").length, 0, side);
    assert.equal(victim.health, victim.definition.stats.vitality);
  }
  // Someone the squad's car kills drops what they carried, as with a bullet (FreeSynd).
  const squadCar = car("squad-car", 10, 5, null, { path: [{ x: 30, y: 5 }] });
  squadCar.vehicle.controlledBy = "op";
  const guard = person("guard", 10.3, 5, { health: 1, equipment: [{ definition: { name: "Pistol" } }] });
  advanceVehicles([squadCar, guard], 1 / 30, roads, grid);
  assert.equal(guard.disabled, true);
  assert.equal(guard.lastDamageType, "collision");
  assert.equal(bystander.health, bystander.definition.stats.vitality);
  lorry.path = [];
  walker.runOverLeft = 0;
  const parked = advanceVehicles([lorry, walker], 1 / 30, roads, grid).filter((event) => event.type === "runover");
  assert.equal(parked.length, 0, "a parked car hurts nobody");
});

import { FOLLOW_GAP, PEDESTRIAN_GAP, blockedAhead } from "../src/vehicles.js";

test("traffic queues: a car waits for one close ahead that has priority, never locks up, and ignores parked cars", () => {
  const lead = car("car-1", 10, 5, "d1");
  const follower = car("car-2", 8.5, 5, "d2");
  follower.vehicle.heading = { x: 1, y: 0 };
  lead.vehicle.heading = { x: 1, y: 0 };
  assert.equal(blockedAhead(follower, [lead, follower]), true, "the lower id goes first and the other waits");
  assert.equal(blockedAhead(lead, [lead, follower]), false, "the lead is clear (the one behind has no priority)");
  follower.position = { x: 10 - FOLLOW_GAP - 0.5, y: 5 };
  assert.equal(blockedAhead(follower, [lead, follower]), false, "far enough back to move");
  follower.position = { x: 8.5, y: 6.9 };
  assert.equal(blockedAhead(follower, [lead, follower]), false, "a car beside the way is not in the way");
  follower.position = { x: 12, y: 5 };
  assert.equal(blockedAhead(follower, [lead, follower]), false, "a car behind is no obstacle");

  follower.position = { x: 8.5, y: 5 };
  const parked = car("car-0", 10, 5, null);
  assert.equal(blockedAhead(follower, [parked, follower]), false, "nobody at its wheel: drive round it");
  const wreck = car("car-9", 10, 5, "d9", { disabled: true });
  wreck.vehicle.wreckLeft = 5;
  assert.equal(blockedAhead(follower, [wreck, follower]), true, "a burning wreck blocks the road");
  wreck.vehicle.wreckLeft = 0;
  assert.equal(blockedAhead(follower, [wreck, follower]), false, "a cleared one does not");
  const driven = car("car-8", 10, 5, "p");
  driven.vehicle.controlledBy = "operator";
  assert.equal(blockedAhead(follower, [driven, follower]), true, "a car the squad drives has right of way");
});

test("a following car actually holds back while the one ahead stays put, then moves on", () => {
  const roadGrid = createRoadGrid(grid);
  const lead = car("car-1", 10, 5, "d1", { vehicle: { ...newVehicleState("d1"), controlledBy: "p", heading: { x: 1, y: 0 } } });
  const follower = car("car-2", 8.6, 5, "d2");
  follower.vehicle.route = { route: [{ x: 30, y: 5 }], index: 0 };
  follower.vehicle.heading = { x: 1, y: 0 };
  const units = [lead, follower, person("d1", 10, 5, { inVehicle: "car-1" }), person("d2", 8.6, 5, { inVehicle: "car-2" })];
  const before = follower.position.x;
  for (let step = 0; step < 30; step += 1) advanceVehicles(units, 1 / 30, roadGrid, grid);
  assert.equal(follower.position.x, before, "held back for a second");
  lead.position = { x: 20, y: 5 };
  for (let step = 0; step < 30; step += 1) advanceVehicles(units, 1 / 30, roadGrid, grid);
  assert.ok(follower.position.x > before + 3, "and off again once the road is clear");
});

test("a civilian car waits for people on foot to get out of its way, but not for those beside it, behind it or down", () => {
  const driving = car("a", 10, 5, "d", { path: [{ x: 30, y: 5 }] });
  driving.vehicle.heading = { x: 1, y: 0 };
  const ahead = (x, y, over = {}) => person("p", x, y, over);
  assert.equal(blockedAhead(driving, [driving, ahead(10 + PEDESTRIAN_GAP - 0.3, 5)]), true, "someone in the road ahead");
  assert.equal(blockedAhead(driving, [driving, ahead(10 + PEDESTRIAN_GAP + 1, 5)]), false, "far enough off to keep going");
  assert.equal(blockedAhead(driving, [driving, ahead(12, 6.5)]), false, "on the pavement beside the road");
  assert.equal(blockedAhead(driving, [driving, ahead(8, 5)]), false, "behind it");
  assert.equal(blockedAhead(driving, [driving, ahead(11, 5, { disabled: true })]), false, "a fallen person does not stop traffic for ever");
  assert.equal(blockedAhead(driving, [driving, ahead(11, 5, { inVehicle: "x" })]), false, "someone riding is not in the way");
});

test("someone leaving a car is never put in a pocket behind a wall that they could not walk out of", () => {
  const pocketGrid = createTileGrid({
    dimensions: { width: 12, height: 8 },
    regions: [
      { id: "ground", x: 0, y: 0, width: 12, height: 8, surface: "service-concrete", walkable: true, elevation: 0 },
      { id: "road", x: 0, y: 3, width: 12, height: 1, surface: "street", walkable: true, elevation: 0 },
      { id: "wall", x: 0, y: 2, width: 12, height: 1, surface: "service-wall", walkable: false, elevation: 2 },
      { id: "wall-below", x: 0, y: 4, width: 12, height: 1, surface: "service-wall", walkable: false, elevation: 2 },
    ],
  });
  const parked = car("c", 5, 3, "d");
  const rider = person("d", 5, 3, { inVehicle: "c" });
  const [out] = ejectAll(parked, [parked, rider], pocketGrid);
  assert.equal(out.id, "d");
  // Rows 0-1 and 5-7 are walkable pavement but walled off from the road: the only way out is along it.
  assert.deepEqual([out.position.y], [3]);
});

import { advancePatrols } from "../src/simulation.js";

test("a scripted person walks to a car, gets in as its driver, drives to a point, and gets out", () => {
  const roads = createRoadGrid(grid);
  const parked = car("taxi", 12, 5);
  const rider = person("vip", 8, 5, {
    script: {
      steps: [
        { type: "enter", vehicle: "taxi" },
        { type: "drive", to: { x: 30, y: 5 } },
        { type: "leave" },
        { type: "say", text: "Here." },
      ],
      index: 0,
      done: false,
      loop: false,
    },
  });
  const units = [parked, rider];
  const said = [];
  let boardedAt = null;
  let arrivedAt = null;
  for (let step = 0; step < 30 * 40 && !rider.script.done; step += 1) {
    said.push(...advancePatrols(units, 1 / 30, grid, step / 30).filter((event) => event.type === "say"));
    advanceVehicles(units, 1 / 30, roads, grid, step / 30);
    if (rider.inVehicle && boardedAt === null) boardedAt = step;
    if (rider.script.index === 2 && arrivedAt === null) arrivedAt = step;
  }
  assert.ok(boardedAt !== null, "the passenger got in");
  assert.ok(arrivedAt !== null && arrivedAt > boardedAt, "and then drove somewhere");
  assert.ok(Math.hypot(parked.position.x - 30, parked.position.y - 5) < 2.5, "the car is where the script sent it");
  assert.equal(rider.inVehicle ?? null, null, "the person got out");
  assert.equal(parked.vehicle.driverId, null);
  assert.deepEqual(said.map((event) => event.text), ["Here."]);

  // A car that already has a driver, or one that does not exist, is skipped rather than waited for.
  const taken = car("busy", 12, 5, "other");
  const skipper = person("skip", 8, 5, {
    script: { steps: [{ type: "enter", vehicle: "busy" }, { type: "enter", vehicle: "ghost" }], index: 0, done: false, loop: false },
  });
  for (let step = 0; step < 10; step += 1) advancePatrols([taken, skipper], 1 / 30, grid, step / 30);
  assert.equal(skipper.script.done, true);
  assert.equal(skipper.inVehicle ?? null, null);
});

test("cars keep to their lane: oncoming traffic on a wide street passes without meeting or stopping", () => {
  // The road is three tiles wide (rows 4 to 6). East-bound cars keep right (south of the line they follow), west-bound north.
  const east = car("east", 2, 5, "de");
  east.vehicle.route = { route: [{ x: 2, y: 5 }, { x: 30, y: 5 }], index: 1 };
  const west = car("west", 30, 5, "dw");
  west.vehicle.route = { route: [{ x: 30, y: 5 }, { x: 2, y: 5 }], index: 1 };
  const units = [east, west, person("de", 2, 5, { inVehicle: "east" }), person("dw", 30, 5, { inVehicle: "west" })];
  let closest = Infinity;
  let stopped = 0;
  for (let step = 0; step < 35; step += 1) {
    const before = { east: east.position.x, west: west.position.x };
    advanceVehicles(units, 0.1, roads, grid);
    if (east.position.x === before.east || west.position.x === before.west) stopped += 1;
    closest = Math.min(closest, Math.hypot(east.position.x - west.position.x, east.position.y - west.position.y));
  }
  assert.ok(east.position.x > 18 && west.position.x < 14, "both got past each other");
  assert.ok(closest >= 0.9, `they never overlapped (closest ${closest.toFixed(2)})`);
  assert.equal(stopped, 0, "nobody waited for the other");
});

test("keeping right shifts a path to the right-hand side where that is road, and leaves it alone where it is not", () => {
  const path = [{ x: 6, y: 5 }, { x: 7, y: 5 }, { x: 8, y: 5 }];
  assert.deepEqual(keepRight(path, roads, { x: 5, y: 5 }).map((node) => node.y), [6, 6, 6], "east: the south side");
  const back = [{ x: 7, y: 5 }, { x: 6, y: 5 }];
  assert.deepEqual(keepRight(back, roads, { x: 8, y: 5 }).map((node) => node.y), [4, 4], "west: the north side");
  const edge = [{ x: 7, y: 6 }, { x: 8, y: 6 }];
  assert.deepEqual(keepRight(edge, roads, { x: 6, y: 6 }).map((node) => node.y), [6, 6], "no road beyond the kerb: stay put");
});

test("a train runs between its stations, waits at each and turns round at the end of the line", async () => {
  const { isTrain, startTrain, trainCars, TRAIN_SPACING, settleTrain } = await import("../src/vehicles.js");
  const trainDefinition = vehicleDefinition({
    id: "developer.freight-train", name: "Freight Train", kind: "train", carriages: 3,
    stats: { health: 2000, speed: 5, seats: 1, blastRadius: 1, blastDamage: 1 },
    appearance: { primaryColor: "#5b6671", accentColor: "#e1b35a" },
  });
  const train = car("train", 12, 5, null, { definition: trainDefinition, health: 2000 });
  startTrain(train, [{ x: 12, y: 5, wait: 0 }, { x: 22, y: 5, wait: 4 }, { x: 32, y: 5, wait: 2 }], 3);
  assert.equal(isTrain(train), true);
  assert.equal(canEnter({ position: { x: 12, y: 5 }, disabled: false }, train), false, "nobody boards a train that is moving");
  // The carriages stand in a row behind the engine.
  assert.deepEqual(trainCars(train).map((part) => part.x), [12, 12 - TRAIN_SPACING, 12 - 2 * TRAIN_SPACING, 12 - 3 * TRAIN_SPACING]);
  const events = [];
  const at = (seconds) => {
    for (let step = 0; step < seconds * 10; step += 1) events.push(...advanceVehicles([train], 0.1, roads, grid));
  };
  at(2); // 10 tiles at 5 a second: arrives at the first station
  assert.equal(train.position.x, 22);
  assert.deepEqual(events.map((event) => event.type), ["train-stops"]);
  at(3);
  assert.equal(train.position.x, 22, "waiting at the station");
  at(2);
  assert.ok(train.position.x > 22, "gone again");
  assert.ok(events.some((event) => event.type === "train-leaves"));
  for (let guard = 0; guard < 300 && events.filter((event) => event.type === "train-stops").length < 2; guard += 1) at(0.1);
  assert.equal(events.filter((event) => event.type === "train-stops").length, 2, "reached the end of the line");
  // Turned round: the last carriage is now the engine, standing where the tail was, and the train heads back; it still
  // occupies the same stretch of track, the front end at the end of the line.
  assert.equal(Math.max(...trainCars(train).map((part) => part.x)), 32);
  assert.ok(train.vehicle.heading.x < 0, "heading back");
  assert.ok(Math.abs(train.position.x - (32 - 3 * TRAIN_SPACING)) < 0.6, "the engine is where the tail was");
  for (let guard = 0; guard < 200 && train.position.x > 22; guard += 1) at(0.1);
  assert.ok(train.position.x <= 22.1, "on its way back to the middle station");
  // After a saved game puts the engine back, the carriages line up behind it again.
  train.position = { x: 20, y: 5 };
  train.vehicle.heading = { x: 1, y: 0 };
  settleTrain(train);
  assert.deepEqual(trainCars(train).map((part) => part.x), [20, 20 - TRAIN_SPACING, 20 - 2 * TRAIN_SPACING, 20 - 3 * TRAIN_SPACING]);
});

test("cars wait for a train in their lane and drive on once it has gone", () => {
  const trainDefinition = vehicleDefinition({
    id: "developer.freight-train", name: "Freight Train", kind: "train", carriages: 2,
    stats: { health: 2000, speed: 5, seats: 1, blastRadius: 1, blastDamage: 1 },
    appearance: { primaryColor: "#5b6671", accentColor: "#e1b35a" },
  });
  const train = car("train", 20, 5, null, { definition: trainDefinition, health: 2000 });
  startTrain(train, [{ x: 20, y: 5, wait: 100 }, { x: 30, y: 5, wait: 0 }], 2);
  train.vehicle.train.waiting = 100; // standing in the station
  const traffic = car("taxi", 14, 5, "cabbie", { path: [{ x: 28, y: 5 }] });
  traffic.vehicle.heading = { x: 1, y: 0 };
  const cabbie = person("cabbie", 14, 5, { inVehicle: "taxi" });
  traffic.vehicle.route = { route: [{ x: 14, y: 5 }, { x: 28, y: 5 }], index: 1 };
  for (let step = 0; step < 60; step += 1) advanceVehicles([train, traffic, cabbie], 0.1, roads, grid);
  assert.ok(traffic.position.x < 20, `the car stopped short of the train (${traffic.position.x.toFixed(1)})`);
});

test("passengers board a train waiting at a station and are put down on the platform at the next one", async () => {
  const { dropTrainPassengers, startTrain, TRAIN_SPACING } = await import("../src/vehicles.js");
  const trainDefinition = vehicleDefinition({
    id: "developer.freight-train", name: "Freight Train", kind: "train", carriages: 2,
    stats: { health: 2000, speed: 5, seats: 1, blastRadius: 1, blastDamage: 1 },
    appearance: { primaryColor: "#5b6671", accentColor: "#e1b35a" },
  });
  const train = car("train", 12, 2, null, { definition: trainDefinition, health: 2000 });
  startTrain(train, [{ x: 12, y: 2, wait: 5 }, { x: 30, y: 2, wait: 5 }], 2);
  // The track is row 2 (no walking there); the platform is row 3, and a stair joins it to the ground.
  const rails = createTileGrid({
    dimensions: { width: 40, height: 8 },
    regions: [
      { id: "ground", x: 0, y: 0, width: 40, height: 8, surface: "service-concrete", walkable: true, elevation: 0 },
      { id: "line", x: 0, y: 2, width: 40, height: 1, surface: "rail", walkable: false, elevation: 8 },
      { id: "deck", x: 8, y: 3, width: 28, height: 1, surface: "platform", walkable: true, elevation: 9 },
    ],
  });
  const operator = { ...person("op", 11, 3), side: "team" };
  const stranger = person("far", 30, 6);
  // Not at a station yet: nobody can board.
  train.vehicle.train.waiting = 0;
  assert.equal(canEnter(operator, train), false, "a moving train cannot be boarded");
  train.vehicle.train.waiting = 5;
  assert.equal(canEnter(operator, train), true, "from the platform beside it, while it waits");
  assert.equal(canEnter(stranger, train), false, "too far from every carriage");
  const { entered, thrownOut } = enterVehicle(train, [operator], [train, operator, stranger], rails);
  assert.deepEqual(entered.map((unit) => unit.id), ["op"]);
  assert.equal(thrownOut, null);
  assert.equal(train.vehicle.controlledBy, null, "nobody drives a train");
  assert.equal(operator.inVehicle, "train");
  // It rides along, hidden; at the next station it is put on the platform beside the middle carriage.
  train.vehicle.train.waiting = 0;
  const events = [];
  for (let step = 0; step < 400 && !events.some((event) => event.type === "train-drop"); step += 1) {
    events.push(...advanceVehicles([train, operator], 0.1, roads, rails));
  }
  const drop = events.find((event) => event.type === "train-drop");
  assert.deepEqual(drop.unitIds, ["op"]);
  assert.equal(operator.inVehicle, null);
  assert.equal(operator.position.y, 3, "on the platform, not on the track");
  const middle = train.vehicle.train.body[1];
  assert.ok(Math.abs(operator.position.x - middle.x) <= 1.5, "beside the middle carriage");
  assert.deepEqual(dropTrainPassengers(train, [train, operator], rails), [], "nobody left to drop");
  assert.ok(TRAIN_SPACING > 0);
});

test("a car on a street-long route keeps to one lane instead of weaving across it", () => {
  const driver = person("d", 5, 5, { inVehicle: "c" });
  const vehicle = car("c", 5, 5, "d");
  // The route is the street's centre line, a tile at a time, the way a patrol builds it.
  vehicle.vehicle.route = { route: Array.from({ length: 20 }, (_, index) => ({ x: 6 + index, y: 5 })), index: 0 };
  const units = [vehicle, driver];
  const lanes = new Set();
  for (let step = 0; step < 80; step += 1) {
    advanceVehicles(units, 0.05, roads, grid);
    if (vehicle.position.x > 8) lanes.add(vehicle.position.y);
  }
  assert.ok(vehicle.position.x > 12, "it drove");
  assert.deepEqual([...lanes], [6], "one lane, the tile to the right of its heading, all the way");

  // Coming back the other way it uses the other side, so the two never share a lane.
  const back = car("b", 25, 5, "e");
  back.vehicle.route = { route: Array.from({ length: 20 }, (_, index) => ({ x: 24 - index, y: 5 })), index: 0 };
  const there = [back, person("e", 25, 5, { inVehicle: "b" })];
  const sides = new Set();
  for (let step = 0; step < 80; step += 1) {
    advanceVehicles(there, 0.05, roads, grid);
    if (back.position.x < 22) sides.add(back.position.y);
  }
  assert.deepEqual([...sides], [4], "west-bound traffic is on the north side");
});
