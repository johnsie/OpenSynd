// SPDX-License-Identifier: GPL-2.0-or-later

// Passwords, names and limits. Passwords are never kept: only a slow salted hash (scrypt, built into Node).
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const KEY_LENGTH = 32;
const hashWith = (password, salt) =>
  new Promise((done, fail) => {
    scrypt(password, salt, KEY_LENGTH, { N: 16384, r: 8, p: 1 }, (error, key) => (error ? fail(error) : done(key)));
  });

/** { salt, hash } for a password, both as text, to be stored. */
export async function hashPassword(password) {
  const salt = randomBytes(16);
  return { salt: salt.toString("base64"), hash: (await hashWith(password, salt)).toString("base64") };
}

export async function verifyPassword(password, record) {
  const expected = Buffer.from(record.hash, "base64");
  const actual = await hashWith(password, Buffer.from(record.salt, "base64"));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export const NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 _-]{1,18}[A-Za-z0-9]$/;

/** Why a name or password is not acceptable, as a sentence for the person, or null if it is. */
export function problemWithName(name) {
  if (typeof name !== "string" || !NAME_PATTERN.test(name) || /  /.test(name)) {
    return "Names are 3 to 20 letters, numbers, spaces, dashes or underscores.";
  }
  return null;
}

export function problemWithPassword(password) {
  if (typeof password !== "string" || password.length < 8) return "A password needs at least 8 characters.";
  if (password.length > 200) return "That password is too long.";
  return null;
}

/** A random token for a session: long enough that it cannot be guessed. */
export const newToken = () => randomBytes(32).toString("base64url");

/** Allow `max` things per `windowMs` for each key (an address, a name); `take(key)` says whether this one may go ahead. */
export function createRateLimiter({ max, windowMs, now = Date.now }) {
  const seen = new Map();
  return {
    take(key) {
      const time = now();
      const recent = (seen.get(key) ?? []).filter((at) => time - at < windowMs);
      if (recent.length >= max) {
        seen.set(key, recent);
        return false;
      }
      recent.push(time);
      seen.set(key, recent);
      if (seen.size > 5000) for (const [other, times] of seen) if (!times.some((at) => time - at < windowMs)) seen.delete(other);
      return true;
    },
  };
}
