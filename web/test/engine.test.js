// SPDX-License-Identifier: GPL-2.0-or-later

import assert from "node:assert/strict";
import test from "node:test";

import {
  applyGates,
  buildPatrolRoute,
  createTileGrid,
  formationTiles,
  isTerrainWalkable,
  isWalkable,
  findObjectiveAtPosition,
  findPath,
  gridToScreen,
  screenToGrid,
  zoneContains,
} from "../src/engine.js";
import {
  FIXED_STEP_SECONDS,
  advanceCombat,
  advancePatrols,
  advanceUnits,
  consumeFixedSteps,
} from "../src/simulation.js";

const map = {
  dimensions: { width: 5, height: 4 },
  regions: [
    { id: "ground", x: 0, y: 0, width: 5, height: 4, walkable: true, elevation: 0 },
    { id: "wall", x: 2, y: 0, width: 1, height: 3, walkable: false, elevation: 2 },
  ],
};

test("later regions override earlier map regions", () => {
  const grid = createTileGrid(map);
  assert.equal(grid[1][1].id, "ground");
  assert.equal(grid[1][2].id, "wall");
});

test("pathfinding routes around unwalkable regions", () => {
  const path = findPath(createTileGrid(map), { x: 0, y: 1 }, { x: 4, y: 1 });
  assert.ok(path.length > 4);
  assert.ok(path.every((position) => position.x !== 2 || position.y === 3));
  assert.deepEqual(path.at(-1), { x: 4, y: 1 });
});

test("isometric projection round-trips tile centers", () => {
  const cell = { width: 80, height: 40 };
  const origin = { x: 240, y: 50 };
  for (const position of [{ x: 0, y: 0 }, { x: 4, y: 2 }, { x: 1, y: 3 }]) {
    assert.deepEqual(screenToGrid(gridToScreen(position, cell, origin), cell, origin), position);
  }
});

test("zone containment excludes the far boundary", () => {
  const zone = { position: { x: 3, y: 2 }, width: 2, height: 2 };
  assert.equal(zoneContains(zone, { x: 4, y: 3 }), true);
  assert.equal(zoneContains(zone, { x: 5, y: 3 }), false);
});

test("interaction lookup finds only pending objectives in the active zone", () => {
  const objectives = [
    { id: "done", type: "interact", targetZone: "west", complete: true },
    { id: "pending", type: "interact", targetZone: "east", complete: false },
  ];
  const zones = [
    { id: "west", position: { x: 1, y: 1 }, width: 1, height: 1 },
    { id: "east", position: { x: 3, y: 2 }, width: 2, height: 2 },
  ];

  assert.equal(findObjectiveAtPosition(objectives, zones, { x: 3, y: 3 }, "interact")?.id, "pending");
  assert.equal(findObjectiveAtPosition(objectives, zones, { x: 1, y: 1 }, "interact"), null);
});

function movingUnit() {
  return {
    id: "operator-1",
    side: "team",
    definition: { stats: { speed: 3 } },
    position: { x: 0, y: 0 },
    path: [
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 2, y: 1 },
    ],
  };
}

test("fixed-step replay is independent of render-frame frequency", () => {
  const replay = (frameDurations) => {
    const unit = movingUnit();
    const clock = { accumulator: 0 };
    const arrivals = [];
    let ticks = 0;
    for (const duration of frameDurations) {
      consumeFixedSteps(clock, duration, (stepSeconds) => {
        arrivals.push(...advanceUnits([unit], stepSeconds));
        ticks += 1;
      });
    }
    return { unit, arrivals, ticks };
  };

  const thirtyFps = replay(Array(60).fill(FIXED_STEP_SECONDS));
  const sixtyFps = replay(Array(120).fill(FIXED_STEP_SECONDS / 2));

  assert.deepEqual(sixtyFps, thirtyFps);
  assert.deepEqual(thirtyFps.unit.position, { x: 2, y: 1 });
});

test("fixed-step clock retains fractional frame time", () => {
  const clock = { accumulator: 0 };
  let ticks = 0;
  const step = () => {
    ticks += 1;
  };

  consumeFixedSteps(clock, FIXED_STEP_SECONDS * 0.4, step);
  consumeFixedSteps(clock, FIXED_STEP_SECONDS * 0.6, step);

  assert.equal(ticks, 1);
  assert.equal(clock.accumulator, 0);
});

function combatUnits() {
  return [
    {
      id: "operator-one",
      side: "team",
      definition: { stats: { attack: 12, range: 3.25, cooldown: 0.75 } },
      position: { x: 1, y: 1 },
      path: [],
      health: 100,
      cooldownRemaining: 0,
      targetId: "watcher-one",
      disabled: false,
    },
    {
      id: "watcher-one",
      side: "opposition",
      definition: { stats: { attack: 6, range: 2.5, cooldown: 1.2 } },
      position: { x: 3, y: 1 },
      path: [],
      health: 45,
      cooldownRemaining: 0,
      targetId: null,
      disabled: false,
    },
  ];
}

