// SPDX-License-Identifier: GPL-2.0-or-later

// The three body-chemistry sliders (after FreeSynd's IPA: Intelligence, Perception, Adrenaline). Each operative has
// them and the player moves them during play. A slider has three values, from 0 to 100 with 50 neutral:
//   amount      where the player set it
//   effect      what is actually in force
//   dependency  the body's tolerance mark
// Every second the effect moves one notch toward the amount; once they agree, both drift back toward the dependency, so
// a high dose takes hold quickly and then wears off; every 4.5 seconds the dependency itself creeps one notch toward the
// amount, so a dose held for long stops working and leaves the operative below neutral when it ends.
export const DRUG_NAMES = Object.freeze(["adrenaline", "perception", "intelligence"]);
export const DRUG_LABELS = Object.freeze({ adrenaline: "Adrenaline", perception: "Perception", intelligence: "Intelligence" });
export const DRUG_HINTS = Object.freeze({
  adrenaline: "Walk faster, at the cost of a steadier aim.",
  perception: "Weapons reach further.",
  intelligence: "Weapons and the Persuader recharge faster.",
});
export const NEUTRAL = 50;
export const NOTCH = 5;
export const EFFECT_SECONDS = 1;
export const DEPENDENCY_SECONDS = 4.5;

export function newDrugs() {
  return Object.fromEntries(DRUG_NAMES.map((name) => [name, { amount: NEUTRAL, effect: NEUTRAL, dependency: NEUTRAL }]));
}

const clamp = (value) => Math.min(100, Math.max(0, Math.round(value)));
const toward = (value, goal, step) => (value < goal ? Math.min(goal, value + step) : Math.max(goal, value - step));

// Repair anything damaged: unknown drugs dropped, values whole numbers from 0 to 100.
export function sanitizeDrugs(value) {
  const drugs = newDrugs();
  if (value === null || typeof value !== "object" || Array.isArray(value)) return drugs;
  for (const name of DRUG_NAMES) {
    const entry = value[name];
    if (!entry || typeof entry !== "object") continue;
    for (const key of ["amount", "effect", "dependency"]) {
      if (Number.isFinite(entry[key])) drugs[name][key] = clamp(entry[key]);
    }
  }
  return drugs;
}

/** Set a slider (the amount); returns the unit's drugs with that change. */
export function setDrug(drugs, name, amount) {
  if (!DRUG_NAMES.includes(name)) return drugs;
  return { ...drugs, [name]: { ...drugs[name], amount: clamp(amount) } };
}

/**
 * Time passes. `timers` is { effect, dependency } seconds carried between calls; the drugs are changed in place and the
 * timers returned so the caller can keep them.
 */
export function advanceDrug(drug, timers, deltaSeconds) {
  let { effect, dependency } = timers;
  effect += deltaSeconds;
  dependency += deltaSeconds;
  while (effect >= EFFECT_SECONDS) {
    effect -= EFFECT_SECONDS;
    if (drug.effect !== drug.amount) {
      drug.effect = toward(drug.effect, drug.amount, NOTCH);
    } else {
      drug.effect = toward(drug.effect, drug.dependency, NOTCH);
      drug.amount = toward(drug.amount, drug.dependency, NOTCH);
    }
  }
  while (dependency >= DEPENDENCY_SECONDS) {
    dependency -= DEPENDENCY_SECONDS;
    drug.dependency = toward(drug.dependency, drug.amount, NOTCH);
  }
  return { effect, dependency };
}

export function advanceDrugs(units, deltaSeconds) {
  for (const unit of units) {
    if (!unit.drugs || unit.disabled) continue;
    unit.drugTimers ??= Object.fromEntries(DRUG_NAMES.map((name) => [name, { effect: 0, dependency: 0 }]));
    for (const name of DRUG_NAMES) unit.drugTimers[name] = advanceDrug(unit.drugs[name], unit.drugTimers[name], deltaSeconds);
  }
}

/**
 * What a drug does to the rest of the game: 1 at neutral, up to x2 when the effect is above the body's tolerance and down
 * to x0.5 when it is below (the body has adapted and the drug is wearing off).
 */
export function drugMultiplier(drugs, name) {
  const drug = drugs?.[name];
  if (!drug) return 1;
  const magnitude = Math.min(1, Math.abs(drug.effect - drug.dependency) / NEUTRAL);
  return drug.effect >= drug.dependency ? 1 + magnitude : 1 / (1 + magnitude);
}

// Adrenaline quickens the legs; a racing pulse makes the aim worse (the reach falls as it rises).
export const adrenalineSpeed = (drugs) => drugMultiplier(drugs, "adrenaline");
export const adrenalineAim = (drugs) => drugMultiplier(drugs, "adrenaline") ** -0.3;
export const perceptionReach = (drugs) => drugMultiplier(drugs, "perception") ** 0.5;
export const intelligenceRecharge = (drugs) => 1 / drugMultiplier(drugs, "intelligence") ** 0.5;

// The slowest recharge the drugs can cause (Intelligence at its lowest), for validating saved cooldowns.
export const MAX_DRUG_RECHARGE = 2 ** 0.5;
