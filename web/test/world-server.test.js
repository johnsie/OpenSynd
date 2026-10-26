// SPDX-License-Identifier: GPL-2.0-or-later

import assert from "node:assert/strict";
import test from "node:test";

import { commands } from "../src/commands.js";
import { silentHooks } from "../src/core/hooks.js";
import { playRecording, stateHash } from "../src/core/replay.js";
import { findPath } from "../src/engine.js";
import { HOUR_MS, RAID_COST, SIGNUP_FUNDS, incomePerHour, raidMission, upgradeCost } from "../server/raids.js";
import { makeWorld } from "../server/content.js";
import { content, withServer } from "./support.js";

const START = Date.UTC(2026, 9, 10, 12);
const TARGET = content.territories[3]; // a rival company's territory

async function signedUp(call, connect, name) {
  const signed = await call("/api/signup", { method: "POST", body: { name, password: "a good password" } });
  const client = await connect(signed.body.token);
  client.hello();
  await client.next("welcome");
  return { client, token: signed.body.token, name };
}

const world = async (call, who) => (await call("/api/world", { token: who?.token })).body;
const row = (page, id = TARGET.id) => page.territories.find((territory) => territory.id === id);

// Raid a territory and finish it, one way or the other: the squad wins at once, or is all put down.
async function raid(context, who, id, outcome) {
  who.client.send({ t: "create", mode: "raid", territory: id });
  const start = await who.client.next("start");
  const room = context.server.rooms.get(start.room);
  context.advance(500);
  if (outcome === "win") {
    for (const objective of room.world.objectives) objective.complete = true;
  } else {
    for (const unit of room.world.units.filter((item) => item.side === "team")) {
      unit.disabled = true;
      unit.health = 0;
    }
  }
  context.advance(200);
  return { start, room, end: await who.client.next("end") };
}

test("anyone can look at the world: fifty territories held by their rival companies, with nothing raidable until you sign in", async () => {
  await withServer(async ({ call }) => {
    const page = await world(call);
    assert.equal(page.territories.length, 50);
    assert.equal(row(page).holder, TARGET.owner);
    assert.equal(row(page).player, false);
    assert.ok(row(page).defence >= 1 && row(page).defence <= 3);
    assert.equal(row(page).canRaid, false);
    assert.match(row(page).why, /Sign in/);
    assert.equal(page.you, null);
    assert.equal(page.raidCost, RAID_COST);
  }, { clock: () => START });
});

test("a raid costs funds, and winning it makes the territory yours, shielded, logged and recorded to watch", async () => {
  let clock = START;
  await withServer(async (context) => {
    const { call, connect } = context;
    const anna = await signedUp(call, connect, "Anna");
    assert.equal((await world(call, anna)).you.funds, SIGNUP_FUNDS);
    assert.equal(row(await world(call, anna)).canRaid, true);
    const { start, end } = await raid(context, anna, TARGET.id, "win");
    assert.equal(start.variant, "raid");
    assert.equal(start.data.variant, "raid", "the operation made for this raid is sent whole");
    assert.equal(end.outcome, "success");
    assert.deepEqual([end.raid.captured, end.raid.cost, end.raid.funds], [true, RAID_COST, SIGNUP_FUNDS - RAID_COST]);
    const page = await world(call, anna);
    assert.deepEqual([row(page).holder, row(page).player, row(page).mine, row(page).defence], ["Anna", true, true, 1]);
    assert.ok(row(page).shieldedFor > 11 * 3600 && row(page).shieldedFor <= 12 * 3600);
    assert.equal(page.you.owned, 1);
    assert.equal(page.you.incomePerHour, incomePerHour(TARGET));
    assert.deepEqual(page.raids.map((entry) => [entry.territory, entry.outcome, entry.attacker]), [[TARGET.id, "captured", "Anna"]]);
    const kept = (await call(`/api/run/${end.raid.run}`)).body;
    assert.equal(kept.recording.raid.territory, TARGET.id, "the recording says what was raided and how well defended");

    // What the territory pays builds up while away, and is paid when the world is next looked at.
    clock += 5 * HOUR_MS;
    const later = await world(call, anna);
    assert.equal(later.you.collected, 5 * incomePerHour(TARGET));
    assert.equal(later.you.funds, SIGNUP_FUNDS - RAID_COST + 5 * incomePerHour(TARGET));
    assert.equal((await world(call, anna)).you.collected, 0, "paid once");
  }, { clock: () => clock });
});

