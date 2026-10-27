// SPDX-License-Identifier: GPL-2.0-or-later
import assert from "node:assert/strict";
import test from "node:test";

import { applyCommand } from "../src/core/apply.js";
import { silentHooks } from "../src/core/hooks.js";
import { loadContent } from "../server/content.js";
import { parseClientMessage } from "../server/protocol.js";
import { WAR_CAPTURE_SECONDS, WAR_OPERATIVES_PER_COMPANY, WarRoom, warMission } from "../server/war.js";
import { withServer } from "./support.js";

const content = loadContent();
const mission = "missions/western-siberia.mission.json";

test("the company war reuses an existing map and preallocates both coalitions", () => {
  const generated = warMission(content, mission);
  assert.equal(generated.mission.map, content.read(mission).map);
  assert.equal(generated.points.length, 3);
  assert.equal(generated.contracts.length, 3);
  assert.equal(generated.mission.objectives.length, 0);
  assert.equal(generated.mission.team.filter((unit) => unit.warSide === "cyan").length, 16);
  assert.equal(generated.mission.team.filter((unit) => unit.warSide === "ember").length, 16);
  assert.ok(generated.mission.team.every((unit) => unit.playerUnit && unit.warReserve));
  assert.equal(generated.mission.bystanders.filter((unit) => unit.missionGiver).length, 3);
});

test("companies are balanced across coalitions and the ember company can receive authoritative orders", () => {
  const room = new WarRoom({ content, mission });
  const cyan = room.claimCompany("cyan-player", 1, null, "North Ltd");
  const ember = room.claimCompany("ember-player", 2, null, "South Ltd");
  assert.equal(cyan.coalition, "cyan");
  assert.equal(ember.coalition, "ember");
  assert.equal(ember.ids.length, WAR_OPERATIVES_PER_COMPANY);
  const unit = room.world.units.find((candidate) => candidate.id === ember.ids[0]);
  const destination = room.world.war.points[1].position;
  const result = applyCommand(room.world, silentHooks(), { type: "move", unitIds: [unit.id], to: destination }, {
    owns: (id) => ember.ids.includes(id),
  });
  assert.equal(result.ok, true);
  assert.notEqual(result.moved, false);
  assert.equal(unit.company, "South Ltd");
  unit.activeSlot = 0;
  const rival = room.world.units.find((candidate) => candidate.id === cyan.ids[0]);
  assert.equal(applyCommand(room.world, silentHooks(), {
    type: "attack",
    unitIds: [unit.id],
    targetId: rival.id,
  }, { owns: (id) => ember.ids.includes(id) }).ok, true);
  assert.equal(unit.followId, rival.id);
});

test("a sole coalition captures a point and persistent rooms do not time out", () => {
  let saved = null;
  const room = new WarRoom({ content, mission, save: (state) => { saved = state; } });
  const company = room.claimCompany("player", 1);
  const point = room.world.war.points[0];
  for (const id of company.ids) room.world.units.find((unit) => unit.id === id).position = { ...point.position };
  for (let step = 0; step < WAR_CAPTURE_SECONDS * 30 + 1; step += 1) room.tick();
  assert.equal(point.owner, company.coalition);
  assert.equal(room.finished, false);
  assert.deepEqual(saved.scores, { cyan: 1, ember: 0 });
  assert.deepEqual(saved.points, { "war-point-1": "cyan", "war-point-2": null, "war-point-3": null });
  const restored = new WarRoom({ content, mission, persisted: saved });
  assert.equal(restored.world.war.points[0].owner, "cyan");
  assert.equal(restored.world.war.coalitions[0].score, 1);
});

test("mission-giver NPCs issue repeatable coalition contracts that pay on capture", () => {
  const room = new WarRoom({ content, mission });
  const company = room.claimCompany("player", 1);
  const operator = room.world.units.find((unit) => unit.id === company.ids[0]);
  const giver = room.world.units.find((unit) => unit.missionGiver);
  operator.position = { ...giver.position };
  const result = applyCommand(room.world, silentHooks(), { type: "interact", unitIds: [operator.id] }, {
    owns: (id) => company.ids.includes(id),
  });
  assert.equal(result.ok, true);
  const contract = room.world.war.contracts.find((item) => item.contractId === giver.missionGiver.contractId);
  assert.equal(contract.assignments[company.coalition].status, "active");
  const point = room.world.war.points.find((item) => item.id === contract.pointId);
  point.owner = company.coalition;
  room.tick();
  assert.equal(contract.assignments[company.coalition].status, "cooldown");
  assert.equal(room.world.war.coalitions.find((item) => item.id === company.coalition).score, contract.reward);
});

test("the protocol accepts the signed-in company-war mode", () => {
  assert.equal(parseClientMessage(JSON.stringify({ t: "create", mode: "war" })).ok, true);
});

test("signed-in companies join the same live instance on opposite coalitions", async () => {
  await withServer(async (context) => {
    const join = async (name) => {
      const signed = await context.call("/api/signup", { method: "POST", body: { name, password: "a good password" } });
      const client = await context.connect(signed.body.token);
      client.hello();
      await client.next("welcome");
      client.send({ t: "create", mode: "war" });
      return { client, start: await client.next("start") };
    };
    const first = await join("North Ltd");
    const second = await join("South Ltd");
    assert.equal(first.start.room, second.start.room);
    assert.equal(first.start.variant, "war");
    const coalitions = second.start.team.map((member) => member.coalition).sort();
    assert.deepEqual(coalitions, ["cyan", "ember"]);
    assert.equal(first.start.squad.length, WAR_OPERATIVES_PER_COMPANY);
    assert.equal(second.start.squad.length, WAR_OPERATIVES_PER_COMPANY);
    const room = context.server.rooms.get(first.start.room);
    const target = room.world.war.points[1].position;
    second.client.send({ t: "command", seq: 1, command: { type: "move", unitIds: [second.start.squad[0]], to: target } });
    await new Promise((done) => setTimeout(done, 20));
    context.advance(200);
    let update = await second.client.next("update");
    while (!update.acks.some((ack) => ack.seq === 1)) update = await second.client.next("update");
    assert.deepEqual(update.acks, [{ seq: 1, ok: true }]);
    assert.equal(room.persistent, true);
  });
});
