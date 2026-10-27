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
  const base = await read(mission.map);
  const map = mission.zones?.length ? { ...base, zones: [...base.zones, ...mission.zones] } : base;
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

test("Last Departure begins when the squad approaches and ends with whole-squad extraction", async () => {
  const game = await loadMission();
  const target = game.mission.opponents.find((unit) => unit.id === "director-vale");
  assert.deepEqual(game.mission.objectives.map((objective) => objective.type), ["disable", "extract"]);
  assert.deepEqual(game.mission.objectives[0].targets, [target.id]);
  assert.equal(game.mission.sequence, true);
  assert.equal(game.mission.bystanders.length, 0);
  assert.equal(target.unit, "units/lucan-vale.unit.json");
  const [valeDefinition, guardDefinition] = await Promise.all([read(target.unit), read("units/guard.unit.json")]);
  assert.equal(valeDefinition.role, "guard");
  assert.deepEqual(valeDefinition.appearance, guardDefinition.appearance, "Vale looks like every other guard");
  assert.equal(valeDefinition.stats.vitality, guardDefinition.stats.vitality * 2, "Vale can take twice as many hits as a guard");
  assert.equal(valeDefinition.stats.speed, 4.2, "Vale runs quickly without reaching the operative's full pace");
  assert.ok(valeDefinition.stats.speed > guardDefinition.stats.speed, "Vale runs for the car faster than the guards patrol");
  assert.ok(game.mission.opponents.filter((unit) => unit !== target).every((unit) => unit.unit === "units/guard.unit.json"));
  assert.ok(game.mission.opponents.filter((unit) => unit.id !== target.id).every((unit) => unit.patrol?.length));
  assert.equal(target.passive, true, "Vale never turns to fight the squad");
  assert.deepEqual(target.script[0], { type: "trigger", at: target.position, radius: 12 });
  assert.deepEqual(target.script.map((step) => step.type), ["trigger", "say", "enter", "drive", "escape"]);
  assert.equal(target.script[2].vehicle, "vale-escape-car");
  const car = game.mission.vehicles.find((vehicle) => vehicle.id === "vale-escape-car");
  assert.deepEqual(car.position, { x: 112, y: 51 }, "the car is fully visible farther along the open eastbound road");
  assert.ok(Math.hypot(car.position.x - target.position.x, car.position.y - target.position.y) >= 16);
  const forecourt = game.map.regions.filter((region) => region.id.startsWith("vale-forecourt"));
  assert.deepEqual(forecourt.map((region) => region.id).sort(), [
    "vale-forecourt-apron",
    "vale-forecourt-east",
    "vale-forecourt-north",
    "vale-forecourt-south",
  ]);
  assert.ok(forecourt.every((region) => region.walkable && region.elevation === 0), "the escape scene is open ground");
  const nearbyBuildings = game.map.regions.filter((region) => region.surface === "utility-building");
  const distanceFromCar = (region) => Math.hypot(
    Math.max(region.x - car.position.x, car.position.x - (region.x + region.width - 1), 0),
    Math.max(region.y - car.position.y, car.position.y - (region.y + region.height - 1), 0),
  );
  assert.ok(Math.min(...nearbyBuildings.map(distanceFromCar)) > 7, "no building crowds or obscures the getaway car");
  assert.equal(game.grid[car.position.y][car.position.x].surface, "street");
  assert.equal(game.grid[target.script[3].to.y][target.script[3].to.x].surface, "street");
  const exit = game.map.zones.find((zone) => zone.id === game.mission.objectives[1].targetZone);
  assert.ok(findPath(game.grid, game.unit.position, exit.position).length > 0, "the squad can reach extraction without a locked gate");
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
    drone: await read("units/enemy-agent.unit.json"),
    guard: await read("units/guard.unit.json"),
    vale: await read("units/lucan-vale.unit.json"),
  };
  const pack = await read("pack.json");
  const equipment = Object.fromEntries(
    await Promise.all(pack.equipment.map(async (path) => [path, await read(path)])),
  );
  return [...mission.team, ...mission.opponents].map((placement) => {
    const definition = placement.unit.includes("operator")
      ? definitions.operator
      : placement.id === "director-vale"
        ? definitions.vale
        : placement.unit.includes("guard")
          ? definitions.guard
          : definitions.drone;
    return {
      id: placement.id,
      side: definition.role === "operator" ? "team" : "opposition",
      definition,
      position: { ...placement.position },
      path: [],
      equipment: [...placement.equipment, ...(definition.carries ?? [])]
        .map((path) => ({ definition: equipment[path], charges: equipment[path].charges })),
      activeSlot: 0, // operatives fire the weapon they have selected: the first item is the pistol
      health: definition.stats.vitality,
      cooldownRemaining: 0,
      targetId: null,
      disabled: false,
    };
  });
}

