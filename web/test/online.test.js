// SPDX-License-Identifier: GPL-2.0-or-later

// The game's online client, against a real server on a spare port: signing in, playing, and being refused when out of date.
import assert from "node:assert/strict";
import test from "node:test";

import { commands } from "../src/commands.js";
import { stateHash } from "../src/core/replay.js";
import { applyServerMessage, equipmentLookup } from "../src/core/sync.js";
import { findPath } from "../src/engine.js";
import { OnlineClient, PROTOCOL_VERSION, createSmoother } from "../src/online.js";
import { loadContent, makeWorld } from "../server/content.js";
import { PROTOCOL_VERSION as SERVER_PROTOCOL } from "../server/protocol.js";
import { createGameServer } from "../server/server.js";
import { openStore } from "../server/store.js";

const content = loadContent();
const lookup = equipmentLookup(content.equipment);

async function withServer(body) {
  let time = 0;
  const store = openStore();
  const server = createGameServer({ content, store, now: () => time, tickEvery: false });
  const address = await server.listen(0);
  const advance = (ms) => {
    time += ms;
    for (let round = 0; round < 200; round += 1) server.tickRooms();
  };
  const client = (overrides = {}) => new OnlineClient({ server: `http://${address}`, content: server.content.hash, ...overrides });
  try {
    await body({ client, server, advance, address });
  } finally {
    await server.close();
    store.close();
  }
}
const waitFor = async (condition, within = 3000) => {
  for (let waited = 0; waited < within && !condition(); waited += 10) await new Promise((done) => setTimeout(done, 10));
  assert.ok(condition(), "timed out waiting");
};

test("the client and the server speak the same version of the protocol", () => {
  assert.equal(PROTOCOL_VERSION, SERVER_PROTOCOL);
});

test("the client signs up, signs in, and signs out", async () => {
  await withServer(async ({ client }) => {
    const anna = client();
    assert.equal((await anna.health()).ok, true);
    assert.equal((await anna.signUp("Anna", "a good password")).ok, true);
    assert.equal(anna.account.name, "Anna");
    const later = client({ token: anna.token });
    assert.equal((await later.whoAmI()).name, "Anna");
    const wrong = await client().signIn("Anna", "not the password");
    assert.equal(wrong.ok, false);
    assert.match(wrong.error, /do not match/);
    await anna.signOut();
    assert.equal(await client({ token: anna.token }).whoAmI(), null, "no longer signed in");
    assert.equal(await client({ server: "http://127.0.0.1:1" }).health(), null, "an unreachable server is just null");
  });
});

test("a client that is out of date is refused with the reason", async () => {
  await withServer(async ({ client }) => {
    await assert.rejects(client({ content: "0000" }).connect(), (error) => error.reason === "content" && /out of date/.test(error.message));
    await assert.rejects(client({ server: "http://127.0.0.1:1" }).connect(), /Could not reach/);
  });
});

test("a client plays an operation on the server and its copy stays in step with the server's", async () => {
  await withServer(async ({ client, server, advance }) => {
    const anna = client();
    await anna.signUp("Anna", "a good password");
    await anna.connect();
    const started = new Promise((done) => anna.on("start", done));
    const updates = [];
    anna.on("update", (message) => updates.push(message));
    anna.create("solo");
    const start = await started;
    const copy = makeWorld(content, start.mission, { seed: start.seed });
    applyServerMessage(copy, start, lookup);
    const room = server.rooms.get(start.room);
    const lead = room.world.units.find((unit) => unit.id === start.squad[0]);
    const from = { x: Math.round(lead.position.x), y: Math.round(lead.position.y) };
    const target = [...Array(13).keys()]
      .flatMap((dx) => [...Array(13).keys()].map((dy) => ({ x: from.x + dx - 6, y: from.y + dy - 6 })))
      .find((tile) => Math.hypot(tile.x - from.x, tile.y - from.y) >= 5 && findPath(room.world.grid, from, tile).length > 0);
    const seq = anna.command(commands.move([lead.id], target));
    await waitFor(() => [...room.players.values()][0].queue.length > 0);
    advance(4000);
    await waitFor(() => updates.some((message) => message.step >= 120));
    const smoother = createSmoother();
    for (const message of updates) applyServerMessage(copy, message, lookup, { smoother, now: 0 });
    smoother.show(copy.units, 1e9);
    assert.ok(updates.flatMap((message) => message.acks).some((ack) => ack.seq === seq && ack.ok), "the order was acknowledged");
    const last = updates.at(-1);
    assert.equal(copy.steps, last.step);
    const there = copy.units.find((unit) => unit.id === lead.id).position;
    assert.ok(Math.hypot(there.x - from.x, there.y - from.y) > 2, "the client's copy shows them having walked");
    assert.equal(stateHash(copy), stateHash(room.world), "the copy is exactly the server's world");
  });
});

