// SPDX-License-Identifier: GPL-2.0-or-later

import assert from "node:assert/strict";
import test from "node:test";

import { cleanSpeech, isBlocked, problemWithName } from "../server/auth.js";
import { withServer } from "./support.js";

async function signUp(context, name) {
  const signed = await context.call("/api/signup", { method: "POST", body: { name, password: "a good password" } });
  return signed.body.token;
}

test("the word list keeps abuse out of names and speech, even lightly disguised", () => {
  assert.equal(isBlocked("what the f u c k"), true);
  assert.equal(isBlocked("sh1t"), true);
  assert.equal(isBlocked("Good game, well played"), false);
  assert.equal(problemWithName("Anna Smith"), null);
  assert.ok(problemWithName("Big Sh1t"));
  assert.equal(cleanSpeech("  nice   one \n"), "nice one");
  assert.equal(cleanSpeech("you are a b1tch"), null);
  assert.equal(cleanSpeech("   "), null);
  assert.equal(cleanSpeech("x".repeat(500)).length, 120);
});

test("friends: ask, accept, see who is on, remove", async () => {
  await withServer(async (context) => {
    const anna = await signUp(context, "Anna");
    const ben = await signUp(context, "Ben");
    const asked = await context.call("/api/friends", { method: "POST", token: anna, body: { name: "Ben", action: "request" } });
    assert.deepEqual(asked.body.outgoing, ["Ben"]);
    assert.deepEqual((await context.call("/api/friends", { token: ben })).body.incoming, ["Anna"]);
    const early = await context.call("/api/friends", { method: "POST", token: anna, body: { name: "Ben", action: "accept" } });
    assert.equal(early.status, 404);
    const accepted = await context.call("/api/friends", { method: "POST", token: ben, body: { name: "Anna", action: "accept" } });
    assert.deepEqual(accepted.body.friends, ["Anna"]);
    const online = await context.connect(ben);
    online.hello();
    await online.next("welcome");
    assert.deepEqual((await context.call("/api/friends", { token: anna })).body.online, ["Ben"]);
    await context.call("/api/friends", { method: "POST", token: anna, body: { name: "Ben", action: "remove" } });
    assert.deepEqual((await context.call("/api/friends", { token: ben })).body.friends, []);
    const nobody = await context.call("/api/friends", { method: "POST", token: anna, body: { name: "Nobody", action: "request" } });
    assert.equal(nobody.status, 404);
    assert.equal((await context.call("/api/friends")).status, 401);
  });
});

test("asking someone who has already asked you makes you friends", async () => {
  await withServer(async (context) => {
    const anna = await signUp(context, "Anna");
    const ben = await signUp(context, "Ben");
    await context.call("/api/friends", { method: "POST", token: anna, body: { name: "Ben", action: "request" } });
    const back = await context.call("/api/friends", { method: "POST", token: ben, body: { name: "Anna", action: "request" } });
    assert.deepEqual(back.body.friends, ["Anna"]);
  });
});

test("a profile shows how a player has done, and nothing private", async () => {
  await withServer(async (context) => {
    await signUp(context, "Anna");
    const profile = await context.call("/api/profile/Anna");
    assert.equal(profile.status, 200);
    assert.equal(profile.body.name, "Anna");
    assert.equal(profile.body.territories, 0);
    assert.equal(profile.body.bestDaily, null);
    assert.equal(JSON.stringify(profile.body).includes("hash"), false);
    assert.equal((await context.call("/api/profile/Nobody")).status, 404);
  });
});

test("people in a game talk to each other; the word list and a rate limit apply", async () => {
  await withServer(async (context) => {
    const anna = await signUp(context, "Anna");
    const ben = await signUp(context, "Ben");
    const a = await context.connect(anna);
    a.hello();
    await a.next("welcome");
    const b = await context.connect(ben);
    b.hello();
    await b.next("welcome");
    a.send({ t: "open", capacity: 2 });
    const game = (await a.next("waiting")).game;
    b.send({ t: "join", game: game.id });
    await b.next("waiting");
    a.send({ t: "say", text: "ready when you are" });
    const heard = await b.next("chat");
    assert.deepEqual({ from: heard.from, text: heard.text }, { from: "Anna", text: "ready when you are" });
    await a.next("chat"); // and the speaker hears it too
    a.send({ t: "say", text: "you b1tch" });
    for (let i = 0; i < 12; i += 1) a.send({ t: "say", text: `hello ${i}` });
    await new Promise((done) => setTimeout(done, 100));
    const chats = b.received.filter((message) => message.t === "chat").map((message) => message.text);
    assert.ok(!chats.some((text) => text.includes("b1tch")));
    assert.ok(chats.length <= 8, "no more than eight in ten seconds");
  });
});

test("reports are kept for the admin, who can close an account", async () => {
  await withServer(
    async (context) => {
      const anna = await signUp(context, "Anna");
      const ben = await signUp(context, "Ben");
      assert.equal((await context.call("/api/report", { method: "POST", token: anna, body: { name: "Ben", reason: "rude" } })).status, 200);
      assert.equal((await context.call("/api/report", { method: "POST", body: { name: "Ben", reason: "x" } })).status, 401);
      const admin = (path, method, body) =>
        fetch(`${context.api}${path}`, {
          method,
          headers: { "x-admin-token": "secret", "Content-Type": "application/json" },
          body: body && JSON.stringify(body),
        });
      assert.equal((await context.call("/api/admin/reports")).status, 403, "not without the token");
      const listed = await (await admin("/api/admin/reports", "GET")).json();
      assert.deepEqual([listed.reports[0].reporter, listed.reports[0].reported, listed.reports[0].reason], ["Anna", "Ben", "rude"]);
      const live = await context.connect(ben);
      live.hello();
      await live.next("welcome");
      assert.equal((await admin("/api/admin/ban", "POST", { name: "Ben" })).status, 200);
      await new Promise((done) => setTimeout(done, 100));
      assert.equal(live.socket.readyState > 1, true, "their connection was closed");
      assert.equal((await context.call("/api/me", { token: ben })).status, 401, "their sign-in no longer works");
      const login = await context.call("/api/login", { method: "POST", body: { name: "Ben", password: "a good password" } });
      assert.equal(login.status, 403);
      await admin("/api/admin/ban", "POST", { name: "Ben", banned: false });
      assert.equal((await context.call("/api/login", { method: "POST", body: { name: "Ben", password: "a good password" } })).status, 200);
    },
    { adminToken: "secret" },
  );
});
