// SPDX-License-Identifier: GPL-2.0-or-later

// Shared by the server's tests: a real server on a spare port, with clocks the test winds by hand, and a small client for it.
import { CORE_VERSION, PROTOCOL_VERSION } from "../server/protocol.js";
import { loadContent } from "../server/content.js";
import { createGameServer } from "../server/server.js";
import { openStore } from "../server/store.js";

export const content = loadContent();

// A server on a spare port with a clock the test winds by hand.
export async function withServer(body, options = {}) {
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