const STEP = 1000 / 30;

// Updates reach the page `late` ms behind the game's clock; `at(ms)` is what the smoother shows for the unit at that moment.
function feed(smoother, reports, lateFor = () => 0) {
  const unit = { id: "u", position: { x: 0, y: 0 } };
  for (const { step, x } of reports) {
    unit.position = { x, y: 0 };
    smoother.arrived(step, step * STEP + lateFor(step));
    smoother.observe(unit, step);
  }
  return (ms) => {
    smoother.show([unit], ms);
    return unit.position.x;
  };
}

test("people are shown a little in the past, moving at a steady pace between the two reports around that moment", () => {
  const smoother = createSmoother({ delaySteps: 4 });
  // A walker at one tile every three steps (a report every three steps).
  const at = feed(smoother, [3, 6, 9, 12, 15].map((step) => ({ step, x: step / 3 })));
  // At game step 15 the page shows step 11: between the reports for 9 and 12.
  assert.ok(Math.abs(at(15 * STEP) - 11 / 3) < 1e-9, "a third of the way from 3 to 4 tiles... at step 11");
  // A bit later, still moving at the same pace, with no pause between reports.
  assert.ok(Math.abs(at(16 * STEP) - 12 / 3) < 1e-9);
  assert.ok(Math.abs(at(15.5 * STEP) - 11.5 / 3) < 1e-9);
});

test("a late update does not make people stop and then rush: they keep walking at the same pace", () => {
  const smoother = createSmoother({ delaySteps: 4 });
  // The report for step 12 arrives 80 ms (2.4 steps) late; the others on time.
  const at = feed(smoother, [3, 6, 9, 12].map((step) => ({ step, x: step / 3 })), (step) => (step === 12 ? 80 : 0));
  const speeds = [];
  for (let ms = 13 * STEP; ms < 15 * STEP; ms += STEP) speeds.push(at(ms + STEP) - at(ms));
  for (const speed of speeds) assert.ok(Math.abs(speed - 1 / 3) < 1e-9, `steady pace, got ${speed}`);
});

test("someone who stood still then set off does not drift across the time they stood, and a long jump is not dragged", () => {
  const smoother = createSmoother({ delaySteps: 4 });
  const unit = { id: "u", position: { x: 5, y: 0 } };
  smoother.arrived(3, 3 * STEP);
  smoother.observe(unit, 3);
  unit.position = { x: 6, y: 0 }; // 90 steps later, the first report of them moving again
  smoother.arrived(93, 93 * STEP);
  smoother.observe(unit, 93);
  smoother.show([unit], 50 * STEP); // while they were still
  assert.equal(unit.position.x, 5);
  const jumper = { id: "j", position: { x: 5, y: 0 } };
  smoother.observe(jumper, 90);
  jumper.position = { x: 40, y: 0 };
  smoother.observe(jumper, 93);
  smoother.show([jumper], 93 * STEP + 4 * STEP); // the moment reaches step 93
  assert.equal(jumper.position.x, 40);
  smoother.show([jumper], 91 * STEP + 4 * STEP);
  assert.equal(jumper.position.x, 5, "not dragged across");
});

