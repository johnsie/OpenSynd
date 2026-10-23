// SPDX-License-Identifier: GPL-2.0-or-later

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createTileGrid } from "../src/engine.js";
import {
  SIGNAL_CYCLE,
  STOP_DISTANCE,
  advanceVehicles,
  createRoadGrid,
  findCrossings,
  newVehicleState,
  signalAt,
  stoppedBySignal,
  vehicleDefinition,
} from "../src/vehicles.js";

const read = async (path) => JSON.parse(await readFile(new URL(`../content/${path}`, import.meta.url), "utf8"));

test("the crossings of a real map are the squares where its streets meet", async () => {
  const map = await read("maps/audit-yard.map.json");
  const crossings = findCrossings(createTileGrid(map));
  assert.equal(crossings.length, 16, "four streets each way");
  assert.ok(crossings.every((crossing) => crossing.width === 4 && crossing.height === 4));
  assert.deepEqual(crossings[0], { id: "crossing-24-24", x: 24, y: 24, width: 4, height: 4, offset: 0 });
  assert.equal(new Set(crossings.map((crossing) => crossing.id)).size, 16);
  assert.ok(crossings.some((crossing) => crossing.offset !== 0), "they do not all change together");
  assert.deepEqual(findCrossings([]), []);
});

test("a signal runs a 20 second cycle: east-west, a pause, north-south, a pause", () => {
  const crossing = { offset: 0 };
  assert.equal(SIGNAL_CYCLE, 20);
  assert.deepEqual([0, 7.9, 8, 9.9, 10, 17.9, 18, 19.9, 20].map((time) => signalAt(crossing, time)), [
    "ew", "ew", "red", "red", "ns", "ns", "red", "red", "ew",
  ]);
  assert.equal(signalAt({ offset: 10 }, 0), "ns", "an offset shifts the phase");
  assert.equal(signalAt(crossing, -2), "red", "time before zero still cycles");
});

const crossing = { id: "c", x: 20, y: 10, width: 4, height: 4, offset: 0 };
const car = (x, y, heading) => ({
  id: "car-1",
  side: "vehicle",
  position: { x, y },
  path: [],
  health: 90,
  disabled: false,
  vehicle: { ...newVehicleState("d"), heading },
});

test("a car stops short of a crossing that is red its way, and not for one that is green or too far off", () => {
  // At time 9 the light is red both ways; at 5 east-west is green; at 12 north-south is green.
  const east = car(20 - STOP_DISTANCE + 0.5, 11, { x: 1, y: 0 });
  assert.equal(stoppedBySignal(east, [crossing], 9), true, "red for all");
  assert.equal(stoppedBySignal(east, [crossing], 5), false, "green east-west");
  assert.equal(stoppedBySignal(east, [crossing], 12), true, "green north-south only");
  assert.equal(stoppedBySignal(car(10, 11, { x: 1, y: 0 }), [crossing], 9), false, "still far off");
  assert.equal(stoppedBySignal(car(21, 11, { x: 1, y: 0 }), [crossing], 9), false, "already in the crossing");
  assert.equal(stoppedBySignal(car(26, 11, { x: 1, y: 0 }), [crossing], 9), false, "already through it");
  assert.equal(stoppedBySignal(car(25, 11, { x: -1, y: 0 }), [crossing], 9), true, "approaching from the other side");
  assert.equal(stoppedBySignal(car(21, 7.5, { x: 0, y: 1 }), [crossing], 5), true, "north-south at east-west green");
  assert.equal(stoppedBySignal(car(21, 7.5, { x: 0, y: 1 }), [crossing], 12), false);
  assert.equal(stoppedBySignal(car(30, 7.5, { x: 0, y: 1 }), [crossing], 9), false, "not in line with the crossing");
  assert.equal(stoppedBySignal(east, [], 9), false, "no crossings, no signals");
});

test("an AI car holds at the stop line on red and drives on when it goes green; a car the squad drives ignores it", () => {
  const grid = createTileGrid({
    dimensions: { width: 40, height: 20 },
    regions: [
      { id: "ground", x: 0, y: 0, width: 40, height: 20, surface: "service-concrete", walkable: true, elevation: 0 },
      { id: "street-column-0", x: 20, y: 0, width: 4, height: 20, surface: "street", walkable: true, elevation: 0 },
      { id: "street-row-0", x: 0, y: 10, width: 40, height: 4, surface: "street", walkable: true, elevation: 0 },
    ],
  });
  const roads = createRoadGrid(grid);
  assert.equal(roads.crossings.length, 1);
  const definition = vehicleDefinition({
    id: "t",
    name: "T",
    kind: "city-car",
    stats: { health: 90, speed: 6, seats: 3, blastRadius: 3, blastDamage: 50 },
    appearance: {},
  });
  const make = (controlled) => {
    const vehicle = { ...car(14, 11, { x: 1, y: 0 }), definition };
    vehicle.vehicle.route = { route: [{ x: 38, y: 11 }], index: 0 };
    if (controlled) vehicle.vehicle.controlledBy = "p";
    vehicle.path = controlled ? [{ x: 38, y: 11 }] : [];
    return vehicle;
  };
  const driver = {
    id: "d",
    position: { x: 14, y: 11 },
    disabled: false,
    inVehicle: "car-1",
    health: 50,
    definition: { stats: { vitality: 50 } },
  };
  const run = (vehicle, from, seconds) => {
    // Pin the phase to a red light: time 9 to 10 is all red, 8 to 9 as well as 18 to 20.
    for (let step = 0; step < Math.round(seconds * 30); step += 1) {
      advanceVehicles([vehicle, driver], 1 / 30, roads, grid, from + step / 30);
    }
  };
  const waiting = make(false);
  roads.crossings[0].offset = 0;
  run(waiting, 8, 1.9);
  assert.ok(waiting.position.x < 20 && waiting.position.x > 14, `it stopped short of the crossing: ${waiting.position.x}`);
  const stopped = waiting.position.x;
  run(waiting, 8, 0.1);
  assert.ok(Math.abs(waiting.position.x - stopped) < 0.01, "and stays put while the light is red");
  run(waiting, 18.5, 3);
  assert.ok(waiting.position.x > 22, "once east-west is green again it goes through");

  const ignoring = make(true);
  run(ignoring, 8, 2);
  assert.ok(ignoring.position.x > waiting.position.x - 0.01 || ignoring.position.x > 20, "the squad's car drives straight on");
});
