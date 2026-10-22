// SPDX-License-Identifier: GPL-2.0-or-later

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createTileGrid, findPath, isWalkable } from "../src/engine.js";
import {
  gateOpen,
  missionComplete,
  resolveArrival,
  resolveInteraction,
  syncGates,
} from "../src/mission.js";
import { FIXED_STEP_SECONDS, advanceCombat, advanceUnits } from "../src/simulation.js";

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
    assert.equal(isWalkable(game.grid, 13, 9), false);
    assert.deepEqual(findPath(game.grid, { x: 12, y: 9 }, { x: 14, y: 9 }), []);

    steps.push(walk(game, { x: 3, y: 3 }));
    assert.ok(interact(game));
    steps.push(walk(game, { x: 11, y: 7 }));
    assert.ok(interact(game));
    assert.equal(missionComplete(game.objectives), false);

    steps.push(walk(game, { x: 11, y: 10 }));
    assert.equal(gateOpen(game.objectives, game.map.objects[0]), false);
    assert.ok(interact(game));
    assert.equal(gateOpen(game.objectives, game.map.objects[0]), true);
    assert.equal(isWalkable(game.grid, 13, 9), true);

    steps.push(walk(game, { x: 14, y: 9 }));
    assert.equal(missionComplete(game.objectives), true);
    runs.push({ log: game.log, steps });
  }

  assert.deepEqual(runs[0].log, ["restore-west", "restore-east", "open-gate", "leave-yard"]);
  assert.deepEqual(runs[0], runs[1]);
  // Golden values: fixed-step counts for each leg at 30 Hz. A change here means
  // routes or movement speed changed and replays need regenerating.
  assert.deepEqual(runs[0].steps, [39, 115, 29, 39]);
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
    drone: await read("units/watcher-drone.unit.json"),
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
    byId["operator-one"].position = { x: 4, y: 3 };
    byId["operator-two"].position = { x: 4, y: 4 };
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
  // lands one retaliation hit; the far watcher is untouched.
  assert.equal(run.events.at(-1).step, 24);
  assert.equal(run.events.length, 6);
  assert.deepEqual(run.health, {
    "operator-one": 94,
    "operator-two": 100,
    "operator-three": 100,
    "operator-four": 100,
    "watcher-one": 0,
    "watcher-two": 45,
  });
});
