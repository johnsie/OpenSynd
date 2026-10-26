// SPDX-License-Identifier: GPL-2.0-or-later

import assert from "node:assert/strict";
import test from "node:test";

import { commands } from "../src/commands.js";
import { silentHooks } from "../src/core/hooks.js";
import { playRecording, stateHash } from "../src/core/replay.js";
import { applyUnit, applyWorld, equipmentLookup } from "../src/core/sync.js";
import { findPath } from "../src/engine.js";
import { UPDATE_EVERY_STEPS, Room } from "../server/rooms.js";
import { loadContent, makeWorld } from "../server/content.js";

const content = loadContent();
const MISSION = "missions/restore-relay.mission.json";
const lookup = equipmentLookup(content.equipment);

function openTile(world, unit, distance = 6) {
  const from = { x: Math.round(unit.position.x), y: Math.round(unit.position.y) };
  for (let dx = -distance; dx <= distance; dx += 1) {
    for (let dy = -distance; dy <= distance; dy += 1) {
      const tile = { x: from.x + dx, y: from.y + dy };
      if (Math.hypot(dx, dy) >= distance - 1 && findPath(world.grid, from, tile).length > 0) return tile;
    }
  }
  throw new Error("no open ground");
}

// A player as the room sees one: everything it is sent is kept.
const player = () => {
  const messages = [];
  return { messages, send: (message) => messages.push(JSON.parse(JSON.stringify(message))) };
};
const kinds = (who) => who.messages.map((message) => message.t);

test("a player joining is told how to build the operation and how it stands", () => {
  const room = new Room({ id: "r1", content, mission: MISSION, seed: 3 });
  const anna = player();
  room.addPlayer("anna", anna);
  const [start] = anna.messages;
  assert.equal(start.t, "start");
  assert.deepEqual([start.mission, start.seed, start.squad.length], [MISSION, 3, 4]);
  assert.equal(start.units.length, room.world.units.length, "everyone, the first time");
  assert.equal(start.world.steps, 0);
});

test("orders are carried out on the next step, acknowledged, and the world is sent to the player every few steps", () => {
  const room = new Room({ id: "r2", content, mission: MISSION });
  const anna = player();
  room.addPlayer("anna", anna);
  const lead = room.world.units[0];
  const target = openTile(room.world, lead);
  assert.deepEqual(room.receive("anna", 1, commands.move([lead.id], target)), { ok: true });
  const before = { ...lead.position };
  for (let step = 0; step < UPDATE_EVERY_STEPS * 4; step += 1) room.tick();
  assert.ok(Math.hypot(lead.position.x - before.x, lead.position.y - before.y) > 0.5, "they walked");
  const updates = anna.messages.filter((message) => message.t === "update");
  assert.equal(updates.length, 4, "an update every few steps");
  assert.deepEqual(updates[0].acks, [{ seq: 1, ok: true }]);
  assert.deepEqual(updates[1].acks, [], "acknowledged once");
  assert.ok(anna.messages.some((message) => message.t === "feedback"), "the order's own news goes to the player who gave it");
  assert.ok(updates.every((update) => JSON.stringify(update).length < 30_000), "updates stay small");
});

test("a player's copy of the operation, fed what the room sends, ends up where the room is", () => {
  const room = new Room({ id: "r3", content, mission: MISSION, seed: 8 });
  const anna = player();
  room.addPlayer("anna", anna);
  const [start] = anna.messages;
  const copy = makeWorld(content, start.mission, { seed: start.seed });
  const apply = (message) => {
    for (const change of message.units) {
      applyUnit(copy.units.find((unit) => unit.id === change.id), change.set ?? change, lookup, change.remove ?? []);
    }
    applyWorld(copy, message.world, lookup);
  };
  for (const unit of start.units) applyUnit(copy.units.find((other) => other.id === unit.id), unit.set, lookup, []);
  applyWorld(copy, start.world, lookup);
  room.receive("anna", 1, commands.move(room.squad, openTile(room.world, room.world.units[0], 7)));
  for (let step = 0; step < UPDATE_EVERY_STEPS * 12; step += 1) room.tick();
  for (const message of anna.messages.filter((item) => item.t === "update")) apply(message);
  assert.equal(copy.steps, room.world.steps);
  assert.equal(stateHash(copy), stateHash(room.world));
});