test("a shielded territory cannot be raided; after the shield, the raiders may fail and the holder keeps it", async () => {
  let clock = START;
  await withServer(async (context) => {
    const { call, connect } = context;
    const anna = await signedUp(call, connect, "Anna");
    const ben = await signedUp(call, connect, "Ben");
    await raid(context, anna, TARGET.id, "win");
    ben.client.send({ t: "create", mode: "raid", territory: TARGET.id });
    assert.match((await ben.client.next("error")).message, /shielded/);
    assert.equal(row(await world(call, ben)).canRaid, false);
    clock += 13 * HOUR_MS;
    const lost = await raid(context, ben, TARGET.id, "lose");
    assert.equal(lost.end.outcome, "failure");
    assert.equal(lost.end.raid.captured, false);
    const page = await world(call, ben);
    assert.equal(row(page).holder, "Anna", "she still has it");
    assert.ok(row(page).shieldedFor > 5 * 3600, "and it is shielded again");
    assert.equal(page.you.funds, SIGNUP_FUNDS - RAID_COST, "the raid was paid for");
    const hers = await world(call, anna);
    const seen = hers.raids.map((entry) => [entry.outcome, entry.attacker, entry.defender]).slice(0, 1);
    assert.deepEqual(seen, [["defended", "Ben", "Anna"]], "she sees it");
  }, { clock: () => clock });
});

test("a raid takes a player's territory from them, and the holder's log shows who took it", async () => {
  let clock = START;
  await withServer(async (context) => {
    const { call, connect } = context;
    const anna = await signedUp(call, connect, "Anna");
    const ben = await signedUp(call, connect, "Ben");
    await raid(context, anna, TARGET.id, "win");
    clock += 13 * HOUR_MS;
    const taken = await raid(context, ben, TARGET.id, "win");
    assert.equal(taken.end.raid.captured, true);
    assert.equal(row(await world(call, ben)).holder, "Ben");
    const hers = await world(call, anna);
    assert.equal(hers.you.owned, 0);
    assert.equal(hers.raids[0].outcome, "captured");
    assert.equal(hers.raids[0].defender, "Anna");
    assert.equal(hers.raids[0].attacker, "Ben");
  }, { clock: () => clock });
});

test("nobody can raid someone with far less than they have, or without the funds, or a territory that is not there", async () => {
  let clock = START;
  await withServer(async (context) => {
    const { call, connect } = context;
    const anna = await signedUp(call, connect, "Anna");
    const ben = await signedUp(call, connect, "Ben");
    const first = content.territories[3].id;
    const others = [content.territories[4].id, content.territories[5].id];
    await raid(context, ben, first, "win");
    for (const id of others) {
      clock += 13 * HOUR_MS;
      await raid(context, anna, id, "win");
    }
    // Anna holds two and Ben one: Ben's is less than half... of two, no: 1 * 2 >= 2, still fine.
    clock += 13 * HOUR_MS;
    anna.client.send({ t: "create", mode: "raid", territory: first });
    assert.equal((await anna.client.next("start")).variant, "raid", "two against one is a fair match");
    // A player with three and a rival with one is not.
    const cleo = await signedUp(call, connect, "Cleo");
    const fiona = await signedUp(call, connect, "Fiona");
    await raid(context, fiona, content.territories[10].id, "win");
    for (const id of [content.territories[11].id, content.territories[12].id, content.territories[13].id]) {
      clock += 13 * HOUR_MS;
      await raid(context, cleo, id, "win");
    }
    clock += 13 * HOUR_MS;
    cleo.client.send({ t: "create", mode: "raid", territory: content.territories[10].id });
    assert.match((await cleo.client.next("error")).message, /far less/);
    cleo.client.send({ t: "create", mode: "raid", territory: "developer.nowhere" });
    assert.match((await cleo.client.next("error")).message, /no such territory/);
    const broke = await signedUp(call, connect, "Broke");
    for (let index = 0; index < 5; index += 1) context.store.spendFunds(context.store.findForLogin("Broke").id, 300);
    broke.client.send({ t: "create", mode: "raid", territory: content.territories[20].id });
    assert.match((await broke.client.next("error")).message, /costs 300/);
    const guest = await context.connect();
    guest.hello();
    await guest.next("welcome");
    guest.send({ t: "create", mode: "raid", territory: first });
    assert.match((await guest.next("error")).message, /Sign in/);
  }, { clock: () => clock });
});

