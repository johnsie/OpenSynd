// SPDX-License-Identifier: GPL-2.0-or-later

// Body upgrades. Each operative has six fitted parts, each upgradeable through three tiers; the tier prices
// are 1x, 5x and 10x the part's base price. The base prices are FreeSynd's: legs 6000, arms 5000, chest 8000, others 4500.
// The effects are small, steady edges, not new abilities.
export const MAX_TIER = 3;
export const TIER_PRICE_MULTIPLIER = Object.freeze([1, 5, 10]);

// `tiers` lists the effect at tier 0 (nothing fitted) to 3.
export const PARTS = Object.freeze({
  legs: {
    label: "Legs",
    base: 6000,
    tiers: Object.freeze([1, 1.15, 1.3, 1.5]),
    effect: "Walk faster: 15, 30 and 50 percent quicker.",
  },
  arms: {
    label: "Arms",
    base: 5000,
    tiers: Object.freeze([1, 0.9, 0.8, 0.7]),
    effect: "Weapons recharge 10, 20 and 30 percent faster, and the operative carries 4, 8 and 12 more weight freely.",
  },
  chest: {
    label: "Chest",
    base: 8000,
    tiers: Object.freeze([0, 20, 40, 70]),
    effect: "More integrity: 20, 40 and 70 extra. From tier 2, wounds heal on their own.",
  },
  heart: {
    label: "Heart",
    base: 4500,
    tiers: Object.freeze([0, 1, 2, 3]),
    effect: "A steadier aim: shots land closer to where they are pointed.",
  },
  eyes: {
    label: "Eyes",
    base: 4500,
    tiers: Object.freeze([1, 1.1, 1.2, 1.3]),
    effect: "Weapons reach 10, 20 and 30 percent further.",
  },
  brain: {
    label: "Brain",
    base: 4500,
    tiers: Object.freeze([0, 1, 2, 3]),
    effect: "Persuading guards, police and enemy agents takes fewer points, and the aim is a little steadier.",
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
export const chestTier = (upgrades) => tierOf(upgrades, "chest");
export const eyesRange = (upgrades) => effectOf(upgrades, "eyes");

// FreeSynd's accuracy: each of the Eyes, Brain, Arms, Heart and Legs parts adds a little for every tier fitted.
export const AIM_PER_TIER = 0.006;
export const AIM_PARTS = Object.freeze(["eyes", "brain", "arms", "heart", "legs"]);
export const aimBonus = (upgrades) => AIM_PARTS.reduce((sum, part) => sum + tierOf(upgrades, part) * AIM_PER_TIER, 0);

// Research for the parts: tier 1 is on sale from the start, and tiers 2 and 3 have to be researched, the second before the
// third (FreeSynd's "legs V2", "legs V3" and so on), at FreeSynd's minimum fundings (`research.dat`).
export const PART_RESEARCH_COSTS = Object.freeze({
  legs: [4440, 8880],
  arms: [4440, 8880],
  chest: [6000, 12000],
  heart: [3480, 6960],
  eyes: [3480, 6960],
  brain: [3480, 6960],
});

export const partResearchId = (part, tier) => `part.${part}.${tier}`;

/** The researches that open tier 2 and 3 of every part, shaped like equipment so the research machinery runs them. */
export function partResearchItems() {
  const items = [];
  for (const part of PART_NAMES) {
    PART_RESEARCH_COSTS[part].forEach((cost, index) => {
      const tier = index + 2;
      items.push({
        id: partResearchId(part, tier),
        name: `${PARTS[part].label} tier ${tier}`,
        description: `Opens tier ${tier} of the ${PARTS[part].label.toLowerCase()}: ${PARTS[part].effect}`,
        researchCost: cost,
        requires: tier > 2 ? [partResearchId(part, tier - 1)] : [],
        kind: "part",
        part,
        tier,
      });
    });
  }
  return items;
}

/** Whether a tier can be fitted: tier 1 always, the others once their research is done (items is the list researched). */
export const tierUnlocked = (items, part, tier) => tier <= 1 || items.includes(partResearchId(part, tier));
