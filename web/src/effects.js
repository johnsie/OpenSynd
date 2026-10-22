// SPDX-License-Identifier: GPL-2.0-or-later

// Presentation-only effects. Nothing here feeds back into the simulation, so
// replays and saves are unaffected by what is shown.
export const EFFECT_DURATIONS = Object.freeze({
  pulse: 0.35,
  repair: 0.7,
  restore: 0.9,
  muzzle: 0.09,
  tracer: 0.16,
  persuade: 0.8,
  impact: 0.3,
  puff: 0.35,
});

export function createEffects() {
  return [];
}

export function addEffect(effects, type, details) {
  if (!(type in EFFECT_DURATIONS)) throw new Error(`Unknown effect type: ${type}`);
  effects.push({ type, age: 0, duration: EFFECT_DURATIONS[type], ...details });
}

export function advanceEffects(effects, deltaSeconds) {
  for (const effect of effects) effect.age += deltaSeconds;
  for (let index = effects.length - 1; index >= 0; index -= 1) {
    if (effects[index].age >= effects[index].duration) effects.splice(index, 1);
  }
}

// 0 at the start of an effect, approaching 1 at the end.
export function effectProgress(effect) {
  return Math.min(1, Math.max(0, effect.age / effect.duration));
}

// Walking bob in pixels; zero when reduced motion is requested or the unit is idle.
export function walkBob(timeSeconds, moving, reducedMotion, amplitude = 2) {
  if (!moving || reducedMotion) return 0;
  return Math.abs(Math.sin(timeSeconds * 9)) * -amplitude;
}

// Screen-space unit vector for one of the eight facings (0 toward the camera, clockwise).
export function facingVector(facing) {
  const angle = (facing * Math.PI) / 4;
  return { x: Math.sin(angle), y: Math.cos(angle) };
}

export const RECOIL_SECONDS = 0.14;

// How far a unit is kicked back, in pixels, since it fired: full at the shot, back to 0 after
// RECOIL_SECONDS. The offset points away from the way it faces. Reduced motion has no kick.
export function recoilOffset(elapsed, firedAt, facing, distance = 3, reducedMotion = false) {
  if (reducedMotion || firedAt === undefined || firedAt === null) return { x: 0, y: 0 };
  const left = 1 - (elapsed - firedAt) / RECOIL_SECONDS;
  if (left <= 0 || left > 1) return { x: 0, y: 0 };
  const direction = facingVector(facing ?? 0);
  return { x: -direction.x * distance * left, y: -direction.y * distance * left };
}

export const KNOCKBACK_SECONDS = 0.26;

// A unit that has just been hit is thrown back along `direction` (a unit vector in screen space,
// away from the attacker) and then recovers: out fast, back slower. Reduced motion has no kick.
export function knockbackOffset(elapsed, hitAt, direction, distance = 9, reducedMotion = false) {
  if (reducedMotion || hitAt === undefined || hitAt === null || !direction) return { x: 0, y: 0 };
  const progress = (elapsed - hitAt) / KNOCKBACK_SECONDS;
  if (progress < 0 || progress >= 1) return { x: 0, y: 0 };
  const amount = Math.sin(Math.PI * Math.pow(progress, 0.6)) * distance;
  return { x: direction.x * amount, y: direction.y * amount * 0.55 };
}