test("the holder raises a territory's defence by paying for each level, and only the holder can", async () => {
  let clock = START;
  await withServer(async (context) => {
    const { call, connect } = context;
    const anna = await signedUp(call, connect, "Anna");
    const ben = await signedUp(call, connect, "Ben");
    await raid(context, anna, TARGET.id, "win");
    const upgrade = (who, level) => call("/api/defence", { method: "POST", token: who.token, body: { territory: TARGET.id, level } });
    assert.equal((await upgrade(ben, 2)).status, 403, "not his");
    const annaId = context.store.findForLogin("Anna").id;
    context.store.spendFunds(annaId, 1000); // down to 200
    assert.equal((await upgrade(anna, 2)).status, 402, "she cannot afford 1000 yet");
    context.store.addFunds(annaId, 5000);
    assert.equal((await upgrade(anna, 1)).status, 400, "not a rise");
    assert.equal((await upgrade(anna, 9)).status, 400, "above the top");
    const done = await upgrade(anna, 3);
    assert.equal(done.status, 200);
    assert.equal(done.body.cost, upgradeCost(2) + upgradeCost(3));
    assert.equal(row(await world(call, anna)).defence, 3);
    // The raid on it now faces more agents.
    clock += 13 * HOUR_MS;
    ben.client.send({ t: "create", mode: "raid", territory: TARGET.id });
    const start = await ben.client.next("start");
    assert.match(start.data.intel[0], /Defence level 3/);
    assert.equal(context.server.rooms.get(start.room).raid.level, 3);
  }, { clock: () => clock });
});

test("each new month the map starts afresh and funds are kept", async () => {
  let clock = START;
  await withServer(async (context) => {
    const { call, connect } = context;
    const anna = await signedUp(call, connect, "Anna");
    await raid(context, anna, TARGET.id, "win");
    assert.equal(row(await world(call, anna)).holder, "Anna");
    const funds = (await world(call, anna)).you.funds;
    clock = Date.UTC(2026, 10, 2);
    const fresh = await world(call, anna);
    assert.equal(row(fresh).holder, TARGET.owner, "the rival company has it again");
    assert.equal(fresh.you.owned, 0);
    assert.ok(fresh.you.funds >= funds, "funds stay");
    assert.notEqual(fresh.season, undefined);
  }, { clock: () => clock });
});

test("a raid as played is recorded in a way that plays back to the same state", async () => {
  await withServer(async (context) => {
    const { call, connect } = context;
    const anna = await signedUp(call, connect, "Anna");
    anna.client.send({ t: "create", mode: "raid", territory: TARGET.id });
    const start = await anna.client.next("start");
    const room = context.server.rooms.get(start.room);
    const lead = room.world.units.find((unit) => unit.id === start.squad[0]);
    const from = { x: Math.round(lead.position.x), y: Math.round(lead.position.y) };
    const tile = [...Array(13).keys()]
      .flatMap((dx) => [...Array(13).keys()].map((dy) => ({ x: from.x + dx - 6, y: from.y + dy - 6 })))
      .find((spot) => Math.hypot(spot.x - from.x, spot.y - from.y) >= 5 && findPath(room.world.grid, from, spot).length > 0);
    anna.client.send({ t: "command", seq: 1, command: commands.move(start.squad, tile) });
    await new Promise((done) => setTimeout(done, 80));
    context.advance(4000);
    const recording = JSON.parse(JSON.stringify(room.toRecording()));
    const mission = raidMission(content, { ...TARGET, holder: TARGET.owner }, recording.raid.level);
    const again = makeWorld(content, mission, { seed: recording.seed, options: recording.options ?? { decidesOutcome: true } });
    playRecording(again, recording, silentHooks());
    assert.equal(stateHash(again), stateHash(room.world));
  }, { clock: () => START });
});
