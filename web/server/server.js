// SPDX-License-Identifier: GPL-2.0-or-later

// The game server: accounts over plain HTTP, and the games themselves over WebSockets. It keeps every running operation, steps
// them on a clock, and sends each player what changes. Run it with server/main.js; tests make one on a spare port.
import { randomBytes } from "node:crypto";
import { createServer } from "node:http";

import { FIXED_STEP_SECONDS } from "../src/simulation.js";
import { createOidc, displayNameFor } from "./oidc.js";
import { cleanSpeech, createRateLimiter, hashPassword, newToken, problemWithName, problemWithPassword, verifyPassword } from "./auth.js";
import { contentHash } from "./content-hash.js";
import {
  DAY_MS,
  choresEarned,
  dailyOperation,
  describeChore,
  dayNumber,
  resultOf,
  rewardWithStreak,
  SCORE_FORMULA,
  scoreFrom,
  scoreOf,
  streakOf,
} from "./daily.js";
import { CORE_VERSION, PROTOCOL_VERSION, checkVersions, parseClientMessage } from "./protocol.js";
import { WAITING_SECONDS, WaitingGame, splitSquad } from "./lobby.js";
import {
  MAX_DEFENCE,
  RAID_COST,
  SHIELD_AFTER_CAPTURED_HOURS,
  SHIELD_AFTER_DEFENDED_HOURS,
  HOUR_MS,
  SIGNUP_FUNDS,
  accrued,
  canRaid,
  incomePerHour,
  raidMission,
  rivalDefence,
  seasonOf,
  upgradeCost,
} from "./raids.js";
import { Room } from "./rooms.js";
import { WarRoom } from "./war.js";
import { upgrade } from "./ws.js";

const MAX_BODY_BYTES = 4096;
const IDLE_SECONDS = 90;
const PING_SECONDS = 20;
export const AWAY_SECONDS = 120; // how long a signed-in player's place is kept after their connection goes
export const MAX_ROOMS = 200;
export const MAX_CONNECTIONS_PER_ADDRESS = 8;

const json = (response, status, body, headers = {}) => {
  response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers });
  response.end(JSON.stringify(body));
};

function readBody(request) {
  return new Promise((done, fail) => {
    let size = 0;
    const chunks = [];
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        fail(new Error("too large"));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      try {
        done(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {});
      } catch {
        fail(new Error("not JSON"));
      }
    });
    request.on("error", fail);
  });
}

/**
 * Make the server. `content` is the loaded pack (server/content.js) and `store` the database (server/store.js). Nothing listens until
 * `listen()`. `origins` is the list of sites whose pages may call the accounts API ("*" for any); `clock` is for tests.
 */
