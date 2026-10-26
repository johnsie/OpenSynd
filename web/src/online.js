// SPDX-License-Identifier: GPL-2.0-or-later

// The game's side of talking to a game server: signing in over HTTP, and playing over a WebSocket. It uses only what browsers and
// Node both have (fetch and WebSocket), so the same code runs in the page and in the tests against a real server. It knows nothing
// about drawing: it hands what the server says to whoever is listening.
import { CORE_VERSION } from "./core/replay.js";

export const PROTOCOL_VERSION = 1; // must equal the server's (server/protocol.js); a test checks that they do

const trimSlash = (text) => text.replace(/\/+$/, "");

export class OnlineClient {
  /**
   * `server` is the server's address ("https://example.org" or "http://127.0.0.1:8787"); `content` is the fingerprint of the
   * content this game has (see server/content-hash.js); `token` a sign-in kept from before. `WebSocketClass` and `fetchFn` can be
   * replaced (by tests).
   */
  constructor({
    server,
    content,
    token = null,
    WebSocketClass = globalThis.WebSocket,
    fetchFn = globalThis.fetch?.bind(globalThis),
  }) {
    this.server = trimSlash(server);
    this.content = content;
    this.token = token;
    this.account = null;
    this.WebSocketClass = WebSocketClass;
    this.fetch = fetchFn;
    this.socket = null;
    this.listeners = new Map();
    this.nextSeq = 1;
    this.connected = false;
  }

  // ---------------------------------------------------------------------------------------------------------- events

  /** Listen for "start", "update", "feedback", "end", "error", "refused" or "close". Returns a function that stops listening. */
  on(type, handler) {
    const handlers = this.listeners.get(type) ?? [];
    handlers.push(handler);
    this.listeners.set(type, handlers);
    return () => this.listeners.set(type, (this.listeners.get(type) ?? []).filter((item) => item !== handler));
  }

  emit(type, message) {
    for (const handler of this.listeners.get(type) ?? []) handler(message);
  }

  // ------------------------------------------------------------------------------------------------------ accounts

