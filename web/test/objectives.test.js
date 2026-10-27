// SPDX-License-Identifier: GPL-2.0-or-later

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createTileGrid, findPath } from "../src/engine.js";
import {
  currentObjective,
  failureReason,
  gateOpen,
  missionOutcome,
  missionClass,
  objectiveDirective,
  operativeDirective,
  objectiveFocus,
  resolveArrival,
  resolveDisabled,
  resolveInteraction,
  resolveUnitObjectives,
  syncGates,
} from "../src/mission.js";
import { FIXED_STEP_SECONDS, advancePatrols } from "../src/simulation.js";

const read = async (path) => JSON.parse(await readFile(new URL(`../content/${path}`, import.meta.url), "utf8"));
// Safe Passage and Loose Ends are no longer operations in the campaign (every territory has a map of its own now); they are kept as
// fixtures because they exercise rules (an escort that waits for a key, a stolen vehicle) that the generated operations do not.
const readFixture = async (name) => JSON.parse(await readFile(new URL(`./fixtures/missions/${name}`, import.meta.url), "utf8"));

const zones = [
  { id: "drop", position: { x: 10, y: 10 }, width: 3, height: 3 },
  { id: "out", position: { x: 20, y: 10 }, width: 3, height: 3 },
];
const unit = (id, side, x, y, over = {}) => ({
  id,
  side,
  position: { x, y },
  health: 50,
  disabled: false,
  equipment: [],
  definition: { name: id, role: side, stats: { speed: 3 } },
  ...over,
});
const objective = (over) => ({ id: over.type, required: true, description: over.type, complete: false, sequence: false, ...over });

test("objectives provide compact orders for the squad HUD", () => {
  assert.equal(objectiveDirective({ type: "disable" }), "ASSASSINATE");
  assert.equal(objectiveDirective({ type: "extract" }), "ASSEMBLE AT EXIT");
  assert.equal(objectiveDirective({ type: "hold" }), "HOLD POSITION");
  assert.equal(objectiveDirective({ type: "unknown" }), "COMPLETE OBJECTIVE");
  assert.equal(objectiveDirective(null), "");
});

test("mission dossiers classify the objective mix in player-facing terms", () => {
  assert.equal(missionClass([{ type: "disable", targets: ["executive"] }]), "ASSASSINATION");
  assert.equal(missionClass([{ type: "disable", targets: ["a", "b"] }]), "MULTIPLE ASSASSINATION");
  assert.equal(missionClass([{ type: "persuade" }, { type: "protect" }]), "PERSONNEL ACQUISITION");
  assert.equal(missionClass([{ type: "protect" }]), "ESCORT / PROTECTION");
  assert.equal(missionClass([{ type: "eliminate" }]), "COMBAT SWEEP");
  assert.equal(missionClass([{ type: "hold" }]), "HOLD POSITION");
  assert.equal(missionClass([{ type: "take-item" }]), "EQUIPMENT ACQUISITION");
  assert.equal(missionClass([{ type: "interact" }]), "INFILTRATION");
  assert.equal(missionClass([{ type: "extract" }]), "EVACUATION");
});

test("operative status reports live movement, following, combat and vehicle activity", () => {
  const agent = unit("agent", "team", 1, 1, { definition: { name: "Agent One", role: "operator", stats: {} }, path: [] });
  const contact = unit("contact", "civilian", 2, 2, { definition: { name: "Witness", role: "civilian", stats: {} } });
  assert.deepEqual(operativeDirective(agent, [agent, contact]), {
    action: "WAITING",
    detail: "Agent One · awaiting orders",
  });
  agent.path = [{ x: 2, y: 1 }, { x: 3, y: 1 }];
  assert.equal(operativeDirective(agent, [agent, contact]).action, "GOING");
  agent.path = [];
  agent.tailId = contact.id;
  assert.deepEqual(operativeDirective(agent, [agent, contact]), {
    action: "FOLLOWING",
    detail: "Agent One · Witness",
  });
  agent.tailId = null;
  agent.followId = contact.id;
  assert.equal(operativeDirective(agent, [agent, contact]).action, "PURSUING");
  agent.targetId = contact.id;
  assert.equal(operativeDirective(agent, [agent, contact]).action, "ENGAGING");

  const car = unit("car", "vehicle", 1, 1, {
    definition: { name: "Executive car", role: "vehicle", stats: {} },
    path: [{ x: 2, y: 1 }],
    vehicle: { controlledBy: agent.id },
  });
  agent.followId = null;
  agent.targetId = null;
  agent.inVehicle = car.id;
  assert.equal(operativeDirective(agent, [agent, car]).action, "DRIVING");
});