export function createGameServer({
  content,
  store,
  origins = ["*"],
  now = () => performance.now(),
  tickEvery = true,
  clock = () => Date.now(),
  adminToken = null,
  oidc = createOidc(),
}) {
  content.hash ??= contentHash(content.root);
  store.rescoreOnce(SCORE_FORMULA, scoreFrom);
  const rooms = new Map();
  const connections = new Set();
  const perAddress = new Map();
  const signups = createRateLimiter({ max: 10, windowMs: 60_000 });
  const logins = createRateLimiter({ max: 20, windowMs: 60_000 });
  const speech = createRateLimiter({ max: 8, windowMs: 10_000 });
  const reports = createRateLimiter({ max: 5, windowMs: 3_600_000 });
  let roomCounter = 0;
  let warRoom = null;

  const allowed = (origin) => origins.includes("*") || (origin && origins.includes(origin));
  const corsHeaders = (request) => {
    const origin = request.headers.origin;
    if (!allowed(origin)) return {};
    return {
      "Access-Control-Allow-Origin": origins.includes("*") ? "*" : origin,
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      Vary: "Origin",
    };
  };

  const accountOf = (request) => {
    const header = request.headers.authorization ?? "";
    return header.startsWith("Bearer ") ? store.accountForToken(header.slice(7)) : null;
  };

  // ---------------------------------------------------------------------------------------------------- accounts over HTTP

  async function handleApi(request, response, url) {
    const headers = corsHeaders(request);
    const reply = (status, body) => json(response, status, body, headers);
    if (request.method === "OPTIONS") {
      response.writeHead(204, headers);
      response.end();
      return;
    }
    const address = request.socket.remoteAddress ?? "unknown";
    try {
      if (url.pathname === "/api/health" && request.method === "GET") {
        reply(200, {
          ok: true,
          protocol: PROTOCOL_VERSION,
          core: CORE_VERSION,
          content: content.hash,
          rooms: rooms.size,
          oidc: oidc ? { issuer: oidc.issuer, client: oidc.client } : null,
          war: { online: warRoom?.present ?? 0, running: Boolean(warRoom) },
        });
      } else if (url.pathname === "/api/signup" && request.method === "POST") {
        if (!signups.take(address)) return reply(429, { error: "Too many sign-ups from here. Wait a minute." });
        const { name, password } = await readBody(request);
        const problem = problemWithName(name) ?? problemWithPassword(password);
        if (problem) return reply(400, { error: problem });
        const account = store.createAccount(name, await hashPassword(password));
        if (!account) return reply(409, { error: "That name is taken." });
        store.addFunds(account.id, SIGNUP_FUNDS); // enough for a few raids to begin with
        const token = newToken();
        store.createSession(account.id, token);
        reply(201, { token, account: { id: account.id, name: account.name } });
      } else if (url.pathname === "/api/login" && request.method === "POST") {
        if (!logins.take(address)) return reply(429, { error: "Too many tries. Wait a minute." });
        const { name, password } = await readBody(request);
        const found = typeof name === "string" ? store.findForLogin(name) : null;
        // The same answer, and the same work, whether or not the name exists.
        const record = found ?? { salt: Buffer.alloc(16).toString("base64"), hash: Buffer.alloc(32).toString("base64") };
        const good = typeof password === "string" && (await verifyPassword(password, record)) && Boolean(found);
        if (!good) return reply(401, { error: "That name and password do not match." });
        if (found.banned) return reply(403, { error: "This account has been closed." });
        const token = newToken();
        store.createSession(found.id, token);
        reply(200, { token, account: { id: found.id, name: found.name } });
      } else if (url.pathname === "/api/oidc/code" && request.method === "POST") {
        if (!oidc) return reply(404, { error: "Signing in with Outiva is not set up on this server." });
        if (!logins.take(address)) return reply(429, { error: "Too many tries. Wait a minute." });
        const { code, verifier, redirectUri, nonce } = await readBody(request);
        if ([code, verifier, redirectUri, nonce].some((value) => typeof value !== "string" || value.length > 2000)) {
          return reply(400, { error: "That request could not be read." });
        }
        let claims;
        try {
          claims = await oidc.exchange({ code, verifier, redirectUri, nonce });
        } catch {
          return reply(401, { error: "Outiva did not accept that sign-in." });
        }
        let account = store.accountForSubject(claims.sub);
        if (!account) {
          const salt = randomBytes(16).toString("base64");
          // A password nobody knows: this account signs in through Outiva only.
          account = store.createAccount(displayNameFor(store.nameTaken), { salt, hash: randomBytes(32).toString("base64") });
          store.linkSubject(claims.sub, account.id);
          store.addFunds(account.id, SIGNUP_FUNDS);
        }
        if (store.isBanned(account.id)) return reply(403, { error: "This account has been closed." });
        const token = newToken();
        store.createSession(account.id, token);
        reply(200, { token, account: { id: account.id, name: account.name } });
      } else if (url.pathname === "/api/daily" && request.method === "GET") {
        reply(200, dailyPage(accountOf(request)));
      } else if (/^\/api\/run\/\d+$/.test(url.pathname) && request.method === "GET") {
        const kept = store.runRecording(Number(url.pathname.split("/").pop()));
        if (!kept) return reply(404, { error: "No such run." });
        reply(200, kept);
      } else if (url.pathname === "/api/world" && request.method === "GET") {
        reply(200, worldPage(accountOf(request)));
      } else if (url.pathname === "/api/defence" && request.method === "POST") {
        const account = accountOf(request);
        if (!account) return reply(401, { error: "Not signed in." });
        const { territory, level } = await readBody(request);
        const result = upgradeDefence(account, territory, level);
        reply(result.status ?? 200, result.error ? { error: result.error } : result);
      } else if (url.pathname === "/api/friends" && request.method === "GET") {
        const account = accountOf(request);
        if (!account) return reply(401, { error: "Not signed in." });
        const online = new Set([...connections].filter((c) => c.account).map((c) => c.account.name));
        const lists = store.friends(account.id);
        reply(200, { ...lists, online: lists.friends.filter((name) => online.has(name)) });
      } else if (url.pathname === "/api/friends" && request.method === "POST") {
        const account = accountOf(request);
        if (!account) return reply(401, { error: "Not signed in." });
        const { name, action } = await readBody(request);
        const other = typeof name === "string" ? store.findForLogin(name) : null;
        if (!other || other.id === account.id) return reply(404, { error: "There is nobody called that." });
        if (action === "remove") store.removeFriend(account.id, other.id);
        else if (action === "accept") {
          if (!store.acceptFriend(account.id, other.id)) return reply(404, { error: "They have not asked to be your friend." });
        } else if (action === "request") store.requestFriend(account.id, other.id);
        else return reply(400, { error: "Unknown action." });
        reply(200, store.friends(account.id));
      } else if (/^\/api\/profile\/[^/]+$/.test(url.pathname) && request.method === "GET") {
        const found = store.findForLogin(decodeURIComponent(url.pathname.split("/").pop()));
        const profile = found && store.profile(found.id);
        if (!profile) return reply(404, { error: "There is nobody called that." });
        reply(200, { name: found.name, ...profile });
      } else if (url.pathname === "/api/report" && request.method === "POST") {
        const account = accountOf(request);
        if (!account) return reply(401, { error: "Not signed in." });
        if (!reports.take(account.id)) return reply(429, { error: "You have sent several reports already. Try again later." });
        const { name, reason } = await readBody(request);
        const other = typeof name === "string" ? store.findForLogin(name) : null;
        if (!other || other.id === account.id) return reply(404, { error: "There is nobody called that." });
        store.report(account.id, other.id, String(reason ?? "").slice(0, 300));
        reply(200, { ok: true });
      } else if (url.pathname === "/api/admin/reports" && request.method === "GET") {
        if (!adminToken || request.headers["x-admin-token"] !== adminToken) return reply(403, { error: "Not allowed." });
        reply(200, { reports: store.reports() });
      } else if (url.pathname === "/api/admin/ban" && request.method === "POST") {
        if (!adminToken || request.headers["x-admin-token"] !== adminToken) return reply(403, { error: "Not allowed." });
        const { name, banned = true } = await readBody(request);
        const other = typeof name === "string" ? store.findForLogin(name) : null;
        if (!other) return reply(404, { error: "There is nobody called that." });
        store.setBanned(other.id, banned);
        if (banned) for (const connection of connections) if (connection.account?.id === other.id) connection.socketConnection.close(1000, "closed");
        reply(200, { ok: true });
      } else if (url.pathname === "/api/rename" && request.method === "POST") {
        const account = accountOf(request);
        if (!account) return reply(401, { error: "Not signed in." });
        if (!logins.take(address)) return reply(429, { error: "Too many tries. Wait a minute." });
        const { name } = await readBody(request);
        const problem = problemWithName(name);
        if (problem) return reply(400, { error: problem });
        if (!store.renameAccount(account.id, name)) return reply(409, { error: "That name is taken." });
        for (const connection of connections) if (connection.account?.id === account.id) connection.account = { ...connection.account, name };
        reply(200, { account: { id: account.id, name } });
      } else if (url.pathname === "/api/me" && request.method === "GET") {
        const account = accountOf(request);
        if (!account) return reply(401, { error: "Not signed in." });
        reply(200, { account: { id: account.id, name: account.name } });
      } else if (url.pathname === "/api/logout" && request.method === "POST") {
        const header = request.headers.authorization ?? "";
        if (header.startsWith("Bearer ")) store.endSession(header.slice(7));
        reply(200, { ok: true });
      } else if (url.pathname === "/api/account" && request.method === "DELETE") {
        const account = accountOf(request);
        if (!account) return reply(401, { error: "Not signed in." });
        const { password, confirm } = await readBody(request);
        const record = store.findForLogin(account.name);
        // An Outiva account has no password here: it confirms by naming itself.
        const confirmed = store.isLinked(account.id) ? confirm === account.name : typeof password === "string" && (await verifyPassword(password, record));
        if (!confirmed) return reply(403, { error: store.isLinked(account.id) ? "Type your name to confirm." : "That password does not match." });
        store.deleteAccount(account.id);
        for (const connection of connections) if (connection.account?.id === account.id) connection.socketConnection.close(1000, "account deleted");
        reply(200, { ok: true });
      } else {
        reply(404, { error: "Not found." });
      }
    } catch (error) {
      reply(error.message === "too large" ? 413 : 400, { error: "That request could not be read." });
    }
  }

  // ------------------------------------------------------------------------------------------------------ the daily operation

  const today = () => dayNumber(clock());

  function boardsFor(day) {
    return {
      today: store.board("daily", day, day, 10),
      week: store.board("daily", day - 6, day, 10),
      all: store.board("daily", 0, day, 10),
    };
  }

  /** Today's operation, its chores, the boards, and (for a signed-in player) how they are doing. */
  function dailyPage(account) {
    const day = today();
    const operation = dailyOperation(content, day);
    const done = account ? new Set(store.choresOn(account.id, day)) : new Set();
    const days = account ? store.choreDays(account.id) : new Set();
    const mission = content.read(operation.mission);
    return {
      date: operation.date,
      day,
      mission: operation.mission,
      name: operation.name,
      title: mission.title ?? mission.name,
      resetsIn: Math.max(0, Math.round(((day + 1) * DAY_MS - clock()) / 1000)),
      chores: operation.chores.map((chore) => ({ ...describeChore(chore), done: done.has(chore.id) })),
      boards: boardsFor(day),
      you: account && {
        best: store.bestRun(account.id, "daily", day),
        streak: streakOf(days, day),
        funds: store.funds(account.id),
      },
    };
  }

  /** An operation played as the day's has ended: it is kept, scored, and its chores paid. Returns what the player is told. */
  function finishDaily(room) {
    const { operation, account } = room.daily;
    const result = resultOf(room.world, room.squad);
    const score = scoreOf(result);
    const run = store.recordRun({
      account,
      day: operation.day,
      mode: "daily",
      mission: operation.mission,
      seed: operation.seed,
      outcome: result.outcome,
      seconds: result.seconds,
      lost: result.lost,
      score,
      recording: room.toRecording(),
    });
    const earned = choresEarned(operation, result);
    const streak = streakOf(new Set([...store.choreDays(account), ...(earned.length > 0 ? [operation.day] : [])]), operation.day);
    const paid = [];
    for (const chore of earned) {
      const reward = rewardWithStreak(chore.reward, streak);
      if (store.claimChore(account, operation.day, chore.id, reward)) paid.push({ id: chore.id, title: chore.title, reward });
    }
    const ranking = store.board("daily", operation.day, operation.day, 1000);
    const place = ranking.find((row) => row.run === store.bestRun(account, "daily", operation.day)?.id);
    return { daily: { run, score, chores: paid, streak, funds: store.funds(account), rank: place?.rank ?? null, players: ranking.length } };
  }

  // ------------------------------------------------------------------------------------------------------ the shared world

  const entryOf = (id) => content.territories.find((territory) => territory.id === id);

  /** A new month is a new season: the map starts afresh (funds are kept). */
  function ensureSeason() {
    const season = seasonOf(clock());
    if (store.season() !== season) store.newSeason(season);
    return season;
  }

  /** Territories hold income for whoever holds them: what has built up since they last collected is paid out now. */
  function collect(account) {
    const owned = store.ownedBy(account).map(entryOf).filter(Boolean);
    const time = clock();
    const pay = accrued(owned, store.collectedAt(account), time);
    if (pay > 0) store.addFunds(account, pay);
    store.setCollected(account, time);
    return pay;
  }

  /** The world as one player sees it: who holds each territory, how well defended, and what may be done about it. */
  function worldPage(account) {
    const season = ensureSeason();
    const collected = account ? collect(account.id) : 0;
    const holdings = store.holdings();
    const time = clock();
    const mine = account ? store.ownedBy(account.id) : [];
    return {
      season,
      raidCost: RAID_COST,
      maxDefence: MAX_DEFENCE,
      territories: content.territories.map((entry) => {
        const held = holdings.get(entry.id);
        const holderId = held?.owner ?? null;
        const defence = held?.defence ?? rivalDefence(entry);
        const allowed = account
          ? canRaid({
              raiderId: account.id,
              holderId,
              holderCount: holderId === null ? 0 : store.ownedBy(holderId).length,
              yours: mine.length,
              shieldUntil: held?.shield ?? 0,
              now: time,
              funds: store.funds(account.id),
            })
          : { ok: false, reason: "Sign in to raid." };
        return {
          id: entry.id,
          name: entry.name,
          population: entry.population,
          holder: held?.name ?? entry.owner,
          player: Boolean(held?.name),
          mine: Boolean(account && holderId === account.id),
          defence,
          defenceUpgradeCost: defence < MAX_DEFENCE ? upgradeCost(defence + 1) : null,
          shieldedFor: Math.max(0, Math.round(((held?.shield ?? 0) - time) / 1000)),
          income: incomePerHour(entry),
          canRaid: allowed.ok,
          why: allowed.ok ? null : allowed.reason,
        };
      }),
      you: account && {
        funds: store.funds(account.id),
        owned: mine.length,
        incomePerHour: mine.map(entryOf).reduce((total, entry) => total + incomePerHour(entry), 0),
        collected,
      },
      raids: account ? store.recentRaids(account.id, 10) : [],
    };
  }

  /** The holder raises a territory's defence one level or more, paying for each. */
  function upgradeDefence(account, id, level) {
    const held = store.holdings().get(id);
    if (!held || held.owner !== account.id) return { error: "That territory is not yours.", status: 403 };
    if (!Number.isInteger(level) || level <= held.defence || level > MAX_DEFENCE) return { error: "Choose a higher level, up to the top one.", status: 400 };
    let cost = 0;
    for (let step = held.defence + 1; step <= level; step += 1) cost += upgradeCost(step);
    if (!store.spendFunds(account.id, cost)) return { error: `That costs ${cost} funds.`, status: 402 };
    store.setDefence(id, level);
    return { ok: true, cost, funds: store.funds(account.id) };
  }

  /** A raid has ended: the territory changes hands if the raiders held it, the raid is logged and kept, and the holder can watch. */
  function finishRaid(room) {
    const { entry, level, attacker, holder } = room.raid;
    const result = resultOf(room.world, room.squad);
    const won = result.outcome === "success";
    const time = clock();
    const run = store.recordRun({
      account: attacker,
      day: dayNumber(time),
      mode: "raid",
      mission: entry.id,
      seed: room.seed,
      outcome: result.outcome,
      seconds: result.seconds,
      lost: result.lost,
      score: scoreOf(result),
      recording: room.toRecording(),
    });
    if (won) store.claim(entry.id, attacker, 1, time + SHIELD_AFTER_CAPTURED_HOURS * HOUR_MS);
    else if (holder !== null) store.claim(entry.id, holder, level, time + SHIELD_AFTER_DEFENDED_HOURS * HOUR_MS);
    store.logRaid({ territory: entry.id, attacker, defender: holder, outcome: won ? "captured" : "defended", run, level });
    return { raid: { territory: entry.id, name: entry.name, captured: won, run, cost: RAID_COST, funds: store.funds(attacker) } };
  }

  // ------------------------------------------------------------------------------------------------------------- games

  const missionPaths = () => new Set([...content.pack.missions, ...(content.pack.variants ?? [])]);

  // The people connected, by who they are (an account, or a connection for a guest). A running operation sends to a player through
  // this, so a player who reconnects is simply found again.
  const byKey = new Map();
  const games = new Map(); // waiting games
  const seated = new Map(); // account id -> the running operation they are in (even while they are away)
  let gameCounter = 0;
  const keyOf = (connection) => (connection.account ? `a${connection.account.id}` : connection.id);
  const sendTo = (key) => (message) => byKey.get(key)?.send(message);
  const playerOf = (connection) => ({ id: connection.key, name: connection.account.name, account: connection.account.id });

  function startRaid(connection, territory) {
    if (rooms.size >= MAX_ROOMS) return connection.error("The server is full. Try again in a moment.");
    if (!connection.account) return connection.error("Sign in to raid.");
    ensureSeason();
    const entry = entryOf(territory);
    if (!entry) return connection.error("There is no such territory.");
    const account = connection.account.id;
    collect(account);
    const held = store.holdings().get(entry.id);
    const holder = held?.owner ?? null;
    const allowed = canRaid({
      raiderId: account,
      holderId: holder,
      holderCount: holder === null ? 0 : store.ownedBy(holder).length,
      yours: store.ownedBy(account).length,
      shieldUntil: held?.shield ?? 0,
      now: clock(),
      funds: store.funds(account),
    });
    if (!allowed.ok) return connection.error(allowed.reason);
    store.spendFunds(account, RAID_COST);
    const level = held?.defence ?? rivalDefence(entry);
    const mission = raidMission(content, { ...entry, holder: held?.name ?? entry.owner }, level);
    leaveGame(connection);
    leaveRoom(connection);
    roomCounter += 1;
    const room = new Room({
      id: `room-${roomCounter}`,
      content,
      mission: mission.id,
      missionData: mission,
      variant: "raid",
      seed: roomCounter * 7919 + 13,
    });
    room.raid = { entry, level, attacker: account, holder };
    room.recording.raid = { territory: entry.id, level };
    room.onFinish = finishRaid;
    room.startedAt = now();
    rooms.set(room.id, room);
    seat(connection, room, room.squad);
  }

  function startRoom(connection, mode, mission, territory) {
    if (mode === "raid") return startRaid(connection, territory);
    if (mode === "war") return startWar(connection);
    if (rooms.size >= MAX_ROOMS) return connection.error("The server is full. Try again in a moment.");
    if (mode === "daily" && !connection.account) return connection.error("Sign in to play the daily operation.");
    const operation = mode === "daily" ? dailyOperation(content, today()) : null;
    const chosen = operation?.mission ?? mission ?? content.pack.missions[0];
    if (!missionPaths().has(chosen)) return connection.error("There is no such operation.");
    leaveGame(connection);
    leaveRoom(connection);
    roomCounter += 1;
    const room = new Room({ id: `room-${roomCounter}`, content, mission: chosen, seed: operation?.seed ?? roomCounter * 7919 + 13 });
    if (operation) {
      room.daily = { operation, account: connection.account.id };
      room.onFinish = finishDaily;
    }
    room.startedAt = now();
    rooms.set(room.id, room);
    seat(connection, room, room.squad);
  }

  function startWar(connection) {
    if (!needAccount(connection)) return;
    leaveGame(connection);
    leaveRoom(connection);
    if (!warRoom || warRoom.finished) {
      warRoom = new WarRoom({
        content,
        mission: content.pack.missions[0],
        persisted: store.getMeta("company-war", {}),
        save: (state) => store.setMeta("company-war", state),
      });
      warRoom.startedAt = now();
      rooms.set(warRoom.id, warRoom);
    }
    const preferred = store.getMeta(`company-war-coalition:${connection.account.id}`, null);
    const slot = warRoom.claimCompany(connection.key, connection.account.id, preferred, connection.account.name);
    if (!slot) return connection.error("The company war is full. Try again when a company leaves.");
    store.setMeta(`company-war-coalition:${connection.account.id}`, slot.coalition);
    seat(connection, warRoom, slot.ids);
  }

  /** Put a player into a room with these agents (the room tells them how it starts). */
  function seat(connection, room, unitIds, { start = true } = {}) {
    connection.room = room;
    if (connection.account) seated.set(connection.account.id, { room, key: connection.key });
    room.addPlayer(connection.key, {
      send: sendTo(connection.key),
      name: connection.account?.name ?? "Guest",
      account: connection.account?.id ?? null,
      unitIds,
      start,
    });
  }

  /** Leave an operation. With `keep`, a signed-in player's place is held for a while, as if they had stepped away. */
  function leaveRoom(connection, { keep = false } = {}) {
    const room = connection.room;
    if (!room) return;
    connection.room = null;
    if (keep && connection.account && !room.finished) {
      room.detach(connection.key, now());
      return;
    }
    room.removePlayer(connection.key);
    if (connection.account) seated.delete(connection.account.id);
    if (room.players.size === 0 && !room.persistent) rooms.delete(room.id);
  }

  // ------------------------------------------------------------------------------------------------------------ co-op

  const announce = (game) => {
    for (const player of game.players) byKey.get(player.id)?.send({ t: "waiting", game: game.summary() });
  };

  function leaveGame(connection) {
    const game = connection.game;
    if (!game) return;
    connection.game = null;
    if (game.leave(connection.key)) games.delete(game.id);
    else announce(game);
  }

  function needAccount(connection) {
    if (connection.account) return true;
    connection.error("Sign in to play with others.");
    return false;
  }

  function openGame(connection, { mission, capacity = 2, quick = false } = {}) {
    if (!needAccount(connection)) return;
    if (connection.room) return connection.error("You are in an operation already.");
    const chosen = mission ?? content.pack.missions[0];
    if (!content.pack.missions.includes(chosen)) return connection.error("There is no such operation.");
    leaveGame(connection);
    gameCounter += 1;
    const game = new WaitingGame({ id: `game-${gameCounter}`, host: playerOf(connection), mission: chosen, capacity, quick, now: now() });
    games.set(game.id, game);
    connection.game = game;
    announce(game);
  }

  function joinGame(connection, id) {
    if (!needAccount(connection)) return;
    if (connection.room) return connection.error("You are in an operation already.");
    const game = games.get(id);
    if (!game || game.full) return connection.error("That game is not open any more.");
    leaveGame(connection);
    game.join(playerOf(connection));
    connection.game = game;
    announce(game);
    if (game.quick && game.full) beginGame(game);
  }

  function quickMatch(connection) {
    if (!needAccount(connection)) return;
    const waiting = [...games.values()].find((game) => game.quick && !game.full && !game.players.some((p) => p.id === connection.key));
    if (waiting) joinGame(connection, waiting.id);
    else openGame(connection, { capacity: 2, quick: true });
  }

  /** The game has what it needs: an operation starts and the agents are shared out. */
  function beginGame(game) {
    if (rooms.size >= MAX_ROOMS) return;
    roomCounter += 1;
    const room = new Room({ id: `room-${roomCounter}`, content, mission: game.mission, seed: roomCounter * 7919 + 13 });
    room.startedAt = now();
    room.onFinish = finishCoop;
    rooms.set(room.id, room);
    games.delete(game.id);
    const shares = splitSquad(room.squad, game.players.length);
    game.players.forEach((player, index) => {
      const connection = byKey.get(player.id);
      if (!connection) return;
      connection.game = null;
      seat(connection, room, shares[index], { start: false });
    });
    room.startAll();
  }

  /** A cooperative operation has ended: a win pays every signed-in player the same. */
  function finishCoop(room) {
    const result = resultOf(room.world, room.squad);
    const reward = result.outcome === "success" ? Math.min(3000, 1500 + 50 * result.enemiesDisabled) : 0;
    if (reward > 0) for (const player of room.players.values()) if (player.account) store.addFunds(player.account, reward);
    return { coop: { reward } };
  }

  /** Run the rooms up to the present: each is stepped as often as time says it should have been (never a long burst). */
  function tickRooms() {
    for (const room of rooms.values()) {
      if (room.finished) continue;
      const due = Math.min(5, Math.floor((now() - room.startedAt) / 1000 / FIXED_STEP_SECONDS) - room.world.steps);
      for (let index = 0; index < due; index += 1) room.tick();
      // Somebody who has been away too long is not coming back.
      for (const player of [...room.players.values()]) {
        if (player.away && now() - player.awaySince > AWAY_SECONDS * 1000) {
          room.removePlayer(player.id);
          if (player.account) seated.delete(player.account);
        }
      }
    }
    for (const [id, room] of rooms) {
      if ((!room.persistent && room.players.size === 0) || (room.finished && room.present === 0)) rooms.delete(id);
    }
    for (const [id, seat] of seated) if (!rooms.has(seat.room.id) || seat.room.finished) seated.delete(id);
    for (const [id, game] of games) {
      if (now() - game.createdAt > WAITING_SECONDS * 1000) {
        for (const player of game.players) {
          const connection = byKey.get(player.id);
          if (connection) {
            connection.game = null;
            connection.send({ t: "closed", reason: "Nobody joined in time." });
          }
        }
        games.delete(id);
      }
    }
  }

  let connectionCounter = 0;
  function accept(socketConnection, address) {
    connectionCounter += 1;
    const connection = {
      id: `c${connectionCounter}`,
      key: null,
      socketConnection,
      account: null,
      room: null,
      game: null,
      greeted: false,
      lastHeard: now(),
      send: (message) => socketConnection.send(JSON.stringify(message)),
      error: (message) => connection.send({ t: "error", message }),
    };
    connections.add(connection);
    socketConnection.onMessage = (text) => {
      connection.lastHeard = now();
      const parsed = parseClientMessage(text);
      if (!parsed.ok) return connection.error(`Not understood: ${parsed.error}.`);
      const { message } = parsed;
      if (message.t === "ping") return connection.send({ t: "pong", n: message.n ?? 0 });
      if (!connection.greeted) {
        if (message.t !== "hello") return connection.error("Say hello first.");
        const refusal = checkVersions(message, { content: content.hash });
        if (refusal) {
          connection.send(refusal);
          return socketConnection.close(1000, "refused");
        }
        connection.account = message.token ? store.accountForToken(message.token) : null;
        if (message.token && !connection.account) {
          connection.send({ t: "refused", reason: "account", message: "Your sign-in has run out. Sign in again." });
          return socketConnection.close(1000, "refused");
        }
        connection.greeted = true;
        connection.key = keyOf(connection);
        // Signed in on another page: that one is let go, and this one takes over (and goes back into an operation they were in).
        byKey.get(connection.key)?.socketConnection.close(1000, "signed in elsewhere");
        byKey.set(connection.key, connection);
        connection.send({
          t: "welcome",
          v: PROTOCOL_VERSION,
          core: CORE_VERSION,
          account: connection.account && { id: connection.account.id, name: connection.account.name },
        });
        const seatHeld = connection.account && seated.get(connection.account.id);
        if (seatHeld && !seatHeld.room.finished && rooms.has(seatHeld.room.id)) {
          connection.room = seatHeld.room;
          seatHeld.room.attach(connection.key, sendTo(connection.key));
        }
        return undefined;
      }
      switch (message.t) {
        case "create":
          return startRoom(connection, message.mode, message.mission, message.territory);
        case "lobby":
          return connection.send({ t: "lobby", games: [...games.values()].map((game) => game.summary()) });
        case "open":
          return openGame(connection, message);
        case "join":
          return joinGame(connection, message.game);
        case "quick":
          return quickMatch(connection);
        case "ready":
          if (connection.game) {
            connection.game.setReady(connection.key, message.on);
            announce(connection.game);
          }
          return undefined;
        case "begin":
          if (connection.game?.host !== connection.key) return connection.error("Only the host can begin the game.");
          if (!connection.game.canBegin()) return connection.error("Everyone needs to be ready, and there must be two of you.");
          return beginGame(connection.game);
        case "say": {
          if (!connection.account) return connection.error("Sign in to talk to others.");
          const text = cleanSpeech(message.text);
          if (!text || !speech.take(connection.key)) return undefined;
          const keys = connection.room ? [...connection.room.players.keys()] : (connection.game?.players.map((p) => p.id) ?? []);
          for (const key of keys) byKey.get(key)?.send({ t: "chat", from: connection.account.name, text });
          return undefined;
        }
        case "leave":
          leaveGame(connection);
          return connection.send({ t: "closed", reason: "You left the game." });
        case "command": {
          const result = connection.room?.receive(connection.key, message.seq, message.command) ?? { ok: false, error: "no operation" };
          if (!result.ok) connection.send({ t: "feedback", events: [], refused: { seq: message.seq, error: result.error } });
          return undefined;
        }
        default:
          return undefined;
      }
    };
    socketConnection.onClose = () => {
      leaveGame(connection);
      leaveRoom(connection, { keep: true });
      if (byKey.get(connection.key) === connection) byKey.delete(connection.key);
      connections.delete(connection);
      perAddress.set(address, Math.max(0, (perAddress.get(address) ?? 1) - 1));
    };
    return connection;
  }

  const http = createServer((request, response) => {
    const url = new URL(request.url, "http://localhost");
    if (url.pathname.startsWith("/api/")) {
      handleApi(request, response, url);
    } else {
      json(response, 404, { error: "Not found." });
    }
  });
  http.on("upgrade", (request, socket) => {
    const address = request.socket.remoteAddress ?? "unknown";
    const url = new URL(request.url, "http://localhost");
    if (url.pathname !== "/ws") {
      socket.end("HTTP/1.1 404 Not Found\r\n\r\n");
      return;
    }
    const socketConnection = upgrade(request, socket, {
      check: (incoming) => {
        if (incoming.headers.origin && !allowed(incoming.headers.origin)) return "That site may not play here.";
        if ((perAddress.get(address) ?? 0) >= MAX_CONNECTIONS_PER_ADDRESS) return "Too many connections from here.";
        return null;
      },
    });
    if (!socketConnection) return;
    perAddress.set(address, (perAddress.get(address) ?? 0) + 1);
    accept(socketConnection, address);
  });

  let ticker = null;
  let upkeep = null;
  return {
    http,
    rooms,
    connections,
    content,
    tickRooms,
    /** Start listening. Resolves with the address ("127.0.0.1:port"). */
    listen(port = 0, host = "127.0.0.1") {
      return new Promise((done) => {
        http.listen(port, host, () => {
          if (tickEvery) ticker = setInterval(tickRooms, 1000 * FIXED_STEP_SECONDS);
          // Quiet connections are checked on and, if they have gone, let go.
          upkeep = setInterval(() => {
            for (const connection of connections) {
              if (now() - connection.lastHeard > IDLE_SECONDS * 1000) connection.socketConnection.close(1001, "idle");
              else if (now() - connection.lastHeard > PING_SECONDS * 1000) connection.socketConnection.ping();
            }
            store.purgeExpired();
          }, 10_000);
          done(`${host}:${http.address().port}`);
        });
      });
    },
    async close() {
      clearInterval(ticker);
      clearInterval(upkeep);
      for (const connection of connections) connection.socketConnection.close(1001, "server stopping");
      http.closeAllConnections?.();
      await new Promise((done) => http.close(done));
    },
  };
}