test("a squad fight against a guard resolves identically on every run", async () => {
  const runs = [];
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const units = await loadSquad();
    const byId = Object.fromEntries(units.map((unit) => [unit.id, unit]));
    // Two operators close to within pulse range of the first guard and engage it.
    byId["guard-1"].position = { x: 28, y: 40 };
    byId["operator-one"].position = { x: 26, y: 40 };
    byId["operator-two"].position = { x: 26, y: 41 };
    byId["operator-one"].targetId = "guard-1";
    byId["operator-two"].targetId = "guard-1";

    const events = [];
    for (let step = 1; step <= 600 && !byId["guard-1"].disabled; step += 1) {
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
  assert.equal(run.events.at(-1).unitId, "guard-1");
  assert.equal(run.health["guard-1"], 0);
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

test("an undefended squad loses to the guards at a repeatable step", async () => {
  const runs = [];
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const units = await loadSquad();
    const byId = Object.fromEntries(units.map((unit) => [unit.id, unit]));
    // Everyone stands together inside the guards' range and never fights back.
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
    runs.push({ step, outcome: missionOutcome(objectives, units), guard: byId["guard-1"].health });
  }

  assert.deepEqual(runs[0], runs[1]);
  assert.equal(runs[0].outcome, "failure");
  assert.ok(runs[0].step < 20000);
  assert.equal(runs[0].guard, 60);
});

test("every Last Departure guard patrols a real route that stays on walkable ground", async () => {
  const mission = await read("missions/restore-relay.mission.json");
  const map = await read(mission.map);
  const definition = await read("units/guard.unit.json");
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
  // Golden step counts at 30 Hz for one operator walking.
  assert.deepEqual(runs[0].steps, [439, 629, 420, 210, 286]);
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
    if (mission.id === "developer.restore-relay") {
      assert.equal(bystanders.length, 0, `${file} is deliberately an empty guarded yard`);
      continue;
    }
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

test("at the start FreeSynd's weapons are available (pistol, shotgun, persuader, scanner, medikit); the rest need research", async () => {
  const pack = await read("pack.json");
  const items = await Promise.all(pack.equipment.map((path) => read(path)));
  const free = items.filter((item) => !(item.researchCost > 0));
  const freeWeapons = free.filter((item) => item.action === "disable-pulse").map((item) => item.name).sort();
  assert.deepEqual(freeWeapons, ["Civic Pulse Emitter", "Scatter Emitter"]);
  assert.ok(free.some((item) => item.action === "persuade"), "the persuader is a starting item");
  assert.ok(free.some((item) => item.action === "scan"), "the scanner is a starting item");
  assert.ok(free.some((item) => item.action === "restore-vitality"), "the medikit is a starting item");
  for (const action of ["time-bomb", "shield"]) {
    const found = items.filter((item) => item.action === action);
    assert.ok(found.length > 0, `the pack has a ${action} item`);
    assert.ok(found.every((item) => item.researchCost > 0), `${action} needs research`);
  }
const names = items.filter((item) => item.action === "disable-pulse").map((item) => item.name);
  for (const wanted of ["Machine Pistol", "Rotary Cannon", "Coil Gun", "Longshot Rifle", "Scatter Emitter"]) {
    assert.ok(names.includes(wanted), wanted);
  }
});

import { operativesOutside, resolveExtraction } from "../src/mission.js";

test("extraction needs every operative still standing in the zone, wherever they got there from", () => {
  const zones = [{ id: "exit", kind: "exit", position: { x: 10, y: 10 }, width: 3, height: 3 }];
  const objective = () => ({ id: "leave", type: "extract", targetZone: "exit", required: true, complete: false });
  const operator = (id, x, y, over = {}) => ({ id, side: "team", disabled: false, position: { x, y }, ...over });

  // The first operative to arrive waits for the rest.
  const first = [objective()];
  const squad = [operator("a", 11, 11), operator("b", 3, 3), operator("c", 12, 10)];
  const events = resolveArrival(first, zones, { x: 11, y: 11 }, squad);
  assert.deepEqual(events.map((event) => [event.type, event.outside]), [["waiting", 1]]);
  assert.equal(first[0].complete, false);
  assert.deepEqual(operativesOutside(zones[0], squad).map((unit) => unit.id), ["b"]);

  // The last one in completes it; someone who has fallen no longer has to be there.
  squad[1].position = { x: 10, y: 12 };
  assert.deepEqual(resolveExtraction(first, zones, squad).map((event) => event.type), ["complete"]);
  const fallen = [objective()];
  assert.equal(resolveExtraction(fallen, zones, [operator("a", 11, 11), operator("b", 3, 3, { disabled: true })]).length, 1);

  // Nobody left standing completes nothing; other commitments still come first.
  assert.deepEqual(resolveExtraction([objective()], zones, [operator("a", 3, 3, { disabled: true })]), []);
  const pending = [{ id: "relay", type: "interact", targetZone: "x", required: true, complete: false }, objective()];
  assert.deepEqual(resolveExtraction(pending, zones, [operator("a", 11, 11)]), []);
  // Without a list of units the old rule holds: anyone arriving counts.
  assert.equal(resolveArrival([objective()], zones, { x: 11, y: 11 }).length, 1);
});