test("persuade completes when the named targets (or enough of them) follow the squad", () => {
  const units = [unit("a", "civilian", 1, 1), unit("b", "civilian", 2, 2)];
  const all = [objective({ type: "persuade", targets: ["a", "b"] })];
  assert.deepEqual(resolveUnitObjectives(all, zones, units), []);
  units[0].persuaded = true;
  assert.deepEqual(resolveUnitObjectives(all, zones, units), []);
  units[1].persuaded = true;
  assert.equal(resolveUnitObjectives(all, zones, units).length, 1);
  assert.equal(all[0].complete, true);

  const some = [objective({ type: "persuade", targets: ["a", "b"], count: 1 })];
  assert.equal(resolveUnitObjectives(some, zones, [unit("a", "civilian", 1, 1, { persuaded: true }), units[1]]).length, 1);
});

test("eliminate needs everyone in the group down or won over", () => {
  const as = (role) => ({ definition: { name: role, role, stats: {} } });
  const units = [
    unit("g1", "opposition", 1, 1, as("guard")),
    unit("g2", "opposition", 2, 2, as("guard")),
    unit("e", "opposition", 3, 3, as("enemy-agent")),
  ];
  const list = [objective({ type: "eliminate", group: "guard" })];
  units[0].disabled = true;
  assert.deepEqual(resolveUnitObjectives(list, zones, units), []);
  units[1].persuaded = true;
  assert.equal(resolveUnitObjectives(list, zones, units).length, 1, "the enemy agent is not in the group");
});

test("vehicle objectives: wreck one, or ride in one", () => {
  const car = unit("car", "vehicle", 5, 5);
  const wreck = [objective({ type: "destroy-vehicle", targets: ["car"] })];
  assert.deepEqual(resolveUnitObjectives(wreck, zones, [car]), []);
  car.disabled = true;
  assert.equal(resolveUnitObjectives(wreck, zones, [car]).length, 1);

  const van = unit("van", "vehicle", 5, 5);
  const ride = [objective({ type: "use-vehicle", targets: ["van"] })];
  const op = unit("op", "team", 5, 5);
  assert.deepEqual(resolveUnitObjectives(ride, zones, [van, op]), []);
  op.inVehicle = "van";
  assert.equal(resolveUnitObjectives(ride, zones, [van, op]).length, 1);
});

test("take-item completes when an operator carries the item, however they got it", () => {
  const key = { definition: { id: "developer.clearance-key" }, charges: null };
  const op = unit("op", "team", 1, 1);
  const list = [objective({ type: "take-item", item: "developer.clearance-key" })];
  assert.deepEqual(resolveUnitObjectives(list, zones, [op]), []);
  op.equipment.push(key);
  assert.equal(resolveUnitObjectives(list, zones, [op]).length, 1);
  const downed = unit("down", "team", 1, 1, { disabled: true, equipment: [key] });
  const again = [objective({ type: "take-item", item: "developer.clearance-key" })];
  assert.deepEqual(resolveUnitObjectives(again, zones, [downed]), []);
});

test("evacuate counts persuaded followers standing in the zone", () => {
  const list = [objective({ type: "evacuate", targetZone: "out", count: 2 })];
  const followers = [unit("a", "civilian", 21, 11, { persuaded: true }), unit("b", "civilian", 5, 5, { persuaded: true })];
  assert.deepEqual(resolveUnitObjectives(list, zones, followers), []);
  followers[1].position = { x: 22, y: 12 };
  assert.equal(resolveUnitObjectives(list, zones, followers).length, 1);
});

test("protect: the named person must be in the zone alive; losing them loses the operation", () => {
  const witness = unit("w", "civilian", 5, 5);
  const op = unit("op", "team", 1, 1);
  const list = [objective({ type: "protect", targets: ["w"], targetZone: "out" })];
  assert.equal(missionOutcome(list, [op, witness]), "active");
  witness.position = { x: 21, y: 11 };
  resolveUnitObjectives(list, zones, [op, witness]);
  assert.equal(list[0].complete, true);

  const second = [objective({ type: "protect", targets: ["w"], targetZone: "out" })];
  witness.disabled = true;
  assert.equal(missionOutcome(second, [op, witness]), "failure");
  assert.match(failureReason(second, [op, witness]), /w was lost/);
});

