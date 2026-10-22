// SPDX-License-Identifier: GPL-2.0-or-later

// Per-operative training bars. Level 3 is the baseline defined by the unit
// data; each step changes the effect by a fixed fraction.
export const LEVEL_MIN = 1;
export const LEVEL_MAX = 5;
export const LEVEL_DEFAULT = 3;
export const BARS = Object.freeze(["speed", "brain"]);
export const BAR_LABELS = Object.freeze({ speed: "Speed", brain: "Brain" });
export const BAR_HINTS = Object.freeze({
  speed: "How fast the operative walks.",
  brain: "How quickly the operative can fire the pulse again.",
});

const SPEED_STEP = 0.2;
const BRAIN_STEP = 0.15;

export function defaultLevels() {
  return { speed: LEVEL_DEFAULT, brain: LEVEL_DEFAULT };
}

export function clampLevel(level) {
  return Math.min(LEVEL_MAX, Math.max(LEVEL_MIN, Math.round(level)));
}

export function isValidLevel(level) {
  return Number.isInteger(level) && level >= LEVEL_MIN && level <= LEVEL_MAX;
}

// Walking pace multiplier: 0.6x at level 1 up to 1.4x at level 5.
export function speedMultiplier(levels) {
  return 1 + ((levels?.speed ?? LEVEL_DEFAULT) - LEVEL_DEFAULT) * SPEED_STEP;
}

// Pulse cooldown multiplier: 1.3x slower at level 1 up to 0.7x (faster) at level 5.
export function cooldownMultiplier(levels) {
  return 1 - ((levels?.brain ?? LEVEL_DEFAULT) - LEVEL_DEFAULT) * BRAIN_STEP;
}

// Longest cooldown a unit can have, for validating saved state.
export function maxCooldownMultiplier() {
  return cooldownMultiplier({ brain: LEVEL_MIN });
}

// Returns the new levels, or the same object if the change is not allowed.
export function adjustLevel(levels, bar, delta) {
  if (!BARS.includes(bar)) return levels;
  const next = clampLevel(levels[bar] + delta);
  return next === levels[bar] ? levels : { ...levels, [bar]: next };
}
