// SPDX-License-Identifier: GPL-2.0-or-later

import { chestTier } from "./upgrades.js";

// How a person looks as they die, following FreeSynd's death animations (the numbers are our own):
//   shot (or run over): recoils and falls, then lies where they dropped;
//   laser: vaporized in a flash, leaving nothing of an enemy and a scorch mark where one of ours stood;
//   fire or a blast without a second-version chest: runs about burning for a second, collapses, smoulders for seven
//   seconds and is left a charred body. With the second-version chest a blast or fire kills like a bullet.

export const FALL_SECONDS = 0.45;
export const VAPORIZE_SECONDS = 0.9;
export const BURN_RUN_SECONDS = 1;
export const BURN_COLLAPSE_SECONDS = 0.5;
export const SMOULDER_SECONDS = 7;
export const BLOOD_SECONDS = 2.5;

/** "shot", "laser" or "burn": which death a fallen person gets, from what killed them and their chest. */
export function deathKind(unit) {
  const cause = unit.lastDamageType ?? "bullet";
  if (cause === "beam" || cause === "laser") return "laser";
  if (cause === "burn" || cause === "explosion") return chestTier(unit.upgrades) >= 2 ? "shot" : "burn";
  return "shot";
}

const clamp01 = (value) => Math.min(1, Math.max(0, value));

/**
 * What to draw `age` seconds after death: { drawn, fall (0 upright to 1 lying), fade (alpha), squash (vertical scale),
 * flames, smoke, blood (each 0 to 1), run (0 to 1 while still running about), charred, ash, flash }.
 */
export function deathLook(kind, age, ours = false) {
  const look = { drawn: true, fall: 0, fade: 1, squash: 1, flames: 0, smoke: 0, run: 0, charred: false, ash: false, flash: 0, blood: 0 };
  if (kind === "laser") {
    const t = clamp01(age / VAPORIZE_SECONDS);
    look.flash = 1 - t;
    look.fade = 1 - t;
    look.squash = 1 - 0.8 * t;
    if (t >= 1) {
      look.drawn = false;
      look.ash = ours;
    }
    return look;
  }
  if (kind === "burn") {
    if (age < BURN_RUN_SECONDS) {
      look.flames = 1;
      look.run = age / BURN_RUN_SECONDS;
      return look;
    }
    const down = age - BURN_RUN_SECONDS;
    look.fall = clamp01(down / BURN_COLLAPSE_SECONDS);
    look.run = 1;
    if (down < SMOULDER_SECONDS) {
      look.flames = Math.max(0, 1 - down / 2);
      look.smoke = 1 - down / SMOULDER_SECONDS;
    } else {
      look.charred = true;
    }
    return look;
  }
  look.fall = clamp01(age / FALL_SECONDS);
  look.blood = clamp01((age - 0.2) / BLOOD_SECONDS); // a pool spreads under someone who was shot
  return look;
}
