// SPDX-License-Identifier: GPL-2.0-or-later

// The page's half of signing in with an Outiva account (OpenID Connect, authorisation code with PKCE). The page sends the browser to
// the identity service and, when it comes back with a code, hands the code to the game server (online.js), which does the rest. A quiet
// attempt (prompt=none) lets someone already signed in to Outiva be signed in here without doing anything.
const KEEP = "opensynd.oidc.v1";
const urlSafe = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, (c) => ({ "+": "-", "/": "_", "=": "" })[c]);
const randomText = (bytes) => urlSafe(crypto.getRandomValues(new Uint8Array(bytes)));
const challengeOf = async (verifier) => urlSafe(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));

/** Where the identity service sends the browser back to: the site's front page. */
export const returnAddress = (location) => `${location.origin}/`;

/** The address to send the browser to, remembering what is needed when it comes back. `silent` asks without showing any page. */
export async function signInAddress({ issuer, client }, { silent, location, storage }) {
  const kept = { state: randomText(16), nonce: randomText(16), verifier: randomText(48), silent: Boolean(silent) };
  storage.setItem(KEEP, JSON.stringify(kept));
  const query = new URLSearchParams({
    client_id: client,
    redirect_uri: returnAddress(location),
    response_type: "code",
    scope: "openid profile",
    state: kept.state,
    nonce: kept.nonce,
    code_challenge: await challengeOf(kept.verifier),
    code_challenge_method: "S256",
  });
  if (silent) query.set("prompt", "none");
  return `${issuer}/protocol/openid-connect/auth?${query}`;
}

/**
 * If the browser has just come back from the identity service, what it brought: { code, verifier, nonce, redirectUri } to give the
 * game server, { failed: true, silent } if it came back with nothing (not signed in there, or declined), or null if it did not.
 */
export function comeBack({ location, storage }) {
  const query = new URLSearchParams(location.search);
  if (!query.has("state") || (!query.has("code") && !query.has("error"))) return null;
  let kept = null;
  try {
    kept = JSON.parse(storage.getItem(KEEP) ?? "null");
    storage.removeItem(KEEP);
  } catch {
    // Nothing kept: the answer cannot be trusted.
  }
  if (!kept || kept.state !== query.get("state")) return { failed: true, silent: false };
  if (!query.has("code")) return { failed: true, silent: kept.silent };
  return { code: query.get("code"), verifier: kept.verifier, nonce: kept.nonce, redirectUri: returnAddress(location) };
}
