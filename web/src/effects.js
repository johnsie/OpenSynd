// SPDX-License-Identifier: GPL-2.0-or-later

// Presentation-only effects. Nothing here feeds back into the simulation, so
// replays and saves are unaffected by what is shown.
export const EFFECT_DURATIONS = Object.freeze({
  pulse: 0.35,
  repair: 0.7,
  restore: 0.9,
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