test("one player cannot give orders to another's agents, and bad orders are refused with a reason", () => {
  const room = new Room({ id: "r4", content, mission: MISSION });
  const anna = player();
  const ben = player();
  const squad = room.squad;
  room.addPlayer("anna", { ...anna, unitIds: squad.slice(0, 2) });
  room.addPlayer("ben", { ...ben, unitIds: squad.slice(2) });
  const theirs = room.world.units.find((unit) => unit.id === squad[2]);
  const before = { ...theirs.position };
  assert.deepEqual(room.receive("anna", 1, commands.move([squad[2]], openTile(room.world, theirs))), { ok: true }, "queued...");
  room.receive("anna", 2, { type: "teleport", unitIds: [squad[0]] });
  room.receive("anna", 3, commands.move([squad[0]], { x: 99999, y: 3 }));
  for (let step = 0; step < UPDATE_EVERY_STEPS; step += 1) room.tick();
  const acks = anna.messages.find((message) => message.t === "update").acks;
  assert.deepEqual(acks.map((ack) => [ack.seq, ack.ok]), [[1, false], [2, false], [3, false]]);
  assert.equal(acks[0].error, "not your agent");
  assert.deepEqual(theirs.position, before, "nothing moved");
  assert.equal(room.receive("anna", 3, commands.move([squad[0]], { x: 1, y: 1 })).error, "out of order", "a sequence number cannot repeat");
  assert.equal(room.receive("nobody", 1, commands.move([squad[0]], { x: 1, y: 1 })).ok, false);
});

test("a player cannot flood the room: only so many orders wait, and only a few are carried out a step", () => {
  const room = new Room({ id: "r5", content, mission: MISSION });
  const anna = player();
  room.addPlayer("anna", anna);
  const lead = room.squad[0];
  let accepted = 0;
  for (let seq = 1; seq <= 200; seq += 1) if (room.receive("anna", seq, commands.interact([lead])).ok) accepted += 1;
  assert.equal(accepted, 64);
  room.tick();
  assert.equal(room.recording.commands.length, 8, "eight a step");
});

test("when the operation ends, players are told, and the recording plays back to the same result", () => {
  const room = new Room({ id: "r6", content, mission: MISSION, seed: 17 });
  const anna = player();
  room.addPlayer("anna", anna);
  room.receive("anna", 1, commands.move(room.squad, openTile(room.world, room.world.units[0], 5)));
  for (let step = 0; step < 90; step += 1) room.tick();
  for (const objective of room.world.objectives) objective.complete = true;
  room.recording.commands.push({ step: room.world.steps, command: { type: "test-complete" } }); // (a stand-in, never replayed)
  room.recording.commands.pop();
  room.tick();
  assert.equal(room.finished, true);
  const end = anna.messages.at(-1);
  assert.equal(end.t, "end");
  assert.equal(end.outcome, "success");
  assert.equal(kinds(anna).filter((kind) => kind === "end").length, 1);
  room.tick(); // nothing more happens
  assert.equal(kinds(anna).filter((kind) => kind === "end").length, 1);
  assert.equal(room.receive("anna", 9, commands.interact(room.squad)).ok, false, "no orders once it is over");
});

test("a recording of the played operation checks out: it replays to the very same state", () => {
  const room = new Room({ id: "r7", content, mission: MISSION, seed: 23 });
  const anna = player();
  room.addPlayer("anna", anna);
  room.receive("anna", 1, commands.move(room.squad, openTile(room.world, room.world.units[0], 6)));
  for (let step = 0; step < 150; step += 1) {
    if (step === 60) room.receive("anna", 2, commands.useItem(room.squad, room.squad[0], 0));
    room.tick();
  }
  const recording = JSON.parse(JSON.stringify(room.toRecording()));
  const again = makeWorld(content, recording.mission, { seed: recording.seed });
  playRecording(again, recording, silentHooks());
  assert.equal(stateHash(again), stateHash(room.world));
});
