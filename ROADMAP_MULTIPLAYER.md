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
- **One simulation, two places.** The server runs the same simulation code as the browser, as a Node module (the code is already
  dependency-free ES modules). That is how it can run games, verify scores and replay reports without a second implementation.
- **Sizes:** S a day, M a few days, L a week or more.

## Phase 0. The foundation (L)

Everything else stands on this.

- **Server project** in `server/`: Node, one process to start, WebSocket for live play and plain HTTP for everything else. Storage
  begins as SQLite and can move to Postgres when there is a reason.
- **Accounts:** sign up with a name and password (or a sign-in provider later), sessions, a profile with a chosen display name.
  Passwords are hashed; no email is needed to play.
- **Protocol:** a versioned message format shared by client and server (`protocol.js`), with a version check on connect so a stale
  browser is told to update instead of misbehaving. The existing hot-update flow carries the new client to players.
- **Deterministic simulation:** all randomness goes through the seeded generator in `random.js`, orders are small serialisable
  records stamped with a tick, and a game can be recorded and replayed to the identical final state. This powers verification,
  reports and replays (Roadmap 2.0 F5), not just cheating prevention.
- **Deployment:** the GitLab pipeline that publishes the static site also builds and releases the server, with a health check and
  a one-page guide in [docs/SELF_HOSTING.md](docs/SELF_HOSTING.md) so anyone can run their own.
- *Test:* a recorded game replays identically in Node twice; a client and server complete a handshake; an old client is refused
  with a clear message.

## Phase 1. Daily operation (M)

One operation for everyone each day, with a real leaderboard.

- The server picks the day's seed and operation and publishes it; everyone gets the same layout.
- A finished run is submitted with its orders. The server **re-runs it** and only then records the score, so a faked number cannot
  get on the board.
- Score = time, casualties and funds kept. Boards for today, this week and all time; friends-only view once Phase 4 adds friends.
- A result card with a short link others can open to watch the replay.
- *Test:* two accounts get the same day; a tampered submission is rejected; the board ranks as expected.

## Phase 2. Co-op operations, two to four players (L)

One operation, each player commanding their own agents.

- **Server-authoritative.** The server runs the simulation and ticks it; clients send orders and receive state updates. There is no
  desync to chase and no peer-to-peer connection to set up, so firewalls and home routers do not matter. A cheating client can only
  issue orders, which the server checks like any other.
- **Lobby:** create or browse open games from the menu's Co-op entry, pick the operation and difficulty, invite by link or friend
  list, ready up.
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

- Friends, invites and simple chat or quick messages in lobbies.
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