test("a required persuasion target dying makes the mission fail instead of remaining unwinnable", () => {
  const defector = unit("defector", "opposition", 5, 5, { disabled: true, health: 0 });
  const op = unit("op", "team", 1, 1);
  const list = [objective({ type: "persuade", targets: ["defector"] })];
  assert.equal(missionOutcome(list, [op, defector]), "failure");
  assert.match(failureReason(list, [op, defector]), /defector was killed before they could be persuaded/);
});

test("a target who escapes is not 'disabled' and loses the operation", () => {
  const broker = unit("broker", "opposition", 5, 5, { disabled: true, escaped: true, health: 0 });
  const op = unit("op", "team", 1, 1);
  const list = [objective({ type: "disable", targets: ["broker"] })];
  assert.deepEqual(resolveDisabled(list, [op, broker]), []);
  assert.equal(missionOutcome(list, [op, broker]), "failure");
  assert.match(failureReason(list, [op, broker]), /got away/);
  broker.escaped = false;
  assert.equal(resolveDisabled(list, [op, broker]).length, 1);
});

test("in a sequence only the first open required objective can progress", () => {
  const list = [
    objective({ type: "reach-zone", id: "first", targetZone: "drop", sequence: true }),
    objective({ type: "reach-zone", id: "second", targetZone: "out", sequence: true }),
    objective({ type: "reach-zone", id: "bonus", targetZone: "out", required: false, sequence: true }),
  ];
  assert.equal(currentObjective(list).id, "first");
  const ids = (events) => events.map((event) => event.objective.id);
  assert.deepEqual(ids(resolveArrival(list, zones, { x: 21, y: 11 })), ["bonus"], "the later one waits, an optional one does not");
  assert.deepEqual(ids(resolveArrival(list, zones, { x: 11, y: 11 })), ["first"]);
  assert.equal(currentObjective(list).id, "second");
  assert.deepEqual(ids(resolveArrival(list, zones, { x: 21, y: 11 })), ["second"]);
  assert.equal(currentObjective(list), null);
  const unordered = [
    objective({ type: "reach-zone", id: "first", targetZone: "drop" }),
    objective({ type: "reach-zone", id: "second", targetZone: "out" }),
  ];
  assert.equal(resolveArrival(unordered, zones, { x: 21, y: 11 }).length, 1, "without a sequence any order works");
  const interact = [
    objective({ type: "reach-zone", id: "a", targetZone: "drop", sequence: true }),
    objective({ type: "interact", id: "b", targetZone: "out", sequence: true }),
  ];
  assert.equal(resolveInteraction(interact, zones, { x: 21, y: 11 }), null, "interaction waits its turn too");
});

test("the briefing points at the current objective's zone or people", () => {
  const broker = unit("broker", "opposition", 40, 7);
  assert.deepEqual(objectiveFocus(objective({ type: "disable", targets: ["broker"] }), zones, [broker]), [{ x: 40, y: 7 }]);
  assert.deepEqual(objectiveFocus(objective({ type: "reach-zone", targetZone: "drop" }), zones, []), [{ x: 11.5, y: 11.5 }]);
  assert.deepEqual(objectiveFocus(null, zones, []), []);
});

test("a gate opens for an operator carrying its key who stands close", () => {
  const gate = { id: "g", position: { x: 5, y: 5 }, width: 1, height: 2, control: "nowhere", key: "developer.clearance-key" };
  const key = { definition: { id: "developer.clearance-key", effect: { range: 2.5 } }, charges: null };
  const holder = unit("op", "team", 2, 5, { equipment: [key] });
  assert.equal(gateOpen([], gate, [holder]), false, "too far");
  holder.position = { x: 3, y: 5 };
  assert.equal(gateOpen([], gate, [holder]), true);
  holder.disabled = true;
  assert.equal(gateOpen([], gate, [holder]), false, "a downed carrier opens nothing");
  holder.disabled = false;
  holder.equipment = [];
  assert.equal(gateOpen([], gate, [holder]), false, "no key, no entry");
  assert.equal(gateOpen([], { ...gate, key: undefined }, [{ ...holder, equipment: [key] }]), false);
});

