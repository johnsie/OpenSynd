// SPDX-License-Identifier: GPL-2.0-or-later

// A small seeded random generator (mulberry32). The simulation draws its misses from it, so a mission replayed
// from the same seed and the same orders plays out the same way in every browser.
export function createRandom(seed = 1) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
