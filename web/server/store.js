// SPDX-License-Identifier: GPL-2.0-or-later

// Everything the server remembers, in one SQLite file (built into Node, so nothing to install). Only what the game needs is kept:
// a display name, a password hash, sessions, and later scores and replays. Everything goes through these functions, so a bigger
// database could replace this file without the rest of the server noticing.
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

const sha256 = (text) => createHash("sha256").update(text).digest("hex");

export const SESSION_DAYS = 30;

export function openStore(path = ":memory:", { now = Date.now } = {}) {
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE COLLATE NOCASE,
      salt TEXT NOT NULL,
      hash TEXT NOT NULL,
      created INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS runs (
      id INTEGER PRIMARY KEY,
      account INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      day INTEGER NOT NULL,
      mode TEXT NOT NULL,
      mission TEXT NOT NULL,
      seed INTEGER NOT NULL,
      outcome TEXT NOT NULL,
      seconds INTEGER NOT NULL,
      lost INTEGER NOT NULL,
      score INTEGER NOT NULL,
      recording TEXT NOT NULL,
      created INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS runs_by_day ON runs (mode, day, score DESC);
    CREATE TABLE IF NOT EXISTS chores (
      account INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      day INTEGER NOT NULL,
      chore TEXT NOT NULL,
      reward INTEGER NOT NULL,
      PRIMARY KEY (account, day, chore)
    );
    CREATE TABLE IF NOT EXISTS territories (
      id TEXT PRIMARY KEY,
      owner INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
      defence INTEGER NOT NULL DEFAULT 1,
      shield_until INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS raids (
      id INTEGER PRIMARY KEY,
      territory TEXT NOT NULL,
      attacker INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      defender INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
      outcome TEXT NOT NULL,
      run INTEGER,
      level INTEGER NOT NULL,
      created INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS oidc_links (
      subject TEXT PRIMARY KEY,
      account INTEGER NOT NULL UNIQUE REFERENCES accounts(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS friends (
      requester INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      target INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      accepted INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (requester, target)
    );
    CREATE TABLE IF NOT EXISTS reports (
      id INTEGER PRIMARY KEY,
      reporter INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      reported INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      reason TEXT NOT NULL,
      created INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      account INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      expires INTEGER NOT NULL
    );
  `);
  // An account's balance (what chores and, later, raids pay) was added after the first version: older files gain it.
  if (!db.prepare("PRAGMA table_info(accounts)").all().some((column) => column.name === "funds")) {
    db.exec("ALTER TABLE accounts ADD COLUMN funds INTEGER NOT NULL DEFAULT 0");
  }
  if (!db.prepare("PRAGMA table_info(accounts)").all().some((column) => column.name === "collected")) {
    db.exec("ALTER TABLE accounts ADD COLUMN collected INTEGER NOT NULL DEFAULT 0");
  }
  if (!db.prepare("PRAGMA table_info(accounts)").all().some((column) => column.name === "banned")) {
    db.exec("ALTER TABLE accounts ADD COLUMN banned INTEGER NOT NULL DEFAULT 0");
  }
  const statements = {
    oidcAccount: db.prepare("SELECT account FROM oidc_links WHERE subject = ?"),
    oidcLink: db.prepare("INSERT INTO oidc_links (subject, account) VALUES (?, ?)"),
    oidcOf: db.prepare("SELECT subject FROM oidc_links WHERE account = ?"),
    nameTaken: db.prepare("SELECT 1 FROM accounts WHERE name = ?"),
    rename: db.prepare("UPDATE accounts SET name = ? WHERE id = ?"),
    friendRows: db.prepare(`
      SELECT friends.requester AS requester, friends.target AS target, friends.accepted AS accepted,
             requester_account.name AS requester_name, target_account.name AS target_name
      FROM friends JOIN accounts AS requester_account ON requester_account.id = friends.requester
                   JOIN accounts AS target_account ON target_account.id = friends.target
      WHERE friends.requester = ? OR friends.target = ?`),
    friendLink: db.prepare("SELECT accepted FROM friends WHERE requester = ? AND target = ?"),
    insertFriend: db.prepare("INSERT OR IGNORE INTO friends (requester, target, accepted) VALUES (?, ?, 0)"),
    acceptFriend: db.prepare("UPDATE friends SET accepted = 1 WHERE requester = ? AND target = ?"),
    removeFriend: db.prepare("DELETE FROM friends WHERE (requester = ? AND target = ?) OR (requester = ? AND target = ?)"),
    insertReport: db.prepare("INSERT INTO reports (reporter, reported, reason, created) VALUES (?, ?, ?, ?)"),
    reports: db.prepare(`
      SELECT reports.id AS id, reporter.name AS reporter, reported.name AS reported, reports.reason AS reason, reports.created AS created
      FROM reports JOIN accounts AS reporter ON reporter.id = reports.reporter JOIN accounts AS reported ON reported.id = reports.reported
      ORDER BY reports.id DESC LIMIT ?`),
    setBanned: db.prepare("UPDATE accounts SET banned = ? WHERE id = ?"),
    banned: db.prepare("SELECT banned FROM accounts WHERE id = ?"),
    profile: db.prepare(`
      SELECT accounts.created AS created,
        (SELECT count(*) FROM territories WHERE owner = accounts.id) AS territories,
        (SELECT count(*) FROM raids WHERE attacker = accounts.id AND outcome = 'captured') AS raidsWon,
        (SELECT count(*) FROM raids WHERE attacker = accounts.id AND outcome = 'defended') AS raidsLost,
        (SELECT count(*) FROM raids WHERE defender = accounts.id AND outcome = 'defended') AS defended,
        (SELECT count(*) FROM raids WHERE defender = accounts.id AND outcome = 'captured') AS lost,
        (SELECT max(score) FROM runs WHERE account = accounts.id AND mode = 'daily') AS bestDaily,
        (SELECT count(*) FROM runs WHERE account = accounts.id AND mode = 'daily' AND score > 0) AS dailyWins,
        (SELECT count(*) FROM chores WHERE account = accounts.id) AS chores
      FROM accounts WHERE accounts.id = ?`),
    holdings: db.prepare(
      "SELECT territories.id AS id, territories.owner AS owner, accounts.name AS name, territories.defence AS defence, territories.shield_until AS shield FROM territories LEFT JOIN accounts ON accounts.id = territories.owner",
    ),
    claim: db.prepare(
      "INSERT INTO territories (id, owner, defence, shield_until) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET owner = excluded.owner, defence = excluded.defence, shield_until = excluded.shield_until",
    ),
    ownedBy: db.prepare("SELECT id FROM territories WHERE owner = ?"),
    setDefence: db.prepare("UPDATE territories SET defence = ? WHERE id = ?"),
    spend: db.prepare("UPDATE accounts SET funds = funds - ? WHERE id = ? AND funds >= ?"),
    collectedAt: db.prepare("SELECT collected FROM accounts WHERE id = ?"),
    setCollected: db.prepare("UPDATE accounts SET collected = ? WHERE id = ?"),
    insertRaid: db.prepare(
      "INSERT INTO raids (territory, attacker, defender, outcome, run, level, created) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ),
    recentRaids: db.prepare(`
      SELECT raids.id AS id, raids.territory AS territory, raids.outcome AS outcome, raids.run AS run, raids.level AS level,
             raids.created AS created, attacker.name AS attacker, defender.name AS defender
      FROM raids JOIN accounts AS attacker ON attacker.id = raids.attacker LEFT JOIN accounts AS defender ON defender.id = raids.defender
      WHERE raids.attacker = ? OR raids.defender = ? ORDER BY raids.id DESC LIMIT ?`),
    getMeta: db.prepare("SELECT value FROM meta WHERE key = ?"),
    setMeta: db.prepare("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"),
    clearWorld: db.prepare("DELETE FROM territories"),
    insertRun: db.prepare(
      "INSERT INTO runs (account, day, mode, mission, seed, outcome, seconds, lost, score, recording, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ),
    bestRun: db.prepare(
      "SELECT id, score, seconds, lost FROM runs WHERE account = ? AND mode = ? AND day BETWEEN ? AND ? ORDER BY score DESC, seconds ASC LIMIT 1",
    ),
    board: db.prepare(`
      SELECT accounts.name AS name, best.score AS score, best.seconds AS seconds, best.lost AS lost, best.id AS run
      FROM (
        SELECT account, id, score, seconds, lost,
               ROW_NUMBER() OVER (PARTITION BY account ORDER BY score DESC, seconds ASC) AS place
        FROM runs WHERE mode = ? AND day BETWEEN ? AND ? AND score > 0
      ) AS best JOIN accounts ON accounts.id = best.account
      WHERE best.place = 1 ORDER BY best.score DESC, best.seconds ASC, accounts.name ASC LIMIT ?`),
    runRecording: db.prepare(
      "SELECT runs.recording AS recording, accounts.name AS name, runs.day AS day FROM runs JOIN accounts ON accounts.id = runs.account WHERE runs.id = ?",
    ),
    claimChore: db.prepare("INSERT OR IGNORE INTO chores (account, day, chore, reward) VALUES (?, ?, ?, ?)"),
    addFunds: db.prepare("UPDATE accounts SET funds = funds + ? WHERE id = ?"),
    funds: db.prepare("SELECT funds FROM accounts WHERE id = ?"),
    choreDays: db.prepare("SELECT DISTINCT day FROM chores WHERE account = ?"),
    choresOn: db.prepare("SELECT chore, reward FROM chores WHERE account = ? AND day = ?"),
    insertAccount: db.prepare("INSERT INTO accounts (name, salt, hash, created) VALUES (?, ?, ?, ?)"),
    byName: db.prepare("SELECT id, name, salt, hash, created, banned FROM accounts WHERE name = ?"),
    byId: db.prepare("SELECT id, name, created FROM accounts WHERE id = ?"),
    deleteAccount: db.prepare("DELETE FROM accounts WHERE id = ?"),
    insertSession: db.prepare("INSERT INTO sessions (token, account, expires) VALUES (?, ?, ?)"),
    session: db.prepare("SELECT account, expires FROM sessions WHERE token = ?"),
    deleteSession: db.prepare("DELETE FROM sessions WHERE token = ?"),
    deleteExpired: db.prepare("DELETE FROM sessions WHERE expires < ?"),
  };
  const publicAccount = (row) => (row ? { id: Number(row.id), name: row.name, created: Number(row.created) } : null);

  return {
    db,

    /** Add an account. Returns it, or null if the name is already taken. */
    createAccount(name, { salt, hash }) {
      try {
        const result = statements.insertAccount.run(name, salt, hash, now());
        statements.setCollected.run(now(), Number(result.lastInsertRowid));
        return publicAccount(statements.byId.get(result.lastInsertRowid));
      } catch (error) {
        if (/UNIQUE/.test(error.message)) return null;
        throw error;
      }
    },

    /** The account with this name, with its password record (for checking a sign-in), or null. */
    findForLogin(name) {
      const row = statements.byName.get(name);
      return row ? { ...publicAccount(row), salt: row.salt, hash: row.hash, banned: Number(row.banned) === 1 } : null;
    },

    getAccount: (id) => publicAccount(statements.byId.get(id)),

    /** Delete an account and everything tied to it. */
    deleteAccount(id) {
      statements.deleteAccount.run(id);
    },

    /** Start a session for an account. Only a hash of the token is kept, so a stolen database is no use for signing in. */
    createSession(accountId, token) {
      statements.insertSession.run(sha256(token), accountId, now() + SESSION_DAYS * 86_400_000);
    },

    /** The account a session token belongs to, or null if it is unknown or has run out. */
    accountForToken(token) {
      if (typeof token !== "string" || token.length < 20) return null;
      const row = statements.session.get(sha256(token));
      if (!row || Number(row.expires) < now()) return null;
      if (Number(statements.banned.get(row.account)?.banned ?? 0) === 1) return null; // a closed account's sign-ins stop working
      return publicAccount(statements.byId.get(row.account));
    },

    // ------------------------------------------------------------------------------------------------ runs and chores

    /** Keep a finished operation: how it went, and the recording that plays it back. Returns its id. */
    recordRun({ account, day, mode, mission, seed, outcome, seconds, lost, score, recording }) {
      const text = JSON.stringify(recording);
      const result = statements.insertRun.run(account, day, mode, mission, seed, outcome, seconds, lost, score, text, now());
      return Number(result.lastInsertRowid);
    },

    /** An account's best run of a mode in a range of days, or null. */
    bestRun(account, mode, fromDay, toDay = fromDay) {
      const row = statements.bestRun.get(account, mode, fromDay, toDay);
      return row ? { id: Number(row.id), score: Number(row.score), seconds: Number(row.seconds), lost: Number(row.lost) } : null;
    },

    /** The best run of each player in a range of days, best first. */
    board(mode, fromDay, toDay, limit = 10) {
      return statements.board.all(mode, fromDay, toDay, limit).map((row, index) => ({
        rank: index + 1,
        name: row.name,
        score: Number(row.score),
        seconds: Number(row.seconds),
        lost: Number(row.lost),
        run: Number(row.run),
      }));
    },

    /** A kept run's recording, with its player's name and day, or null. */
    runRecording(id) {
      const row = statements.runRecording.get(id);
      return row ? { name: row.name, day: Number(row.day), recording: JSON.parse(row.recording) } : null;
    },

    /** Pay a chore once: returns true if it was newly claimed (and the reward is added to the account), false if already done. */
    claimChore(account, day, chore, reward) {
      const result = statements.claimChore.run(account, day, chore, reward);
      if (Number(result.changes) === 0) return false;
      statements.addFunds.run(reward, account);
      return true;
    },

    // ------------------------------------------------------------------------------------------------ the shared world

    /** Who holds what: a Map from territory id to { owner, name, defence, shield }. Territories nobody has taken are not in it. */
    holdings: () =>
      new Map(
        statements.holdings.all().map((row) => [
          row.id,
          { owner: row.owner === null ? null : Number(row.owner), name: row.name, defence: Number(row.defence), shield: Number(row.shield) },
        ]),
      ),
    claim: (id, owner, defence, shieldUntil) => statements.claim.run(id, owner, defence, shieldUntil),
    ownedBy: (account) => statements.ownedBy.all(account).map((row) => row.id),
    setDefence: (id, level) => statements.setDefence.run(level, id),

    /** Take funds from an account if it has them. Returns whether it did. */
    spendFunds: (account, amount) => Number(statements.spend.run(amount, account, amount).changes) > 0,
    collectedAt: (account) => Number(statements.collectedAt.get(account)?.collected ?? 0),
    setCollected: (account, time) => statements.setCollected.run(time, account),

    logRaid: ({ territory, attacker, defender, outcome, run, level }) =>
      Number(statements.insertRaid.run(territory, attacker, defender, outcome, run, level, now()).lastInsertRowid),
    recentRaids: (account, limit = 10) =>
      statements.recentRaids.all(account, account, limit).map((row) => ({ ...row, id: Number(row.id), created: Number(row.created) })),

    /**
     * Work every won run's score out again with `scoreOf({ seconds, lost })`, once for each formula number (so a changed formula
     * reaches the runs already kept, and the boards stay fair between old and new).
     */
    rescoreOnce(formula, scoreOf) {
      if (Number(statements.getMeta.get("score-formula")?.value ?? 0) >= formula) return false;
      const update = db.prepare("UPDATE runs SET score = ? WHERE id = ?");
      for (const row of db.prepare("SELECT id, seconds, lost FROM runs WHERE outcome = 'success'").all()) {
        update.run(scoreOf(Number(row.seconds), Number(row.lost)), row.id);
      }
      statements.setMeta.run("score-formula", String(formula));
      return true;
    },
    season: () => Number(statements.getMeta.get("season")?.value ?? 0),
    /** A new season: every territory is nobody's again (funds and the raid log stay). */
    newSeason(season) {
      statements.clearWorld.run();
      statements.setMeta.run("season", String(season));
    },

    // ------------------------------------------------------------------------------------------------ Outiva (OpenID Connect) accounts

    /** The account an identity (its `sub`) belongs to, or null. */
    accountForSubject(subject) {
      const row = statements.oidcAccount.get(subject);
      return row ? publicAccount(statements.byId.get(row.account)) : null;
    },
    linkSubject: (subject, account) => statements.oidcLink.run(subject, account),
    isLinked: (account) => Boolean(statements.oidcOf.get(account)),
    /** Change an account's display name. Returns false if somebody else has it. */
    renameAccount(account, name) {
      try {
        statements.rename.run(name, account);
        return true;
      } catch (error) {
        if (/UNIQUE/.test(error.message)) return false;
        throw error;
      }
    },
    nameTaken: (name) => Boolean(statements.nameTaken.get(name)),

    // --------------------------------------------------------------------------------------- friends, reports, bans, profiles

    /** Who is a friend, who has asked, and who has been asked, for an account. */
    friends(account) {
      const accepted = [];
      const incoming = [];
      const outgoing = [];
      for (const row of statements.friendRows.all(account, account)) {
        const mine = Number(row.requester) === account;
        const other = mine ? row.target_name : row.requester_name;
        if (Number(row.accepted) === 1) accepted.push(other);
        else (mine ? outgoing : incoming).push(other);
      }
      return { friends: accepted.sort(), incoming: incoming.sort(), outgoing: outgoing.sort() };
    },

    /** Ask to be friends (or, if they have already asked you, become friends). Returns "asked", "friends" or "already". */
    requestFriend(account, other) {
      if (statements.friendLink.get(other, account)) {
        statements.acceptFriend.run(other, account);
        return "friends";
      }
      if (statements.friendLink.get(account, other)) return "already";
      statements.insertFriend.run(account, other);
      return "asked";
    },

    /** Accept a request somebody made to you. Returns whether there was one. */
    acceptFriend(account, other) {
      if (!statements.friendLink.get(other, account)) return false;
      statements.acceptFriend.run(other, account);
      return true;
    },

    removeFriend: (account, other) => statements.removeFriend.run(account, other, other, account),

    report: (reporter, reported, reason) => statements.insertReport.run(reporter, reported, reason, now()),
    reports: (limit = 50) => statements.reports.all(limit).map((row) => ({ ...row, id: Number(row.id), created: Number(row.created) })),
    setBanned: (account, banned) => statements.setBanned.run(banned ? 1 : 0, account),
    isBanned: (account) => Number(statements.banned.get(account)?.banned ?? 0) === 1,

    /** What others may see of an account: when it began and how it has gone. */
    profile(account) {
      const row = statements.profile.get(account);
      if (!row) return null;
      const number = (value) => Number(value ?? 0);
      return {
        since: number(row.created),
        territories: number(row.territories),
        raidsWon: number(row.raidsWon),
        raidsLost: number(row.raidsLost),
        defended: number(row.defended),
        lost: number(row.lost),
        bestDaily: row.bestDaily === null ? null : number(row.bestDaily),
        dailyWins: number(row.dailyWins),
        chores: number(row.chores),
      };
    },

    funds: (account) => Number(statements.funds.get(account)?.funds ?? 0),
    addFunds: (account, amount) => statements.addFunds.run(amount, account),
    choreDays: (account) => new Set(statements.choreDays.all(account).map((row) => Number(row.day))),
    choresOn: (account, day) => statements.choresOn.all(account, day).map((row) => row.chore),

    endSession: (token) => statements.deleteSession.run(sha256(token)),
    purgeExpired: () => statements.deleteExpired.run(now()),
    close: () => db.close(),
  };
}
