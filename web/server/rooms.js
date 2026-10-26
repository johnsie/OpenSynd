// SPDX-License-Identifier: GPL-2.0-or-later

// A room is one operation being played on the server. The server runs the world; each player sends commands for the agents they
// control, and is sent what changes. Nothing a player's browser says is trusted beyond the commands, and each one is checked
// like any other (see core/apply.js). The whole operation is recorded, so it can be played back to check a result.
import { emptyCampaign } from "../src/campaign.js";
import { applyCommand } from "../src/core/apply.js";
import { operatorsOf } from "../src/core/orders.js";
import { raiseWeapon } from "../src/inventory.js";
import { recordingHooks } from "../src/core/hooks.js";
import { startRecording, stateHash, stepRecorded } from "../src/core/replay.js";
import { changedUnits, packWorld } from "../src/core/sync.js";
import { FIXED_STEP_SECONDS } from "../src/simulation.js";
import { makeWorld } from "./content.js";

export const STEPS_PER_SECOND = Math.round(1 / FIXED_STEP_SECONDS);
export const UPDATE_EVERY_STEPS = 3; // ten updates a second
const MAX_PENDING_EVENTS = 400; // a long burst is trimmed to its newest news rather than flooding one update
export const MAX_COMMANDS_PER_STEP = 8; // more than a person could give; the rest wait for the next step
export const MAX_QUEUED_COMMANDS = 64;
export const MAX_OPERATION_SECONDS = 20 * 60;

/** Ask for events a player should hear (messages, sounds, effects) from a recording of a step. */
const forPlayers = (events) => events.filter((event) => event.type !== "changed" && event.type !== "selectionChanged");

export class Room {
  /**
   * `content` is the loaded pack; `mission` the path of the operation; `seed` starts its streams of chance. Players are added with
   * addPlayer. Nothing runs on its own: tick() is called by whoever owns the clock (a timer on the server, a loop in a test).
   */
  constructor({
    id,
    content,
    mission,
    missionData = null,
    variant = null,
    seed = 1,
    campaign = emptyCampaign(),
    options = { decidesOutcome: true },
  }) {
    this.id = id;
    this.content = content;
    this.mission = mission;
    this.variant = variant;
    this.seed = seed;
    this.campaign = campaign;
    this.missionData = missionData; // an operation made on the spot (a raid) rather than read from the pack: sent to players whole
    this.world = makeWorld(content, missionData ?? mission, { campaign, seed, options });
    this.recording = startRecording({ mission, variant, seed, content: content.hash ?? null });
    this.players = new Map();
    this.stepHooks = recordingHooks();
    this.pending = []; // events since the last update, each stamped with the step it happened in
    this.finished = false;
    this.result = null;
    this.onFinish = null; // called once when the operation ends; what it returns is added to the message the players get
  }

  get squad() {
    return this.world.units.filter((unit) => unit.side === "team").map((unit) => unit.id);
  }

  /**
   * A player joins and controls these agents (all four if the squad is not shared out). `send(message)` is how they are told
   * things. Returns the player, with the `start` message already sent.
   */
  addPlayer(id, { send, unitIds = this.squad, name = id, account = null, start = true }) {
    const player = {
      id,
      name,
      account,
      send,
      unitIds,
      known: new Map(),
      queue: [],
      acks: [],
      feedback: recordingHooks(),
      lastSeq: -1,
      away: false,
      awaySince: null,
    };
    this.players.set(id, player);
    if (start) this.sendStart(player);
    return player;
  }

  /** Tell every player the operation has begun (for a room that was filled first, so each is told who the others are). */
  startAll() {
    for (const player of this.players.values()) this.sendStart(player);
  }

  /** Tell a player an operation has begun: how to build it, and everything about it as it stands. */
  sendStart(player) {
    player.known = new Map();
    player.send({
      t: "start",
      room: this.id,
      mission: this.mission,
      variant: this.variant,
      ...(this.missionData ? { data: this.missionData } : {}),
      seed: this.seed,
      squad: player.unitIds,
      team: [...this.players.values()].map((other) => ({ name: other.name, squad: other.unitIds })),
      step: this.world.steps,
      world: packWorld(this.world),
      units: changedUnits(this.world, player.known),
    });
  }

  removePlayer(id) {
    this.players.delete(id);
  }

