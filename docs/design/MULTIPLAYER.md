<!-- SPDX-License-Identifier: GPL-2.0-or-later -->

# OpenSynd multiplayer architecture

This is the design the online modes (co-op operations, the daily operation and rival companies) are built on. It assumes there is a
game server and that the server is the authority.

## The central idea

**The game is a headless core that takes commands and produces state and events. The browser is one client of it.**

Today the rules are split: `simulation.js` is clean, but the per-tick step, the handling of orders and the objective rules live
in `web/src/app.js` beside rendering, sound and the status line. Online play cannot be built on that. The first job is to pull the
core out so that the same code runs in three places:

| Where | What runs the core | Used for |
| --- | --- | --- |
| Browser, in-process | a `LocalSession` | single-player, offline, exactly as now |
| Server, per room | a `Room` | co-op, raids, the daily operation, replay verification |
| Browser, alongside a server | a copy for prediction | making your own agents answer at once |

Single-player and online then share one code path in the client: the client talks to a **Session**, and a session is either local
or remote. There is no "multiplayer mode" bolted on beside the game.

## Layers

```
 client (browser)                       server (Node)
 ┌────────────────────┐                 ┌─────────────────────────────────────┐
 │ render, input,     │   commands ───► │ gateway (HTTP + WebSocket, auth)    │
 │ audio, UI, camera  │                 │   ├ lobby / matchmaking             │
 │        │           │ ◄─── updates    │   ├ rooms  ── each runs core/       │
 │ Session interface  │                 │   ├ world service (territories)     │
 │  ├ LocalSession ───┼─┐               │   ├ verifier (re-runs replays)      │
 │  └ RemoteSession   │ │               │   └ store (accounts, scores, saves) │
 └────────────────────┘ │               └─────────────────────────────────────┘
                        ▼
                 core/  (shared, no DOM, no clock, no Math.random)
```

- **`core/`** (shared): world state, the command set, the fixed step, the events it emits, objective and outcome rules, save and
  load. Depends on nothing browser-specific, so Node can import it unchanged.
- **client**: everything that touches the screen, speakers or the player. It turns input into commands and events into pictures,
  sounds and messages.
- **server**: accounts, lobbies, rooms, persistence, and the services that sit around the core.

## The core's contract

**Commands in.** A command is a small serialisable record: `{ type, unitIds, ... }` using grid coordinates and ids, never screen
positions or object references. Types follow what the player can already do: move, attack, follow, fire at a point, hold fire,
use item, switch weapon, board or leave a vehicle, loot, interact, stance, group. The server checks every command: the unit belongs
to the sender, the unit is able to do it, the numbers are in range. Today's hold-fire reads a screen position inside the step; it
becomes a grid position in the command.

**A fixed step.** The core advances in the existing 1/30 s ticks. A tick takes the commands due this tick, applies them in a defined
order, runs the rules, and returns events. Nothing in it reads a wall clock, the screen or `Math.random`; all randomness comes from
the seeded generator so the same seed and commands always give the same result.

**Events out.** Where the step now calls `setStatus`, `audio.play` or `addEffect`, it emits a typed event instead: `shot`, `hit`,
`death`, `objective-complete`, `alert-raised`, `door-opened`, `message` (a key and arguments, not finished text, so it can be
translated). The client turns events into effects and sound; the server forwards them. Purely visual randomness (the spin of a puff
of smoke) moves to the client, which is why it may use `Math.random` and the core may not.

**State is data.** Everything the rules need lives in one serialisable state object. A snapshot is that state; a save is a
snapshot in the existing save format.

## Sessions

```
Session
  start(operation, options) -> void
  send(command)             -> void
  onUpdate(listener)        // { tick, events, snapshot-or-delta }
  stop()
```

- **LocalSession** runs the core in the page. Commands apply on the next tick. This is today's game behind a clean seam, and it keeps
  working offline.
- **RemoteSession** sends commands over a WebSocket and receives updates. It also runs a local copy of the core to **predict** the
  player's own agents (see below).

Because the client only knows the interface, every existing feature that goes through commands and events works online with no
extra code.

## Networking

- **Transport:** WebSocket, one connection per player, JSON to begin with (readable, debuggable) and a compact encoding later if the
  size matters. HTTP for sign-in, listings and files.
- **Rate:** the server steps at 30 Hz. It sends **updates at about 10 Hz**: events since the last update plus changed units, with a
  full snapshot on join, rejoin and every few seconds as a safety net.
- **Commands** carry a sequence number and are applied on the server at the next tick. They are acknowledged in the next update.
- **Prediction:** the client applies the player's commands to its own copy immediately, so their agents react at once. When an update
  arrives it rewinds to the server's state, replays the commands the server has not yet acknowledged, and carries on. Other
  players' agents and enemies are shown by **interpolating** between updates, slightly in the past. This is the standard approach and
  suits a slow top-down game well. Only the player's own movement is predicted; combat results always come from the server.
