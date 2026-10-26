<!-- SPDX-License-Identifier: GPL-2.0-or-later -->

# OpenSynd Multiplayer Roadmap

OpenSynd gets a **game server**. The server holds accounts, the day's tasks, the shared map and the scores; the browser is the
client. Three things are built on it:

1. **Daily chores**: short tasks that renew every day and pay out, with a daily operation everyone plays and a board to rank on.
2. **Cooperative operations**: two to four players, one operation, a squad each.
3. **Raiding**: attack other players' territories and defend your own, on a map the server keeps.

The architecture is in [docs/design/MULTIPLAYER.md](docs/design/MULTIPLAYER.md): a headless game core that runs in the browser for
single-player and on the server for online games, with the server as the authority. Single-player stays complete and playable
without an account. Like [ROADMAP_2.md](ROADMAP_2.md) this is a wish list in order, not a promise.

**Sizes:** S a day, M a few days, L a week or more. FreeSynd's rules still win for anything FreeSynd defines.

## Phase 0. The server and the core (L)

Nothing online works without this. Detail is in the design document.

- **0a. Extract the core (L).** Commands and events replace direct calls to status, sound and effects inside the game step; the step
  stops reading the screen; the rules move out of `app.js` into a core with no browser code. Single-player runs through a local
  session and behaves as before. *Test:* every existing test and browser test passes; the core plays an operation in Node.
- **0b. Replayable (M).** Seeded randomness everywhere in the rules, commands stamped with a tick, a recorder and a replay runner.
  *Test:* a recorded game replays to the same state hash twice in Node and once in Firefox.
- **0c. Server skeleton (M).** Node, WebSocket and HTTP, SQLite, accounts and sessions, a handshake that checks protocol, rules
  and content versions and tells an out-of-date client to update, a health check, and the pipeline that releases it with the site.
  *Test:* sign-up, sign-in and account deletion work; a stale client is refused with a clear message.
- **0d. One room (M).** One player in one server room, with prediction, interpolation and reconnects. *Test:* a bot and a browser
  finish the same operation; a forced disconnect rejoins with nothing lost.
- **Docs:** a self-hosting guide for the server, and [PRIVACY.md](PRIVACY.md) stating what it keeps (display name, password hash,
  scores, replays, online-campaign state) before anything is public.

## Phase 1. Daily chores (M)

A reason to come back each day, and the first feature on the server.

- **The day's chores:** the server issues three or four small tasks each UTC day, drawn from a pool: win an operation without
  losing an agent, finish under a time, persuade someone, destroy a vehicle, complete an operation with only one weapon type, and
  so on. Each pays funds or research points into your campaign. They are checked from your recorded run, not taken on trust.
- **The daily operation:** one operation and one seed for everyone each day. The server re-runs every submitted replay before
  scoring it. Score is time, casualties and funds kept.
- **Boards:** today, this week and all time, with each entry's replay watchable from the board. Friends-only once Phase 3 adds a
  friends list.
- **Streaks:** consecutive days completed give a growing bonus that is capped, with one missed day forgiven each week, so it rewards
  habit without punishing a break.
- **Menu:** the Daily entry shows today's chores, how many are done, and time until they renew.
- *Test:* two accounts see the same day; a chore completes only from a valid replay; a tampered submission is rejected; the board
  ranks correctly; chores renew at the day boundary.

## Phase 2. Cooperative operations (L)

Two to four players, one operation, a squad each.

- **Server-authoritative:** the server runs the operation; clients send orders and receive updates. A modified client can only
  issue orders, and the server checks each one.
- **Finding a game:** the Co-op entry offers **quick match** (the server fills a room), or **open a game** that shows in your
  friends' lists once Phase 3 exists. Pick the operation and difficulty, then ready up.
- **Squads:** agents are split between players (two players, two agents each; four players, one each). Funds and the outcome are
  shared. Rewards go to each player's own campaign.
- **Feel:** your own agents respond instantly (predicted in your browser); everyone else's are smoothed between updates. Combat
  results always come from the server.
- **Reconnects and drop-outs:** a dropped player rejoins the same game; while away an AI holds their agents. If everyone drops, the
  room keeps for a few minutes.
- **Co-op operations:** the existing operations scaled to more agents, and a few built for it (a split objective that needs two
  teams at once, a door one player holds while another crosses).
- **Spectating and replays** come with the design: a spectator is a client that sends no orders.
- *Test:* a bot and two browsers complete an operation together; forged orders (another player's agent) are rejected; a dropped
  player rejoins; play stays smooth under simulated latency and loss.

## Phase 3. Raiding (L)

Attack other players' territories, and defend your own, on a world map the server keeps.

- **The world:** each player's company holds territories on a shared map. Holdings, income and defences persist while players are
  offline, and only the server changes them.
- **Defending:** you set a guard layout for each territory from a budget and improve it with funds. Guards run the same AI as in any
  operation. You can watch a replay of every raid on your territory.
- **Raiding:** pick a territory in reach of one of yours, then play its defender's layout as an ordinary operation. The server
  verifies the run by replay, then moves ownership, pays loot and tells the defender.
- **Fairness:** raids are matched by strength; a raided territory is shielded for a while; a lost territory can be taken back; seasons
  reset the map so new players are never shut out. Raiding costs something, so it is a choice and not a free action.
- **Friends and rivals:** a friends list (request and accept by display name), a join button on a friend in a lobby, and a rivalry
  record against anyone you keep raiding.
- **Live defence, later:** a defender can choose to be online and fight the raid in person, with the same server-run room as co-op.
- *Test:* a raid changes ownership exactly once; a forged raid report is refused; shields, matching and seasons behave; offline
  income accrues correctly.

## Phase 4. Around it (M)

- Profiles with a record of operations, and rankings per mode.
- Server-hosted missions and campaign packs, with the editor publishing to the server ([ROADMAP_2.md](ROADMAP_2.md) G1 to G3).
- Quick messages in lobbies; report, mute and ban tools; name filters. These come before raiding opens to the public.

## Order

1. Phase 0 (the core, then the server). Steps 0a and 0b are worth doing even if nothing else ships.
2. Phase 1, daily chores: small, proves accounts, verification and replays with real players.
3. Phase 2, cooperative operations.
4. Phase 3, raiding.
5. Phase 4, in parts, as soon as accounts exist; moderation before Phase 3 goes public.

## Things to decide and watch

- **Where it runs:** a live game costs CPU. A small VPS handles dozens of operations at once, and rooms are independent so they can
  spread over processes. Decide the host before Phase 0c ends.
- **Privacy and deletion:** store the least that works, say so, and let people delete their account.
- **Abuse:** rate limits on sign-up, commands and submissions; moderation tools before public raiding.
- **Fairness of rewards:** chores and raids pay into a campaign, so payouts are tuned with the balance bot to keep single-player
  progression meaningful.
- **No payments.** Nothing here sells anything; no pay-to-win, no store.
