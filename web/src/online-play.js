// SPDX-License-Identifier: GPL-2.0-or-later

// Playing an operation that runs on a server. The page builds the same operation from the same content and then lets the server's
// updates drive it: where people are, what they carry, what is done. This module keeps that going: it applies updates to the page's
// state (smoothing movement), plays the server's news (lines, sounds, effects) through the same hooks the local game uses, and
// sends the player's orders to the server. It touches no page elements; the page hands it what it needs.
import { silentHooks } from "./core/hooks.js";
import { applyServerMessage, equipmentLookup } from "./core/sync.js";
import { syncWorldGates } from "./core/step.js";
import { OnlineClient, createSmoother } from "./online.js";

export function createOnlinePlay({
  state,
  hooks,
  equipment,
  makeClient = (options) => new OnlineClient(options),
  now = () => performance.now(),
}) {
  const lookup = equipmentLookup(equipment);
  const smoother = createSmoother();
  let client = null;
  let attached = false;
  let pending = [];
  let holdFireSent = "";
  let holdFireAt = -Infinity;
  let asked = false; // the page has asked for an operation and is waiting for it, so its start is not announced to onStart
  const listeners = { start: [], end: [], close: [], news: [], chat: [] };
  const emit = (type, payload) => listeners[type].forEach((listener) => listener(payload));

  // What the server says happened: through the same hooks as when the game runs here.
  function play(events) {
    for (const event of events ?? []) {
      if (event.type === "message") hooks.message(event.text);
      else if (event.type === "sound") hooks.sound(event.name, event);
      else if (event.type === "effect") hooks.effect(event.kind, event);
      else if (event.type === "looted") hooks.looted({ id: event.unitId }, []);
    }
  }

  function handle(message) {
    if (message.t === "update") {
      applyServerMessage(state, message, lookup, { smoother, now: now() });
      syncWorldGates(state, silentHooks()); // doors and gates follow from who stands where
      play(message.events);
      hooks.changed();
      emit("news", message);
    } else if (message.t === "feedback") {
      play(message.events);
      if (message.refused) hooks.message(`That order was refused: ${message.refused.error}.`);
    } else if (message.t === "end") {
      emit("end", message);
    }
  }

  function receive(message) {
    if (attached) handle(message);
    else pending.push(message);
  }

  return {
    get client() {
      return client;
    },
    get online() {
      return Boolean(client?.connected);
    },
    get account() {
      return client?.account ?? null;
    },

    /** Set up the connection details (the server's address, the content fingerprint, a sign-in kept from before). */
    configure({ server, content, token }) {
      client?.disconnect();
      client = makeClient({ server, content, token });
      attached = false;
      pending = [];
    },

    health: () => client?.health() ?? Promise.resolve(null),
    daily: () => client?.daily() ?? Promise.resolve(null),
    world: () => client?.world() ?? Promise.resolve(null),
    upgradeDefence: (territory, level) => client.upgradeDefence(territory, level),
    friends: () => client?.friends() ?? Promise.resolve(null),
    friendAction: (name, action) => client.friendAction(name, action),
    profile: (name) => client?.profile(name) ?? Promise.resolve(null),
    report: (name, reason) => client.report(name, reason),
    say: (text) => client.say(text),
    onChat: (listener) => listeners.chat.push(listener),
    whoAmI: () => client?.whoAmI() ?? Promise.resolve(null),
    signIn: (name, password) => client.signIn(name, password),
    oidcCode: (details) => client.oidcCode(details),
    signUp: (name, password) => client.signUp(name, password),
    signOut: () => client?.signOut() ?? Promise.resolve(),

    /**
     * Open the connection if there is none. Operations then begin on the server's say (a game's host starts it, a quick match fills,
     * or a player is put back into one they left): each one arrives as a "start" for onStart listeners.
     */
    async connect() {
      if (client.connected) return;
      await client.connect();
      client.on("start", (message) => {
        // The page builds the operation from this; until it says it has (attach), what the server sends is kept.
        attached = false;
        pending = [];
        smoother.clear();
        if (asked) asked = false;
        else emit("start", message);
      });
      for (const type of ["update", "feedback", "end"]) client.on(type, receive);
      client.on("close", (event) => emit("close", event));
      client.on("chat", (message) => emit("chat", message));
    },

    /** Connect and ask for an operation of one's own (solo or the day's). Resolves with the server's start message. */
    async start(mode, mission, extra = {}) {
      await this.connect();
      asked = true;
      return new Promise((done, fail) => {
        const stop = client.on("start", (message) => {
          stop();
          stopError();
          done(message);
        });
        // A refused request (a shielded territory, too few funds) answers with an error instead of a start.
        const stopError = client.on("error", (message) => {
          stop();
          stopError();
          asked = false;
          fail(new Error(message.message));
        });
        client.create(mode, mission, extra);
      });
    },

    /** Raid a territory. Resolves with the start message of the operation, or rejects with the reason it was refused. */
    raid(territory) {
      return this.start("raid", undefined, { territory });
    },

    /** The page has built the operation and applied the start message: updates now flow into it. */
    attach() {
      attached = true;
      for (const message of pending.splice(0)) handle(message);
    },

    /** Give the server an order for the player's agents. */
    give: (command) => client.command(command),

    /** Called every drawn frame: people walk between the server's updates, and a held weapon is kept firing at the server. */
    frame(unitIds, holdFire) {
      smoother.show(state.units, now());
      const wanted = holdFire && unitIds.length > 0 ? `${holdFire.x.toFixed(1)},${holdFire.y.toFixed(1)}|${unitIds.join()}` : "";
      // Where the weapon points is told to the server at most ten times a second; letting go is told at once.
      if (wanted !== holdFireSent && (wanted === "" || now() - holdFireAt >= 100)) {
        holdFireSent = wanted;
        holdFireAt = now();
        client.command(
          holdFire && unitIds.length > 0
            ? { type: "holdFire", unitIds, on: true, at: holdFire }
            : { type: "holdFire", unitIds: unitIds.length > 0 ? unitIds : [state.units[0].id], on: false },
        );
      }
    },

    onStart: (listener) => listeners.start.push(listener),
    onEnd: (listener) => listeners.end.push(listener),
    onClose: (listener) => listeners.close.push(listener),
    onNews: (listener) => listeners.news.push(listener),

    /** Leave: the connection is closed and the page goes back to its own operation. */
    stop() {
      attached = false;
      pending = [];
      holdFireSent = "";
      smoother.clear();
      client?.disconnect();
    },
  };
}
