// SPDX-License-Identifier: GPL-2.0-or-later

// What the game and the server say to each other over a WebSocket: JSON messages with a type in `t`. The versions below are sent
// and checked when a connection opens, so a game that is out of date is told to update instead of misbehaving.
import { CORE_VERSION } from "../src/core/replay.js";

export const PROTOCOL_VERSION = 1;
export { CORE_VERSION };

// From the game to the server.
//   hello    { v, core, content, token }          first message: who this is, and which versions the game has
//   create   { mode: "solo" | "daily" | "raid" | "war", mission?, territory? }   start an operation
//   command  { seq, command }                      an order for the player's agents (see commands.js)
//   lobby    {}                                    list the games waiting for players
//   open     { mission?, capacity? }               open a cooperative game and wait in it
//   join     { game }                              join a waiting game
//   quick    {}                                    join a waiting quick-match game, or open one
//   ready    { on }                                say whether you are ready
//   begin    {}                                    the host begins the game
//   leave    {}                                    leave the game you are waiting in
//   say      { text }                              say something to the others in your game or operation
//   ping     { n }
// From the server to the game.
//   welcome  { v, core, account }                  the hello was accepted
//   refused  { reason, message }                   the hello was not (reason: "protocol", "core", "content", "account")
//   lobby    { games }                             the games waiting for players
//   waiting  { game }                              the game you are in, with its players (sent again whenever it changes)
//   chat     { from, text }                        something another player said
//   closed   { reason }                            the game you were waiting in is gone
//   start    { room, mission, variant, seed, squad, team, step, world, units }   an operation has begun (or you are back in it)
//   update   { step, world, units, events, acks }  what changed since the last update
//   feedback { events }                            lines and sounds for what this player's own orders did
//   end      { outcome, stats }                    the operation is over
//   error    { message }
//   pong     { n }

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

/** Check one message from the game. Returns { ok: true, message } or { ok: false, error }. */
export function parseClientMessage(text) {
  let message;
  try {
    message = JSON.parse(text);
  } catch {
    return { ok: false, error: "not JSON" };
  }
  if (!isObject(message) || typeof message.t !== "string") return { ok: false, error: "no type" };
  switch (message.t) {
    case "hello":
      if (!Number.isInteger(message.v) || !Number.isInteger(message.core) || typeof message.content !== "string") {
        return { ok: false, error: "hello needs v, core and content" };
      }
      if (message.token !== undefined && typeof message.token !== "string") return { ok: false, error: "bad token" };
      return { ok: true, message };
    case "say":
      if (typeof message.text !== "string" || message.text.length > 400) return { ok: false, error: "bad text" };
      return { ok: true, message };
    case "lobby":
    case "quick":
    case "begin":
    case "leave":
      return { ok: true, message };
    case "open":
      if (message.mission !== undefined && (typeof message.mission !== "string" || message.mission.length > 200)) {
        return { ok: false, error: "bad mission" };
      }
      if (message.capacity !== undefined && !Number.isInteger(message.capacity)) return { ok: false, error: "bad capacity" };
      return { ok: true, message };
    case "join":
      if (typeof message.game !== "string" || message.game.length > 40) return { ok: false, error: "bad game" };
      return { ok: true, message };
    case "ready":
      if (typeof message.on !== "boolean") return { ok: false, error: "bad ready" };
      return { ok: true, message };
    case "create":
      if (!["solo", "daily", "raid", "war"].includes(message.mode)) return { ok: false, error: "unknown mode" };
      if (message.territory !== undefined && (typeof message.territory !== "string" || message.territory.length > 80)) {
        return { ok: false, error: "bad territory" };
      }
      if (message.mission !== undefined && (typeof message.mission !== "string" || message.mission.length > 200)) {
        return { ok: false, error: "bad mission" };
      }
      return { ok: true, message };
    case "command":
      if (!Number.isInteger(message.seq) || message.seq < 0 || !isObject(message.command)) return { ok: false, error: "bad command" };
      return { ok: true, message };
    case "ping":
      return { ok: true, message };
    default:
      return { ok: false, error: "unknown message" };
  }
}

/** Check the versions in a hello against the server's own. Returns null if they match, or a `refused` message. */
export function checkVersions(hello, { content }) {
  if (hello.v !== PROTOCOL_VERSION) {
    return { t: "refused", reason: "protocol", message: "This game is out of date: reload the page to update it." };
  }
  if (hello.core !== CORE_VERSION) {
    return { t: "refused", reason: "core", message: "The game's rules are out of date: reload the page to update it." };
  }
  if (hello.content !== content) {
    return { t: "refused", reason: "content", message: "The game's content is out of date: reload the page to update it." };
  }
  return null;
}
