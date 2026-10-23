// SPDX-License-Identifier: GPL-2.0-or-later

// Between-mission progression, kept in this browser: funds (money) earned while
// playing and from achievements, spent on body upgrades and on new items, plus each
// operative's loadout of up to eight items.
import { MAX_TIER, PARTS, emptyUpgrades, sanitizeUpgrades, upgradePrice } from "./upgrades.js";

export const CAMPAIGN_KEY = "opensynd.campaign.v1";
export const SLOTS_PER_OPERATIVE = 8;
// Funds trickle in during game time: six per minute of play.
export const FUNDS_PER_SECOND = 0.1;

// Cyborg heart and brain used to be squad-wide research tracks; they are now body parts (see upgrades.js). Old
// records are refunded what was spent on them.
const OLD_TRACK_COSTS = [20, 30, 40, 50, 60];
const refundOldTrack = (level) => OLD_TRACK_COSTS.slice(0, Math.min(5, wholeNumber(level))).reduce((sum, cost) => sum + cost, 0);

export function emptyCampaign() {
  return { funds: 0, carry: 0, upgrades: {}, items: [], loadouts: {}, achievements: [] };
}

function wholeNumber(value, fallback = 0) {
  return Number.isInteger(value) && value >= 0 ? value : fallback;
}

// Tolerant parsing: anything damaged or out of range falls back to a safe default.
export function parseCampaign(text) {
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    return emptyCampaign();
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) return emptyCampaign();
  const ids = (list) =>
    Array.isArray(list)
      ? [...new Set(list.filter((id) => typeof id === "string" && id.length > 0 && id.length < 120))]
      : [];
  const loadouts = {};
  if (value.loadouts !== null && typeof value.loadouts === "object" && !Array.isArray(value.loadouts)) {
    for (const [operator, slots] of Object.entries(value.loadouts)) {
      if (Array.isArray(slots) && operator.length < 120) {
        loadouts[operator] = slots
          .slice(0, SLOTS_PER_OPERATIVE)
          .filter((id) => typeof id === "string" && id.length > 0 && id.length < 120);
      }
    }
  }
  const upgrades = {};
  if (value.upgrades !== null && typeof value.upgrades === "object" && !Array.isArray(value.upgrades)) {
    for (const [operator, parts] of Object.entries(value.upgrades)) {
      if (operator.length < 120) upgrades[operator] = sanitizeUpgrades(parts);
    }
  }
  const carry = typeof value.carry === "number" && value.carry >= 0 && value.carry < 1 ? value.carry : 0;
  return {
    funds: wholeNumber(value.funds) + refundOldTrack(value.heart) + refundOldTrack(value.brain),
    carry,
    upgrades,
    items: ids(value.items),
    loadouts,
    achievements: ids(value.achievements),
  };
}

export function serializeCampaign(campaign) {
  return JSON.stringify(campaign, null, 2);
}

// Game-time income: whole funds are paid out and the remainder carries over.
export function earnTime(campaign, seconds) {
  const total = campaign.carry + Math.max(0, seconds) * FUNDS_PER_SECOND;
  const whole = Math.floor(total);
  if (whole === 0 && total === campaign.carry) return campaign;
  return { ...campaign, funds: campaign.funds + whole, carry: total - whole };
}

// What harming bystanders costs. Funds never go below zero.
export const CIVILIAN_PENALTY = 40;
export const POLICE_PENALTY = 80;

export function penalise(campaign, amount) {
  return { ...campaign, funds: Math.max(0, campaign.funds - Math.max(0, amount)) };
}

// An achievement pays its reward once, ever.
export function earnAchievement(campaign, achievement) {
  if (campaign.achievements.includes(achievement.id)) return campaign;
  return {
    ...campaign,
    funds: campaign.funds + achievement.reward,
    achievements: [...campaign.achievements, achievement.id],
  };
}

// Body upgrades, per operative. Each part has three tiers; fitting the next one costs its price.
export function upgradesOf(campaign, operatorId) {
  return campaign.upgrades?.[operatorId] ?? emptyUpgrades();
}

export function canFit(campaign, operatorId, part) {
  const tier = upgradesOf(campaign, operatorId)[part];
  return tier < MAX_TIER && campaign.funds >= upgradePrice(part, tier + 1);
}

// Returns the new campaign, or the same object if the part cannot be fitted.
export function fitUpgrade(campaign, operatorId, part) {
  if (!PARTS[part] || !canFit(campaign, operatorId, part)) return campaign;
  const current = upgradesOf(campaign, operatorId);
  const tier = current[part] + 1;
  return {
    ...campaign,
    funds: campaign.funds - upgradePrice(part, tier),
    upgrades: { ...campaign.upgrades, [operatorId]: { ...current, [part]: tier } },
  };
}

// Taking the top tier off returns what it cost.
export function removeUpgrade(campaign, operatorId, part) {
  const current = upgradesOf(campaign, operatorId);
  if (!PARTS[part] || current[part] === 0) return campaign;
  return {
    ...campaign,
    funds: campaign.funds + upgradePrice(part, current[part]),
    upgrades: { ...campaign.upgrades, [operatorId]: { ...current, [part]: current[part] - 1 } },
  };
}

// Items with no research cost are available from the start.
export function isItemAvailable(campaign, item) {
  return (item.researchCost ?? 0) === 0 || campaign.items.includes(item.id);
}