  /**
   * A player's connection has gone, but they may come back: their agents are told to hold and fight from where they stand, and what
   * they were doing is left as it was. `time` says when (for expiring them later).
   */
  detach(id, time = 0) {
    const player = this.players.get(id);
    if (!player) return;
    player.away = true;
    player.awaySince = time;
    player.send = () => {};
    player.queue.length = 0;
    for (const unit of operatorsOf(this.world, player.unitIds)) {
      if (unit.activeSlot !== null && unit.activeSlot !== undefined) continue;
      const slot = unit.equipment.findIndex((item) => item.definition.action === "disable-pulse" && item.charges !== 0);
      if (slot >= 0) raiseWeapon(unit, slot);
    }
  }

  /** A player who was away is back, on a new connection: they are told how everything stands. */
  attach(id, send) {
    const player = this.players.get(id);
    if (!player) return null;
    player.away = false;
    player.awaySince = null;
    player.send = send;
    player.lastSeq = -1;
    this.sendStart(player);
    return player;
  }

  /** How many players are here (not away). */
  get present() {
    return [...this.players.values()].filter((player) => !player.away).length;
  }

  /** A command from a player: queued for the next step, or refused at once if it is nonsense or the queue is full. */
  receive(playerId, seq, command) {
    const player = this.players.get(playerId);
    if (!player || this.finished) return { ok: false, error: "not in this operation" };
    if (!Number.isInteger(seq) || seq <= player.lastSeq) return { ok: false, error: "out of order" };
    if (player.queue.length >= MAX_QUEUED_COMMANDS) return { ok: false, error: "too many orders at once" };
    player.lastSeq = seq;
    player.queue.push({ seq, command });
    return { ok: true };
  }

  /** One fixed step: the queued commands are carried out, the world moves on, and every few steps the players are sent what changed. */
  tick() {
    if (this.finished) return;
    for (const player of this.players.values()) this.runCommands(player);
    this.stepHooks.events.length = 0;
    stepRecorded(this.world, this.stepHooks, this.recording);
    // Players are sent an update every few steps, so what happens in the steps between (shots, hits, sounds, lines) is kept until then.
    // `step` says when in the game each one happened, so the page can space them out as they were.
    for (const event of forPlayers(this.stepHooks.events)) this.pending.push({ ...event, step: this.world.steps });
    if (this.pending.length > MAX_PENDING_EVENTS) this.pending.splice(0, this.pending.length - MAX_PENDING_EVENTS);
    if (this.world.steps % UPDATE_EVERY_STEPS === 0 || this.world.outcome !== "active") this.sendUpdates(this.pending.splice(0));
    if (this.world.outcome !== "active" || this.world.steps >= MAX_OPERATION_SECONDS * STEPS_PER_SECOND) this.finish();
  }

  runCommands(player) {
    let carried = 0;
    while (player.queue.length > 0 && carried < MAX_COMMANDS_PER_STEP) {
      const { seq, command } = player.queue.shift();
      carried += 1;
      player.feedback.events.length = 0;
      this.recording.commands.push({ step: this.world.steps, command: JSON.parse(JSON.stringify(command)), player: player.id });
      const result = applyCommand(this.world, player.feedback, command, { owns: (unitId) => player.unitIds.includes(unitId) });
      player.acks.push({ seq, ok: result.ok, ...(result.ok ? {} : { error: result.error }) });
      // What the order did is told to whoever gave it; the world's own news goes to everyone, in the update.
      const own = forPlayers(player.feedback.events);
      if (own.length > 0) player.send({ t: "feedback", events: own });
    }
  }

  sendUpdates(events) {
    const world = packWorld(this.world);
    for (const player of this.players.values()) {
      player.send({
        t: "update",
        step: this.world.steps,
        world,
        units: changedUnits(this.world, player.known),
        events,
        acks: player.acks.splice(0),
      });
    }
  }

  /** The operation is over: it is recorded as it stands and the players are told how it went. */
  finish() {
    if (this.finished) return;
    this.finished = true;
    this.result = {
      outcome: this.world.outcome === "active" ? "timeout" : this.world.outcome,
      steps: this.world.steps,
      hash: stateHash(this.world),
      stats: this.world.opStats,
      debrief: this.world.debrief,
    };
    const extra = this.onFinish?.(this) ?? {};
    for (const player of this.players.values()) player.send({ t: "end", ...this.result, ...extra });
  }

  /** The recording, with what is needed to play it back and check the result. */
  toRecording() {
    return { ...this.recording, result: this.result };
  }
}
