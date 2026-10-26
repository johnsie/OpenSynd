<!-- SPDX-License-Identifier: GPL-2.0-or-later -->

# OpenSynd Multiplayer Roadmap

The main menu already lists three online modes as "planned": **Co-op operations**, **Daily operation** and **Rival syndicates**.
This file says how to build them around a **game server**. Like [ROADMAP_2.md](ROADMAP_2.md) it is a wish list in order, not a
promise.

## Ground rules

- **There is a server, and it is the authority.** It owns accounts, matchmaking, the shared campaign state and the scores. The
  browser is a client: it sends what the player wants to do and draws what the server says happened.
- **Single-player stays complete and offline.** The base game never needs the network; online modes appear in the menu when the
  server is reachable and say plainly when it is not.
- **FreeSynd's rules still win** for anything the original defines (weapons, damage, agents). Multiplayer adds modes; it does not
  change rules.
- **One core, three places.** The same headless game core runs locally for single-player, on the server for online games, and in the
  browser for prediction. That is how the server runs games, verifies scores and replays reports without a second implementation.
- **Sizes:** S a day, M a few days, L a week or more.

## Phase 0. The foundation (L)

Everything else stands on this. The design is in [docs/design/MULTIPLAYER.md](docs/design/MULTIPLAYER.md); the short version is
that the game becomes a headless **core** that takes commands and returns state and events, and the browser and the server are both
clients of it.

- **0a. Extract the core (L).** Commands and events replace direct calls to the status line, sound and effects inside the step;
  the step stops reading the screen; `core/` moves out of `app.js` with no DOM. The single-player game, driven through a
  `LocalSession`, behaves as before. *Test:* the existing tests and browser tests still pass; the core plays an operation in Node
  with no `document` defined.
- **0b. Deterministic and replayable (M).** All rules randomness is seeded; commands are stamped with a tick; a recorder and a
  replay runner exist. *Test:* a recorded game replays to the identical state hash twice in Node and once in Firefox.
- **0c. Server skeleton (M).** `server/`: Node, WebSocket and HTTP, SQLite, accounts and sessions, a versioned handshake that
  refuses an out-of-date client with a clear message, a health check, and the GitLab pipeline that releases it with the site.
  *Test:* a client and server complete a handshake; a stale client is refused; sign-up, sign-in and deletion work.
- **0d. A room (M).** One player in one server room through a `RemoteSession`, with prediction, interpolation and reconnects.
  *Test:* a bot client and a browser each finish the same operation; a forced disconnect rejoins without losing state.
- **Deploy and docs:** a self-hosting guide for the server next to [docs/SELF_HOSTING.md](docs/SELF_HOSTING.md), and
  [PRIVACY.md](PRIVACY.md) updated for what the server keeps before anything is public.

## Phase 1. Daily operation (M)

One operation for everyone each day, with a real leaderboard.

- The server picks the day's seed and operation and publishes it; everyone gets the same layout.
- A finished run is submitted with its orders. The server **re-runs it** and only then records the score, so a faked number cannot
  get on the board.
- Score = time, casualties and funds kept. Boards for today, this week and all time; friends-only view once Phase 4 adds friends.
- A result card, and a replay of any board entry that you can watch from the board itself.
- *Test:* two accounts get the same day; a tampered submission is rejected; the board ranks as expected.

## Phase 2. Co-op operations, two to four players (L)

One operation, each player commanding their own agents.

- **Server-authoritative.** The server runs the simulation and ticks it; clients send orders and receive state updates. There is no
  desync to chase and no peer-to-peer connection to set up, so firewalls and home routers do not matter. A cheating client can only
  issue orders, which the server checks like any other.
- **Lobby:** create or browse open games from the menu's Co-op entry, pick the operation and difficulty, then either **quick match**
  (the server fills a room) or open a game for friends, who see it in their friends list and join with one click. Ready up.
- **Feel:** clients predict their own agents' movement and interpolate everyone else's, so orders respond at once even on a slow
  link. Updates send only what changed.
- Agents split between players (2 players: 2 each; 4 players: 1 each). Shared funds and a shared outcome.
- **Disconnects:** a dropped player rejoins the same game; while they are gone an AI holds their agents.
- **Spectators and replays** come almost free: a spectator is a client that sends no orders.
- *Test:* a bot client plays alongside a Playwright page for a full operation; a forced disconnect rejoins into the same state; the
  server's final state matches a replay of the recorded orders.

## Phase 3. Rival syndicates, a shared world (L)

Raid other players' territories, with the server holding the shared state.

- **Persistent world:** each player's syndicate holds territories on a shared map, kept by the server. Holdings and income continue
  while players are offline.
- **Defence:** a player sets a guard layout for each territory from a small budget and upgrades it from their funds.
- **Raids:** an attacker plays the defender's layout as an ordinary operation, live against the guard AI. When it ends, the server
  verifies the run by replay, then changes the territory's owner and tells the defender, who sees the raid on their map and can
  watch it.
- **Rules that keep it fair:** a recently raided territory is shielded for a while, raids are matched by strength, and a territory
  can be won back. Seasons reset the map so new players are never locked out.
- A live **defender-versus-attacker** raid, with a human defending, can follow once co-op networking is solid.
- *Test:* a raid changes ownership exactly once; a forged report is refused; shield and matching rules hold.

## Phase 4. The community around it (M)

- A friends list (request and accept by display name), a "join" button on a friend who is in a lobby, and simple chat or quick messages in lobbies.
- Shared mission lists and uploaded missions (Roadmap 2.0 G1 to G3) hosted by the server, with the editor publishing straight to it.
- Profiles with a record of operations, and rankings per mode.
- Moderation basics: report, mute, ban, and name filters.

## Order

1. Phase 0, the foundation (all of it; nothing else works without it).
2. Phase 1, daily operation: the smallest real feature, and it proves accounts, verification and replays with real players.
3. Phase 2, co-op.
4. Phase 3, rival syndicates.
5. Phase 4, community, which can start in parts as soon as accounts exist.

## Things to decide and watch

- **Hosting and cost:** a server running live games uses CPU per game. A small VPS handles dozens of concurrent operations; if the
  game grows, games can be spread over several processes because each one is independent. Decide where it runs before Phase 0 ends.
- **Privacy:** store the least that works (display name, password hash, scores, replays), say so in the README, and offer account
  deletion.
- **Abuse:** rate limits on sign-up and submissions, and the moderation tools in Phase 4, before Phase 3 opens to the public.
- **Latency:** the game is paused-friendly and top-down, so tens of milliseconds are fine, but prediction in Phase 2 should be
  tested with simulated bad networks.
- **No payments.** Nothing here sells anything; no pay-to-win, no store.
