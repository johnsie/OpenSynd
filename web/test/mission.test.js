// SPDX-License-Identifier: GPL-2.0-or-later

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildPatrolRoute, createTileGrid, findPath, isWalkable } from "../src/engine.js";
import {
  advanceHold,
  gateOpen,
  isOpenTarget,
  missionComplete,
  missionOutcome,
  resolveArrival,
  resolveDisabled,
  resolveInteraction,
  syncGates,
} from "../src/mission.js";
import { FIXED_STEP_SECONDS, advanceCombat, advancePatrols, advanceUnits } from "../src/simulation.js";

const read = async (path) =>
  JSON.parse(await readFile(new URL(`../content/${path}`, import.meta.url), "utf8"));

async function loadMission(file = "missions/restore-relay.mission.json") {
  const mission = await read(file);
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
  assert.deepEqual(runs[0].steps, [358, 1155, 366, 540]);
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
  const pack = await read("pack.json");
  const equipment = Object.fromEntries(
    await Promise.all(pack.equipment.map(async (path) => [path, await read(path)])),
  );
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
  // Golden values at 30 Hz: the watcher falls on step 70 after ten shots
  // and lands two heavy-pulse retaliation hits (20 each); the other watchers are untouched.
  assert.equal(run.events.at(-1).step, 70);
  assert.equal(run.events.length, 10);
  assert.deepEqual(run.health, {
    "operator-one": 60,
    "operator-two": 100,
    "operator-three": 100,
    "operator-four": 100,
    "watcher-one": 0,
    "watcher-two": 75,
    "watcher-three": 75,
    "watcher-four": 75,
    "watcher-five": 75,
    "watcher-six": 75,
    "watcher-seven": 75,
    "watcher-eight": 75,
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
  // Golden value at 30 Hz: about 4 seconds of sustained fire from toughened watchers, no watcher touched.
  assert.deepEqual(runs[0], { step: 121, outcome: "failure", watchers: 75 });
});

test("every First Light watcher patrols a real route that stays on walkable ground", async () => {
  const mission = await read("missions/restore-relay.mission.json");
  const map = await read(mission.map);
  const definition = await read("units/security-watcher.unit.json");
  const grid = createTileGrid(map);
  const watchers = mission.opponents.filter((placement) => placement.patrol).map((placement) => {
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

test("the Audit Yard mission plays through: three relays, the panel, then extraction", async () => {
  const runs = [];
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const game = await loadMission("missions/quiet-hours.mission.json");
    game.log = [];
    const gate = game.map.objects[0];
    const steps = [];

    assert.equal(game.map.dimensions.width, 96);
    assert.equal(isWalkable(game.grid, gate.position.x, gate.position.y), false);
    assert.deepEqual(findPath(game.grid, { x: 81, y: 16 }, { x: 88, y: 14 }), []);

    for (const stop of [{ x: 25, y: 25 }, { x: 47, y: 69 }, { x: 69, y: 47 }]) {
      steps.push(walk(game, stop));
      assert.ok(interact(game));
    }
    assert.equal(missionComplete(game.objectives), false);
    steps.push(walk(game, { x: 69, y: 25 }));
    assert.equal(gateOpen(game.objectives, gate), false);
    assert.ok(interact(game));
    assert.equal(isWalkable(game.grid, gate.position.x, gate.position.y), true);
    steps.push(walk(game, { x: 88, y: 14 }));
    assert.equal(missionComplete(game.objectives), true);
    runs.push({ log: game.log, steps });
  }

  assert.deepEqual(runs[0], runs[1]);
  assert.deepEqual(runs[0].log, ["restore-one", "restore-two", "restore-three", "open-gate", "leave-yard"]);
  // Golden step counts at 30 Hz for one operator walking without rest, fatigue included.
  assert.deepEqual(runs[0].steps, [462, 775, 640, 350, 477]);
});

test("every mission in the pack has a story, debrief and valid patrols", async () => {
  const pack = await read("pack.json");
  assert.ok(pack.missions.length >= 2);
  for (const file of pack.missions) {
    const mission = await read(file);
    assert.ok(mission.story && mission.title, `${file} needs a story and a title`);
    assert.ok(mission.debrief?.success && mission.debrief?.failure, `${file} needs a debrief`);
    const grid = createTileGrid(await read(mission.map));
    for (const placement of [...mission.opponents, ...(mission.bystanders ?? [])].filter((entry) => entry.patrol)) {
      assert.ok(buildPatrolRoute(grid, placement.position, placement.patrol).length > 0, `${placement.id} in ${file}`);
    }
    const bystanders = mission.bystanders ?? [];
    assert.ok(bystanders.length >= 10, `${file} should have people on its streets`);
    assert.ok(bystanders.some((entry) => entry.unit.includes("city-police")), `${file} needs police`);
    assert.ok(bystanders.some((entry) => entry.unit.includes("civilian-woman")));
    assert.ok(bystanders.some((entry) => entry.unit.includes("civilian-man")));
  }
});

const holdZones = [{ id: "uplink", kind: "hold", position: { x: 4, y: 4 }, width: 2, height: 2 }];
const operatorIn = (x, y, extra = {}) => ({ id: "op", side: "team", disabled: false, position: { x, y }, ...extra });

test("a disable objective completes only when every named target is down", () => {
  const objectives = [{ id: "d", type: "disable", targets: ["a", "b"], required: true, complete: false }];
  const units = [
    { id: "a", side: "opposition", disabled: true },
    { id: "b", side: "opposition", disabled: false },
  ];
  assert.deepEqual(resolveDisabled(objectives, units), []);
  assert.equal(isOpenTarget(objectives, "b"), true);
  assert.equal(isOpenTarget(objectives, "op"), false);
  units[1].disabled = true;
  assert.equal(resolveDisabled(objectives, units).length, 1);
  assert.equal(objectives[0].complete, true);
  assert.equal(isOpenTarget(objectives, "b"), false, "no marker once the objective is done");
  // A disable objective is never completed by walking somewhere.
  assert.deepEqual(resolveArrival(objectives, [], { x: 0, y: 0 }), []);
});

test("a hold objective counts time in its zone, drains when left, and completes at the target", () => {
  const objective = { id: "h", type: "hold", targetZone: "uplink", holdSeconds: 10, required: true, complete: false };
  const objectives = [objective];
  assert.deepEqual(advanceHold(objectives, holdZones, [operatorIn(0, 0)], 5), []);
  assert.equal(objective.progress, 0, "nobody there yet");
  advanceHold(objectives, holdZones, [operatorIn(4, 4)], 6);
  assert.equal(objective.progress, 6);
  advanceHold(objectives, holdZones, [operatorIn(0, 0)], 2);
  assert.equal(objective.progress, 2, "drains at twice the rate");
  advanceHold(objectives, holdZones, [operatorIn(4, 4, { disabled: true })], 5);
  assert.equal(objective.progress, 0, "a disabled operator does not hold it");
  assert.deepEqual(advanceHold(objectives, holdZones, [operatorIn(5, 5)], 9.9), []);
  const done = advanceHold(objectives, holdZones, [operatorIn(5, 5)], 0.2);
  assert.equal(done.length, 1);
  assert.equal(objective.complete, true);
  assert.deepEqual(advanceHold(objectives, holdZones, [operatorIn(5, 5)], 5), [], "only completes once");
  assert.deepEqual(resolveArrival(objectives, holdZones, { x: 4, y: 4 }), [], "walking in does not complete it");
});

test("Dead Drop mixes objective types and every target and zone it names exists", async () => {
  const pack = await read("pack.json");
  const mission = await read(pack.missions.find((file) => file.includes("dead-drop")));
  const map = await read(mission.map);
  const types = new Set(mission.objectives.map((objective) => objective.type));
  assert.ok(["interact", "disable", "hold", "extract"].every((type) => types.has(type)));
  const placements = new Set(mission.opponents.map((entry) => entry.id));
  for (const objective of mission.objectives) {
    if (objective.type === "disable") assert.ok(objective.targets.every((id) => placements.has(id)));
    else assert.ok(map.zones.some((zone) => zone.id === objective.targetZone), objective.id);
  }
});
