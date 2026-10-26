// SPDX-License-Identifier: GPL-2.0-or-later

// The game core with no browser: an operation is made from the pack's files, given orders and stepped in Node, and it plays out
// the same way every time.
import assert from "node:assert/strict";
import test from "node:test";

import { commands } from "../src/commands.js";
import { applyCommand } from "../src/core/apply.js";
import { recordingHooks, silentHooks } from "../src/core/hooks.js";
import { giveRecorded, playRecording, startRecording, stateHash, stepRecorded } from "../src/core/replay.js";
import { stepWorld } from "../src/core/world.js";
import { findPath } from "../src/engine.js";
import { FIXED_STEP_SECONDS } from "../src/simulation.js";
import { loadContent, makeWorld } from "../server/content.js";

const content = loadContent();
const MISSION = "missions/restore-relay.mission.json";
const ids = (world) => world.units.filter((unit) => unit.side === "team").map((unit) => unit.id);
// A tile some way off that a unit can really walk to.
function openTileFrom(world, unit, distance = 6) {
  const from = { x: Math.round(unit.position.x), y: Math.round(unit.position.y) };
  for (let dx = -distance; dx <= distance; dx += 1) {
    for (let dy = -distance; dy <= distance; dy += 1) {
      const tile = { x: from.x + dx, y: from.y + dy };
      if (Math.hypot(dx, dy) >= distance - 1 && findPath(world.grid, from, tile).length > 0) return tile;
    }
  }
  throw new Error("no open ground nearby");
}
const seconds = (count) => Math.round(count / FIXED_STEP_SECONDS);

test("an operation is made from content in Node, with its people, vehicles and objectives", () => {
  const world = makeWorld(content, MISSION);
  assert.equal(world.outcome, "active");
  assert.equal(ids(world).length, 4, "the squad");
  assert.ok(world.units.some((unit) => unit.side === "opposition"));
  assert.ok(world.objectives.length >= 2);
  assert.ok(world.units.filter((unit) => unit.side === "vehicle").length > 0, "vehicles with drivers");
  assert.ok(world.grid.length > 0 && world.roadGrid.length > 0);
  assert.deepEqual(world.units.filter((unit) => unit.side === "team").map((unit) => unit.number), [1, 2, 3, 4]);
});

test("orders given to the core move people, and the world steps without any browser", () => {
  const world = makeWorld(content, MISSION);
  const hooks = recordingHooks();
  const start = { ...world.units[0].position };
  const target = openTileFrom(world, world.units[0]);
  const result = applyCommand(world, hooks, commands.move([world.units[0].id], target));
  assert.deepEqual([result.ok, result.moved], [true, true]);
  assert.ok(hooks.events.some((event) => event.type === "message" && /Route accepted/.test(event.text)));
  for (let step = 0; step < seconds(4); step += 1) stepWorld(world, FIXED_STEP_SECONDS, hooks);
  assert.ok(Math.hypot(world.units[0].position.x - start.x, world.units[0].position.y - start.y) > 2, "they walked");
  assert.equal(world.steps, seconds(4));
  assert.ok(Math.abs(world.elapsed - 4) < 0.05, "game time follows the steps");
});

test("commands that name nobody's agents, or nothing, are refused and change nothing", () => {
  const world = makeWorld(content, MISSION);
  const before = stateHash(world);
  const hooks = silentHooks();
  const lead = world.units[0].id;
  assert.equal(applyCommand(world, hooks, commands.move(["nobody"], { x: 5, y: 5 })).ok, true, "an unknown agent is not an operator");
  assert.equal(applyCommand(world, hooks, commands.move([lead], { x: 5000, y: 5 })).ok, false, "off the map");
  assert.equal(applyCommand(world, hooks, commands.attack([lead], "ghost")).ok, false, "no such target");
  const refused = applyCommand(world, hooks, commands.move([lead], { x: 5, y: 5 }), { owns: () => false });
  assert.equal(refused.error, "not your agent");
  assert.equal(stateHash(world), before);
});