test("combat replay applies deterministic damage and disabling", () => {
  const replay = () => {
    const units = combatUnits();
    const events = [];
    for (let tick = 0; tick < 120; tick += 1) {
      events.push(...advanceCombat(units, FIXED_STEP_SECONDS));
    }
    return { units, events };
  };

  const first = replay();
  const second = replay();
  assert.deepEqual(first, second);
  assert.equal(first.units[1].health, 0);
  assert.equal(first.units[1].disabled, true);
  assert.ok(first.events.some((event) => event.type === "disabled"));
});

test("combat does not apply damage outside weapon range", () => {
  const units = combatUnits();
  units[1].position = { x: 7, y: 5 };
  assert.deepEqual(advanceCombat(units, FIXED_STEP_SECONDS), []);
  assert.equal(units[0].health, 100);
  assert.equal(units[1].health, 45);
});

test("a closed gate blocks the route to the exit until its control opens", async () => {
  const { readFile } = await import("node:fs/promises");
  const map = JSON.parse(
    await readFile(new URL("../content/maps/signal-yard.map.json", import.meta.url), "utf8"),
  );
  const grid = createTileGrid(map);
  const start = { x: 116, y: 110 };
  const exit = { x: 122, y: 110 };

  applyGates(grid, map.objects, () => false);
  assert.deepEqual(findPath(grid, start, exit), []);
  assert.equal(isTerrainWalkable(grid, 117, 110), true);

  applyGates(grid, map.objects, () => true);
  assert.ok(findPath(grid, start, exit).length > 0);

  applyGates(grid, map.objects, () => false);
  assert.deepEqual(findPath(grid, start, exit), []);
});

test("gates never make blocked terrain walkable", () => {
  const grid = [[{ x: 0, y: 0, walkable: false }]];
  applyGates(grid, [{ id: "g", position: { x: 0, y: 0 }, width: 1, height: 1 }], () => true);
  assert.equal(isWalkable(grid, 0, 0), false);
});

test("formation tiles are distinct, walkable and nearest first", () => {
  const grid = createTileGrid(map);
  const tiles = formationTiles(grid, { x: 1, y: 1 }, 4);
  assert.equal(tiles.length, 4);
  assert.deepEqual(tiles[0], { x: 1, y: 1 });
  assert.equal(new Set(tiles.map((tile) => `${tile.x},${tile.y}`)).size, 4);
  assert.ok(tiles.every((tile) => isWalkable(grid, tile.x, tile.y)));
  assert.deepEqual(formationTiles(grid, { x: 2, y: 1 }, 3), []);
  assert.equal(formationTiles(grid, { x: 0, y: 0 }, 100).length, 17);
});

function patrolUnit(route, overrides = {}) {
  return {
    id: "guard",
    side: "opposition",
    definition: { stats: { speed: 3.25, range: 2.5, attack: 6, cooldown: 1.2 } },
    position: { ...route[0] },
    targetId: null,
    disabled: false,
    patrol: { route, index: 1 },
    ...overrides,
  };
}

test("patrol routes loop through the waypoints and back to the start", () => {
  const grid = createTileGrid(map);
  const route = buildPatrolRoute(grid, { x: 0, y: 1 }, [{ x: 4, y: 1 }]);
  assert.deepEqual(route.at(-1), { x: 0, y: 1 });
  assert.ok(route.some((tile) => tile.x === 4 && tile.y === 1));
  assert.deepEqual(buildPatrolRoute(grid, { x: 0, y: 1 }, [{ x: 2, y: 1 }]), []);
});

test("a patrol walks its route at a steady pace and loops", () => {
  const route = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 1, y: 0 }];
  const guard = patrolUnit(route);
  const visited = [];
  for (let step = 0; step < 600; step += 1) {
    advancePatrols([guard], FIXED_STEP_SECONDS);
    visited.push(guard.patrol.index);
  }
  assert.ok(guard.position.x >= 0 && guard.position.x <= 2);
  assert.ok(new Set(visited).size === route.length);
  // About 1 tile per second, so 600 steps (20 s) covers roughly 20 tiles of route.
  assert.ok(visited.filter((index, at) => index === 0 && visited[at - 1] === 3).length >= 4);
});

test("a patrol is repeatable, holds while engaged, and ignores disabled units", () => {
  const route = [{ x: 0, y: 0 }, { x: 3, y: 0 }];
  const run = () => {
    const guard = patrolUnit(route);
    for (let step = 0; step < 90; step += 1) advancePatrols([guard], FIXED_STEP_SECONDS);
    return guard.position;
  };
  assert.deepEqual(run(), run());

  const target = { id: "op", side: "team", disabled: false, position: { x: 1, y: 1 } };
  const guard = patrolUnit(route, { targetId: "op" });
  const before = { ...guard.position };
  advancePatrols([guard, target], 1);
  assert.deepEqual(guard.position, before);

  target.position = { x: 40, y: 40 };
  advancePatrols([guard, target], 1);
  assert.equal(guard.targetId, null);
  assert.notDeepEqual(guard.position, before);

  const down = patrolUnit(route, { disabled: true });
  advancePatrols([down], 1);
  assert.deepEqual(down.position, route[0]);
});
