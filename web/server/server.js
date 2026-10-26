// SPDX-License-Identifier: GPL-2.0-or-later

// The game server: accounts over plain HTTP, and the games themselves over WebSockets. It keeps every running operation, steps
// them on a clock, and sends each player what changes. Run it with server/main.js; tests make one on a spare port.
import { createServer } from "node:http";

import { FIXED_STEP_SECONDS } from "../src/simulation.js";
import { createRateLimiter, hashPassword, newToken, problemWithName, problemWithPassword, verifyPassword } from "./auth.js";
import { contentHash } from "./content-hash.js";
import { CORE_VERSION, PROTOCOL_VERSION, checkVersions, parseClientMessage } from "./protocol.js";
import { Room } from "./rooms.js";
import { upgrade } from "./ws.js";

const MAX_BODY_BYTES = 4096;
const IDLE_SECONDS = 90;
const PING_SECONDS = 20;
export const MAX_ROOMS = 200;
export const MAX_CONNECTIONS_PER_ADDRESS = 8;

const json = (response, status, body, headers = {}) => {
  response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers });
  response.end(JSON.stringify(body));
};

function readBody(request) {
  return new Promise((done, fail) => {
    let size = 0;
    const chunks = [];
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        fail(new Error("too large"));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      try {
        done(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {});
      } catch {
        fail(new Error("not JSON"));
      }
    });
    request.on("error", fail);
  });
}

/**
 * Make the server. `content` is the loaded pack (server/content.js) and `store` the database (server/store.js). Nothing listens until
 * `listen()`. `origins` is the list of sites whose pages may call the accounts API ("*" for any); `clock` is for tests.
 */
