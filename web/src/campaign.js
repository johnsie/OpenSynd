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

// The roster (FreeSynd's cryo chamber): up to eight operatives, four of whom deploy on any operation. A fallen
// operative is lost for good unless permadeath is switched off, and the only way to get new ones is capturing
// enemy agents or paying to hire a replacement. The first four use the ids of the operation's starting slots.
export const ROSTER_MAX = 8;
export const SQUAD_MAX = 4;
export const HIRE_PRICE = 60;
export const STARTING_IDS = Object.freeze(["operator-one", "operator-two", "operator-three", "operator-four"]);
export const SURNAMES = Object.freeze([
  "Alder", "Brandt", "Calloway", "Dray", "Esquivel", "Farrow", "Galt", "Hale", "Iyer", "Jarrow",
  "Kestrel", "Lindqvist", "Marlow", "Nakamura", "Okafor", "Pryce", "Quill", "Rourke", "Sato", "Thorne",
  "Ulloa", "Vance", "Whitlock", "Xu", "Yarrow", "Zeller", "Ashby", "Bishop", "Crane", "Dunmore",
  "Ellery", "Fenwick", "Garza", "Holloway", "Ibarra", "Jessup", "Kowal", "Lacroix", "Moreau", "Novak",
]);

function surnameFor(roster, index) {
  const used = new Set(roster.map((member) => member.name));
  for (let step = 0; step < SURNAMES.length; step += 1) {
    const name = SURNAMES[(index + step) % SURNAMES.length];
    if (!used.has(name)) return name;
  }
  return `${SURNAMES[index % SURNAMES.length]} ${roster.length + 1}`;
}

export function initialRoster() {
  const roster = [];
  for (const [index, id] of STARTING_IDS.entries()) {
    roster.push({ id, name: surnameFor(roster, index * 7), alive: true, missions: 0 });
  }
  return roster;
}

export function emptyCampaign() {
  return {
    funds: 0,
    carry: 0,
    upgrades: {},
    items: [],
    loadouts: {},
    achievements: [],
    roster: initialRoster(),
    squad: [...STARTING_IDS],
    permadeath: true,
  };
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
  const roster = parseRoster(value.roster);
  const aliveIds = roster.filter((member) => member.alive).map((member) => member.id);
  const squad = Array.isArray(value.squad)
    ? [...new Set(value.squad.filter((id) => aliveIds.includes(id)))].slice(0, SQUAD_MAX)
    : aliveIds.slice(0, SQUAD_MAX);
  const carry = typeof value.carry === "number" && value.carry >= 0 && value.carry < 1 ? value.carry : 0;
  return {
    funds: wholeNumber(value.funds) + refundOldTrack(value.heart) + refundOldTrack(value.brain),
    carry,
    upgrades,
    items: ids(value.items),
    loadouts,
    achievements: ids(value.achievements),
    roster,
    squad,
    permadeath: value.permadeath !== false,
  };
}

// Anything damaged falls back to the starting roster; ids and names are kept short and unique.
function parseRoster(value) {
  if (!Array.isArray(value)) return initialRoster();
  const seen = new Set();
  const roster = [];
  for (const entry of value.slice(0, ROSTER_MAX * 2)) {
    if (entry === null || typeof entry !== "object") continue;
    const id = typeof entry.id === "string" && entry.id.length > 0 && entry.id.length < 40 ? entry.id : null;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const name = typeof entry.name === "string" && entry.name.length > 0 && entry.name.length < 40 ? entry.name : id;
    roster.push({ id, name, alive: entry.alive !== false, missions: wholeNumber(entry.missions) });
  }
  return roster.length > 0 ? roster : initialRoster();
}

export const aliveMembers = (campaign) => campaign.roster.filter((member) => member.alive);

// Who deploys, in order: the squad members who are alive.
export function deployedMembers(campaign) {
  return campaign.squad.map((id) => campaign.roster.find((member) => member.id === id)).filter((member) => member?.alive);
}

