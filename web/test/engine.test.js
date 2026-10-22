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
  screenToGridExact,
  screenToGrid,
  zoneContains,
} from "../src/engine.js";
import {
  FIXED_STEP_SECONDS,
  advanceCombat,
  castShot,
  hasLineOfSight,
  advanceFocus,
  advancePursuit,
  fireManual,
  advancePatrols,
  advancePersuasion,
  persuadeCheck,
  gunOut,
  startPanic,
  advanceUnits,
  combatStats,
  heldWeapon,
  roundsLeft,
  stealthFactor,
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
    definition: { stats: { speed: 3.25, range: 2.5, attack: 6, cooldown: 1.2, awareness: 85 } },
    position: { ...route[0] },
    path: [],
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

const streetMap = {
  dimensions: { width: 40, height: 5 },
  regions: [{ id: "road", x: 0, y: 0, width: 40, height: 5, walkable: true, elevation: 0 }],
};

function operatorAt(x, y, overrides = {}) {
  return {
    id: "op",
    side: "team",
    disabled: false,
    position: { x, y },
    path: [],
    definition: { stats: { speed: 4.5, range: 3.25, attack: 12, cooldown: 0.75, awareness: 70 } },
    ...overrides,
  };
}

test("a watcher spots a nearby operator once, chases, and stops within pulse range", () => {
  const grid = createTileGrid(streetMap);
  const guard = patrolUnit([{ x: 2, y: 2 }, { x: 4, y: 2 }]);
  const operator = operatorAt(8, 2);
  const events = [];
  for (let step = 0; step < 300; step += 1) {
    events.push(...advancePatrols([guard, operator], FIXED_STEP_SECONDS, grid));
  }
  assert.deepEqual(events, [{ type: "spotted", unitId: "guard", targetId: "op" }]);
  const gap = Math.hypot(guard.position.x - operator.position.x, guard.position.y - operator.position.y);
  assert.ok(gap <= 2.5 * 0.9 + 1e-6, `stopped ${gap} tiles away`);
  assert.deepEqual(guard.path, []);
});

test("a watcher ignores operators beyond its sight and cannot catch a fleeing one", () => {
  const grid = createTileGrid(streetMap);
  const guard = patrolUnit([{ x: 2, y: 2 }, { x: 4, y: 2 }]);
  const far = operatorAt(38, 2);
  assert.deepEqual(advancePatrols([guard, far], 1, grid), []);

  // An operator running away at full speed keeps its lead over the chaser.
  const operator = operatorAt(8, 2);
  const startGap = 6;
  for (let step = 0; step < 150; step += 1) {
    operator.position.x += (operator.definition.stats.speed * 0.7 * FIXED_STEP_SECONDS);
    advancePatrols([guard, operator], FIXED_STEP_SECONDS, grid);
  }
  assert.ok(operator.position.x - guard.position.x > startGap);
});

test("a watcher that loses its target returns to its route over real ground", () => {
  const grid = createTileGrid(streetMap);
  const route = [{ x: 2, y: 2 }, { x: 4, y: 2 }];
  const guard = patrolUnit(route);
  const operator = operatorAt(8, 2);
  for (let step = 0; step < 60; step += 1) advancePatrols([guard, operator], FIXED_STEP_SECONDS, grid);
  assert.ok(guard.position.x > 4);

  operator.position = { x: 39, y: 0 };
  for (let step = 0; step < 900; step += 1) advancePatrols([guard, operator], FIXED_STEP_SECONDS, grid);
  assert.ok(guard.position.x <= 4.5 && guard.position.x >= 1.5, `guard ended at ${guard.position.x}`);
  assert.equal(guard.alertedBy, null);
});

test("a higher speed level walks further in the same time", () => {
  const grid = createTileGrid(streetMap);
  const walkedBy = (speed) => {
    const unit = {
      ...operatorAt(0, 2),
      levels: { speed, brain: 3 },
      path: findPath(grid, { x: 0, y: 2 }, { x: 39, y: 2 }),
    };
    for (let step = 0; step < 90; step += 1) advanceUnits([unit], FIXED_STEP_SECONDS);
    return unit.position.x;
  };
  const slow = walkedBy(1);
  const normal = walkedBy(3);
  const fast = walkedBy(5);
  assert.ok(slow < normal && normal < fast);
  assert.ok(Math.abs(fast / normal - 1.4) < 0.01);
  assert.ok(Math.abs(slow / normal - 0.6) < 0.01);
});

test("a higher brain level fires the pulse more often", () => {
  const firedBy = (brain) => {
    const attacker = {
      ...operatorAt(0, 2),
      id: "shooter",
      levels: { speed: 3, brain },
      equipment: [{ definition: { action: "disable-pulse", effect: { attack: 1, range: 5, cooldown: 0.75 } } }],
      cooldownRemaining: 0,
      targetId: "dummy",
      health: 100,
    };
    const dummy = {
      ...operatorAt(1, 2),
      id: "dummy",
      side: "opposition",
      health: 100000,
      cooldownRemaining: 99,
      targetId: null,
    };
    let shots = 0;
    for (let step = 0; step < 30 * 20; step += 1) {
      shots += advanceCombat([attacker, dummy], FIXED_STEP_SECONDS).filter((event) => event.type === "damage").length;
    }
    return shots;
  };
  const slow = firedBy(1);
  const normal = firedBy(3);
  const quick = firedBy(5);
  assert.ok(slow < normal && normal < quick);
  assert.ok(quick / normal > 1.35 && quick / normal < 1.5);
});

test("walking tires an operator and slows them; resting recovers stamina", () => {
  const grid = createTileGrid(streetMap);
  const walker = {
    ...operatorAt(0, 2),
    levels: { speed: 3, brain: 3 },
    stamina: 1,
    path: findPath(grid, { x: 0, y: 2 }, { x: 39, y: 2 }),
  };
  const pace = () => {
    const from = walker.position.x;
    for (let step = 0; step < 30; step += 1) advanceUnits([walker], FIXED_STEP_SECONDS);
    return walker.position.x - from;
  };
  const fresh = pace();
  for (let step = 0; step < 30 * 6; step += 1) advanceUnits([walker], FIXED_STEP_SECONDS);
  assert.ok(walker.stamina < 0.95 && walker.stamina > 0);
  const tiredPace = pace();
  assert.ok(tiredPace < fresh, `tired ${tiredPace} should be below fresh ${fresh}`);

  walker.path = [];
  const tired = walker.stamina;
  for (let step = 0; step < 30 * 4; step += 1) advanceUnits([walker], FIXED_STEP_SECONDS);
  assert.ok(walker.stamina > tired && walker.stamina < 1);
});

test("stronger legs keep their stamina longer over the same walk", () => {
  const grid = createTileGrid(streetMap);
  const staminaAfter = (speed) => {
    const walker = {
      ...operatorAt(0, 2),
      levels: { speed, brain: 3 },
      stamina: 1,
      path: findPath(grid, { x: 0, y: 2 }, { x: 39, y: 2 }),
    };
    for (let step = 0; step < 30 * 8; step += 1) advanceUnits([walker], FIXED_STEP_SECONDS);
    return walker.stamina;
  };
  assert.ok(staminaAfter(5) > staminaAfter(3) && staminaAfter(3) > staminaAfter(1));
});

test("turning Brain up speeds the pulse at first, then mental fatigue pulls it back", () => {
  const shots = (brain, seconds, focus = 1) => {
    const attacker = {
      ...operatorAt(0, 2),
      id: "shooter",
      levels: { speed: 3, brain },
      focus,
      equipment: [{ definition: { action: "disable-pulse", effect: { attack: 1, range: 5, cooldown: 0.75 } } }],
      cooldownRemaining: 0,
      targetId: "dummy",
      health: 100,
    };
    const dummy = {
      ...operatorAt(1, 2),
      id: "dummy",
      side: "opposition",
      health: 100000,
      cooldownRemaining: 99,
      targetId: null,
    };
    let fired = 0;
    for (let step = 0; step < 30 * seconds; step += 1) {
      advanceFocus([attacker], FIXED_STEP_SECONDS);
      fired += advanceCombat([attacker, dummy], FIXED_STEP_SECONDS).filter((event) => event.type === "damage").length;
    }
    return { fired, focus: attacker.focus };
  };

  const early = shots(5, 10);
  const baseline = shots(3, 10);
  assert.ok(early.fired > baseline.fired, "a fresh Brain 5 outshoots the baseline");
  assert.equal(baseline.focus, 1, "baseline Brain never tires");

  const worn = shots(5, 10, 0);
  assert.ok(worn.fired < early.fired, "a spent mind fires slower than a fresh one");
  assert.ok(Math.abs(worn.fired - baseline.fired) <= 1, "spent Brain 5 falls back to the baseline");

  // Running at Brain 5 for a minute leaves the mind spent; turning it down recovers it.
  const strained = shots(5, 60);
  assert.ok(strained.focus < 0.05);
  const calm = shots(2, 30, strained.focus);
  assert.ok(calm.focus > strained.focus);
});

test("tired legs fall to a lower effective level, but strong legs resist it", () => {
  const grid = createTileGrid(streetMap);
  const paceAfterWalking = (speed) => {
    const walker = {
      ...operatorAt(0, 2),
      levels: { speed, brain: 3 },
      stamina: 0,
      path: findPath(grid, { x: 0, y: 2 }, { x: 39, y: 2 }),
    };
    for (let step = 0; step < 30; step += 1) advanceUnits([walker], FIXED_STEP_SECONDS);
    return walker.position.x;
  };
  const weak = paceAfterWalking(1);
  const average = paceAfterWalking(3);
  const strong = paceAfterWalking(5);
  assert.ok(weak <= average && average < strong);
  // Spent Legs 5 walk like a rested level 3.
  assert.ok(Math.abs(strong - 3.15) < 0.4);
});

function weaponItem(attack, range, cooldown) {
  return { definition: { action: "disable-pulse", effect: { attack, range, cooldown } }, charges: null };
}

test("a unit fights with the hardest-hitting weapon that reaches its target", () => {
  const light = { attack: 12, range: 3.25, cooldown: 0.75 };
  const heavy = { attack: 20, range: 4.5, cooldown: 1.4 };
  const carrier = { ...operatorAt(0, 0), equipment: [weaponItem(12, 3.25, 0.75), weaponItem(20, 4.5, 1.4)] };

  assert.deepEqual(combatStats(carrier), heavy, "reach is the longest weapon");
  assert.deepEqual(combatStats(carrier, 2), heavy, "the heavy weapon hits harder when both reach");
  assert.deepEqual(combatStats(carrier, 4), heavy, "only the heavy weapon reaches 4 tiles");
  assert.deepEqual(combatStats(carrier, 9), heavy, "out of reach falls back to the longest");
  const lightOnly = { ...operatorAt(0, 0), equipment: [weaponItem(12, 3.25, 0.75)] };
  assert.deepEqual(combatStats(lightOnly, 2), light);

  const unarmed = { ...operatorAt(0, 0), equipment: [] };
  assert.equal(combatStats(unarmed), unarmed.definition.stats, "no weapon: the unit's own stats");
});

test("an armed watcher hits harder and from further away", () => {
  const shotFrom = (equipment, gap) => {
    const watcher = patrolUnit([{ x: 5, y: 2 }, { x: 8, y: 2 }], { equipment });
    watcher.position = { x: 5, y: 2 };
    watcher.targetId = "op";
    watcher.cooldownRemaining = 0;
    const target = operatorAt(5 + gap, 2, { health: 100 });
    const events = advanceCombat([watcher, target], FIXED_STEP_SECONDS);
    return events.filter((event) => event.type === "damage").map((event) => event.amount);
  };
  assert.deepEqual(shotFrom([], 2), [6], "the watcher's own stats");
  assert.deepEqual(shotFrom([weaponItem(20, 4.5, 1.4)], 2), [20]);
  assert.deepEqual(shotFrom([], 4), [], "bare watchers cannot reach 4 tiles");
  assert.deepEqual(shotFrom([weaponItem(20, 4.5, 1.4)], 4), [20], "the heavy emitter can");
});

test("a shadow cloak shortens how far a watcher sees its wearer", () => {
  const grid = createTileGrid(streetMap);
  const cloak = { definition: { action: "stealth", effect: { sightFactor: 0.6 } }, charges: null };
  const spottedAt = (equipment, gap) => {
    const guard = patrolUnit([{ x: 2, y: 2 }, { x: 4, y: 2 }]);
    guard.position = { x: 2, y: 2 };
    const operator = operatorAt(2 + gap, 2, { equipment });
    return advancePatrols([guard, operator], FIXED_STEP_SECONDS, grid).length > 0;
  };
  // Awareness 85 gives a sight of 13.6 tiles; a cloak cuts it to 8.2.
  assert.equal(spottedAt([], 12), true);
  assert.equal(spottedAt([cloak], 12), false);
  assert.equal(spottedAt([cloak], 7), true);
  assert.equal(stealthFactor({ equipment: [cloak, { definition: { action: "stealth", effect: { sightFactor: 0.8 } } }] }), 0.6);
  assert.equal(stealthFactor({}), 1);
});

test("a chosen weapon is the one that fires, even when another would hit harder", () => {
  const light = weaponItem(12, 3.25, 0.75);
  const heavy = weaponItem(20, 4.5, 1.4);
  const carrier = { ...operatorAt(0, 0), equipment: [light, heavy], activeSlot: 0 };
  assert.deepEqual(combatStats(carrier, 2), light.definition.effect);
  assert.deepEqual(combatStats(carrier, 4), light.definition.effect, "no fallback: the chosen weapon only");

  carrier.activeSlot = 1;
  assert.deepEqual(combatStats(carrier, 2), heavy.definition.effect);

  // Back to automatic: the best weapon for the distance.
  carrier.activeSlot = null;
  assert.deepEqual(combatStats(carrier, 2), heavy.definition.effect);
  // A chosen slot that is not a weapon (or is empty) is ignored.
  const tool = { definition: { action: "stealth", effect: { sightFactor: 0.6 } }, charges: null };
  const odd = { ...operatorAt(0, 0), equipment: [tool, light], activeSlot: 0 };
  assert.deepEqual(combatStats(odd, 2), light.definition.effect);
  assert.deepEqual(combatStats({ ...odd, activeSlot: 5 }, 2), light.definition.effect);
});

test("a chosen short-range weapon cannot hit a target beyond its reach", () => {
  const carrier = {
    ...operatorAt(0, 0),
    id: "shooter",
    equipment: [weaponItem(12, 3.25, 0.75), weaponItem(20, 4.5, 1.4)],
    activeSlot: 0,
    cooldownRemaining: 0,
    targetId: "far",
  };
  const far = { ...operatorAt(4, 0), id: "far", side: "opposition", health: 100, cooldownRemaining: 99, targetId: null };
  assert.deepEqual(advanceCombat([carrier, far], FIXED_STEP_SECONDS), [], "4 tiles is past the light weapon");
  carrier.activeSlot = 1;
  assert.equal(advanceCombat([carrier, far], FIXED_STEP_SECONDS).length, 1, "the heavy weapon reaches");
});

function roundsWeapon(rounds, attack = 12, range = 3.25, cooldown = 0.75) {
  return { definition: { name: "Pulse", action: "disable-pulse", effect: { attack, range, cooldown } }, charges: rounds };
}

function shooterWith(equipment, overrides = {}) {
  return {
    ...operatorAt(0, 0),
    id: "shooter",
    equipment,
    cooldownRemaining: 0,
    targetId: "dummy",
    health: 100,
    ...overrides,
  };
}

const dummyTarget = () => ({
  ...operatorAt(1, 0),
  id: "dummy",
  side: "opposition",
  health: 100000,
  cooldownRemaining: 99,
  targetId: null,
});

function fireFor(units, seconds) {
  const events = [];
  for (let step = 0; step < 30 * seconds; step += 1) events.push(...advanceCombat(units, FIXED_STEP_SECONDS));
  return events.filter((event) => event.type === "damage");
}

test("every shot spends a round and an empty weapon stops firing", () => {
  const pulse = roundsWeapon(3);
  const shots = fireFor([shooterWith([pulse]), dummyTarget()], 20);
  assert.equal(shots.length, 3, "only three rounds to fire");
  assert.equal(pulse.charges, 0);
  assert.deepEqual(shots.map((shot) => shot.outOfRounds), [false, false, true], "the last round says so");
  assert.equal(shots.at(-1).weapon, "Pulse");
  assert.equal(fireFor([shooterWith([roundsWeapon(0)]), dummyTarget()], 5).length, 0);
});

test("a weapon with unlimited rounds never runs dry", () => {
  const endless = roundsWeapon(null);
  assert.ok(fireFor([shooterWith([endless]), dummyTarget()], 20).length > 20);
  assert.equal(endless.charges, null);
});

test("an operative can carry several of the same weapon, each with its own rounds", () => {
  const first = roundsWeapon(2);
  const second = roundsWeapon(2);
  const third = roundsWeapon(2);
  const squad = shooterWith([first, second, third]);
  const shots = fireFor([squad, dummyTarget()], 30);
  assert.equal(shots.length, 6, "three magazines of two rounds");
  assert.deepEqual([first.charges, second.charges, third.charges], [0, 0, 0]);
  assert.equal(roundsLeft(squad), 0);
  assert.equal(roundsLeft(shooterWith([roundsWeapon(5), roundsWeapon(7)])), 12, "rounds add up across copies");
  assert.equal(roundsLeft(shooterWith([])), null, "no weapon: natural attack, no rounds to count");
});

test("a chosen weapon that runs dry hands over to the next loaded one", () => {
  const chosen = roundsWeapon(1);
  const spare = roundsWeapon(4);
  const squad = shooterWith([chosen, spare], { activeSlot: 0 });
  const shots = fireFor([squad, dummyTarget()], 30);
  assert.equal(shots.length, 5);
  assert.equal(chosen.charges, 0);
  assert.equal(spare.charges, 0);
  assert.equal(combatStats(squad).range, 0, "once everything is empty the unit is disarmed");
});

test("an armed unit with no rounds left cannot fire or pick targets; an unarmed one still can", () => {
  const empty = shooterWith([roundsWeapon(0)]);
  assert.deepEqual(combatStats(empty), { attack: 0, range: 0, cooldown: 1 });
  const watcher = { ...patrolUnit([{ x: 0, y: 0 }, { x: 3, y: 0 }]), side: "opposition", equipment: [roundsWeapon(0)] };
  const target = operatorAt(1, 0, { health: 100 });
  advanceCombat([watcher, target], FIXED_STEP_SECONDS);
  assert.equal(watcher.targetId, null, "no weapon, no automatic target");

  const bare = { ...patrolUnit([{ x: 0, y: 0 }, { x: 3, y: 0 }]), side: "opposition", equipment: [] };
  advanceCombat([bare, operatorAt(1, 0, { health: 100 })], FIXED_STEP_SECONDS);
  assert.notEqual(bare.targetId, null, "the unarmed watcher fights with its own stats");
});

test("an operative holds a weapon only while one is selected and loaded", () => {
  const pistol = roundsWeapon(5);
  const rifle = roundsWeapon(3, 20, 4.5, 1.4);
  const medkit = { definition: { action: "restore-vitality", effect: { restoreVitality: 30 } }, charges: 1 };
  const operative = shooterWith([pistol, medkit, rifle], { targetId: null });

  assert.equal(heldWeapon(operative), null, "nothing selected: hands empty");
  assert.equal(heldWeapon({ ...operative, targetId: "w" }), rifle, "firing at a target: the weapon is out");
  assert.equal(heldWeapon({ ...operative, targetId: "w", equipment: [roundsWeapon(0)] }), null, "nothing to fire");
  assert.equal(heldWeapon({ ...operative, activeSlot: 0 }), pistol);
  assert.equal(heldWeapon({ ...operative, activeSlot: 2 }), rifle);
  assert.equal(heldWeapon({ ...operative, activeSlot: 1 }), null, "a medkit is not a weapon");
  assert.equal(heldWeapon({ ...operative, activeSlot: 9 }), null, "an empty slot holds nothing");
  assert.equal(heldWeapon({ ...operative, activeSlot: 0, disabled: true }), null, "disabled units drop it");

  // A selected weapon with no rounds left is put away.
  assert.equal(heldWeapon({ ...operative, equipment: [roundsWeapon(0)], activeSlot: 0 }), null);
});

test("a watcher draws its weapon only while it is alert or fighting", () => {
  const rifle = roundsWeapon(10, 20, 4.5, 1.4);
  const watcher = { ...patrolUnit([{ x: 0, y: 0 }, { x: 3, y: 0 }]), side: "opposition", equipment: [rifle] };
  assert.equal(heldWeapon(watcher), null, "on patrol: carried, not drawn");
  assert.equal(heldWeapon({ ...watcher, alertedBy: "op" }), rifle, "alert: weapon out");
  assert.equal(heldWeapon({ ...watcher, targetId: "op" }), rifle, "fighting: weapon out");
  assert.equal(heldWeapon({ ...watcher, alertedBy: "op", equipment: [] }), null, "unarmed watchers hold nothing");
  assert.equal(heldWeapon({ ...watcher, alertedBy: "op", disabled: true }), null);
});

test("a watcher that spots someone calls its neighbours, who then see further", () => {
  const grid = createTileGrid(streetMap);
  const spotter = patrolUnit([{ x: 14, y: 2 }, { x: 16, y: 2 }]);
  spotter.id = "spotter";
  spotter.position = { x: 14, y: 2 };
  const neighbour = patrolUnit([{ x: 9, y: 2 }, { x: 8, y: 2 }]);
  neighbour.id = "neighbour";
  neighbour.position = { x: 9, y: 2 };
  // 11 tiles from the spotter (inside its sight of 13.6) but 16 from the neighbour: outside its own
  // sight, inside the 18.4 tiles a called watcher sees.
  const operator = operatorAt(25, 2);

  advancePatrols([neighbour, operator], FIXED_STEP_SECONDS, grid);
  assert.equal(neighbour.alertedBy, null, "alone it does not see the operator");

  const events = advancePatrols([spotter, neighbour, operator], FIXED_STEP_SECONDS, grid);
  assert.deepEqual(events.map((event) => event.unitId), ["spotter", "neighbour"]);
  assert.equal(neighbour.alertedBy, "op", "called by the spotter (5 tiles away), it sees the same operator");

  // A watcher 25 tiles from the spotter is not called, and the operator is 14 tiles from it: just out of sight.
  const distant = patrolUnit([{ x: 39, y: 2 }, { x: 38, y: 2 }]);
  distant.id = "distant";
  distant.position = { x: 39, y: 2 };
  advancePatrols([spotter, distant, operator], FIXED_STEP_SECONDS, grid);
  assert.equal(spotter.alertedBy, "op");
  assert.equal(distant.alertedBy, null);
});

function chaser(x, y, equipment, overrides = {}) {
  return {
    ...operatorAt(x, y),
    id: "chaser",
    levels: { speed: 3, brain: 3 },
    stamina: 1,
    focus: 1,
    equipment,
    followId: "prey",
    health: 100,
    cooldownRemaining: 0,
    targetId: null,
    ...overrides,
  };
}

const prey = (x, y, overrides = {}) => ({
  ...operatorAt(x, y),
  id: "prey",
  side: "opposition",
  health: 75,
  disabled: false,
  patrol: null,
  targetId: null,
  cooldownRemaining: 99,
  ...overrides,
});

test("an operative follows a watcher out of range and shoots once it is in range", () => {
  const grid = createTileGrid(streetMap);
  const hunter = chaser(0, 2, [roundsWeapon(24)]);
  const watcher = prey(20, 2);
  const units = [hunter, watcher];

  advancePursuit(units, grid);
  assert.ok(hunter.path.length > 0, "out of range: it sets off after the watcher");
  assert.equal(hunter.targetId, null, "and does not fire yet");

  let shot = false;
  for (let step = 0; step < 30 * 20 && !shot; step += 1) {
    advancePursuit(units, grid);
    advanceUnits(units, FIXED_STEP_SECONDS);
    shot = advanceCombat(units, FIXED_STEP_SECONDS).some((event) => event.type === "damage");
  }
  assert.ok(shot, "it closes the distance and fires");
  assert.ok(Math.hypot(hunter.position.x - 20, hunter.position.y - 2) <= 3.25, "from inside weapon range");
  assert.deepEqual(hunter.path, [], "standing still while it shoots");
  assert.equal(hunter.targetId, "prey");
});

test("pursuit stops at the range of the selected weapon, not the best weapon", () => {
  const grid = createTileGrid(streetMap);
  const standOffAt = (activeSlot) => {
    const hunter = chaser(0, 2, [roundsWeapon(24, 12, 3.25, 0.75), roundsWeapon(10, 20, 4.5, 1.4)], { activeSlot });
    const watcher = prey(25, 2);
    for (let step = 0; step < 30 * 20; step += 1) {
      advancePursuit([hunter, watcher], grid);
      advanceUnits([hunter, watcher], FIXED_STEP_SECONDS);
      if (hunter.targetId) break;
    }
    return 25 - hunter.position.x;
  };
  const withPistol = standOffAt(0);
  const withRifle = standOffAt(1);
  assert.ok(withPistol <= 3.25 * 0.9 + 0.2, `pistol stops ${withPistol} tiles away`);
  assert.ok(withRifle > withPistol + 0.5 && withRifle <= 4.5 * 0.9 + 0.2, `rifle stops ${withRifle} tiles away`);
});

test("pursuit re-routes after a moving watcher and starts again when it backs out of range", () => {
  const grid = createTileGrid(streetMap);
  const hunter = chaser(0, 2, [roundsWeapon(24)]);
  const watcher = prey(10, 2);
  const units = [hunter, watcher];
  for (let step = 0; step < 30 * 4; step += 1) {
    advancePursuit(units, grid);
    advanceUnits(units, FIXED_STEP_SECONDS);
  }
  const closeTo = hunter.position.x;
  assert.ok(closeTo > 5, "it has closed in");

  watcher.position = { x: 36, y: 2 };
  advancePursuit(units, grid);
  assert.equal(hunter.targetId, null, "the watcher is far away again: stop firing");
  assert.ok(hunter.path.length > 0 && hunter.path.at(-1).x >= 35, "and a fresh route leads to its new place");
});

test("pursuit ends when the watcher falls, when rounds run out, or the operative is down", () => {
  const grid = createTileGrid(streetMap);
  const ended = (hunter, watcher) => {
    const events = advancePursuit([hunter, watcher], grid);
    return { events, followId: hunter.followId };
  };
  assert.deepEqual(ended(chaser(0, 2, [roundsWeapon(5)]), prey(5, 2, { disabled: true })), {
    events: [{ type: "ended", unitId: "chaser", reason: "disabled" }],
    followId: null,
  });
  assert.deepEqual(ended(chaser(0, 2, [roundsWeapon(0)]), prey(5, 2)).events, [
    { type: "ended", unitId: "chaser", reason: "no-rounds" },
  ]);
  assert.equal(ended(chaser(0, 2, [roundsWeapon(5)], { disabled: true }), prey(5, 2)).followId, null);
  assert.deepEqual(ended(chaser(0, 2, [roundsWeapon(5)], { followId: "gone" }), prey(5, 2)).events, [
    { type: "ended", unitId: "chaser", reason: "lost" },
  ]);
  // Units that are not following anyone are left alone.
  const idle = chaser(0, 2, [roundsWeapon(5)], { followId: null });
  assert.deepEqual(advancePursuit([idle, prey(5, 2)], grid), []);
  assert.deepEqual(idle.path, []);
});

function shooterAt(x, y, equipment, overrides = {}) {
  return {
    ...operatorAt(x, y),
    id: "gun",
    equipment,
    cooldownRemaining: 0,
    levels: { speed: 3, brain: 3 },
    stamina: 1,
    focus: 1,
    health: 100,
    ...overrides,
  };
}

test("a manual shot hits the first standing enemy along the line and spends a round", () => {
  const grid = createTileGrid(streetMap);
  const pistol = roundsWeapon(5);
  const shooter = shooterAt(2, 2, [pistol]);
  const near = prey(4, 2, { id: "near" });
  const far = prey(5, 2, { id: "far" });
  const result = fireManual(shooter, { x: 20, y: 2 }, [shooter, far, near], grid);

  assert.equal(result.fired, true);
  assert.deepEqual(result.events.map((event) => [event.type, event.targetId]), [["damage", "near"]]);
  assert.equal(near.health, 75 - 12);
  assert.equal(far.health, 75, "only the first in line is hit");
  assert.equal(pistol.charges, 4);
  assert.ok(shooter.cooldownRemaining > 0);
  assert.deepEqual(shooter.aimAt, { x: 20, y: 2 });
});

test("a manual shot that hits nothing reports where it ended and still costs a round", () => {
  const grid = createTileGrid(streetMap);
  const pistol = roundsWeapon(1);
  const shooter = shooterAt(2, 2, [pistol]);
  const aside = prey(3, 4, { id: "aside" });
  const result = fireManual(shooter, { x: 20, y: 2 }, [shooter, aside], grid);
  assert.equal(result.fired, true);
  assert.equal(result.events[0].type, "shot");
  assert.ok(Math.abs(result.events[0].end.x - (2 + 3.25)) < 0.3, "it flew to the end of its range");
  assert.equal(result.events[0].outOfRounds, true, "that was the last round");
  assert.equal(aside.health, 75);
});

test("a manual shot stops at walls, ignores the disabled and never hits friends", () => {
  const grid = createTileGrid(map);
  const shooter = shooterAt(0, 1, [roundsWeapon(9, 12, 6, 0.75)]);
  const behindWall = prey(4, 1, { id: "behind" });
  const result = fireManual(shooter, { x: 4, y: 1 }, [shooter, behindWall], grid);
  assert.equal(result.events[0].type, "shot", "the wall at x=2 stops it");
  assert.equal(behindWall.health, 75);

  const open = createTileGrid(streetMap);
  const gunner = shooterAt(2, 2, [roundsWeapon(9)]);
  const down = prey(4, 2, { id: "down", disabled: true });
  const friend = operatorAt(3, 2, { id: "friend" });
  const out = fireManual(gunner, { x: 9, y: 2 }, [gunner, down, friend], open);
  assert.equal(out.events[0].type, "shot");
});

test("a manual shot respects recharge, rounds and the selected weapon's range", () => {
  const grid = createTileGrid(streetMap);
  const pistol = roundsWeapon(9, 12, 3.25, 0.75);
  const rifle = roundsWeapon(9, 20, 4.5, 1.4);
  const target = prey(7, 2);

  const picked = shooterAt(2, 2, [pistol, rifle], { activeSlot: 0 });
  assert.equal(fireManual(picked, { x: 7, y: 2 }, [picked, target], grid).events[0].type, "shot", "5 tiles is past the pistol");
  const heavy = shooterAt(2, 2, [pistol, rifle], { activeSlot: 1 });
  assert.equal(fireManual(heavy, { x: 7, y: 2 }, [heavy, target], grid).events[0].type, "damage", "the rifle reaches");
  assert.equal(target.health, 75 - 20);

  assert.equal(fireManual(heavy, { x: 7, y: 2 }, [heavy, target], grid).reason, "recharging");
  const ready = (equipment) => ({ ...picked, cooldownRemaining: 0, equipment });
  assert.equal(fireManual(ready([roundsWeapon(0)]), { x: 7, y: 2 }, [target], grid).reason, "no-rounds");
  assert.equal(fireManual(ready([]), { x: 7, y: 2 }, [target], grid).fired, true, "own natural attack");
  assert.equal(fireManual({ ...picked, disabled: true }, { x: 7, y: 2 }, [target], grid).reason, "down");
});

test("a manual shot can disable a watcher", () => {
  const grid = createTileGrid(streetMap);
  const gun = shooterAt(2, 2, [roundsWeapon(9)]);
  const weak = prey(4, 2, { health: 10 });
  const result = fireManual(gun, { x: 4, y: 2 }, [gun, weak], grid);
  assert.deepEqual(result.events.map((event) => event.type), ["damage", "disabled"]);
  assert.equal(weak.disabled, true);
});

test("screen positions convert back to exact grid positions for aiming", () => {
  const cell = { width: 80, height: 40 };
  const origin = { x: 240, y: 50 };
  const point = gridToScreen({ x: 3.4, y: 1.7 }, cell, origin);
  const exact = screenToGridExact(point, cell, origin);
  assert.ok(Math.abs(exact.x - 3.4) < 1e-9 && Math.abs(exact.y - 1.7) < 1e-9);
});

test("a unit that has just fired by hand holds its weapon for a moment", () => {
  const pistol = roundsWeapon(5);
  const operative = shooterAt(0, 0, [pistol], { targetId: null, firedAt: 10 });
  assert.equal(heldWeapon(operative, 10.5), pistol);
  assert.equal(heldWeapon(operative, 11), null, "put away again after a moment");
  assert.equal(heldWeapon(operative), null, "without a clock it only holds a selected or targeted weapon");
});

const walledMap = {
  dimensions: { width: 20, height: 5 },
  regions: [
    { id: "road", x: 0, y: 0, width: 20, height: 5, surface: "service-concrete", walkable: true, elevation: 0 },
    { id: "block", x: 8, y: 0, width: 2, height: 5, surface: "utility-building", walkable: false, elevation: 3 },
  ],
};

test("a building blocks line of sight; open ground and fences do not", () => {
  const grid = createTileGrid(walledMap);
  assert.equal(hasLineOfSight(grid, { x: 2, y: 2 }, { x: 6, y: 2 }), true, "open ground");
  assert.equal(hasLineOfSight(grid, { x: 2, y: 2 }, { x: 14, y: 2 }), false, "through the building");
  assert.equal(hasLineOfSight(null, { x: 2, y: 2 }, { x: 14, y: 2 }), true, "no map, no cover");
  const fenced = createTileGrid({
    ...walledMap,
    regions: [walledMap.regions[0], { ...walledMap.regions[1], surface: "service-fence", elevation: 1 }],
  });
  assert.equal(hasLineOfSight(fenced, { x: 2, y: 2 }, { x: 14, y: 2 }), true, "chain-link is see-through");
});

test("watchers do not spot operators hidden behind a building, and cannot shoot through it", () => {
  const grid = createTileGrid(walledMap);
  const guard = patrolUnit([{ x: 6, y: 2 }, { x: 7, y: 2 }]);
  const hidden = operatorAt(12, 2);
  assert.deepEqual(advancePatrols([guard, hidden], 1, grid), [], "no one seen through the building");
  const clear = operatorAt(2, 2);
  assert.equal(advancePatrols([guard, clear], 1, grid).length, 1, "an operator in the open is seen");

  const shooter = { ...operatorAt(7, 2, { id: "shooter", cooldownRemaining: 0 }), side: "opposition", targetId: null };
  const target = operatorAt(10.5, 2, { cooldownRemaining: 0, targetId: null });
  assert.deepEqual(advanceCombat([shooter, target], FIXED_STEP_SECONDS, grid), []);
});

function copAt(x, y, overrides = {}) {
  return patrolUnit([{ x, y }, { x: x + 1, y }], {
    id: "cop",
    side: "police",
    alertedBy: null,
    cooldownRemaining: 0,
    definition: { stats: { speed: 4, range: 4.5, attack: 10, cooldown: 1, awareness: 75 } },
    ...overrides,
  });
}

test("police ignore an operator with no weapon out, but act on one who draws it", () => {
  const grid = createTileGrid(streetMap);
  const cop = copAt(6, 2);
  const operator = operatorAt(12, 2, { activeSlot: null, targetId: null, equipment: [weaponItem(12, 3.25, 0.75)] });
  assert.equal(gunOut(operator, 10), false);
  assert.deepEqual(advancePatrols([cop, operator], 1, grid, 10), [], "no gun, no interest");
  operator.activeSlot = 0;
  assert.equal(gunOut(operator, 10), true);
  assert.equal(gunOut(operator, null), false, "without a clock police cannot react");
  const events = advancePatrols([cop, operator], 1, grid, 10);
  assert.deepEqual(events, [{ type: "spotted", unitId: "cop", targetId: "op" }]);
  assert.equal(cop.alertedBy, "op");
});

test("police shoot an armed operator in range and stop when the weapon is put away", () => {
  const grid = createTileGrid(streetMap);
  const cop = copAt(6, 2, { alertedBy: "op" });
  const operator = operatorAt(9, 2, { activeSlot: 0, targetId: null, equipment: [weaponItem(12, 3.25, 0.75)] });
  const first = advanceCombat([cop, operator], FIXED_STEP_SECONDS, grid, 10);
  assert.equal(first.filter((event) => event.type === "damage" && event.attackerId === "cop").length, 1);
  operator.activeSlot = null;
  advancePatrols([cop, operator], 1, grid, 10);
  assert.equal(cop.targetId, null, "the weapon is away: the cop holds fire");
  assert.deepEqual(advanceCombat([cop, operator], 1, grid, 20), []);
});

test("watchers and police never shoot civilians, and civilians notice no one", () => {
  const grid = createTileGrid(streetMap);
  const civilian = patrolUnit([{ x: 7, y: 2 }, { x: 8, y: 2 }], { id: "civ", side: "civilian", cooldownRemaining: 0 });
  const watcher = patrolUnit([{ x: 5, y: 2 }, { x: 6, y: 2 }], { cooldownRemaining: 0 });
  assert.deepEqual(advanceCombat([watcher, civilian], 1, grid, 10), []);
  const operator = operatorAt(8, 2, { activeSlot: 0, equipment: [weaponItem(12, 3.25, 0.75)] });
  assert.deepEqual(advancePatrols([civilian, operator], 1, grid, 10), []);
  assert.equal(civilian.alertedBy ?? null, null);
});

test("gunfire sends nearby civilians running away from it for a few seconds", () => {
  const grid = createTileGrid(streetMap);
  const near = patrolUnit([{ x: 20, y: 2 }, { x: 22, y: 2 }], { id: "near", side: "civilian" });
  const far = patrolUnit([{ x: 38, y: 2 }, { x: 39, y: 2 }], { id: "far", side: "civilian" });
  const fled = startPanic([near, far], { x: 16, y: 2 }, grid, 100);
  assert.equal(fled, 1, "only the one within earshot");
  assert.ok(near.path.length > 0 && near.path.at(-1).x > near.position.x, "runs away from the shooter");
  assert.equal(far.path.length, 0);
  const start = near.position.x;
  for (let step = 0; step < 30; step += 1) advancePatrols([near, far], FIXED_STEP_SECONDS, grid, 100);
  const sprinted = near.position.x - start;
  assert.ok(sprinted > 2.5, `ran ${sprinted} tiles in a second`);
});

function persuaderItem(charges = 30) {
  return { definition: { id: "persuader", action: "persuade", effect: { range: 3.5, cooldown: 1.2 } }, charges };
}

function personAt(id, side, x, y = 2, overrides = {}) {
  return patrolUnit([{ x, y }, { x: x + 1, y }], {
    id,
    side,
    alertedBy: null,
    cooldownRemaining: 0,
    definition: { stats: { speed: 3, range: 1, attack: 0, cooldown: 1, awareness: 40, vitality: 40 } },
    ...overrides,
  });
}

function persuader(overrides = {}) {
  return operatorAt(10, 2, { id: "agent", persuading: true, equipment: [persuaderItem()], ...overrides });
}

test("a Persuader wins over a nearby civilian, who then follows the agent", () => {
  const grid = createTileGrid(streetMap);
  const agent = persuader();
  const civilian = personAt("civ", "civilian", 12);
  const events = advancePersuasion([agent, civilian], 0.1, grid);
  assert.deepEqual(events.map((event) => [event.type, event.kind, event.count]), [["persuaded", "civilian", 1]]);
  assert.equal(civilian.persuaded, true);
  assert.equal(civilian.persuadedBy, "agent");
  assert.equal(agent.equipment[0].charges, 29);
  // The agent walks off; the follower keeps up.
  agent.position = { x: 24, y: 2 };
  for (let step = 0; step < 300; step += 1) advancePatrols([agent, civilian], FIXED_STEP_SECONDS, grid, 5);
  assert.ok(Math.hypot(civilian.position.x - 24, civilian.position.y - 2) <= 2.2, "caught up with the agent");
});

test("the Persuader needs to be switched on, in range, and have charges", () => {
  const grid = createTileGrid(streetMap);
  const civilian = personAt("civ", "civilian", 12);
  assert.deepEqual(advancePersuasion([persuader({ persuading: false }), civilian], 1, grid), []);
  assert.deepEqual(advancePersuasion([persuader(), personAt("far", "civilian", 20)], 1, grid), []);
  assert.deepEqual(advancePersuasion([persuader({ equipment: [persuaderItem(0)] }), civilian], 1, grid), []);
  assert.equal(civilian.persuaded, undefined);
});

test("police need six persuaded civilians first, and enemy agents four police", () => {
  const grid = createTileGrid(streetMap);
  const agent = persuader();
  const cop = personAt("cop", "police", 11);
  const enemy = personAt("enemy", "opposition", 11);
  assert.deepEqual(persuadeCheck(agent, cop), { ok: false, kind: "police", needs: "6 more civilians" });
  assert.deepEqual(persuadeCheck(agent, enemy), { ok: false, kind: "opposition", needs: "4 more police" });
  const refused = advancePersuasion([agent, cop], 0.1, grid);
  assert.equal(refused[0].type, "refused");
  assert.equal(cop.persuaded, undefined);

  agent.persuasions = { civilian: 5, police: 0, opposition: 0 };
  assert.equal(persuadeCheck(agent, cop).ok, false, "five is not enough");
  agent.persuasions.civilian = 6;
  assert.equal(persuadeCheck(agent, cop).ok, true);
  assert.equal(persuadeCheck(agent, enemy).ok, false, "police first");
  agent.persuasions.police = 4;
  assert.equal(persuadeCheck(agent, enemy).ok, true);

  // Counts are the persuading agent's own: another agent starts from nothing.
  assert.equal(persuadeCheck(persuader({ id: "other" }), cop).ok, false);
});

test("one person is persuaded at a time, nearest first, and the cooldown spaces them", () => {
  const grid = createTileGrid(streetMap);
  const agent = persuader();
  const near = personAt("near", "civilian", 11);
  const further = personAt("further", "civilian", 12);
  advancePersuasion([agent, further, near], 0.1, grid);
  assert.equal(near.persuaded, true);
  assert.equal(further.persuaded, undefined);
  assert.deepEqual(advancePersuasion([agent, further, near], 0.5, grid), [], "still recharging");
  assert.equal(advancePersuasion([agent, further, near], 1, grid).length, 1);
  assert.equal(agent.persuasions.civilian, 2);
});

test("persuaded followers are not shot at by hand and a persuaded enemy fights for the squad", () => {
  const grid = createTileGrid(streetMap);
  const follower = personAt("civ", "civilian", 12, 2, { persuaded: true, persuadedBy: "agent" });
  const shooter = operatorAt(10, 2, { id: "agent", cooldownRemaining: 0, equipment: [weaponItem(12, 3.25, 0.75)] });
  assert.equal(castShot(shooter, { x: 14, y: 2 }, [shooter, follower], grid, 4).target, null, "friends are not hit");
  const turned = personAt("turned", "opposition", 20, 2, {
    persuaded: true,
    persuadedBy: "agent",
    definition: { stats: { speed: 4, range: 3.25, attack: 12, cooldown: 1, awareness: 85 } },
  });
  const other = personAt("other", "opposition", 22, 2, {
    definition: { stats: { speed: 4, range: 3.25, attack: 12, cooldown: 1, awareness: 85 } },
  });
  const events = advanceCombat([turned, other, shooter], FIXED_STEP_SECONDS, grid, 1);
  assert.equal(events.filter((event) => event.type === "damage" && event.attackerId === "turned" && event.targetId === "other").length, 1);
  assert.equal(events.filter((event) => event.targetId === "turned").length, 0, "no one shoots the turned agent");
});
