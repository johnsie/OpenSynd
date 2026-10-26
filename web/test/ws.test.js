// SPDX-License-Identifier: GPL-2.0-or-later

import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";

import {
  FrameParser,
  OPCODES,
  acceptKey,
  encodeClientFrame,
  encodeFrame,
  upgrade,
} from "../server/ws.js";

test("the handshake answer is the one the standard gives for its own example key", () => {
  assert.equal(acceptKey("dGhlIHNhbXBsZSBub25jZQ=="), "s3pPLMBiTxaQ9kYGzzhZRbK+xOo=");
});

test("frames of every size round-trip, and masked client frames are unmasked", () => {
  for (const size of [0, 5, 125, 126, 300, 65535, 65536, 70000]) {
    const text = "x".repeat(size);
    const frames = new FrameParser(1_000_000).push(encodeClientFrame(OPCODES.text, text));
    assert.equal(frames.length, 1, `size ${size}`);
    assert.equal(frames[0].payload.toString(), text);
    assert.equal(frames[0].opcode, OPCODES.text);
  }
  const server = encodeFrame(OPCODES.text, "hello");
  assert.equal(server[0], 0x81);
  assert.equal(server[1], 5, "unmasked, short");
});

test("frames split over several chunks, and several frames in one chunk, are both cut correctly", () => {
  const parser = new FrameParser();
  const one = encodeClientFrame(OPCODES.text, "first");
  const two = encodeClientFrame(OPCODES.text, "second");
  assert.deepEqual(parser.push(one.subarray(0, 3)), []);
  const frames = parser.push(Buffer.concat([one.subarray(3), two]));
  assert.deepEqual(frames.map((frame) => frame.payload.toString()), ["first", "second"]);
});

test("frames that break the rules are refused", () => {
  assert.throws(() => new FrameParser().push(encodeFrame(OPCODES.text, "x")), /masked/, "an unmasked client frame");
  assert.throws(() => new FrameParser(10).push(encodeClientFrame(OPCODES.text, "x".repeat(11))), /too large/);
  assert.throws(() => new FrameParser().push(Buffer.from([0xc1, 0x80, 0, 0, 0, 0])), /reserved/);
  assert.throws(() => new FrameParser().push(encodeClientFrame(OPCODES.ping, "x".repeat(126))), /control/);
});

async function withServer(body, options = {}) {
  const connections = [];
  const server = createServer((request, response) => response.end("not a socket"));
  server.on("upgrade", (request, socket) => {
    const connection = upgrade(request, socket, options);
    if (connection) connections.push(connection);
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  const url = `ws://127.0.0.1:${server.address().port}/`;
  try {
    await body({ url, connections, server });
  } finally {
    for (const connection of connections) connection.close();
    server.closeAllConnections?.();
    await new Promise((done) => server.close(done));
  }
}

const opened = (socket) =>
  new Promise((done, fail) => {
    socket.onopen = done;
    socket.onerror = () => fail(new Error("could not connect"));
  });
const next = (socket) =>
  new Promise((done) => {
    socket.onmessage = (event) => done(event.data);
  });

test("a client connects, messages go both ways, and closing is noticed on the server", async () => {
  await withServer(async ({ url, connections }) => {
    const client = new WebSocket(url);
    await opened(client);
    const [connection] = connections;
    const received = new Promise((done) => { connection.onMessage = done; });
    client.send(JSON.stringify({ hello: "world" }));
    assert.deepEqual(JSON.parse(await received), { hello: "world" });
    const reply = next(client);
    connection.send("héllo ☃");
    assert.equal(await reply, "héllo ☃");
    const closed = new Promise((done) => { connection.onClose = (code) => done(code); });
    client.close(1000);
    assert.equal(await closed, 1000);
  });
});

test("a message too large for the limit closes the connection", async () => {
  await withServer(async ({ url, connections }) => {
    const client = new WebSocket(url);
    await opened(client);
    const closed = new Promise((done) => { client.onclose = (event) => done(event.code); });
    client.send("x".repeat(5000));
    assert.equal(await closed, 1009);
    assert.equal(connections[0].open, false);
  }, { maxBytes: 1000 });
});

test("a request that is not a WebSocket handshake gets an error, and a check can refuse a good one", async () => {
  await withServer(async ({ url }) => {
    const plain = await fetch(url.replace("ws:", "http:"));
    assert.equal(await plain.text(), "not a socket");
    const refused = new WebSocket(url);
    await assert.rejects(opened(refused));
  }, { check: () => "not from here" });
});
