// SPDX-License-Identifier: GPL-2.0-or-later

import assert from "node:assert/strict";
import test from "node:test";

import { commands } from "../src/commands.js";
import { AWAY_SECONDS } from "../server/server.js";
import { content, withServer } from "./support.js";

const MISSION = content.pack.missions[0];

async function player(context, name) {
  const signed = await context.call("/api/signup", { method: "POST", body: { name, password: "a good password" } });
  const client = await context.connect(signed.body.token);
  client.hello();
  await client.next("welcome");
  return { client, token: signed.body.token, name };
}

// Two or more signed-in players in one game, begun.
async function beginGame(context, names) {
  const players = [];
  for (const name of names) players.push(await player(context, name));
  const [host, ...others] = players;
  host.client.send({ t: "open", capacity: names.length });
  const opened = await host.client.next("waiting");
  for (const other of others) {
    other.client.send({ t: "join", game: opened.game.id });
    await other.client.next("waiting");
    other.client.send({ t: "ready", on: true });
  }
  await new Promise((done) => setTimeout(done, 50));
  host.client.send({ t: "begin" });
  const starts = await Promise.all(players.map((one) => one.client.next("start")));
  return { players, starts, room: context.server.rooms.get(starts[0].room) };
}

test("a signed-in player opens a game, others see it in the lobby and join, and everyone is told who is in it", async () => {
  await withServer(async (context) => {
    const anna = await player(context, "Anna");
    const ben = await player(context, "Ben");
    anna.client.send({ t: "open", capacity: 3 });
    const opened = await anna.client.next("waiting");
    assert.deepEqual([opened.game.host, opened.game.capacity, opened.game.mission], ["Anna", 3, MISSION]);
    ben.client.send({ t: "lobby" });
    const listed = await ben.client.next("lobby");
    assert.deepEqual(listed.games.map((game) => [game.id, game.host, game.players.length]), [[opened.game.id, "Anna", 1]]);
    ben.client.send({ t: "join", game: opened.game.id });
    const seen = await anna.client.next("waiting");
    assert.deepEqual(seen.game.players.map((one) => one.name), ["Anna", "Ben"]);
    ben.client.send({ t: "leave" });
    assert.equal((await ben.client.next("closed")).reason, "You left the game.");
    assert.deepEqual((await anna.client.next("waiting")).game.players.map((one) => one.name), ["Anna"]);
  });
});

test("guests cannot play with others, and a game that does not exist or is full cannot be joined", async () => {
  await withServer(async (context) => {
    const guest = await context.connect();
    guest.hello();
    await guest.next("welcome");
    guest.send({ t: "open" });
    assert.match((await guest.next("error")).message, /Sign in/);
    guest.send({ t: "quick" });
    assert.match((await guest.next("error")).message, /Sign in/);
    const anna = await player(context, "Anna");
    anna.client.send({ t: "join", game: "game-99" });
    assert.match((await anna.client.next("error")).message, /not open/);
    anna.client.send({ t: "open", mission: "../elsewhere" });
    assert.match((await anna.client.next("error")).message, /no such operation/);
  });
});

test("only the host begins, only once the others are ready, and then the agents are shared out", async () => {
  await withServer(async (context) => {
    const anna = await player(context, "Anna");
    const ben = await player(context, "Ben");
    anna.client.send({ t: "open", capacity: 2 });
    const { game } = await anna.client.next("waiting");
    ben.client.send({ t: "join", game: game.id });
    await ben.client.next("waiting");
    ben.client.send({ t: "begin" });
    assert.match((await ben.client.next("error")).message, /Only the host/);
    anna.client.send({ t: "begin" });
    assert.match((await anna.client.next("error")).message, /ready/);
    ben.client.send({ t: "ready", on: true });
    await new Promise((done) => setTimeout(done, 50));
    anna.client.send({ t: "begin" });
    const [first, second] = [await anna.client.next("start"), await ben.client.next("start")];
    assert.equal(first.room, second.room, "the same operation");
    assert.equal(first.squad.length, 2);
    assert.equal(second.squad.length, 2);
    assert.deepEqual([...first.squad, ...second.squad].sort(), context.server.rooms.get(first.room).squad.sort(), "everyone has someone");
    assert.deepEqual(first.team.map((member) => member.name), ["Anna", "Ben"]);
    assert.equal(context.server.rooms.get(first.room).world.units.filter((unit) => unit.side === "team").length, 4);
  });
});