// Put a living operative in the squad (if there is room) or take one out. At least one must stay.
export function deploy(campaign, id) {
  const member = campaign.roster.find((entry) => entry.id === id);
  if (!member?.alive || campaign.squad.includes(id) || campaign.squad.length >= SQUAD_MAX) return campaign;
  return { ...campaign, squad: [...campaign.squad, id] };
}

export function bench(campaign, id) {
  if (!campaign.squad.includes(id) || campaign.squad.length <= 1) return campaign;
  return { ...campaign, squad: campaign.squad.filter((entry) => entry !== id) };
}

// Operatives who fell are lost for good (unless permadeath is off): their kit and body parts go with them.
export function loseOperatives(campaign, ids) {
  const fallen = ids.filter((id) => campaign.roster.some((member) => member.id === id && member.alive));
  if (!campaign.permadeath || fallen.length === 0) return campaign;
  const loadouts = { ...campaign.loadouts };
  const upgrades = { ...campaign.upgrades };
  for (const id of fallen) {
    delete loadouts[id];
    delete upgrades[id];
  }
  const roster = campaign.roster.map((member) => (fallen.includes(member.id) ? { ...member, alive: false } : member));
  let squad = campaign.squad.filter((id) => !fallen.includes(id));
  if (squad.length === 0) squad = roster.filter((member) => member.alive).map((member) => member.id).slice(0, SQUAD_MAX);
  return { ...campaign, roster, squad, loadouts, upgrades };
}

// A new operative joins: a captured enemy agent with their gear, or a hired replacement. Returns the campaign and
// the new member, or the same campaign and null when the roster is full.
export function recruit(campaign, { items = [], upgrades = null } = {}) {
  if (aliveMembers(campaign).length >= ROSTER_MAX) return { campaign, member: null };
  const numbers = campaign.roster.map((member) => Number(/^agent-(\d+)$/.exec(member.id)?.[1] ?? 0));
  const id = `agent-${Math.max(4, ...numbers) + 1}`;
  const member = { id, name: surnameFor(campaign.roster, campaign.roster.length * 7 + 3), alive: true, missions: 0 };
  const roster = [...campaign.roster, member];
  // The fallen stay on the list as a memorial, oldest dropped first once it gets long.
  while (roster.length > ROSTER_MAX * 2) {
    const oldest = roster.findIndex((entry) => !entry.alive);
    if (oldest < 0) break;
    roster.splice(oldest, 1);
  }
  const next = {
    ...campaign,
    roster,
    squad: campaign.squad.length < SQUAD_MAX ? [...campaign.squad, id] : campaign.squad,
    loadouts: items.length > 0 ? { ...campaign.loadouts, [id]: items.slice(0, SLOTS_PER_OPERATIVE) } : campaign.loadouts,
    upgrades: upgrades ? { ...campaign.upgrades, [id]: sanitizeUpgrades(upgrades) } : campaign.upgrades,
  };
  return { campaign: next, member };
}

// Hiring a replacement costs funds; with the whole roster lost a volunteer joins for nothing.
export function hire(campaign) {
  const free = aliveMembers(campaign).length === 0;
  if (!free && campaign.funds < HIRE_PRICE) return { campaign, member: null };
  const result = recruit(free ? campaign : { ...campaign, funds: campaign.funds - HIRE_PRICE });
  return result.member ? result : { campaign, member: null };
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

// Reloading costs money (FreeSynd charges for every round). A used round costs a quarter of the item's price
// spread over its full load, so an emptied magazine is a quarter of what the weapon cost. Items with unlimited
// charges cost nothing.
export const RELOAD_SHARE = 0.25;

export function roundPrice(definition) {
  if (!definition.charges) return 0;
  return ((definition.price ?? 0) * RELOAD_SHARE) / definition.charges;
}

// The bill for refilling these equipment entries ({ definition, charges }) to full.
export function resupplyCost(entries) {
  const total = entries.reduce((sum, entry) => {
    if (entry.charges === null || entry.charges === undefined || !entry.definition.charges) return sum;
    return sum + Math.max(0, entry.definition.charges - entry.charges) * roundPrice(entry.definition);
  }, 0);
  return Math.round(total);
}
