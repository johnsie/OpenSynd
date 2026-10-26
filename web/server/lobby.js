// SPDX-License-Identifier: GPL-2.0-or-later

// Games that are waiting for their players: the lobby. A player opens a game (or takes a quick match), others join, everyone says
// they are ready, and the host begins it. Nothing here runs an operation; when it begins, a Room (rooms.js) takes over, with the
// players' agents shared out between them.
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;
export const WAITING_SECONDS = 15 * 60;

/**
 * Share a squad's agents out between players, as evenly as it goes and keeping each player's agents together: two players with four
 * agents get two each; three get two, one and one; four get one each. Returns one list of ids per player.
 */
export function splitSquad(unitIds, players) {
  const base = Math.floor(unitIds.length / players);
  const extra = unitIds.length % players;
  const shares = [];
  let at = 0;
  for (let player = 0; player < players; player += 1) {
    const count = base + (player < extra ? 1 : 0);
    shares.push(unitIds.slice(at, at + count));
    at += count;
  }
  return shares;
}

/** One game waiting for its players. */
export class WaitingGame {
  constructor({ id, host, mission, capacity = 2, quick = false, now }) {
    this.id = id;
    this.mission = mission;
    this.capacity = Math.min(MAX_PLAYERS, Math.max(MIN_PLAYERS, capacity));
    this.quick = quick;
    this.createdAt = now;
    this.players = []; // { id, name, account, ready }
    this.host = null;
    this.join(host);
  }

  get full() {
    return this.players.length >= this.capacity;
  }

  /** Add a player; returns false if the game is full or they are already in it. */
  join(player) {
    if (this.full || this.players.some((other) => other.id === player.id)) return false;
    this.players.push({ ...player, ready: false });
    this.host ??= player.id;
    return true;
  }

  /** A player goes; the host passes to whoever has been here longest. Returns true if the game is now empty. */
  leave(id) {
    this.players = this.players.filter((player) => player.id !== id);
    if (this.host === id) this.host = this.players[0]?.id ?? null;
    return this.players.length === 0;
  }

  setReady(id, ready) {
    const player = this.players.find((item) => item.id === id);
    if (player) player.ready = Boolean(ready);
  }

  /** Whether the host may begin: at least two players, and everyone but the host has said they are ready. */
  canBegin() {
    return this.players.length >= MIN_PLAYERS && this.players.every((player) => player.ready || player.id === this.host);
  }

  /** What the lobby shows for this game. */
  summary() {
    return {
      id: this.id,
      mission: this.mission,
      capacity: this.capacity,
      quick: this.quick,
      host: this.players.find((player) => player.id === this.host)?.name ?? null,
      players: this.players.map((player) => ({ name: player.name, ready: player.ready || player.id === this.host })),
    };
  }
}