export function canResearchItem(campaign, item) {
  return !isItemAvailable(campaign, item) && campaign.funds >= item.researchCost;
}

export function researchItem(campaign, item) {
  if (!canResearchItem(campaign, item)) return campaign;
  return { ...campaign, funds: campaign.funds - item.researchCost, items: [...campaign.items, item.id] };
}

// The operative's loadout, or the mission defaults before one has been chosen.
export function loadoutFor(campaign, operatorId, defaults) {
  return (campaign.loadouts[operatorId] ?? defaults).slice(0, SLOTS_PER_OPERATIVE);
}

// Put an item (or nothing) in one of the eight slots. Only available items fit.
export function setSlot(campaign, operatorId, slot, itemId, catalog, defaults) {
  if (!Number.isInteger(slot) || slot < 0 || slot >= SLOTS_PER_OPERATIVE) return campaign;
  const current = [...loadoutFor(campaign, operatorId, defaults)];
  if (itemId !== null) {
    const item = catalog.find((entry) => entry.id === itemId);
    if (!item || !isItemAvailable(campaign, item)) return campaign;
  }
  // Slots are a packed list: filling past the end appends; clearing removes the entry.
  if (itemId === null) {
    if (slot >= current.length) return campaign;
    current.splice(slot, 1);
  } else if (slot >= current.length) {
    current.push(itemId);
  } else {
    current[slot] = itemId;
  }
  return { ...campaign, loadouts: { ...campaign.loadouts, [operatorId]: current } };
}

// Drop loadout entries that are no longer available (for example after clearing progress).
export function sanitizeLoadouts(campaign, catalog) {
  const loadouts = {};
  for (const [operator, slots] of Object.entries(campaign.loadouts)) {
    loadouts[operator] = slots
      .filter((id) => {
        const item = catalog.find((entry) => entry.id === id);
        return item && isItemAvailable(campaign, item);
      })
      .slice(0, SLOTS_PER_OPERATIVE);
  }
  return { ...campaign, loadouts };
}

// Research effects on fatigue: multipliers applied to the drain and recovery rates.
export function heartEffect(level) {
  return { drain: 1 - 0.12 * level, recover: 1 + 0.15 * level };
}

export function brainEffect(level) {
  return { drain: 1 - 0.15 * level, recover: 1 + 0.15 * level };
}

// Items kept from a successful operation: captured gear counts as researched and
// is added to the operative's loadout while there is room.
export function captureItems(campaign, operatorId, itemIds, catalog, defaults) {
  let next = campaign;
  for (const id of itemIds) {
    const item = catalog.find((entry) => entry.id === id);
    if (!item) continue;
    if (!isItemAvailable(next, item)) next = { ...next, items: [...next.items, id] };
    const loadout = loadoutFor(next, operatorId, defaults);
    if (loadout.length < SLOTS_PER_OPERATIVE) {
      next = { ...next, loadouts: { ...next.loadouts, [operatorId]: [...loadout, id] } };
    }
  }
  return next;
}

// Buying and selling in the Armoury. Items cost their price; a replaced or sold item is
// bought back at half price, so swapping a weapon costs the difference.
export const SELL_SHARE = 0.5;

export function sellValue(item) {
  return Math.floor((item?.price ?? 0) * SELL_SHARE);
}

function slotItem(campaign, operatorId, slot, catalog, defaults) {
  const id = loadoutFor(campaign, operatorId, defaults)[slot];
  return id === undefined ? null : catalog.find((entry) => entry.id === id) ?? null;
}

// What buying `item` into the slot would cost after the refund for any item it replaces.
export function netCost(campaign, operatorId, slot, item, catalog, defaults) {
  return (item.price ?? 0) - sellValue(slotItem(campaign, operatorId, slot, catalog, defaults));
}

export function canBuy(campaign, operatorId, slot, item, catalog, defaults) {
  if (!Number.isInteger(slot) || slot < 0 || slot >= SLOTS_PER_OPERATIVE) return false;
  if (!isItemAvailable(campaign, item)) return false;
  return campaign.funds >= netCost(campaign, operatorId, slot, item, catalog, defaults);
}

// Returns the new campaign, or the same object when the purchase is not allowed.
export function buyIntoSlot(campaign, operatorId, slot, item, catalog, defaults) {
  if (!canBuy(campaign, operatorId, slot, item, catalog, defaults)) return campaign;
  const cost = netCost(campaign, operatorId, slot, item, catalog, defaults);
  const loadout = [...loadoutFor(campaign, operatorId, defaults)];
  if (slot >= loadout.length) loadout.push(item.id);
  else loadout[slot] = item.id;
  return {
    ...campaign,
    funds: campaign.funds - cost,
    loadouts: { ...campaign.loadouts, [operatorId]: loadout },
  };
}

export function sellFromSlot(campaign, operatorId, slot, catalog, defaults) {
  const item = slotItem(campaign, operatorId, slot, catalog, defaults);
  if (!item) return campaign;
  const loadout = [...loadoutFor(campaign, operatorId, defaults)];
  loadout.splice(slot, 1);
  return {
    ...campaign,
    funds: campaign.funds + sellValue(item),
    loadouts: { ...campaign.loadouts, [operatorId]: loadout },
  };
}
