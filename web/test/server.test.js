// SPDX-License-Identifier: GPL-2.0-or-later

import assert from "node:assert/strict";
import test from "node:test";

import { commands } from "../src/commands.js";
import { findPath } from "../src/engine.js";
import { CORE_VERSION, PROTOCOL_VERSION } from "../server/protocol.js";
import { loadContent } from "../server/content.js";
import { createGameServer } from "../server/server.js";
import { openStore } from "../server/store.js";

const content = loadContent();

// A server on a spare port with a clock the test winds by hand.
async function withServer(body, options = {}) {
  let time = 0;
  const store = openStore();
  const server = createGameServer({ content, store, now: () => time, tickEvery: false, ...options });
  const address = await server.listen(0);
  const api = `http://${address}`;
  const call = async (path, { method = "GET", body: payload, token } = {}) => {
    const response = await fetch(`${api}${path}`, {
      method,
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: payload ? JSON.stringify(payload) : undefined,
    });
    return { status: response.status, body: await response.json() };
  };
  const sockets = [];
  const connect = async (token) => {
    const socket = new WebSocket(`ws://${address}/ws`);
    const received = [];
    const waiting = [];
    socket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      received.push(message);
      for (const waiter of [...waiting]) if (waiter.test(message)) waiter.done(message);
    };
    await new Promise((done, fail) => {
      socket.onopen = done;
      socket.onerror = () => fail(new Error("no connection"));
    });
    sockets.push(socket);
    const next = (type, within = 3000) =>
      new Promise((done, fail) => {
        const existing = received.find((message) => message.t === type && !message.taken);
        if (existing) {
          existing.taken = true;
          return done(existing);
        }
        const waiter = {
          test: (message) => message.t === type,
          done: (message) => {
            waiting.splice(waiting.indexOf(waiter), 1);
            message.taken = true;
            done(message);
          },
        };
        waiting.push(waiter);
        setTimeout(() => fail(new Error(`no ${type} message; got ${received.map((message) => message.t)}`)), within);
      });
    const send = (message) => socket.send(JSON.stringify(message));
    const hello = (overrides = {}) =>
      send({ t: "hello", v: PROTOCOL_VERSION, core: CORE_VERSION, content: server.content.hash, token, ...overrides });
    return { socket, received, next, send, hello };
  };
  try {
    // Wind the clock on and let every room catch up (the server never runs more than a few steps at once, as it would not need to).
    const advance = (ms) => {
      time += ms;
      for (let round = 0; round < 200; round += 1) server.tickRooms();
    };
    await body({ api, call, connect, server, store, advance });
  } finally {
    for (const socket of sockets) socket.close();
    await server.close();
    store.close();
  }
}

test("the server says how it is, and unknown paths are not found", async () => {
  await withServer(async ({ call, server }) => {
    const health = await call("/api/health");
    assert.equal(health.status, 200);
    const { ok, protocol, core, content: hash } = health.body;
    assert.deepEqual([ok, protocol, core, hash], [true, PROTOCOL_VERSION, CORE_VERSION, server.content.hash]);
    assert.equal((await call("/api/nothing")).status, 404);
  });
});

test("accounts: sign up, sign in, who am I, sign out, and delete", async () => {
  await withServer(async ({ call }) => {
    const created = await call("/api/signup", { method: "POST", body: { name: "Anna", password: "a good password" } });
    assert.equal(created.status, 201);
    assert.equal(created.body.account.name, "Anna");
    assert.ok(created.body.token.length > 30);
    const taken = await call("/api/signup", { method: "POST", body: { name: "anna", password: "another good one" } });
    assert.equal(taken.status, 409, "taken");
    assert.equal((await call("/api/signup", { method: "POST", body: { name: "Ben", password: "short" } })).status, 400);
    assert.equal((await call("/api/signup", { method: "POST", body: { name: "<b>", password: "a good password" } })).status, 400);
    assert.equal((await call("/api/me", { token: created.body.token })).body.account.name, "Anna");
    assert.equal((await call("/api/me")).status, 401);
    const login = (name, password) => call("/api/login", { method: "POST", body: { name, password } });
    assert.equal((await login("Anna", "wrong password")).status, 401);
    assert.equal((await login("Nobody", "a good password")).status, 401);
    const again = await login("ANNA", "a good password");
    assert.equal(again.status, 200);
    await call("/api/logout", { method: "POST", token: again.body.token });
    assert.equal((await call("/api/me", { token: again.body.token })).status, 401, "signed out");
    const remove = (password) => call("/api/account", { method: "DELETE", token: created.body.token, body: { password } });
    assert.equal((await remove("nope nope nope")).status, 403);
    assert.equal((await remove("a good password")).status, 200);
    assert.equal((await call("/api/me", { token: created.body.token })).status, 401);
    const again2 = await call("/api/signup", { method: "POST", body: { name: "Anna", password: "a good password" } });
    assert.equal(again2.status, 201, "the name is free again");
  });
});

