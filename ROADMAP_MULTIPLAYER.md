<!-- SPDX-License-Identifier: GPL-2.0-or-later -->

# OpenSynd Multiplayer Roadmap

The main menu already lists three online modes as "planned": **Co-op operations**, **Daily operation** and **Rival syndicates**.
This file says how each could be built. Like [ROADMAP_2.md](ROADMAP_2.md) it is a wish list in order, not a promise.

## Ground rules

- **Single-player stays complete and offline.** Nothing here may make the base game need a network.
- **A server is allowed.** The game stays a folder of static files that works alone; a small optional backend adds what peers
  cannot do well: lobbies, signalling, shared leaderboards and storing raid files. The game must keep working when it is unreachable.
  Phases 0 to 3 are still built so the core of each mode works without it, and the server is added alongside from Phase 1.
- **No payments, and minimal accounts.** A player is a chosen name and a random id kept in the browser; the server stores nothing else.
- **FreeSynd's rules still win** for anything the original defines (weapons, damage, agents). Multiplayer adds modes; it does not
  change rules.
- **Sizes:** S a day, M a few days, L a week or more.

## Phase 0. Make the simulation shareable (M)

Everything below depends on the game being **deterministic**: the same seed plus the same orders gives the same result.

- All randomness in `simulation.js` goes through the seeded generator in `random.js` (audit for stray `Math.random`).
- Orders (move, fire, use item, stance) become a small serialisable list stamped with the tick.
- A snapshot can be taken and restored (saves already do this).
- *Test:* a recorded game replays to the identical final state; a node test runs it twice and compares.

This also pays for Roadmap 2.0's F5 replay.

## Phase 1. Daily operation (M), the cheapest mode

One operation for everyone each day; the core works with no server.

- The seed and the operation come from the UTC date, so every player gets the same one.
- Score = time, casualties and funds kept; shown on a result card with a short **share code** (date, score, a checksum of the
  orders) to paste anywhere.
- A **local board** keeps your own best days; pasted codes from friends can be added to it.
- Codes are checkable by replaying the orders (Phase 0), so a pasted score can be verified on your own machine.
- *Test:* two browsers on the same date get the same layout; a tampered code is refused.

With the server (Phase 4, daily board part, built alongside this phase) the board is shared: it re-runs each submitted replay before accepting the score.

## Phase 2. Co-op operations, two to four players (L)

One operation, each player commands their own agents.

- **Peer-to-peer over WebRTC**, with the connection set up by pasting a short invite code each way (no signalling server needed).
  The server's signalling relay and TURN fallback replace code pasting when available, with the lobby list below.
- **Lockstep**: players exchange orders each tick; every browser runs the same deterministic simulation (Phase 0). Small bandwidth,
  no authority needed, and a desync check (state hash every few seconds) catches divergence.
- Four squad members split between players (2 players: 2 each; 4 players: 1 each). Shared funds, shared outcome.
- The menu's Co-op entry opens a lobby: host, or join from the server's lobby list or with a code; pick the operation; ready up.
- Disconnects: the game pauses for 20 seconds, then an AI takes over the missing agents.
- *Test:* two Playwright pages connect, play ten seconds of orders and end with identical state hashes.

## Phase 3. Rival syndicates, asynchronous (L)

Raid another player's territories without both being online.

- A player exports a **syndicate file**: territories held, a defence layout (which guards stand where, chosen from a small budget)
  and a signature. Files are shared like mission files (Roadmap 2.0 G1) or listed in a plain text list (G3).
- You play the raid against their defence as an ordinary operation. The result is a **raid report** file you send back; they see
  it on their map. Because play is deterministic, a report carries the orders and can be replayed to confirm it.
- Territory changes hands only in each player's own campaign; there is no shared world to cheat in.
- *Test:* a defence file loads, validates and plays; a replayed report matches its claimed result.

## Phase 4. The server (L)

A small, replaceable service (anyone can host their own; the game takes its address from settings). It does four jobs:

- **Daily board:** accepts a share code plus its orders, re-runs the simulation to verify it, and ranks it.
- **Lobbies and signalling:** lists open co-op games and relays the WebRTC handshake, with a TURN relay for players behind strict NATs.
- **Syndicate exchange:** stores defence files and raid reports so rivals need not be online together (Phase 3 gets an inbox).
- **Names:** reserves a chosen name against a browser-held key. No email, no password.

Keeps no personal data beyond the name and the scores, rate-limits submissions, and has a one-page self-hosting guide next to
[docs/SELF_HOSTING.md](docs/SELF_HOSTING.md). The simulation is shared code, so the server runs the same Node module the browser does.
Because of that, Phase 0 is also what makes server-side verification possible.

## Order

1. Phase 0 (everything else needs it).
2. Phase 1 daily operation: proves determinism with real players, small.
3. Phase 2 co-op.
4. Phase 3 rival syndicates.
5. Phase 4 (the server): start the daily board part with Phase 1, add lobbies with Phase 2 and the exchange with Phase 3.

## Risks worth knowing

- **Determinism is fragile.** One floating-point or iteration-order difference between browsers desyncs a game. The state-hash check
  and a cross-browser test (Firefox and Chromium) are required before co-op ships.
- **Cheating:** the server re-runs replays, so a faked score fails. Co-op is lockstep with no authority, so a modified client can
  only hurt its own game.
- **NAT traversal** can fail for peer-to-peer; the server's TURN fallback covers it.
