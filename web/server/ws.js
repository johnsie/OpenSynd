// SPDX-License-Identifier: GPL-2.0-or-later

// A small WebSocket server (RFC 6455) on top of Node's own HTTP server, so the game server needs nothing installed. It handles what a
// game needs: the opening handshake, text messages (also when a client splits one over several frames), ping and pong, closing, and
// limits on how large a message may be. Browsers and Node's own WebSocket client talk to it.
import { createHash } from "node:crypto";

const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
export const OPCODES = Object.freeze({ continuation: 0x0, text: 0x1, binary: 0x2, close: 0x8, ping: 0x9, pong: 0xa });
export const MAX_MESSAGE_BYTES = 256 * 1024;

/** The value the server answers a client's Sec-WebSocket-Key with. */
export function acceptKey(key) {
  return createHash("sha1").update(key + GUID).digest("base64");
}

/** One frame as the server sends it (servers do not mask). */
export function encodeFrame(opcode, payload = Buffer.alloc(0), fin = true) {
  const body = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  const first = (fin ? 0x80 : 0) | opcode;
  if (body.length < 126) return Buffer.concat([Buffer.from([first, body.length]), body]);
  if (body.length < 65536) {
    const head = Buffer.alloc(4);
    head[0] = first;
    head[1] = 126;
    head.writeUInt16BE(body.length, 2);
    return Buffer.concat([head, body]);
  }
  const head = Buffer.alloc(10);
  head[0] = first;
  head[1] = 127;
  head.writeBigUInt64BE(BigInt(body.length), 2);
  return Buffer.concat([head, body]);
}

/** One frame as a client sends it (clients must mask); used by tests. */
export function encodeClientFrame(opcode, payload = Buffer.alloc(0), mask = Buffer.from([1, 2, 3, 4]), fin = true) {
  const body = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  const masked = Buffer.from(body.map((byte, index) => byte ^ mask[index % 4]));
  const first = (fin ? 0x80 : 0) | opcode;
  let head;
  if (body.length < 126) head = Buffer.from([first, 0x80 | body.length]);
  else if (body.length < 65536) {
    head = Buffer.alloc(4);
    head[0] = first;
    head[1] = 0x80 | 126;
    head.writeUInt16BE(body.length, 2);
  } else {
    head = Buffer.alloc(10);
    head[0] = first;
    head[1] = 0x80 | 127;
    head.writeBigUInt64BE(BigInt(body.length), 2);
  }
  return Buffer.concat([head, mask, masked]);
}

const tooLarge = () => Object.assign(new Error("frame too large"), { closeCode: 1009 });

/** Cuts a stream of bytes from a client into frames. A frame that breaks the rules makes push() throw. */
export class FrameParser {
  constructor(maxBytes = MAX_MESSAGE_BYTES) {
    this.buffer = Buffer.alloc(0);
    this.maxBytes = maxBytes;
  }

  push(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    const frames = [];
    for (;;) {
      const frame = this.next();
      if (!frame) break;
      frames.push(frame);
    }
    return frames;
  }

  next() {
    const data = this.buffer;
    if (data.length < 2) return null;
    const fin = (data[0] & 0x80) !== 0;
    if ((data[0] & 0x70) !== 0) throw new Error("reserved bits set");
    const opcode = data[0] & 0x0f;
    const masked = (data[1] & 0x80) !== 0;
    if (!masked) throw new Error("client frames must be masked");
    let length = data[1] & 0x7f;
    let offset = 2;
    if (length === 126) {
      if (data.length < 4) return null;
      length = data.readUInt16BE(2);
      offset = 4;
    } else if (length === 127) {
      if (data.length < 10) return null;
      const big = data.readBigUInt64BE(2);
      if (big > BigInt(this.maxBytes)) throw tooLarge();
      length = Number(big);
      offset = 10;
    }
    if (length > this.maxBytes) throw tooLarge();
    if (opcode >= 0x8 && (length > 125 || !fin)) throw new Error("bad control frame");
    if (data.length < offset + 4 + length) return null;
    const mask = data.subarray(offset, offset + 4);
    const payload = Buffer.from(data.subarray(offset + 4, offset + 4 + length));
    for (let index = 0; index < payload.length; index += 1) payload[index] ^= mask[index % 4];
    this.buffer = data.subarray(offset + 4 + length);
    return { fin, opcode, payload };
  }
}