test("Safe Passage: the accountant waits, walks to the gate, waits for the key, then crosses", async () => {
  const mission = await readFixture("safe-passage.mission.json");
  const map = await read(mission.map);
  assert.equal(mission.sequence, true);
  const grid = createTileGrid(map);
  const objectives = mission.objectives.map((item) => ({ ...item, complete: false, sequence: true }));
  const placement = mission.bystanders.find((item) => item.id === "informant");
  const informant = unit("informant", "civilian", placement.position.x, placement.position.y, {
    path: [],
    script: { steps: placement.script, index: 0, waitLeft: null, loop: false, done: false },
    definition: { name: "Accountant", role: "civilian", stats: { speed: 3 } },
  });
  const key = { definition: { id: "developer.clearance-key", effect: { range: 2.5 } }, charges: null };
  const op = unit("op", "team", 27, 41, { equipment: [], path: [] });
  const units = [op, informant];
  const run = (seconds) => {
    for (let step = 0; step < Math.round(seconds / FIXED_STEP_SECONDS); step += 1) {
      advancePatrols(units, FIXED_STEP_SECONDS, grid, step * FIXED_STEP_SECONDS);
      syncGates(grid, map, objectives, units);
    }
  };
  // Nobody near the start: she stays put. The operator comes close and she sets off.
  op.position = { x: 70, y: 70 };
  run(5);
  assert.deepEqual(informant.position, placement.position);
  op.position = { x: 27, y: 44 };
  run(5);
  assert.ok(informant.position.x > placement.position.x || informant.position.y !== placement.position.y, "she is walking");
  op.position = { x: 70, y: 70 };
  run(240);
  assert.ok(Math.hypot(informant.position.x - 112, informant.position.y - 110) < 1.5, "she reached the gate and waits");
  assert.equal(informant.script.index, 4);
  run(10);
  assert.equal(informant.script.index, 4, "still waiting: the gate is shut");
  // The key carrier steps up to the gate: it opens and she crosses to the exit.
  op.equipment.push(key);
  op.position = { x: 115, y: 110 };
  run(30);
  const exit = map.zones.find((zone) => zone.id === "safe-exit");
  op.position = { x: 70, y: 70 };
  resolveUnitObjectives(objectives, map.zones, [{ ...op, equipment: [key] }, informant]);
  assert.ok(informant.position.x >= exit.position.x && informant.position.y >= exit.position.y, "she is in the exit zone");
  assert.equal(objectives.find((item) => item.id === "take-key").complete, true);
  assert.equal(objectives.find((item) => item.id === "escort-informant").complete, true);
});

test("a scripted walker with no route skips the step, and 'escape' removes the unit", async () => {
  const grid = createTileGrid({
    dimensions: { width: 30, height: 5 },
    regions: [{ id: "r", x: 0, y: 0, width: 30, height: 5, surface: "street", walkable: true, elevation: 0 }],
  });
  const runner = unit("run", "opposition", 3, 2, {
    path: [],
    script: {
      steps: [{ type: "walk", to: { x: 100, y: 100 } }, { type: "escape", to: { x: 25, y: 2 } }],
      index: 0,
      waitLeft: null,
      loop: false,
      done: false,
    },
  });
  for (let step = 0; step < 900 && !runner.escaped; step += 1) {
    advancePatrols([runner], FIXED_STEP_SECONDS, grid, step * FIXED_STEP_SECONDS);
  }
  assert.equal(runner.escaped, true);
  assert.equal(runner.disabled, true);
  assert.equal(findPath(grid, { x: 0, y: 0 }, { x: 5, y: 0 }).length > 0, true);
});

test("Loose Ends and Safe Passage use only objective types the game resolves", async () => {
  for (const file of ["safe-passage.mission.json", "loose-ends.mission.json"]) {
    const mission = await readFixture(file);
    assert.equal(mission.sequence, true);
    assert.equal(new Set(mission.objectives.map((item) => item.id)).size, mission.objectives.length);
    assert.equal(mission.objectives.at(-1).type, "extract", "the last step is always the way out");
  }
});

