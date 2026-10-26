// SPDX-License-Identifier: GPL-2.0-or-later

import assert from "node:assert/strict";
import test from "node:test";

import { createRateLimiter, hashPassword, newToken, problemWithName, problemWithPassword, verifyPassword } from "../server/auth.js";
import { SESSION_DAYS, openStore } from "../server/store.js";

test("a password is kept only as a salted hash, and only the right one verifies", async () => {
  const record = await hashPassword("correct horse");
  assert.ok(record.hash && record.salt);
  assert.ok(!JSON.stringify(record).includes("correct horse"));
  assert.equal(await verifyPassword("correct horse", record), true);
  assert.equal(await verifyPassword("wrong horse", record), false);
  assert.notEqual((await hashPassword("correct horse")).hash, record.hash, "a fresh salt each time");
});

test("names and passwords are checked with a sentence for the person", () => {
  const good = ["Anna", "Grey Harbour", "op_7-x", "Ab1", "Skels Team", "O'Neil & Sons Ltd.", "x".repeat(32)];
  for (const name of good) assert.equal(problemWithName(name), null, name);
  for (const bad of ["", "ab", " Anna", "Anna ", "A  B", "x".repeat(33), "bad<name>", "emoji😀", 7, null]) {
    assert.match(problemWithName(bad), /3 to 32/, String(bad));
  }
  assert.equal(problemWithPassword("longenough"), null);
  assert.match(problemWithPassword("short"), /8 characters/);
  assert.match(problemWithPassword("x".repeat(201)), /too long/);
});

test("accounts: names are unique whatever the case, sign-in finds the record, and deleting removes it and its sessions", async () => {
  const store = openStore();
  const record = await hashPassword("a good password");
  const anna = store.createAccount("Anna", record);
  assert.deepEqual([anna.name, typeof anna.id], ["Anna", "number"]);
  assert.equal(store.createAccount("anna", record), null, "taken, whatever the case");
  assert.equal(store.findForLogin("ANNA").id, anna.id);
  assert.equal(store.findForLogin("nobody"), null);
  const token = newToken();
  store.createSession(anna.id, token);
  assert.equal(store.accountForToken(token).name, "Anna");
  store.deleteAccount(anna.id);
  assert.equal(store.accountForToken(token), null, "its sessions went with it");
  assert.equal(store.findForLogin("Anna"), null);
  assert.ok(store.createAccount("Anna", record), "the name is free again");
});

test("sessions: unknown, ended and expired tokens are refused, and the token itself is not stored", async () => {
  let clock = 1_000_000;
  const store = openStore(":memory:", { now: () => clock });
  const anna = store.createAccount("Anna", await hashPassword("a good password"));
  const token = newToken();
  store.createSession(anna.id, token);
  assert.ok(store.accountForToken(token));
  assert.equal(store.accountForToken("x".repeat(40)), null);
  assert.equal(store.accountForToken(undefined), null);
  const stored = store.db.prepare("SELECT token FROM sessions").all();
  assert.ok(stored.every((row) => row.token !== token), "only a hash is kept");
  clock += (SESSION_DAYS + 1) * 86_400_000;
  assert.equal(store.accountForToken(token), null, "expired");
  store.purgeExpired();
  assert.equal(store.db.prepare("SELECT count(*) AS n FROM sessions").get().n, 0);
  const again = newToken();
  store.createSession(anna.id, again);
  store.endSession(again);
  assert.equal(store.accountForToken(again), null, "signed out");
});

test("a rate limiter allows a few things in a window, then waits, and keeps keys apart", () => {
  let clock = 0;
  const limiter = createRateLimiter({ max: 3, windowMs: 1000, now: () => clock });
  assert.deepEqual([1, 2, 3, 4].map(() => limiter.take("a")), [true, true, true, false]);
  assert.equal(limiter.take("b"), true);
  clock = 1500;
  assert.equal(limiter.take("a"), true, "the window has passed");
});