  async call(path, { method = "GET", body } = {}) {
    const response = await this.fetch(`${this.server}${path}`, {
      method,
      headers: { "Content-Type": "application/json", ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let data = {};
    try {
      data = await response.json();
    } catch {
      // An answer that is not JSON is treated as having nothing in it.
    }
    return { ok: response.ok, status: response.status, ...data };
  }

  /** The shared world: who holds each territory, how well defended, what may be raided, and how the signed-in player is doing. */
  async world() {
    const result = await this.call("/api/world");
    return result.ok ? result : null;
  }

  /** The holder raises a territory's defence to a level. Returns the server's answer (with an error sentence if it was refused). */
  upgradeDefence(territory, level) {
    return this.call("/api/defence", { method: "POST", body: { territory, level } });
  }

  /** Today's operation, its chores and the boards (and how the signed-in player is doing). */
  async daily() {
    const result = await this.call("/api/daily");
    return result.ok ? result : null;
  }

  /** What the server is running, or null if it cannot be reached. */
  async health() {
    try {
      const result = await this.call("/api/health");
      return result.ok ? result : null;
    } catch {
      return null;
    }
  }

  async signUp(name, password) {
    return this.signedIn(await this.call("/api/signup", { method: "POST", body: { name, password } }));
  }

  async signIn(name, password) {
    return this.signedIn(await this.call("/api/login", { method: "POST", body: { name, password } }));
  }

  signedIn(result) {
    if (result.ok) {
      this.token = result.token;
      this.account = result.account;
    }
    return result;
  }

  /** Who the stored sign-in belongs to, or null. */
  async whoAmI() {
    if (!this.token) return null;
    try {
      const result = await this.call("/api/me");
      this.account = result.ok ? result.account : null;
      if (!result.ok) this.token = null;
      return this.account;
    } catch {
      return null;
    }
  }

  async signOut() {
    if (this.token) await this.call("/api/logout", { method: "POST" }).catch(() => {});
    this.token = null;
    this.account = null;
    this.disconnect();
  }

  deleteAccount(password) {
    return this.call("/api/account", { method: "DELETE", body: { password } });
  }

  // --------------------------------------------------------------------------------------------------------- playing

  /** Open the connection and say hello. Resolves with the welcome, or rejects with the reason the server gave. */
  connect() {
    return new Promise((done, fail) => {
      const socket = new this.WebSocketClass(`${this.server.replace(/^http/, "ws")}/ws`);
      this.socket = socket;
      let greeted = false;
      socket.onopen = () => {
        const hello = { t: "hello", v: PROTOCOL_VERSION, core: CORE_VERSION, content: this.content, token: this.token ?? undefined };
        socket.send(JSON.stringify(hello));
      };
      socket.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.t === "welcome") {
          greeted = true;
          this.connected = true;
          this.account = message.account ?? this.account;
          done(message);
        } else if (message.t === "refused") {
          fail(Object.assign(new Error(message.message), { reason: message.reason }));
        }
        this.emit(message.t, message);
      };
      socket.onerror = () => {
        if (!greeted) fail(new Error("Could not reach the server."));
      };
      socket.onclose = (event) => {
        this.connected = false;
        if (!greeted) fail(new Error("The server closed the connection."));
        this.emit("close", { code: event.code });
      };
    });
  }

  send(message) {
    if (this.socket?.readyState === 1) this.socket.send(JSON.stringify(message));
  }

  // ---- Playing with others (see server/lobby.js): the server answers with "lobby", "waiting" and "closed" messages, and with
  // "start" for everyone when the host begins.
  lobby() {
    this.send({ t: "lobby" });
  }

  openGame({ mission, capacity = 2 } = {}) {
    this.send({ t: "open", capacity, ...(mission ? { mission } : {}) });
  }

  joinGame(game) {
    this.send({ t: "join", game });
  }

  quickMatch() {
    this.send({ t: "quick" });
  }

  ready(on) {
    this.send({ t: "ready", on });
  }

  begin() {
    this.send({ t: "begin" });
  }

  leaveGame() {
    this.send({ t: "leave" });
  }

  /** Start an operation on the server. The "start" message follows. */
  create(mode = "solo", mission, extra = {}) {
    this.send({ t: "create", mode, ...(mission ? { mission } : {}), ...extra });
  }

  /** Give an order (see commands.js). Returns its number, which the server's acknowledgement carries. */
  command(command) {
    const seq = this.nextSeq;
    this.nextSeq += 1;
    this.send({ t: "command", seq, command });
    return seq;
  }

  disconnect() {
    this.socket?.close();
    this.socket = null;
    this.connected = false;
  }
}

/**
 * Smooths what the server sends. Updates arrive ten times a second, so people would jump a little each time; instead each one
 * walks from where it is shown to where the server says it is over the next interval. `show(units, now)` sets their positions for
 * drawing. A person who has moved a long way at once (out of a car, say) is shown there straight away.
 */
export function createSmoother({ interval = 100, snapDistance = 3 } = {}) {
  const tracks = new Map();
  return {
    /** Call when the server has told us where a unit now is, with where it is being shown (before the news was applied). */
    observe(unit, shown, now) {
      const target = unit.position;
      if (Math.hypot(target.x - shown.x, target.y - shown.y) > snapDistance) {
        tracks.delete(unit.id);
        return;
      }
      tracks.set(unit.id, { from: { ...shown }, to: { ...target }, at: now });
      unit.position = { ...shown };
    },
    show(units, now) {
      for (const unit of units) {
        const track = tracks.get(unit.id);
        if (!track) continue;
        const progress = Math.min(1, (now - track.at) / interval);
        const along = (from, to) => from + (to - from) * progress;
        unit.position = { x: along(track.from.x, track.to.x), y: along(track.from.y, track.to.y) };
        if (progress >= 1) tracks.delete(unit.id);
      }
    },
    clear: () => tracks.clear(),
  };
}
