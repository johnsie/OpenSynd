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
  const statements = {
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
    byName: db.prepare("SELECT id, name, salt, hash, created FROM accounts WHERE name = ?"),
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
        return publicAccount(statements.byId.get(result.lastInsertRowid));
      } catch (error) {
        if (/UNIQUE/.test(error.message)) return null;
        throw error;
      }
    },

    /** The account with this name, with its password record (for checking a sign-in), or null. */
    findForLogin(name) {
      const row = statements.byName.get(name);
      return row ? { ...publicAccount(row), salt: row.salt, hash: row.hash } : null;
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

    funds: (account) => Number(statements.funds.get(account)?.funds ?? 0),
    addFunds: (account, amount) => statements.addFunds.run(amount, account),
    choreDays: (account) => new Set(statements.choreDays.all(account).map((row) => Number(row.day))),
    choresOn: (account, day) => statements.choresOn.all(account, day).map((row) => row.chore),

    endSession: (token) => statements.deleteSession.run(sha256(token)),
    purgeExpired: () => statements.deleteExpired.run(now()),
    close: () => db.close(),
  };
}
