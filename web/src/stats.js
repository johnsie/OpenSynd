// SPDX-License-Identifier: GPL-2.0-or-later

// Per-operative training bars. Level 3 is the baseline defined by the unit
// data; each step changes the effect by a fixed fraction.
export const LEVEL_MIN = 1;
export const LEVEL_MAX = 5;
export const LEVEL_DEFAULT = 3;
export const BARS = Object.freeze(["speed", "brain"]);
// The key stays "speed" so saves keep working; the label is "Legs".
export const BAR_LABELS = Object.freeze({ speed: "Legs", brain: "Brain" });
export const BAR_HINTS = Object.freeze({
  speed: "How fast the operative walks: stronger legs, quicker pace.",
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

// Fatigue: stamina runs from 1 (fresh) to 0 (exhausted). Walking drains it,
// standing still recovers it slowly, and tired legs walk slower.
export const STAMINA_FULL = 1;
export const STAMINA_EMPTY = 0;
const DRAIN_SECONDS_AT_BASELINE = 60; // walking from fresh to empty at Legs level 3
const RECOVER_SECONDS = 70; // resting from empty to fresh
const EXHAUSTED_SPEED = 0.5; // share of normal pace left at zero stamina
const LEGS_ENDURANCE_STEP = 0.15;

export function staminaDrainPerSecond(levels) {
  const legs = levels?.speed ?? LEVEL_DEFAULT;
  return (1 / DRAIN_SECONDS_AT_BASELINE) * (1 - (legs - LEVEL_DEFAULT) * LEGS_ENDURANCE_STEP);
}

export const STAMINA_RECOVER_PER_SECOND = 1 / RECOVER_SECONDS;

// Pace multiplier from tiredness: 1 when fresh, EXHAUSTED_SPEED when empty.
export function staminaSpeedFactor(stamina) {
  const value = Math.min(STAMINA_FULL, Math.max(STAMINA_EMPTY, stamina ?? STAMINA_FULL));
  return EXHAUSTED_SPEED + (1 - EXHAUSTED_SPEED) * value;
}

export function nextStamina(stamina, levels, walking, deltaSeconds) {
  const change = walking
    ? -staminaDrainPerSecond(levels) * deltaSeconds
    : STAMINA_RECOVER_PER_SECOND * deltaSeconds;
  return Math.min(STAMINA_FULL, Math.max(STAMINA_EMPTY, (stamina ?? STAMINA_FULL) + change));
}

export function isValidStamina(value) {
  return Number.isFinite(value) && value >= STAMINA_EMPTY && value <= STAMINA_FULL;
}
