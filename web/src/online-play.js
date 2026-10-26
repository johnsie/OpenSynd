// SPDX-License-Identifier: GPL-2.0-or-later

// Playing an operation that runs on a server. The page builds the same operation from the same content and then lets the server's
// updates drive it: where people are, what they carry, what is done. This module keeps that going: it applies updates to the page's
// state (smoothing movement), plays the server's news (lines, sounds, effects) through the same hooks the local game uses, and
// sends the player's orders to the server. It touches no page elements; the page hands it what it needs.
import { applyCommand } from "./core/apply.js";
import { silentHooks } from "./core/hooks.js";
import { applyServerMessage, equipmentLookup } from "./core/sync.js";
import { syncWorldGates } from "./core/step.js";
import { OnlineClient, createSmoother } from "./online.js";
import { createPredictor } from "./predict.js";

export function createOnlinePlay({
  state,
  hooks,
  equipment,
  makeClient = (options) => new OnlineClient(options),
  now = () => performance.now(),
}) {
  const lookup = equipmentLookup(equipment);
  const smoother = createSmoother();
  const predictor = createPredictor();
  let lastFrameAt = null;
  let client = null;
  let attached = false;
  let pending = [];
  let holdFireSent = "";
  let holdFireAt = -Infinity;
  let asked = false; // the page has asked for an operation and is waiting for it, so its start is not announced to onStart
  const stats = { updates: 0, totalMs: 0, applyMs: 0, worstMs: 0 }; // what handling the server's updates costs the page
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

  // The server sends a few steps' news at once. Events carry the step they happened in and are played when the people, who are shown a
  // little in the past (see createSmoother), have got to that step: a burst of shots is seen and heard as a burst, in step with them.
  const timers = new Set();
  const ownIds = () => state.online?.squad ?? [];
  function playSpaced(events) {
    const early = [];
    for (const event of events ?? []) {
      const delay = Number.isInteger(event.step) ? smoother.delayFor(event.step, now()) : 0;
      if (delay < 1) {
        early.push(event);
        continue;
      }
      const timer = setTimeout(() => {
        timers.delete(timer);
        play([event]);
      }, delay);
      timers.add(timer);
    }
    play(early);
  }

  function handle(message) {
    if (message.t === "update") {
      const began = now();
      applyServerMessage(state, message, lookup, { smoother, now: began });
      // Orders the server has now answered stop being guesses; the agents it reported are where it says, and are moved on from there.
      predictor.answered((message.acks ?? []).map((ack) => ack.seq));
      for (const change of message.units) {
        const unit = state.units.find((item) => item.id === change.id);
        if (unit && change.set?.position && ownIds().includes(unit.id)) predictor.report(unit, message.step);
      }
      syncWorldGates(state, silentHooks()); // doors and gates follow from who stands where
      const applied = now();
      playSpaced(message.events);
      hooks.changed();
      emit("news", message);
      const cost = now() - began;
      stats.updates += 1;
      stats.totalMs += cost;
      stats.applyMs += applied - began;
      stats.worstMs = Math.max(stats.worstMs, cost);
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
    stats,
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
    rename: (name) => client.rename(name),
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
        predictor.clear();
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
    give(command) {
      const seq = client.command(command);
      // A move is carried out on the page's own copy at once, so the agents set off without waiting for the server to answer: it is
      // shown (see predictor) until the server says what really happened.
      const step = smoother.currentStep(now());
      if (command.type === "move" && step !== null && Number.isInteger(seq)) {
        const own = ownIds();
        const result = applyCommand(state, silentHooks(), command, { owns: (id) => own.includes(id) });
        if (result.ok && result.moved !== false) {
          for (const id of command.unitIds) {
            const unit = state.units.find((item) => item.id === id);
            if (unit) predictor.order(unit, step, seq);
          }
        }
      }
      return seq;
    },

    /** Called every drawn frame: people walk between the server's updates, and a held weapon is kept firing at the server. */
    frame(unitIds, holdFire) {
      const current = now();
      smoother.show(state.units, current);
      const step = smoother.currentStep(current);
      if (step !== null) predictor.show(state.units, ownIds(), step, lastFrameAt === null ? 0 : (current - lastFrameAt) / 1000);
      lastFrameAt = current;
      const wanted = holdFire && unitIds.length > 0 ? `${holdFire.x.toFixed(1)},${holdFire.y.toFixed(1)}|${unitIds.join()}` : "";
      // Where the weapon points is told to the server at most twenty times a second; letting go is told at once.
      if (wanted !== holdFireSent && (wanted === "" || now() - holdFireAt >= 50)) {
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
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
      attached = false;
      pending = [];
      holdFireSent = "";
      smoother.clear();
      predictor.clear();
      client?.disconnect();
    },
  };
}
