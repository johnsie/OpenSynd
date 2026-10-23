// SPDX-License-Identifier: GPL-2.0-or-later

import assert from "node:assert/strict";
import test from "node:test";

import { createTileGrid, findPath, hasLineOfSight } from "../src/engine.js";
import { DOOR_REACH, gateOpen, syncGates } from "../src/mission.js";
import { castShot } from "../src/simulation.js";

// A wall across column 10 with one door in it, open ground either side.
const map = {
  dimensions: { width: 20, height: 9 },
  regions: [
    { id: "ground", x: 0, y: 0, width: 20, height: 9, surface: "street", walkable: true, elevation: 0 },
    { id: "wall", x: 10, y: 0, width: 1, height: 9, surface: "wall", walkable: false, elevation: 1 },
    { id: "doorway", x: 10, y: 4, width: 1, height: 1, surface: "street", walkable: true, elevation: 0 },
  ],
};
const door = { id: "side-door", kind: "door", position: { x: 10, y: 4 }, width: 1, height: 1 };
const doorMap = { ...map, objects: [door] };
const person = (id, x, y, over = {}) => ({ id, side: "team", position: { x, y }, disabled: false, equipment: [], ...over });

const fresh = () => createTileGrid(map);

test("a door opens for a living person beside it and closes when they leave", () => {
  assert.equal(gateOpen([], door, []), false, "nobody near");
  assert.equal(gateOpen([], door, [person("a", 10 - DOOR_REACH + 0.1, 4)]), true);
  assert.equal(gateOpen([], door, [person("a", 5, 4)]), false, "too far");
  assert.equal(gateOpen([], door, [person("a", 9, 4, { disabled: true })]), false, "the fallen do not open doors");
  assert.equal(gateOpen([], door, [person("a", 9, 4, { inVehicle: "car" })]), false, "nor do people inside a vehicle");
  assert.equal(gateOpen([], door, [person("foe", 11, 4, { side: "opposition" })]), true, "anyone opens it, either side");
});

test("a closed door blocks sight and shots but routes still plan through it", () => {
  const grid = fresh();
  syncGates(grid, doorMap, [], []);
  assert.equal(grid[4][10].door.open, false);
  assert.equal(hasLineOfSight(grid, { x: 8, y: 4 }, { x: 12, y: 4 }), false, "a closed door blocks sight");
  const shooter = person("s", 8, 4);
  assert.equal(castShot(shooter, { x: 14, y: 4 }, [shooter, person("t", 12, 4, { side: "opposition" })], grid, 10).target, null);
  assert.ok(findPath(grid, { x: 8, y: 4 }, { x: 12, y: 4 }).length > 0, "a walker can plan through a closed door");

  const walker = person("w", 9, 4);
  syncGates(grid, doorMap, [], [walker]);
  assert.equal(grid[4][10].door.open, true);
  assert.equal(hasLineOfSight(grid, { x: 8, y: 4 }, { x: 12, y: 4 }), true, "open: sight returns");
  const target = person("t", 12, 4, { side: "opposition" });
  assert.equal(castShot(walker, { x: 14, y: 4 }, [walker, target], grid, 10).target, target);
  syncGates(grid, doorMap, [], [{ ...walker, position: { x: 3, y: 4 } }]);
  assert.equal(grid[4][10].door.open, false, "closes again once they move off");
});

test("a locked door only opens for someone carrying its key", () => {
  const locked = { ...door, key: "key" };
  const withKey = person("k", 9, 4, { equipment: [{ definition: { id: "key" } }] });
  assert.equal(gateOpen([], locked, [person("a", 9, 4)]), false);
  assert.equal(gateOpen([], locked, [withKey]), true);
  assert.equal(gateOpen([], locked, [{ ...withKey, position: { x: 3, y: 4 } }]), false, "the key must be beside it");
});
