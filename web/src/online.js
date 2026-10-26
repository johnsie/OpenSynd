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

  /** Change the player's display name (shown to other players). */
  async rename(name) {
    const result = await this.call("/api/rename", { method: "POST", body: { name } });
    if (result.ok) this.account = result.account;
    return result;
  }

  /** Friends, requests made to the player and by them, and which friends are on now. */
  async friends() {
    const result = await this.call("/api/friends");
    return result.ok ? result : null;
  }

  /** action: "request" (also accepts if they already asked), "accept" or "remove". */
  friendAction(name, action) {
    return this.call("/api/friends", { method: "POST", body: { name, action } });
  }

  async profile(name) {
    const result = await this.call(`/api/profile/${encodeURIComponent(name)}`);
    return result.ok ? result : null;
  }

  report(name, reason) {
    return this.call("/api/report", { method: "POST", body: { name, reason } });
  }

  /** Say something to the others in the game or operation. What others say arrives as "chat" messages. */
  say(text) {
    this.send({ t: "say", text });
  }

  /** Give the server the code Outiva sent back (see outiva-signin.js). Signs the player in if it is accepted. */
  async oidcCode({ code, verifier, redirectUri, nonce }) {
    return this.signedIn(await this.call("/api/oidc/code", { method: "POST", body: { code, verifier, redirectUri, nonce } }));
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

export const STEP_MS = 1000 / 30; // the game's fixed step

/**
 * Shows people moving smoothly from what the server sends. Updates arrive about ten times a second and not quite evenly, so instead of
 * walking people towards the newest position (which makes them stop when an update is late and rush when it comes) everybody is shown
 * a little in the past: the page works out which game step the server is at now, steps back `delaySteps`, and draws each person
 * between the two reports either side of that moment, at a steady pace. A report that arrives a bit late is still in time.
 * A person who has moved a long way at once (out of a car, say) is shown there as soon as the moment reaches the report.
 */
export function createSmoother({ delaySteps = 4, updateSteps = 3, snapDistance = 3, keep = 8, window = 40 } = {}) {
  const tracks = new Map(); // unit id -> reports [{ step, position }], oldest first
  let offsets = []; // how late (ms) recent updates arrived against the game's own clock; the smallest is the least delayed
  return {
    delaySteps,

    /** Note that the update for `step` arrived at `now` (ms). Call once per update, before observing people. */
    arrived(step, now) {
      offsets.push(now - step * STEP_MS);
      if (offsets.length > window) offsets.shift();
    },

    /** Note where the server says a unit is at `step`. */
    observe(unit, step) {
      const reports = tracks.get(unit.id) ?? [];
      if (reports.length > 0 && reports.at(-1).step >= step) return;
      // Only people who move are reported. One who was still until just now stayed where they were until this update's span began, not
      // since their last report, or they would seem to drift for the whole time they stood.
      if (reports.length > 0 && reports.at(-1).step < step - updateSteps) {
        reports.push({ step: step - updateSteps, position: { ...reports.at(-1).position } });
      }
      reports.push({ step, position: { ...unit.position } });
      if (reports.length > keep) reports.shift();
      tracks.set(unit.id, reports);
    },

    /** The game step being shown at `now`. */
    shownStep(now) {
      return offsets.length === 0 ? null : (now - Math.min(...offsets)) / STEP_MS - delaySteps;
    },

    /** How long after `now` something that happened at `step` should be shown to line up with the people. */
    delayFor(step, now) {
      const at = this.shownStep(now);
      return at === null ? 0 : Math.max(0, (step - at) * STEP_MS);
    },

    /** Set the positions of `units` for drawing at `now`. */
    show(units, now) {
      const at = this.shownStep(now);
      if (at === null) return;
      for (const unit of units) {
        const reports = tracks.get(unit.id);
        if (!reports || reports.length === 0) continue;
        let after = reports.findIndex((report) => report.step > at);
        if (after === -1) after = reports.length; // the moment is past the newest report: stay at it
        const before = reports[after - 1];
        const next = reports[after];
        if (!before) {
          unit.position = { ...reports[0].position };
        } else if (!next) {
          unit.position = { ...before.position };
        } else if (Math.hypot(next.position.x - before.position.x, next.position.y - before.position.y) > snapDistance) {
          unit.position = { ...before.position };
        } else {
          const along = (at - before.step) / (next.step - before.step);
          unit.position = {
            x: before.position.x + (next.position.x - before.position.x) * along,
            y: before.position.y + (next.position.y - before.position.y) * along,
          };
        }
      }
    },

    clear() {
      tracks.clear();
      offsets = [];
    },
  };
}
