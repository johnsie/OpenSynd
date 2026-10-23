// SPDX-License-Identifier: GPL-2.0-or-later

// Per-operative pace and reaction levels. Level 3 is the baseline defined by the unit
// data; fatigue lowers the effective level and each step changes the effect by a fixed fraction.
export const LEVEL_MIN = 1;
export const LEVEL_MAX = 5;
export const LEVEL_DEFAULT = 3;
import { brainEffect, heartEffect } from "./campaign.js";
import { MAX_DRUG_RECHARGE } from "./drugs.js";

export const BARS = Object.freeze(["speed", "brain"]);

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
  return cooldownMultiplier({ brain: LEVEL_MIN }) * MAX_DRUG_RECHARGE;
}

// Fatigue. Two meters run from 1 (fresh) to 0 (spent) and each takes levels off
// its bar, so a tired operator is effectively trained lower than the bar says:
//   stamina (legs): drains while walking, recovers while standing still.
//   focus (brain): drains only while Brain is turned above the baseline, and
//   recovers while it is at or below the baseline.
export const METER_FULL = 1;
export const METER_EMPTY = 0;
const STAMINA_DRAIN_SECONDS_AT_BASELINE = 60; // walking from fresh to empty at Legs level 3
const STAMINA_RECOVER_SECONDS = 70; // resting from empty to fresh
const FOCUS_DRAIN_SECONDS_PER_STEP = 90; // fresh to empty at Brain 4; Brain 5 drains twice as fast
const FOCUS_RECOVER_SECONDS = 90;
const LEGS_ENDURANCE_STEP = 0.15;
// An empty meter takes this many levels off its bar (never below level 1).
export const MAX_FATIGUE_LOSS = 2;

export function staminaDrainPerSecond(levels) {
  const legs = levels?.speed ?? LEVEL_DEFAULT;
  return (1 / STAMINA_DRAIN_SECONDS_AT_BASELINE) * (1 - (legs - LEVEL_DEFAULT) * LEGS_ENDURANCE_STEP);
}

export const STAMINA_RECOVER_PER_SECOND = 1 / STAMINA_RECOVER_SECONDS;

// Brain above the baseline strains the mind: 0 at levels 1-3, rising with each step.
export function focusDrainPerSecond(levels) {
  const steps = Math.max(0, (levels?.brain ?? LEVEL_DEFAULT) - LEVEL_DEFAULT);
  return steps / FOCUS_DRAIN_SECONDS_PER_STEP;
}

function clampMeter(value) {
  return Math.min(METER_FULL, Math.max(METER_EMPTY, value ?? METER_FULL));
}

// `research` holds the cyborg heart and brain levels from the campaign; they scale the rates.
export function nextStamina(stamina, levels, walking, deltaSeconds, research) {
  const heart = heartEffect(research?.heart ?? 0);
  const change = walking
    ? -staminaDrainPerSecond(levels) * heart.drain * deltaSeconds
    : (deltaSeconds / STAMINA_RECOVER_SECONDS) * heart.recover;
  return clampMeter((stamina ?? METER_FULL) + change);
}

export function nextFocus(focus, levels, deltaSeconds, research) {
  const brain = brainEffect(research?.brain ?? 0);
  const drain = focusDrainPerSecond(levels) * brain.drain;
  const change = drain > 0 ? -drain * deltaSeconds : (deltaSeconds / FOCUS_RECOVER_SECONDS) * brain.recover;
  return clampMeter((focus ?? METER_FULL) + change);
}

export function isValidMeter(value) {
  return Number.isFinite(value) && value >= METER_EMPTY && value <= METER_FULL;
}

function effectiveLevel(level, meter) {
  const loss = (METER_FULL - clampMeter(meter)) * MAX_FATIGUE_LOSS;
  return Math.max(LEVEL_MIN, level - loss);
}

// The levels an operator actually performs at, after fatigue.
export function effectiveLevels(levels, stamina, focus) {
  const base = levels ?? defaultLevels();
  return {
    speed: effectiveLevel(base.speed, stamina),
    brain: effectiveLevel(base.brain, focus),
  };
}