test("what happened at a step is shown when the people have got to it", () => {
  const smoother = createSmoother({ delaySteps: 4 });
  smoother.arrived(30, 30 * STEP + 10);
  assert.ok(Math.abs(smoother.delayFor(30, 30 * STEP + 10) - 4 * STEP) < 1e-6, "four steps after it was sent");
  assert.equal(smoother.delayFor(20, 30 * STEP + 10), 0, "already past");
});

// ---- The page's side of playing online (src/online-play.js), with a plain object standing in for the page's state

import { recordingHooks } from "../src/core/hooks.js";
import { createOnlinePlay } from "../src/online-play.js";

test("the page's online play builds the operation, follows the server, plays its news and sends orders", async () => {
  await withServer(async ({ server, advance, address }) => {
    const state = {};
    const hooks = recordingHooks();
    const play = createOnlinePlay({ state, hooks, equipment: content.equipment });
    play.configure({ server: `http://${address}`, content: server.content.hash, token: null });
    assert.equal((await play.health()).ok, true);
    const start = await play.start("solo");
    Object.assign(state, makeWorld(content, start.mission, { seed: start.seed }));
    applyServerMessage(state, start, lookup);
    play.attach();
    const room = server.rooms.get(start.room);
    const lead = state.units.find((unit) => unit.id === start.squad[0]);
    const from = { x: Math.round(lead.position.x), y: Math.round(lead.position.y) };
    const target = [...Array(13).keys()]
      .flatMap((dx) => [...Array(13).keys()].map((dy) => ({ x: from.x + dx - 6, y: from.y + dy - 6 })))
      .find((tile) => Math.hypot(tile.x - from.x, tile.y - from.y) >= 5 && findPath(room.world.grid, from, tile).length > 0);
    play.give(commands.move(start.squad, target));
    await waitFor(() => [...room.players.values()][0].queue.length > 0);
    advance(3000);
    await waitFor(() => state.steps >= 80);
    assert.ok(hooks.events.some((event) => event.type === "message" && /Route accepted|operators moving/.test(event.text)), "its own news");
    play.frame(start.squad, null);
    assert.ok(Math.hypot(lead.position.x - from.x, lead.position.y - from.y) > 1, "the agent has been walking");
    play.give(commands.useItem(start.squad, start.squad[0], 0));
    await waitFor(() => [...room.players.values()][0].queue.length > 0);
    advance(500);
    await waitFor(() => lead.activeSlot === 0);
    assert.equal(lead.activeSlot, 0, "an order the server carried out shows in the page's copy");
    // A held weapon is told to the server, and letting go is too.
    const queued = () => [...room.players.values()][0].queue.length;
    play.frame(start.squad, { x: from.x + 3.5, y: from.y });
    await waitFor(() => queued() > 0);
    advance(100);
    assert.notEqual(room.world.holdFire, null, "the weapon is held on a point");
    play.frame(start.squad, null);
    await waitFor(() => queued() > 0);
    advance(100);
    assert.equal(room.world.holdFire, null, "and let go");
    const closed = new Promise((done) => play.onClose(done));
    play.stop();
    await closed.catch(() => {});
  });
});

test("updates that arrive before the page has built the operation are kept and applied in order", async () => {
  await withServer(async ({ server, advance, address }) => {
    const state = {};
    const clock = { t: 0 };
    const play = createOnlinePlay({ state, hooks: recordingHooks(), equipment: content.equipment, now: () => clock.t });
    play.configure({ server: `http://${address}`, content: server.content.hash, token: null });
    const start = await play.start("solo");
    advance(2000); // the server goes on while the page is still loading
    await waitFor(() => server.rooms.get(start.room).world.steps > 40);
    await new Promise((done) => setTimeout(done, 50));
    Object.assign(state, makeWorld(content, start.mission, { seed: start.seed }));
    applyServerMessage(state, start, lookup);
    assert.equal(state.steps, 0);
    play.attach();
    assert.ok(state.steps > 0, "what was missed is applied the moment the page is ready");
    clock.t = 1e9; // long enough for everyone to have walked to where the server has them
    play.frame(start.squad, null);
    assert.equal(stateHash(state), stateHash(server.rooms.get(start.room).world));
    play.stop();
  });
});
