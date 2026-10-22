// SPDX-License-Identifier: GPL-2.0-or-later

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildPatrolRoute, createTileGrid, findPath, isWalkable } from "../src/engine.js";
import {
  gateOpen,
  missionComplete,
  missionOutcome,
  resolveArrival,
  resolveInteraction,
  syncGates,
} from "../src/mission.js";
import { FIXED_STEP_SECONDS, advanceCombat, advancePatrols, advanceUnits } from "../src/simulation.js";

const read = async (path) =>
  JSON.parse(await readFile(new URL(`../content/${path}`, import.meta.url), "utf8"));

async function loadMission() {
  const mission = await read("missions/restore-relay.mission.json");
  const map = await read(mission.map);
  const definition = await read("units/field-operator.unit.json");
  const placement = mission.team[0];
  const unit = {
    id: placement.id,
    side: "team",
    definition,
    position: { ...placement.position },
    path: [],
  };
  const objectives = mission.objectives.map((objective) => ({ ...objective, complete: false }));
  const grid = createTileGrid(map);
  syncGates(grid, map, objectives);
  return { mission, map, unit, objectives, grid };
}

// Walk the unit along a route at the fixed step, resolving arrivals as the game does.
function walk(game, destination) {
  const path = findPath(game.grid, game.unit.position, destination);
  assert.ok(path.length > 0, `no route to ${destination.x},${destination.y}`);
  game.unit.path = path;
  let steps = 0;
  while (game.unit.path.length > 0) {
    for (const arrival of advanceUnits([game.unit], FIXED_STEP_SECONDS)) {
      for (const event of resolveArrival(game.objectives, game.map.zones, arrival.position)) {
        if (event.type === "complete") game.log.push(event.objective.id);
      }
      syncGates(game.grid, game.map, game.objectives);
    }
    steps += 1;
    assert.ok(steps < 5000, "unit never arrived");
  }
  return steps;
}

function interact(game) {
  const objective = resolveInteraction(game.objectives, game.map.zones, {
    x: Math.round(game.unit.position.x),
    y: Math.round(game.unit.position.y),
  });
  if (objective) game.log.push(objective.id);
  syncGates(game.grid, game.map, game.objectives);
  return objective;
}

test("a full First Light playthrough completes in order and is repeatable", async () => {
  const runs = [];
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const game = await loadMission();
    game.log = [];
    const steps = [];

    // The exit is sealed until the control panel is used.
    assert.equal(isWalkable(game.grid, 117, 110), false);
    assert.deepEqual(findPath(game.grid, { x: 116, y: 110 }, { x: 122, y: 110 }), []);

    steps.push(walk(game, { x: 27, y: 51 }));
    assert.ok(interact(game));
    steps.push(walk(game, { x: 99, y: 75 }));
    assert.ok(interact(game));
    assert.equal(missionComplete(game.objectives), false);

    steps.push(walk(game, { x: 99, y: 99 }));
    assert.equal(gateOpen(game.objectives, game.map.objects[0]), false);
    assert.ok(interact(game));
    assert.equal(gateOpen(game.objectives, game.map.objects[0]), true);
    assert.equal(isWalkable(game.grid, 117, 110), true);

    steps.push(walk(game, { x: 122, y: 110 }));
    assert.equal(missionComplete(game.objectives), true);
    runs.push({ log: game.log, steps });
  }

  assert.deepEqual(runs[0].log, ["restore-west", "restore-east", "open-gate", "leave-yard"]);
  assert.deepEqual(runs[0], runs[1]);
  // Golden values: fixed-step counts for each leg at 30 Hz. A change here means
  // routes, movement speed or fatigue changed and replays need regenerating.
  // Fatigue is included: one operator walking the whole mission with no rest slows each leg.
  assert.deepEqual(runs[0].steps, [362, 1264, 449, 648]);
});

test("extraction stays blocked until every other required objective is complete", () => {
  const zones = [{ id: "exit", kind: "exit", position: { x: 0, y: 0 }, width: 1, height: 1 }];
  const objectives = [
    { id: "a", type: "interact", targetZone: "x", required: true, complete: false },
    { id: "leave", type: "extract", targetZone: "exit", required: true, complete: false },
  ];
  const blocked = resolveArrival(objectives, zones, { x: 0, y: 0 });
  assert.deepEqual(blocked.map((event) => event.type), ["blocked"]);
  assert.equal(objectives[1].complete, false);

  objectives[0].complete = true;
  const done = resolveArrival(objectives, zones, { x: 0, y: 0 });
  assert.deepEqual(done.map((event) => event.type), ["complete"]);
  assert.equal(missionComplete(objectives), true);
});

async function loadSquad() {
  const mission = await read("missions/restore-relay.mission.json");
  const definitions = {
    operator: await read("units/field-operator.unit.json"),
    drone: await read("units/security-watcher.unit.json"),
  };
  const equipment = {
    "equipment/civic-pulse-emitter.equipment.json": await read("equipment/civic-pulse-emitter.equipment.json"),
    "equipment/field-repair-kit.equipment.json": await read("equipment/field-repair-kit.equipment.json"),
  };
  return [...mission.team, ...mission.opponents].map((placement) => {
    const definition = placement.unit.includes("operator") ? definitions.operator : definitions.drone;
    return {
      id: placement.id,
      side: definition.role === "operator" ? "team" : "opposition",
      definition,
      position: { ...placement.position },
      path: [],
      equipment: placement.equipment.map((path) => ({ definition: equipment[path], charges: equipment[path].charges })),
      health: definition.stats.vitality,
      cooldownRemaining: 0,
      targetId: null,
      disabled: false,
    };
  });
}

