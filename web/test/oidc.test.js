// SPDX-License-Identifier: GPL-2.0-or-later

import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import test from "node:test";

import { createOidc, displayNameFor } from "../server/oidc.js";
import { withServer } from "./support.js";

const ISSUER = "https://id.example/realms/outiva";
const CLIENT = "opensynd-web";
const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: "jwk" }), kid: "k1", use: "sig", alg: "RS256" };
const b64 = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");

function token(claims, { key = privateKey, kid = "k1" } = {}) {
  const body = { iss: ISSUER, aud: CLIENT, exp: Math.floor(Date.now() / 1000) + 300, sub: "user-1", nonce: "n1", ...claims };
  const head = `${b64({ alg: "RS256", kid })}.${b64(body)}`;
  return `${head}.${sign("sha256", Buffer.from(head), key).toString("base64url")}`;
}

// A stand-in for the identity service: its keys, and a token endpoint that hands back whichever ID token the test has set.
function fakeIssuer() {
  const state = { idToken: token({}), requests: [] };
  const fetchFn = async (url, options) => {
    if (url.endsWith("/certs")) return { ok: true, json: async () => ({ keys: [jwk] }) };
    state.requests.push(Object.fromEntries(options.body));
    return state.idToken ? { ok: true, json: async () => ({ id_token: state.idToken }) } : { ok: false };
  };
  return { state, fetchFn };
}

test("an ID token is accepted only if it is signed by the issuer's key and is for this game, in time, with this nonce", async () => {
  const { fetchFn } = fakeIssuer();
  const oidc = createOidc({ issuer: ISSUER, client: CLIENT, fetchFn });
  assert.equal((await oidc.verifyToken(token({}), "n1")).sub, "user-1");
  const other = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey;
  await assert.rejects(oidc.verifyToken(token({}, { key: other }), "n1"), /signature/);
  await assert.rejects(oidc.verifyToken(token({ iss: "https://evil.example" }), "n1"), /issuer/);
  await assert.rejects(oidc.verifyToken(token({ aud: "another-game" }), "n1"), /audience/);
  await assert.rejects(oidc.verifyToken(token({ exp: 1 }), "n1"), /expired/);
  await assert.rejects(oidc.verifyToken(token({}), "different"), /nonce/);
  await assert.rejects(oidc.verifyToken(token({}, { kid: "nope" }), "n1"), /unknown key/);
  await assert.rejects(oidc.verifyToken("a.b", "n1"), /not a token/);
  const none = `${b64({ alg: "none" })}.${b64({ iss: ISSUER, aud: CLIENT, sub: "x" })}.`;
  await assert.rejects(oidc.verifyToken(none, "n1"), /algorithm/);
});

test("an internal address is used for the identity service, still asking for the public name", async () => {
  const seen = [];
  const fetchFn = async (address, options = {}) => {
    seen.push({ address, headers: options.headers });
    return { ok: true, json: async () => ({ keys: [jwk] }) };
  };
  const oidc = createOidc({ issuer: ISSUER, client: CLIENT, fetchFn, internal: "http://127.0.0.1:8180/" });
  await oidc.verifyToken(token({}), "n1");
  assert.equal(seen[0].address, "http://127.0.0.1:8180/realms/outiva/protocol/openid-connect/certs");
  assert.equal(seen[0].headers.Host, "id.example");
  assert.equal(seen[0].headers["X-Forwarded-Proto"], "https");
});

test("a new Outiva account gets a made-up codename, never anything from the identity, and it is unique", () => {
  const taken = new Set();
  const names = new Set();
  for (let i = 0; i < 40; i += 1) {
    const name = displayNameFor((n) => taken.has(n));
    assert.match(name, /^[A-Z][a-z]+ [A-Z][a-z]+ \d\d$/);
    taken.add(name);
    names.add(name);
  }
  assert.equal(names.size, 40);
  assert.match(displayNameFor(() => true), /^Agent [0-9a-f]+$/, "when every codename is taken");
});

test("signing in with Outiva makes an account once, and the same identity gets it back", async () => {
  const { state, fetchFn } = fakeIssuer();
  await withServer(
    async (context) => {
      const health = await context.call("/api/health");
      assert.deepEqual(health.body.oidc, { issuer: ISSUER, client: CLIENT });
      const body = { code: "c", verifier: "v", redirectUri: "https://game.example/", nonce: "n1" };
      state.idToken = token({ preferred_username: "Casey" });
      const first = await context.call("/api/oidc/code", { method: "POST", body });
      assert.equal(first.status, 200);
      assert.doesNotMatch(first.body.account.name, /Casey/i, "the display name is not taken from the Outiva username");
      const codename = first.body.account.name;
      assert.equal(state.requests[0].code_verifier, "v");
      assert.equal(state.requests[0].client_id, CLIENT);
      assert.equal((await context.call("/api/me", { token: first.body.token })).status, 200);
      assert.ok(context.store.funds(first.body.account.id) > 0, "starting funds, like any new account");
      state.idToken = token({ preferred_username: "Changed Name" });
      const again = await context.call("/api/oidc/code", { method: "POST", body });
      assert.equal(again.body.account.id, first.body.account.id, "the same identity is the same account");
      assert.equal(again.body.account.name, codename);
      // They choose their own name; it must be allowed and free.
      const rename = (name) => context.call("/api/rename", { method: "POST", token: again.body.token, body: { name } });
      assert.equal((await rename("x")).status, 400);
      assert.equal((await rename("Big Sh1t")).status, 400);
      const taken = await context.call("/api/signup", { method: "POST", body: { name: "Taken Name", password: "a good password" } });
      assert.equal(taken.status, 201);
      assert.equal((await rename("taken name")).status, 409);
      assert.equal((await rename("Casey")).status, 200);
      assert.equal((await context.call("/api/me", { token: again.body.token })).body.account.name, "Casey");
      // It has no password to sign in with, and deleting it is confirmed by name.
      const login = await context.call("/api/login", { method: "POST", body: { name: "Casey", password: "anything at all" } });
      assert.equal(login.status, 401);
      const refused = await context.call("/api/account", { method: "DELETE", token: again.body.token, body: { confirm: "No" } });
      assert.equal(refused.status, 403);
      const deleted = await context.call("/api/account", { method: "DELETE", token: again.body.token, body: { confirm: "Casey" } });
      assert.equal(deleted.status, 200);
    },
    { oidc: createOidc({ issuer: ISSUER, client: CLIENT, fetchFn }) },
  );
});

test("a refused code, a wrong nonce or a closed account does not sign anybody in", async () => {
  const { state, fetchFn } = fakeIssuer();
  await withServer(
    async (context) => {
      const body = { code: "c", verifier: "v", redirectUri: "https://game.example/", nonce: "n1" };
      state.idToken = null;
      assert.equal((await context.call("/api/oidc/code", { method: "POST", body })).status, 401);
      state.idToken = token({ preferred_username: "Dana" });
      assert.equal((await context.call("/api/oidc/code", { method: "POST", body: { ...body, nonce: "other" } })).status, 401);
      assert.equal((await context.call("/api/oidc/code", { method: "POST", body: { code: "c" } })).status, 400);
      const ok = await context.call("/api/oidc/code", { method: "POST", body });
      context.store.setBanned(ok.body.account.id, true);
      assert.equal((await context.call("/api/oidc/code", { method: "POST", body })).status, 403);
    },
    { oidc: createOidc({ issuer: ISSUER, client: CLIENT, fetchFn }) },
  );
  await withServer(async (context) => {
    assert.equal((await context.call("/api/oidc/code", { method: "POST", body: {} })).status, 404);
  }, { oidc: null });
});
