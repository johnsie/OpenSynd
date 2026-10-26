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
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      account INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      expires INTEGER NOT NULL
    );
  `);
  const statements = {
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

    endSession: (token) => statements.deleteSession.run(sha256(token)),
    purgeExpired: () => statements.deleteExpired.run(now()),
    close: () => db.close(),
  };
}