// A short operation with a mix of orders, recorded.
function play(seed, extra = false) {
  const world = makeWorld(content, MISSION, { seed });
  const hooks = silentHooks();
  const recording = startRecording({ mission: MISSION, seed });
  const squad = ids(world);
  const lead = world.units.find((unit) => unit.id === squad[0]);
  const far = openTileFrom(world, lead, 8);
  const near = openTileFrom(world, lead, 3);
  const give = (command) => giveRecorded(world, hooks, recording, command);
  for (let step = 0; step < seconds(30); step += 1) {
    if (step === 0) give(commands.move(squad, far));
    if (step === seconds(8)) give(commands.useItem(squad, squad[0], 0));
    if (step === seconds(12) && extra) give(commands.move(squad, near));
    stepRecorded(world, hooks, recording);
  }
  return { world, recording };
}

test("the same seed and orders always give the same operation, and a different order gives a different one", () => {
  const first = play(5);
  const second = play(5);
  assert.equal(stateHash(first.world), stateHash(second.world));
  assert.notEqual(stateHash(first.world), stateHash(play(5, true).world), "another order, another outcome");
  assert.notEqual(stateHash(first.world), stateHash(makeWorld(content, MISSION, { seed: 5 })), "and time has passed");
});

test("a recording plays back to the same state, also after a trip through JSON", () => {
  const { world, recording } = play(11, true);
  assert.equal(recording.steps, seconds(30));
  assert.ok(recording.commands.length >= 3);
  const stored = JSON.parse(JSON.stringify(recording));
  const again = makeWorld(content, stored.mission, { seed: stored.seed });
  assert.equal(playRecording(again, stored), stored.steps);
  assert.equal(stateHash(again), stateHash(world));
});

test("two operations running side by side in one process do not disturb each other", () => {
  const solo = play(21, true);
  // Another operation, with another seed, is stepped in between every step of this one.
  const world = makeWorld(content, MISSION, { seed: 21 });
  const other = makeWorld(content, MISSION, { seed: 99 });
  const hooks = silentHooks();
  const recording = startRecording({ mission: MISSION, seed: 21 });
  const squad = ids(world);
  const lead = world.units.find((unit) => unit.id === squad[0]);
  const far = openTileFrom(world, lead, 8);
  const near = openTileFrom(world, lead, 3);
  const give = (command) => giveRecorded(world, hooks, recording, command);
  for (let step = 0; step < seconds(30); step += 1) {
    if (step === 0) give(commands.move(squad, far));
    if (step === seconds(8)) give(commands.useItem(squad, squad[0], 0));
    if (step === seconds(12)) give(commands.move(squad, near));
    stepRecorded(world, hooks, recording);
    stepWorld(other, FIXED_STEP_SECONDS, hooks);
  }
  assert.equal(stateHash(world), stateHash(solo.world));
});

test("the rules report what happens through hooks: messages, sounds and effects", () => {
  const world = makeWorld(content, MISSION);
  const hooks = recordingHooks();
  const squad = ids(world);
  applyCommand(world, hooks, commands.useItem(squad, squad[0], 0));
  const kinds = new Set(hooks.events.map((event) => event.type));
  assert.ok(kinds.has("message") && kinds.has("sound"), "a weapon taken out is announced and heard");
  assert.equal(world.units.find((unit) => unit.id === squad[0]).activeSlot, 0);
});

// ---- Sending a world to another copy of it

import { applyUnit, applyWorld, changedUnits, equipmentLookup, packUnit, packWorld } from "../src/core/sync.js";