export function createGameServer({ content, store, origins = ["*"], now = () => performance.now(), tickEvery = true }) {
  content.hash ??= contentHash(content.root);
  const rooms = new Map();
  const connections = new Set();
  const perAddress = new Map();
  const signups = createRateLimiter({ max: 10, windowMs: 60_000 });
  const logins = createRateLimiter({ max: 20, windowMs: 60_000 });
  let roomCounter = 0;

  const allowed = (origin) => origins.includes("*") || (origin && origins.includes(origin));
  const corsHeaders = (request) => {
    const origin = request.headers.origin;
    if (!allowed(origin)) return {};
    return {
      "Access-Control-Allow-Origin": origins.includes("*") ? "*" : origin,
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      Vary: "Origin",
    };
  };

  const accountOf = (request) => {
    const header = request.headers.authorization ?? "";
    return header.startsWith("Bearer ") ? store.accountForToken(header.slice(7)) : null;
  };

  // ---------------------------------------------------------------------------------------------------- accounts over HTTP

  async function handleApi(request, response, url) {
    const headers = corsHeaders(request);
    const reply = (status, body) => json(response, status, body, headers);
    if (request.method === "OPTIONS") {
      response.writeHead(204, headers);
      response.end();
      return;
    }
    const address = request.socket.remoteAddress ?? "unknown";
    try {
      if (url.pathname === "/api/health" && request.method === "GET") {
        reply(200, { ok: true, protocol: PROTOCOL_VERSION, core: CORE_VERSION, content: content.hash, rooms: rooms.size });
      } else if (url.pathname === "/api/signup" && request.method === "POST") {
        if (!signups.take(address)) return reply(429, { error: "Too many sign-ups from here. Wait a minute." });
        const { name, password } = await readBody(request);
        const problem = problemWithName(name) ?? problemWithPassword(password);
        if (problem) return reply(400, { error: problem });
        const account = store.createAccount(name, await hashPassword(password));
        if (!account) return reply(409, { error: "That name is taken." });
        const token = newToken();
        store.createSession(account.id, token);
        reply(201, { token, account: { id: account.id, name: account.name } });
      } else if (url.pathname === "/api/login" && request.method === "POST") {
        if (!logins.take(address)) return reply(429, { error: "Too many tries. Wait a minute." });
        const { name, password } = await readBody(request);
        const found = typeof name === "string" ? store.findForLogin(name) : null;
        // The same answer, and the same work, whether or not the name exists.
        const record = found ?? { salt: Buffer.alloc(16).toString("base64"), hash: Buffer.alloc(32).toString("base64") };
        const good = typeof password === "string" && (await verifyPassword(password, record)) && Boolean(found);
        if (!good) return reply(401, { error: "That name and password do not match." });
        const token = newToken();
        store.createSession(found.id, token);
        reply(200, { token, account: { id: found.id, name: found.name } });
      } else if (url.pathname === "/api/me" && request.method === "GET") {
        const account = accountOf(request);
        if (!account) return reply(401, { error: "Not signed in." });
        reply(200, { account: { id: account.id, name: account.name } });
      } else if (url.pathname === "/api/logout" && request.method === "POST") {
        const header = request.headers.authorization ?? "";
        if (header.startsWith("Bearer ")) store.endSession(header.slice(7));
        reply(200, { ok: true });
      } else if (url.pathname === "/api/account" && request.method === "DELETE") {
        const account = accountOf(request);
        if (!account) return reply(401, { error: "Not signed in." });
        const { password } = await readBody(request);
        const record = store.findForLogin(account.name);
        if (typeof password !== "string" || !(await verifyPassword(password, record))) {
          return reply(403, { error: "That password does not match." });
        }
        store.deleteAccount(account.id);
        for (const connection of connections) if (connection.account?.id === account.id) connection.socketConnection.close(1000, "account deleted");
        reply(200, { ok: true });
      } else {
        reply(404, { error: "Not found." });
      }
    } catch (error) {
      reply(error.message === "too large" ? 413 : 400, { error: "That request could not be read." });
    }
  }

  // ------------------------------------------------------------------------------------------------------------- games

  const missionPaths = () => new Set([...content.pack.missions, ...(content.pack.variants ?? [])]);

  function startSolo(connection, mission) {
    if (rooms.size >= MAX_ROOMS) return connection.error("The server is full. Try again in a moment.");
    const chosen = mission ?? content.pack.missions[0];
    if (!missionPaths().has(chosen)) return connection.error("There is no such operation.");
    leaveRoom(connection);
    roomCounter += 1;
    const room = new Room({ id: `room-${roomCounter}`, content, mission: chosen, seed: roomCounter * 7919 + 13 });
    room.startedAt = now();
    room.owner = connection.account?.id ?? null;
    rooms.set(room.id, room);
    connection.room = room;
    connection.player = room.addPlayer(connection.id, {
      send: (message) => connection.send(message),
      name: connection.account?.name ?? "Guest",
    });
  }

  function leaveRoom(connection) {
    const room = connection.room;
    if (!room) return;
    room.removePlayer(connection.id);
    connection.room = null;
    if (room.players.size === 0) rooms.delete(room.id);
  }

  /** Run the rooms up to the present: each is stepped as often as time says it should have been (never a long burst). */
  function tickRooms() {
    for (const room of rooms.values()) {
      if (room.finished) continue;
      const due = Math.min(5, Math.floor(((now() - room.startedAt) / 1000 / FIXED_STEP_SECONDS)) - room.world.steps);
      for (let index = 0; index < due; index += 1) room.tick();
    }
    for (const [id, room] of rooms) if (room.finished && room.players.size === 0) rooms.delete(id);
  }

  let connectionCounter = 0;
  function accept(socketConnection, address) {
    connectionCounter += 1;
    const connection = {
      id: `c${connectionCounter}`,
      socketConnection,
      account: null,
      room: null,
      player: null,
      greeted: false,
      lastHeard: now(),
      send: (message) => socketConnection.send(JSON.stringify(message)),
      error: (message) => connection.send({ t: "error", message }),
    };
    connections.add(connection);
    socketConnection.onMessage = (text) => {
      connection.lastHeard = now();
      const parsed = parseClientMessage(text);
      if (!parsed.ok) return connection.error(`Not understood: ${parsed.error}.`);
      const { message } = parsed;
      if (message.t === "ping") return connection.send({ t: "pong", n: message.n ?? 0 });
      if (!connection.greeted) {
        if (message.t !== "hello") return connection.error("Say hello first.");
        const refusal = checkVersions(message, { content: content.hash });
        if (refusal) {
          connection.send(refusal);
          return socketConnection.close(1000, "refused");
        }
        connection.account = message.token ? store.accountForToken(message.token) : null;
        if (message.token && !connection.account) {
          connection.send({ t: "refused", reason: "account", message: "Your sign-in has run out. Sign in again." });
          return socketConnection.close(1000, "refused");
        }
        connection.greeted = true;
        return connection.send({
          t: "welcome",
          v: PROTOCOL_VERSION,
          core: CORE_VERSION,
          account: connection.account && { id: connection.account.id, name: connection.account.name },
        });
      }
      if (message.t === "create") return startSolo(connection, message.mission);
      if (message.t === "command") {
        const result = connection.room?.receive(connection.id, message.seq, message.command) ?? { ok: false, error: "no operation" };
        if (!result.ok) connection.send({ t: "feedback", events: [], refused: { seq: message.seq, error: result.error } });
      }
    };
    socketConnection.onClose = () => {
      leaveRoom(connection);
      connections.delete(connection);
      perAddress.set(address, Math.max(0, (perAddress.get(address) ?? 1) - 1));
    };
    return connection;
  }

  const http = createServer((request, response) => {
    const url = new URL(request.url, "http://localhost");
    if (url.pathname.startsWith("/api/")) {
      handleApi(request, response, url);
    } else {
      json(response, 404, { error: "Not found." });
    }
  });
  http.on("upgrade", (request, socket) => {
    const address = request.socket.remoteAddress ?? "unknown";
    const url = new URL(request.url, "http://localhost");
    if (url.pathname !== "/ws") {
      socket.end("HTTP/1.1 404 Not Found\r\n\r\n");
      return;
    }
    const socketConnection = upgrade(request, socket, {
      check: (incoming) => {
        if (incoming.headers.origin && !allowed(incoming.headers.origin)) return "That site may not play here.";
        if ((perAddress.get(address) ?? 0) >= MAX_CONNECTIONS_PER_ADDRESS) return "Too many connections from here.";
        return null;
      },
    });
    if (!socketConnection) return;
    perAddress.set(address, (perAddress.get(address) ?? 0) + 1);
    accept(socketConnection, address);
  });

  let ticker = null;
  let upkeep = null;
  return {
    http,
    rooms,
    connections,
    content,
    tickRooms,
    /** Start listening. Resolves with the address ("127.0.0.1:port"). */
    listen(port = 0, host = "127.0.0.1") {
      return new Promise((done) => {
        http.listen(port, host, () => {
          if (tickEvery) ticker = setInterval(tickRooms, 1000 * FIXED_STEP_SECONDS * 2);
          // Quiet connections are checked on and, if they have gone, let go.
          upkeep = setInterval(() => {
            for (const connection of connections) {
              if (now() - connection.lastHeard > IDLE_SECONDS * 1000) connection.socketConnection.close(1001, "idle");
              else if (now() - connection.lastHeard > PING_SECONDS * 1000) connection.socketConnection.ping();
            }
            store.purgeExpired();
          }, 10_000);
          done(`${host}:${http.address().port}`);
        });
      });
    },
    async close() {
      clearInterval(ticker);
      clearInterval(upkeep);
      for (const connection of connections) connection.socketConnection.close(1001, "server stopping");
      http.closeAllConnections?.();
      await new Promise((done) => http.close(done));
    },
  };
}