- **What is sent:** by default each client is sent only what its team could plausibly see or hear, so a hacked client cannot read
  enemy positions. The visibility rules are the core's own sight rules.
- **Reconnects:** a dropped client reconnects with its session token and receives a snapshot. An AI holds its agents meanwhile.

## Server

- **Gateway:** one Node process to start. It accepts connections, authenticates, and hands each player to the right service.
- **Rooms:** a room is one operation in progress, with a core instance, its players and its command log. Rooms are independent, so
  they can run on worker threads or separate processes as load grows. A room ends when the operation does, and writes its result and
  replay.
- **Lobby and matchmaking:** lists open co-op games, offers quick match, and lets friends see and join each other's games from the friends list.
- **World service:** the shared rival-company map: ownership, defence layouts, shields, income, seasons. It creates a raid room
  and applies the verified result. It is the only writer of that state.
- **Verifier:** takes a replay (version, seed, commands), runs it headless in a worker, and returns the result. The daily board and
  raids accept nothing it has not checked.
- **Store:** accounts, sessions, campaigns kept online, scores, replays, world state. SQLite first, behind a thin interface so
  Postgres can replace it.

## Data and identity

- **Accounts:** a display name and a password (hashed); sign-in providers can be added later. A browser can play offline with no
  account and link a local campaign to an account afterwards.
- **Two kinds of campaign.** The **local campaign** is today's, kept in the browser. The **online campaign** (rival companies) is
  kept by the server. Co-op and daily operations can pay out to either, chosen when you start. Nothing silently moves between them.
- **A replay** is `{ version, contentHash, seed, operationId, squad, commands[] }`. It is small and re-runs to the same result.
- **Content:** the server serves the same content pack as the client and names its hash in the handshake. A client with different
  content is told to update before it can join.

## Versioning

The handshake carries the **protocol version**, the **core version** (a rules change that alters results must change it) and the
**content hash**. Mismatches are refused with a plain message. Replays record the core version, so an old replay is either re-run
by a matching old core or marked as unverifiable and not counted. The existing hot-update flow carries new clients to players; the
server is released in step with it by the same pipeline.

## Safety

- The server trusts nothing from the client except commands, and checks each one.
- Rate limits on commands per second per connection, on sign-ups, and on submissions.
- Messages are size-limited and schema-checked before use.
- Passwords are hashed with a slow hash; sessions are random tokens that expire.
- Chat, where it exists, is filtered and reportable.
- Privacy: the server stores the display name, password hash, scores, replays and online-campaign state, and nothing else. This is
  to be stated in [PRIVACY.md](../../PRIVACY.md) before any online mode ships, with account deletion.

## Testing

- **Determinism:** run the same replay twice in Node and compare final state hashes; run it in Firefox and Node and compare.
- **Core purity:** a test imports `core/` with no `document` or `window` defined and plays an operation to the end.
- **Bots:** a headless client that connects, joins a room and plays scripted commands, used for co-op and load tests.
- **Bad networks:** a test transport that adds latency, jitter and loss, for prediction and reconnect tests.
- **Authority:** forged commands (another player's unit, impossible range) are rejected and change nothing.
- **Existing tests keep passing:** the extraction is done in steps, each leaving the single-player game and its browser tests green.

## How to get there

Each step is shippable on its own and leaves the game playable.

1. **Seams inside the client.** Replace direct `setStatus`, `audio.play` and `addEffect` calls in the step with returned events;
   replace screen positions in the step with grid positions; route every player action through one `applyCommand` function.
   Move the visual-only `Math.random` calls to the client. No behaviour change.
2. **Extract `core/`.** Move state, `applyCommand`, the step and the objective and outcome rules out of `app.js` into modules with
   no DOM. Add the purity test. `app.js` becomes the client.
3. **LocalSession.** The client drives the core through the Session interface. All existing tests pass.
4. **Determinism and replays.** Seeded everywhere, a recorder, a replay runner, hashes, the cross-environment test. This also gives
   Roadmap 2.0's replay feature.
5. **Server skeleton.** Gateway, handshake and version checks, accounts, the store, the pipeline that releases it.
6. **RemoteSession and a room.** One player in one room, then prediction, interpolation and reconnects.
7. **Verifier, then the daily board.** The first real feature, using the replay and verifier.
8. **Lobby and co-op.** Then **world service and raids**, then the community features.

Steps 1 to 4 are worth doing even if nothing online ever shipped: they make the game testable, replayable and easier to change.