test("each player can order their own agents and nobody else's", async () => {
  await withServer(async (context) => {
    const { players, starts, room } = await beginGame(context, ["Anna", "Ben"]);
    const [anna, ben] = players;
    const mine = starts[0].squad[0];
    const theirs = starts[1].squad[0];
    anna.client.send({ t: "command", seq: 1, command: commands.interact([theirs]) });
    anna.client.send({ t: "command", seq: 2, command: commands.interact([mine]) });
    ben.client.send({ t: "command", seq: 1, command: commands.interact([theirs]) });
    await new Promise((done) => setTimeout(done, 80));
    context.advance(200);
    const acks = (message) => message.acks;
    const updateOf = async (one) => (await one.client.next("update"));
    const annaAcks = acks(await updateOf(anna));
    const benAcks = acks(await updateOf(ben));
    assert.deepEqual(annaAcks.map((ack) => [ack.seq, ack.ok]), [[1, false], [2, true]]);
    assert.equal(annaAcks[0].error, "not your agent");
    assert.deepEqual(benAcks.map((ack) => [ack.seq, ack.ok]), [[1, true]]);
    assert.ok(room.recording.commands.every((entry) => entry.player), "the recording says who gave each order");
  });
});

test("quick match: the second player to ask is put with the first and the game begins at once", async () => {
  await withServer(async (context) => {
    const cleo = await player(context, "Cleo");
    const dev = await player(context, "Dev");
    cleo.client.send({ t: "quick" });
    assert.equal((await cleo.client.next("waiting")).game.quick, true);
    dev.client.send({ t: "quick" });
    const [first, second] = [await cleo.client.next("start"), await dev.client.next("start")];
    assert.equal(first.room, second.room);
    assert.equal(context.server.rooms.size, 1);
    assert.equal([...context.server.rooms.values()][0].players.size, 2);
  });
});

test("a win pays every signed-in player, and everyone is told", async () => {
  await withServer(async (context) => {
    const { players, room } = await beginGame(context, ["Anna", "Ben"]);
    context.advance(500);
    for (const objective of room.world.objectives) objective.complete = true;
    context.advance(200);
    const ends = await Promise.all(players.map((one) => one.client.next("end")));
    assert.ok(ends.every((end) => end.outcome === "success" && end.coop.reward >= 1500));
    for (const one of players) {
      const me = (await context.call("/api/me", { token: one.token })).body;
      assert.ok(me.account);
    }
    const funds = players.map((one) => context.store.funds(context.store.findForLogin(one.name).id));
    assert.deepEqual(funds, [ends[0].coop.reward, ends[0].coop.reward]);
  });
});

test("a player who loses their connection comes back to the same operation, and meanwhile their agents hold", async () => {
  await withServer(async (context) => {
    const { players, starts, room } = await beginGame(context, ["Anna", "Ben"]);
    const [anna, ben] = players;
    context.advance(1000);
    const squad = starts[0].squad;
    anna.client.socket.close();
    for (let waited = 0; waited < 100 && room.present > 1; waited += 1) await new Promise((done) => setTimeout(done, 10));
    assert.equal(room.present, 1, "she is away");
    for (const unit of room.world.units.filter((item) => squad.includes(item.id))) {
      assert.notEqual(unit.activeSlot, null, "her agents have a weapon out");
    }
    context.advance(1000);
    assert.ok(ben.client.received.filter((message) => message.t === "update").length > 5, "the game goes on for Ben");
    const back = await context.connect(anna.token);
    back.hello();
    await back.next("welcome");
    const resumed = await back.next("start");
    assert.equal(resumed.room, starts[0].room);
    assert.deepEqual(resumed.squad, squad);
    assert.ok(resumed.step > 30, "the operation has moved on");
    assert.equal(room.present, 2);
    back.send({ t: "command", seq: 1, command: commands.interact([squad[0]]) });
    await new Promise((done) => setTimeout(done, 80)); // the order reaches the server
    context.advance(200);
    await back.next("update");
    const ackedOrders = () => back.received.filter((message) => message.t === "update").flatMap((message) => message.acks);
    for (let waited = 0; waited < 100 && ackedOrders().length === 0; waited += 1) await new Promise((done) => setTimeout(done, 10));
    assert.ok(ackedOrders().some((ack) => ack.seq === 1 && ack.ok), "she can give orders again");
  });
});

test("a player away for too long loses their place, and an empty operation is dropped", async () => {
  let clock = 0;
  await withServer(async (context) => {
    const { players, room } = await beginGame(context, ["Anna", "Ben"]);
    for (const one of players) one.client.socket.close();
    for (let waited = 0; waited < 100 && room.present > 0; waited += 1) await new Promise((done) => setTimeout(done, 10));
    clock += (AWAY_SECONDS + 5) * 1000;
    context.advance(10);
    assert.equal(room.players.size, 0);
    assert.equal(context.server.rooms.size, 0);
  }, { now: () => clock });
});
