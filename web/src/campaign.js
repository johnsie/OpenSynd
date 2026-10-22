// SPDX-License-Identifier: GPL-2.0-or-later

// Between-mission progression, kept in this browser: funds (money) earned while
// playing and from achievements, spent on cyborg heart and brain research and on
// new items, plus each operative's loadout of up to eight items.
export const CAMPAIGN_KEY = "opensynd.campaign.v1";
export const SLOTS_PER_OPERATIVE = 8;
// Funds trickle in during game time: six per minute of play.
export const FUNDS_PER_SECOND = 0.1;

export const TRACKS = Object.freeze({
  heart: {
    label: "Cyborg heart",
    bar: "Stamina",
    maxLevel: 5,
    costs: [20, 30, 40, 50, 60],
    effect: "Legs tire 12% slower and recover 15% faster per level.",
  },
  brain: {
    label: "Cyborg brain",
    bar: "Brain",
    maxLevel: 5,
    costs: [20, 30, 40, 50, 60],
    effect: "Mental strain builds 15% slower and clears 15% faster per level.",
  },
});

export function emptyCampaign() {
  return { funds: 0, carry: 0, heart: 0, brain: 0, items: [], loadouts: {}, achievements: [] };
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
  const carry = typeof value.carry === "number" && value.carry >= 0 && value.carry < 1 ? value.carry : 0;
  return {
    funds: wholeNumber(value.funds),
    carry,
    heart: Math.min(TRACKS.heart.maxLevel, wholeNumber(value.heart)),
    brain: Math.min(TRACKS.brain.maxLevel, wholeNumber(value.brain)),
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

// An achievement pays its reward once, ever.
export function earnAchievement(campaign, achievement) {
  if (campaign.achievements.includes(achievement.id)) return campaign;
  return {
    ...campaign,
    funds: campaign.funds + achievement.reward,
    achievements: [...campaign.achievements, achievement.id],
  };
}

export function nextTrackCost(campaign, track) {
  const level = campaign[track];
  return level >= TRACKS[track].maxLevel ? null : TRACKS[track].costs[level];
}

export function canResearchTrack(campaign, track) {
  const cost = nextTrackCost(campaign, track);
  return cost !== null && campaign.funds >= cost;
}

// Returns the new campaign, or the same object if the research is not allowed.
export function researchTrack(campaign, track) {
  if (!canResearchTrack(campaign, track)) return campaign;
  return {
    ...campaign,
    funds: campaign.funds - nextTrackCost(campaign, track),
    [track]: campaign[track] + 1,
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