test("a scripted person can speak: a say step reports the line once and moves on", () => {
  const grid = createTileGrid({
    dimensions: { width: 10, height: 5 },
    regions: [{ id: "r", x: 0, y: 0, width: 10, height: 5, surface: "street", walkable: true, elevation: 0 }],
  });
  const talker = unit("talker", "civilian", 3, 2, {
    path: [],
    script: { steps: [{ type: "say", text: "Hello." }, { type: "wait", seconds: 5 }], index: 0, waitLeft: null, loop: false, done: false },
  });
  const first = advancePatrols([talker], FIXED_STEP_SECONDS, grid, 0);
  assert.deepEqual(first, [{ type: "say", unitId: "talker", text: "Hello." }]);
  assert.equal(talker.script.index, 1);
  assert.deepEqual(advancePatrols([talker], FIXED_STEP_SECONDS, grid, 1), [], "it does not repeat itself");
});

test("every placement and scripted destination in every operation stands on ground it can reach", async () => {
  const pack = await read("pack.json");
  for (const file of pack.missions) {
    const mission = await read(file);
    const map = await read(mission.map);
    const grid = createTileGrid(map);
    // Gates open for the check: keys and panels are exercised elsewhere.
    for (const gate of map.objects ?? []) {
      for (let y = gate.position.y; y < gate.position.y + gate.height; y += 1) {
        for (let x = gate.position.x; x < gate.position.x + gate.width; x += 1) grid[y][x] = { ...grid[y][x], walkable: true };
      }
    }
    const start = mission.team[0].position;
    const reachable = (point, label) => {
      const there = point.x === start.x && point.y === start.y;
      assert.ok(there || findPath(grid, start, point).length > 0, `${mission.id}: ${label} at ${point.x},${point.y} is unreachable`);
    };
    for (const group of ["team", "opponents", "bystanders"]) {
      for (const placement of mission[group] ?? []) {
        reachable(placement.position, `${group} ${placement.id}`);
        for (const step of placement.script ?? []) {
          if (step.to) reachable(step.to, `${placement.id} script destination`);
        }
      }
    }
    for (const vehicle of (mission.vehicles ?? []).filter((item) => !item.stops)) {
      assert.ok(grid[vehicle.position.y]?.[vehicle.position.x]?.walkable, `${mission.id}: ${vehicle.id} is off the road`);
    }
    for (const train of (mission.vehicles ?? []).filter((item) => item.stops)) {
      for (const stop of train.stops) {
        const rail = map.regions.find(
          (region) => region.surface === "rail" && stop.x >= region.x && stop.x < region.x + region.width && stop.y === region.y,
        );
        assert.ok(rail, `${mission.id}: a stop of ${train.id} at ${stop.x}, ${stop.y} is not on the railway`);
      }
    }
    for (const zone of map.zones) reachable(zone.position, `zone ${zone.id}`);
  }
});

test("some operations are purges (put down every enemy agent) and some are defections (persuade someone and bring them out)", async () => {
  const pack = await read("pack.json");
  let purges = 0;
  let defections = 0;
  for (const path of pack.missions) {
    const mission = await read(path);
    const map = await read(mission.map);
    const grid = createTileGrid(map);
    const agents = mission.opponents.filter((placement) => placement.unit.includes("enemy-agent")).map((placement) => placement.id);
    const purge = mission.objectives.find((objective) => objective.type === "eliminate");
    if (purge) {
      purges += 1;
      assert.deepEqual([...purge.targets].sort(), [...agents].sort(), `${mission.id}: the purge names every enemy agent, and only them`);
      assert.ok(agents.length >= 5, `${mission.id}: a purge has real work to do`);
    }
    const persuade = mission.objectives.find((objective) => objective.type === "persuade");
    if (persuade) {
      defections += 1;
      assert.deepEqual(persuade.targets, ["defector"]);
      const defector = mission.bystanders.find((placement) => placement.id === "defector");
      assert.ok(defector, `${mission.id}: the defector is a bystander`);
      assert.ok(grid[defector.position.y]?.[defector.position.x]?.walkable, `${mission.id}: the defector stands on walkable ground`);
      const escort = mission.objectives.find((objective) => objective.type === "protect");
      assert.deepEqual([escort?.targets, escort?.targetZone], [["defector"], "safe-exit"], "and has to reach the exit alive");
      const carried = mission.team.flatMap((member) => member.equipment);
      assert.ok(carried.includes("equipment/persuader.equipment.json"), `${mission.id}: the squad starts with a Persuader`);
      const minders = mission.opponents.filter((placement) => placement.id.startsWith("minder-"));
      assert.equal(minders.length, 2, "two minders stand by the defector");
    }
  }
  assert.ok(purges >= 8 && defections >= 8, `a good number of each (${purges} purges, ${defections} defections)`);
});