test("a world sent to a fresh copy of the same operation leaves the copy in the very same state", () => {
  const { world } = play(31, true);
  const copy = makeWorld(content, MISSION, { seed: 31 });
  assert.notEqual(stateHash(copy), stateHash(world));
  const lookup = equipmentLookup(content.equipment);
  applyWorld(copy, JSON.parse(JSON.stringify(packWorld(world))), lookup);
  for (const unit of world.units) applyUnit(copy.units.find((other) => other.id === unit.id), packUnit(unit), lookup);
  assert.equal(stateHash(copy), stateHash(world));
  // What the copy keeps for itself is still there and still whole.
  const walker = copy.units.find((unit) => unit.patrol);
  assert.ok(walker.patrol.route.length > 0, "its own long routes were not thrown away");
  assert.ok(walker.definition?.name);
  assert.equal(copy.units.find((unit) => unit.id === ids(world)[0]).equipment[0].definition.id, world.units[0].equipment[0].definition.id);
});

test("only what changed is sent again, a person's far-off route is not, and a whole update stays small", () => {
  const world = makeWorld(content, MISSION);
  const known = new Map();
  const hooks = silentHooks();
  const first = changedUnits(world, known);
  assert.equal(first.length, world.units.length, "everyone the first time");
  const size = (changes) => JSON.stringify(changes).length;
  assert.equal(changedUnits(world, known).length, 0, "nobody if nothing moved");
  applyCommand(world, hooks, commands.move([world.units[0].id], openTileFrom(world, world.units[0])));
  for (let step = 0; step < 2; step += 1) stepWorld(world, FIXED_STEP_SECONDS, hooks);
  const started = changedUnits(world, known);
  assert.ok(started.length >= 1);
  const mover = started.find((change) => change.id === world.units[0].id);
  assert.ok(mover.set.path.length > 1, "the squad's own route goes whole");
  for (let step = 0; step < 2; step += 1) stepWorld(world, FIXED_STEP_SECONDS, hooks);
  const second = changedUnits(world, known);
  const walking = second.find((change) => change.id === world.units[0].id);
  assert.ok(Object.keys(walking.set).length <= 3, `once under way a walking person sends a few fields: ${Object.keys(walking.set)}`);
  const walker = world.units.find((unit) => unit.side !== "team" && unit.path.length > 3 && !unit.vehicle);
  const walkerChange = second.find((change) => change.id === walker?.id);
  if (walkerChange?.set.path) {
    assert.deepEqual(Object.keys(walkerChange.set.path).sort(), ["left", "next"], "someone else's route is just the next step");
  }
  assert.ok(size(second) < 12_000, `a two-step update of ${world.units.length} people is ${size(second)} bytes`);
  assert.ok(size(first) < 400_000, `a full snapshot is ${size(first)} bytes`);
});

test("changes sent as fields bring a fresh copy up to date, step after step", () => {
  const world = makeWorld(content, MISSION, { seed: 41 });
  const copy = makeWorld(content, MISSION, { seed: 41 });
  const lookup = equipmentLookup(content.equipment);
  const known = new Map();
  const hooks = silentHooks();
  const squad = ids(world);
  const send = () => {
    for (const change of changedUnits(world, known)) {
      applyUnit(copy.units.find((unit) => unit.id === change.id), JSON.parse(JSON.stringify(change.set)), lookup, change.remove ?? []);
    }
    applyWorld(copy, JSON.parse(JSON.stringify(packWorld(world))), lookup);
  };
  send();
  applyCommand(world, hooks, commands.move(squad, openTileFrom(world, world.units[0], 7)));
  for (let step = 0; step < seconds(10); step += 1) {
    stepWorld(world, FIXED_STEP_SECONDS, hooks);
    if (step % 3 === 0) send();
  }
  send();
  for (const unit of world.units.filter((item) => item.side === "team")) {
    const other = copy.units.find((item) => item.id === unit.id);
    assert.deepEqual(other.position, unit.position, `${unit.id} is where the server has them`);
    assert.equal(other.health, unit.health);
  }
  assert.equal(stateHash(copy), stateHash(world));
});
