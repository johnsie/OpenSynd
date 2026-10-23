// SPDX-License-Identifier: GPL-2.0-or-later

// Body upgrades. Each operative has six fitted parts, each upgradeable through three tiers; the tier prices
// are 1x, 5x and 10x the part's base price. The effects are small, steady edges, not new abilities.
export const MAX_TIER = 3;
export const TIER_PRICE_MULTIPLIER = Object.freeze([1, 5, 10]);

// `tiers` lists the effect at tier 0 (nothing fitted) to 3.
export const PARTS = Object.freeze({
  legs: {
    label: "Legs",
    base: 6,
    tiers: Object.freeze([1, 1.15, 1.3, 1.5]),
    effect: "Walk faster: 15, 30 and 50 percent quicker.",
  },
  arms: {
    label: "Arms",
    base: 6,
    tiers: Object.freeze([1, 0.9, 0.8, 0.7]),
    effect: "Weapons recharge 10, 20 and 30 percent faster, and the operative carries 4, 8 and 12 more weight freely.",
  },
  chest: {
    label: "Chest",
    base: 8,
    tiers: Object.freeze([0, 20, 40, 70]),
    effect: "More integrity: 20, 40 and 70 extra.",
  },
  heart: {
    label: "Heart",
    base: 5,
    tiers: Object.freeze([0, 2, 4, 5]),
    effect: "Legs tire slower and recover faster.",
  },
  eyes: {
    label: "Eyes",
    base: 6,
    tiers: Object.freeze([1, 1.1, 1.2, 1.3]),
    effect: "Weapons reach 10, 20 and 30 percent further.",
  },
  brain: {
    label: "Brain",
    base: 8,
    tiers: Object.freeze([0, 2, 4, 5]),
    effect: "Strain builds slower, and persuading guards, police and enemy agents takes fewer points.",
  },
});

export const PART_NAMES = Object.freeze(Object.keys(PARTS));

export function emptyUpgrades() {
  return Object.fromEntries(PART_NAMES.map((part) => [part, 0]));
}

// Repair anything damaged: unknown parts dropped, tiers whole numbers from 0 to 3.
export function sanitizeUpgrades(value) {
  const result = emptyUpgrades();
  if (value === null || typeof value !== "object" || Array.isArray(value)) return result;
  for (const part of PART_NAMES) {
    const tier = value[part];
    if (Number.isInteger(tier)) result[part] = Math.min(MAX_TIER, Math.max(0, tier));
  }
  return result;
}

const tierOf = (upgrades, part) => Math.min(MAX_TIER, Math.max(0, upgrades?.[part] ?? 0));
const effectOf = (upgrades, part) => PARTS[part].tiers[tierOf(upgrades, part)];

// What buying `tier` (1 to 3) of a part costs.
export function upgradePrice(part, tier) {
  return PARTS[part].base * TIER_PRICE_MULTIPLIER[tier - 1];
}

export const legsPace = (upgrades) => effectOf(upgrades, "legs");
export const armsCooldown = (upgrades) => effectOf(upgrades, "arms");
export const armsCapacity = (upgrades) => [0, 4, 8, 12][tierOf(upgrades, "arms")];
export const chestVitality = (upgrades) => effectOf(upgrades, "chest");
export const eyesRange = (upgrades) => effectOf(upgrades, "eyes");
// The fatigue research levels (see heartEffect and brainEffect in campaign.js) a tier is worth.
export const heartLevel = (upgrades) => effectOf(upgrades, "heart");
export const brainLevel = (upgrades) => effectOf(upgrades, "brain");