test("a squad fight against a watcher resolves identically on every run", async () => {
  const runs = [];
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const units = await loadSquad();
    const byId = Object.fromEntries(units.map((unit) => [unit.id, unit]));
    // Two operators close to within pulse range of the first watcher and engage it.
    byId["watcher-one"].position = { x: 28, y: 40 };
    byId["operator-one"].position = { x: 26, y: 40 };
    byId["operator-two"].position = { x: 26, y: 41 };
    byId["operator-one"].targetId = "watcher-one";
    byId["operator-two"].targetId = "watcher-one";

    const events = [];
    for (let step = 1; step <= 600 && !byId["watcher-one"].disabled; step += 1) {
      for (const event of advanceCombat(units, FIXED_STEP_SECONDS)) {
        events.push({ step, ...event });
      }
    }
    runs.push({
      events,
      health: Object.fromEntries(units.map((unit) => [unit.id, unit.health])),
    });
  }

  assert.deepEqual(runs[0], runs[1]);
  const [run] = runs;
  assert.equal(run.events.at(-1).type, "disabled");
  assert.equal(run.events.at(-1).unitId, "watcher-one");
  // Golden values at 30 Hz: the watcher falls on step 24 after six pulses and
  // lands one retaliation hit; the other watchers are untouched.
  assert.equal(run.events.at(-1).step, 24);
  assert.equal(run.events.length, 6);
  assert.deepEqual(run.health, {
    "operator-one": 94,
    "operator-two": 100,
    "operator-three": 100,
    "operator-four": 100,
    "watcher-one": 0,
    "watcher-two": 45,
    "watcher-three": 45,
    "watcher-four": 45,
    "watcher-five": 45,
    "watcher-six": 45,
  });
});

test("mission outcome is active, success or failure", () => {
  const objectives = [{ id: "a", required: true, complete: false }];
  const operator = (disabled) => ({ side: "team", disabled });
  const drone = { side: "opposition", disabled: false };

  assert.equal(missionOutcome(objectives, [operator(false), drone]), "active");
  assert.equal(missionOutcome(objectives, [operator(true), operator(false), drone]), "active");
  assert.equal(missionOutcome(objectives, [operator(true), drone]), "failure");
  objectives[0].complete = true;
  assert.equal(missionOutcome(objectives, [operator(true), drone]), "success");
});

test("an undefended squad loses to the watchers at a repeatable step", async () => {
  const runs = [];
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const units = await loadSquad();
    const byId = Object.fromEntries(units.map((unit) => [unit.id, unit]));
    // Everyone stands inside both watchers' range and never fights back.
    byId["watcher-one"].position = { x: 28, y: 40 };
    const centre = { x: 27, y: 40 };
    for (const [index, unit] of units.entries()) {
      unit.position = { x: centre.x + (index % 3) * 0.5, y: centre.y + Math.floor(index / 3) * 0.5 };
    }
    const objectives = [{ id: "a", required: true, complete: false }];

    let step = 0;
    while (missionOutcome(objectives, units) === "active" && step < 20000) {
      step += 1;
      advanceCombat(units, FIXED_STEP_SECONDS);
    }
    runs.push({ step, outcome: missionOutcome(objectives, units), watchers: byId["watcher-one"].health });
  }

  assert.deepEqual(runs[0], runs[1]);
  assert.equal(runs[0].outcome, "failure");
  // Golden value at 30 Hz: about 13 seconds of sustained fire, no watcher touched.
  assert.deepEqual(runs[0], { step: 397, outcome: "failure", watchers: 45 });
});

test("every First Light watcher patrols a real route that stays on walkable ground", async () => {
  const mission = await read("missions/restore-relay.mission.json");
  const map = await read(mission.map);
  const definition = await read("units/security-watcher.unit.json");
  const grid = createTileGrid(map);
  const watchers = mission.opponents.map((placement) => {
    const route = buildPatrolRoute(grid, placement.position, placement.patrol);
    assert.ok(route.length > 0, `${placement.id} has no valid patrol route`);
    return {
      id: placement.id,
      side: "opposition",
      definition,
      position: { ...placement.position },
      path: [],
      targetId: null,
      disabled: false,
      patrol: { route, index: 0 },
    };
  });

  const startedAt = watchers.map((unit) => ({ ...unit.position }));
  for (let step = 0; step < 30 * 120; step += 1) {
    advancePatrols(watchers, FIXED_STEP_SECONDS);
    if (step % 30 === 0) {
      for (const unit of watchers) {
        assert.ok(isWalkable(grid, Math.round(unit.position.x), Math.round(unit.position.y)));
      }
    }
  }
  assert.ok(watchers.some((unit, index) => unit.position.x !== startedAt[index].x || unit.position.y !== startedAt[index].y));
});
