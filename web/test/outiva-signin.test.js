// SPDX-License-Identifier: GPL-2.0-or-later

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { comeBack, returnAddress, signInAddress } from "../src/outiva-signin.js";

const memory = () => {
  const items = new Map();
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => items.set(key, value),
    removeItem: (key) => items.delete(key),
  };
};
const site = { origin: "https://neuroreign.outiva.com", search: "" };
const settings = { issuer: "https://accounts.outiva.com/realms/outiva", client: "opensynd-web" };

test("the address sent to Outiva asks for a code with PKCE, and a quiet attempt adds prompt=none", async () => {
  const storage = memory();
  const url = new URL(await signInAddress(settings, { silent: true, location: site, storage }));
  assert.equal(url.origin + url.pathname, `${settings.issuer}/protocol/openid-connect/auth`);
  assert.equal(url.searchParams.get("client_id"), "opensynd-web");
  assert.equal(url.searchParams.get("redirect_uri"), returnAddress(site));
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.get("prompt"), "none");
  const kept = JSON.parse(storage.getItem("opensynd.oidc.v1"));
  assert.equal(url.searchParams.get("code_challenge"), createHash("sha256").update(kept.verifier).digest("base64url"));
  const asked = new URL(await signInAddress(settings, { silent: false, location: site, storage }));
  assert.equal(asked.searchParams.has("prompt"), false);
});

test("coming back with a code gives what the server needs, once, and only for the state that was sent", async () => {
  const storage = memory();
  await signInAddress(settings, { silent: false, location: site, storage });
  const kept = JSON.parse(storage.getItem("opensynd.oidc.v1"));
  const back = comeBack({ location: { ...site, search: `?code=abc&state=${kept.state}&session_state=x` }, storage });
  assert.deepEqual(back, { code: "abc", verifier: kept.verifier, nonce: kept.nonce, redirectUri: "https://neuroreign.outiva.com/" });
  assert.equal(storage.getItem("opensynd.oidc.v1"), null, "used up");
  assert.equal(comeBack({ location: { ...site, search: `?code=abc&state=${kept.state}` }, storage }).failed, true, "not twice");
});

test("an answer with the wrong state, or none from a quiet attempt, is a failure, and an ordinary visit is nothing", async () => {
  const storage = memory();
  await signInAddress(settings, { silent: true, location: site, storage });
  assert.equal(comeBack({ location: { ...site, search: "?code=abc&state=forged" }, storage }).failed, true);
  await signInAddress(settings, { silent: true, location: site, storage });
  const kept = JSON.parse(storage.getItem("opensynd.oidc.v1"));
  const refused = comeBack({ location: { ...site, search: `?error=login_required&state=${kept.state}` }, storage });
  assert.deepEqual(refused, { failed: true, silent: true });
  assert.equal(comeBack({ location: { ...site, search: "?server=x" }, storage }), null);
});