test("sign-ups from one place are limited, and requests that are not JSON or are too big are refused", async () => {
  await withServer(async ({ call, api }) => {
    for (let index = 0; index < 10; index += 1) {
      await call("/api/signup", { method: "POST", body: { name: `Player ${index}`, password: "a good password" } });
    }
    const extra = await call("/api/signup", { method: "POST", body: { name: "One more", password: "a good password" } });
    assert.equal(extra.status, 429);
    const garbage = await fetch(`${api}/api/login`, { method: "POST", body: "{nope" });
    assert.equal(garbage.status, 400);
    const bigBody = JSON.stringify({ name: "x".repeat(10_000) });
    const huge = await fetch(`${api}/api/login`, { method: "POST", body: bigBody }).catch(() => ({ status: 413 }));
    assert.ok([413, 400].includes(huge.status));
  });
});

test("a game that is out of date, or has a bad sign-in, is told so and let go", async () => {
  await withServer(async ({ connect }) => {
    for (const [overrides, reason] of [
      [{ v: 0 }, "protocol"],
      [{ core: CORE_VERSION + 1 }, "core"],
      [{ content: "0000" }, "content"],
      [{ token: "x".repeat(40) }, "account"],
    ]) {
      const client = await connect();
      client.hello(overrides);
      const refused = await client.next("refused");
      assert.equal(refused.reason, reason);
      assert.match(refused.message, /./);
    }
    const stranger = await connect();
    stranger.send({ t: "create", mode: "solo" });
    assert.equal((await stranger.next("error")).message, "Say hello first.");
  });
});

test("a player joins, starts an operation, gives an order, and is sent the result", async () => {
  await withServer(async ({ call, connect, advance, server }) => {
    const signed = await call("/api/signup", { method: "POST", body: { name: "Anna", password: "a good password" } });
    const client = await connect(signed.body.token);
    client.hello();
    const welcome = await client.next("welcome");
    assert.equal(welcome.account.name, "Anna");
    client.send({ t: "create", mode: "solo" });
    const start = await client.next("start");
    assert.equal(start.squad.length, 4);
    const room = server.rooms.get(start.room);
    const lead = room.world.units.find((unit) => unit.id === start.squad[0]);
    const from = { x: Math.round(lead.position.x), y: Math.round(lead.position.y) };
    let target;
    for (let dx = -6; dx <= 6 && !target; dx += 1) {
      for (let dy = -6; dy <= 6 && !target; dy += 1) {
        const tile = { x: from.x + dx, y: from.y + dy };
        if (Math.hypot(dx, dy) >= 5 && findPath(room.world.grid, from, tile).length > 0) target = tile;
      }
    }
    client.send({ t: "command", seq: 1, command: commands.move([lead.id], target) });
    // Wait for the order to arrive over the socket before the clock is wound on.
    const player = [...room.players.values()][0];
    for (let index = 0; index < 100 && player.queue.length === 0; index += 1) await new Promise((done) => setTimeout(done, 10));
    for (let second = 0; second < 3; second += 1) advance(1000);
    const update = await client.next("update");
    assert.ok(update.step > 0);
    assert.ok(client.received.filter((message) => message.t === "update").length >= 5, "updates keep coming");
    const acks = client.received.filter((message) => message.t === "update").flatMap((message) => message.acks);
    assert.deepEqual(acks, [{ seq: 1, ok: true }]);
    assert.ok(Math.hypot(lead.position.x - from.x, lead.position.y - from.y) > 2, "the agent walked on the server");
    client.send({ t: "ping", n: 7 });
    assert.equal((await client.next("pong")).n, 7);
  });
});

test("nobody gets to run commands in an operation they are not in, and a bad mission is refused", async () => {
  await withServer(async ({ connect }) => {
    const client = await connect();
    client.hello();
    await client.next("welcome");
    client.send({ t: "command", seq: 1, command: commands.interact(["operator-one"]) });
    const refused = await client.next("feedback");
    assert.deepEqual(refused.refused, { seq: 1, error: "no operation" });
    client.send({ t: "create", mode: "solo", mission: "../../etc/passwd" });
    assert.match((await client.next("error")).message, /no such operation/);
    client.send({ t: "nonsense" });
    assert.match((await client.next("error")).message, /Not understood/);
  });
});

test("when the only player leaves, the operation is dropped", async () => {
  await withServer(async ({ connect, server }) => {
    const client = await connect();
    client.hello();
    await client.next("welcome");
    client.send({ t: "create", mode: "solo" });
    await client.next("start");
    assert.equal(server.rooms.size, 1);
    client.socket.close();
    for (let index = 0; index < 50 && server.rooms.size > 0; index += 1) await new Promise((done) => setTimeout(done, 20));
    assert.equal(server.rooms.size, 0);
  });
});

test("a page from a site that is not allowed cannot sign in or play", async () => {
  await withServer(
    async ({ api }) => {
      const asked = await fetch(`${api}/api/health`, { headers: { Origin: "https://elsewhere.example" } });
      assert.equal(asked.headers.get("access-control-allow-origin"), null);
      const permitted = await fetch(`${api}/api/health`, { headers: { Origin: "https://opensynd.example" } });
      assert.equal(permitted.headers.get("access-control-allow-origin"), "https://opensynd.example");
      const socket = new WebSocket(`${api.replace("http", "ws")}/ws`, { headers: { Origin: "https://elsewhere.example" } });
      const result = await new Promise((done) => {
        socket.onopen = () => done("opened");
        socket.onerror = () => done("refused");
      });
      assert.equal(result, "refused");
    },
    { origins: ["https://opensynd.example"] },
  );
});
