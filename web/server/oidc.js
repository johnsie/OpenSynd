// SPDX-License-Identifier: GPL-2.0-or-later

// Signing in with an Outiva account (OpenID Connect, https://accounts.outiva.com). The page sends the server the authorisation code it
// got back; the server swaps it for an ID token (a public client with PKCE, so there is no secret), checks the token's signature
// against the issuer's published keys and its issuer, audience, expiry and nonce, and takes the player's identity from the token's
// stable `sub`. Nothing else about the account is kept: the display name is made from the preferred username once.
import { createPublicKey, randomBytes, verify } from "node:crypto";

import { problemWithName } from "./auth.js";

export const DEFAULT_ISSUER = "https://accounts.outiva.com/realms/outiva";
export const DEFAULT_CLIENT = "opensynd-web";
const KEYS_KEPT_MS = 10 * 60_000;

const decode = (part) => Buffer.from(part, "base64url");
const json = (part) => JSON.parse(decode(part).toString("utf8"));

export function createOidc({ issuer = DEFAULT_ISSUER, client = DEFAULT_CLIENT, fetchFn = globalThis.fetch, now = () => Date.now() } = {}) {
  let keys = null;
  let keysAt = -Infinity;

  async function keyFor(kid, refresh = false) {
    if (!keys || refresh || now() - keysAt > KEYS_KEPT_MS) {
      const response = await fetchFn(`${issuer}/protocol/openid-connect/certs`);
      if (!response.ok) throw new Error("could not fetch the issuer's keys");
      keys = (await response.json()).keys ?? [];
      keysAt = now();
    }
    return keys.find((key) => key.kid === kid && key.kty === "RSA" && (key.use === undefined || key.use === "sig"));
  }

  /** Check an ID token and return its claims, or throw with the reason. */
  async function verifyToken(token, nonce) {
    const parts = typeof token === "string" ? token.split(".") : [];
    if (parts.length !== 3) throw new Error("not a token");
    const header = json(parts[0]);
    if (header.alg !== "RS256") throw new Error("unexpected algorithm");
    const jwk = (await keyFor(header.kid)) ?? (await keyFor(header.kid, true));
    if (!jwk) throw new Error("unknown key");
    const good = verify("sha256", Buffer.from(`${parts[0]}.${parts[1]}`), createPublicKey({ key: jwk, format: "jwk" }), decode(parts[2]));
    if (!good) throw new Error("bad signature");
    const claims = json(parts[1]);
    const audience = [claims.aud].flat();
    if (claims.iss !== issuer) throw new Error("wrong issuer");
    if (!audience.includes(client)) throw new Error("wrong audience");
    if (typeof claims.exp !== "number" || claims.exp * 1000 < now()) throw new Error("token has expired");
    if (typeof claims.sub !== "string" || claims.sub === "") throw new Error("no subject");
    if (nonce !== undefined && claims.nonce !== nonce) throw new Error("wrong nonce");
    return claims;
  }

  return {
    issuer,
    client,
    verifyToken,

    /** Swap the code the page was given for the player's verified claims. */
    async exchange({ code, verifier, redirectUri, nonce }) {
      const response = await fetchFn(`${issuer}/protocol/openid-connect/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: client,
          code,
          code_verifier: verifier,
          redirect_uri: redirectUri,
        }),
      });
      if (!response.ok) throw new Error("the code was not accepted");
      const body = await response.json();
      return verifyToken(body.id_token, nonce);
    },
  };
}

/** A display name for a new account, from what the identity service says, that is allowed and not taken. */
export function displayNameFor(claims, taken) {
  const source = String(claims.preferred_username ?? claims.name ?? claims.given_name ?? "").split("@")[0];
  let base = source.replace(/[^A-Za-z0-9 _-]/g, "").replace(/\s+/g, " ").trim().slice(0, 16);
  if (base.length < 3 || problemWithName(base)) base = "Agent";
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const name = attempt === 0 ? base : `${base} ${1 + Math.floor(Math.random() * 9999)}`;
    if (!problemWithName(name) && !taken(name)) return name;
  }
  return `Agent ${randomBytes(4).toString("hex")}`.slice(0, 20);
}