/** One connected client: send text, close, and be told of messages and of the connection ending. */
export class Connection {
  constructor(socket, { maxBytes = MAX_MESSAGE_BYTES } = {}) {
    this.socket = socket;
    this.parser = new FrameParser(maxBytes);
    this.maxBytes = maxBytes;
    this.partial = null;
    this.open = true;
    this.onMessage = () => {};
    this.onClose = () => {};
    socket.on("data", (chunk) => this.receive(chunk));
    socket.on("close", () => this.finish(1006, "connection lost"));
    socket.on("error", () => this.finish(1006, "connection error"));
  }

  receive(chunk) {
    let frames;
    try {
      frames = this.parser.push(chunk);
    } catch (error) {
      this.close(error.closeCode ?? 1002, error.message);
      return;
    }
    for (const frame of frames) {
      if (!this.open) return;
      this.handle(frame);
    }
  }

  handle({ fin, opcode, payload }) {
    if (opcode === OPCODES.ping) {
      this.write(encodeFrame(OPCODES.pong, payload));
    } else if (opcode === OPCODES.pong) {
      // Nothing to do: the connection is alive.
    } else if (opcode === OPCODES.close) {
      const code = payload.length >= 2 ? payload.readUInt16BE(0) : 1005;
      this.close(code === 1005 ? 1000 : code, "");
    } else if (opcode === OPCODES.text || opcode === OPCODES.continuation) {
      if (opcode === OPCODES.text) {
        if (this.partial) return this.close(1002, "a new message began before the last ended");
        this.partial = [];
      } else if (!this.partial) {
        return this.close(1002, "a continuation with nothing to continue");
      }
      this.partial.push(payload);
      const size = this.partial.reduce((total, part) => total + part.length, 0);
      if (size > this.maxBytes) return this.close(1009, "message too large");
      if (fin) {
        const text = Buffer.concat(this.partial).toString("utf8");
        this.partial = null;
        this.onMessage(text);
      }
    } else {
      this.close(1003, "only text messages are understood");
    }
  }

  write(frame) {
    if (this.open && !this.socket.destroyed) this.socket.write(frame);
  }

  send(text) {
    this.write(encodeFrame(OPCODES.text, Buffer.from(text, "utf8")));
  }

  ping() {
    this.write(encodeFrame(OPCODES.ping));
  }

  close(code = 1000, reason = "") {
    if (!this.open) return;
    const body = Buffer.alloc(2 + Buffer.byteLength(reason));
    body.writeUInt16BE(code, 0);
    body.write(reason, 2);
    this.write(encodeFrame(OPCODES.close, body));
    this.finish(code, reason);
    this.socket.end();
  }

  finish(code, reason) {
    if (!this.open) return;
    this.open = false;
    this.onClose(code, reason);
  }
}

/**
 * Take over an HTTP request that asked to become a WebSocket. Returns the Connection, or null (after answering with an error) if
 * the request was not a proper WebSocket handshake. `check(request)` may refuse a request by returning a string (the reason).
 */
export function upgrade(request, socket, { check = () => null, maxBytes } = {}) {
  const key = request.headers["sec-websocket-key"];
  const proper =
    request.headers.upgrade?.toLowerCase() === "websocket" && key && request.headers["sec-websocket-version"] === "13";
  if (!proper) {
    socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
    return null;
  }
  const refusal = check(request);
  if (refusal) {
    socket.end(`HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Type: text/plain\r\n\r\n${refusal}`);
    return null;
  }
  socket.write(
    "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n" +
      `Sec-WebSocket-Accept: ${acceptKey(key)}\r\n\r\n`,
  );
  socket.setNoDelay(true);
  return new Connection(socket, { maxBytes });
}
