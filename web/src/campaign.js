// SPDX-License-Identifier: GPL-2.0-or-later

// Between-mission progression, kept in this browser: funds (money) earned while
// playing and from achievements, spent on body upgrades and on new items, plus each
// operative's loadout of up to eight items.
import {
  HOURS_PER_DAY,
  MAX_ACTIVE_RESEARCH,
  RESEARCH_LEVELS,
  advanceTerritoryDay,
  holdTerritory,
  missingRequirements,
  newTerritory,
  researchHour,
  sanitizeTerritory,
  withTax,
} from "./strategy.js";
import { MAX_TIER, PARTS, PART_NAMES, emptyUpgrades, sanitizeUpgrades, upgradePrice } from "./upgrades.js";

export const CAMPAIGN_KEY = "opensynd.campaign.v1";
export const SLOTS_PER_OPERATIVE = 8;

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

// What a new campaign starts with (FreeSynd gives 30000 against weapon prices from 250 to 50000; these are our prices).
export const STARTING_FUNDS = 500;

export function emptyCampaign() {
  return {
    funds: STARTING_FUNDS,
    upgrades: {},
    items: [],
    loadouts: {},
    achievements: [],
    roster: initialRoster(),
    squad: [...STARTING_IDS],
    permadeath: true,
    hours: 0,
    territories: {},
    research: { active: [], level: 4, progress: {}, discovered: [] },
    intel: {},
    ended: false,
  };
}

// Funds can carry a fraction (tax and hourly research costs are not whole numbers); two places are kept.
function money(value) {
  return Number.isFinite(value) && value >= 0 ? Math.round(value * 100) / 100 : 0;
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
  const territories = {};
  if (value.territories !== null && typeof value.territories === "object" && !Array.isArray(value.territories)) {
    for (const [id, record] of Object.entries(value.territories)) {
      if (id.length < 120) territories[id] = sanitizeTerritory(id, record);
    }
  }
  const intel = {};
  if (value.intel !== null && typeof value.intel === "object" && !Array.isArray(value.intel)) {
    for (const [id, level] of Object.entries(value.intel)) {
      if (id.length < 120 && Number.isInteger(level) && level > 0) intel[id] = Math.min(INTEL_LEVELS, level);
    }
  }
  const roster = parseRoster(value.roster);
  const aliveIds = roster.filter((member) => member.alive).map((member) => member.id);
  const squad = Array.isArray(value.squad)
    ? [...new Set(value.squad.filter((id) => aliveIds.includes(id)))].slice(0, SQUAD_MAX)
    : aliveIds.slice(0, SQUAD_MAX);
  return {
    funds: money(value.funds) + refundOldTrack(value.heart) + refundOldTrack(value.brain),
    upgrades,
    items: ids(value.items),
    loadouts,
    achievements: ids(value.achievements),
    roster,
    squad,
    permadeath: value.permadeath !== false,
    hours: wholeNumber(value.hours),
    territories,
    research: parseResearch(value.research),
    intel,
    ended: value.ended === true,
  };
}

function parseResearch(value) {
  const progress = {};
  if (value?.progress !== null && typeof value?.progress === "object" && !Array.isArray(value.progress)) {
    for (const [id, percent] of Object.entries(value.progress)) {
      if (id.length < 120 && Number.isFinite(percent) && percent >= 0) progress[id] = Math.min(100, percent);
    }
  }
  const level = Number.isInteger(value?.level) ? Math.min(RESEARCH_LEVELS, Math.max(1, value.level)) : 4;
  const clean = (id, entryLevel) => ({
    id,
    level: Number.isInteger(entryLevel) ? Math.min(RESEARCH_LEVELS, Math.max(1, entryLevel)) : level,
  });
  let active = [];
  if (Array.isArray(value?.active)) {
    active = value.active
      .filter((entry) => typeof entry?.id === "string" && entry.id.length < 120)
      .map((entry) => clean(entry.id, entry.level))
      .filter((entry, index, all) => all.findIndex((other) => other.id === entry.id) === index)
      .slice(0, MAX_ACTIVE_RESEARCH);
  } else if (typeof value?.active === "string" && value.active.length < 120) {
    active = [clean(value.active, level)]; // older saves researched one item at a time
  }
  const discovered = Array.isArray(value?.discovered)
    ? [...new Set(value.discovered.filter((id) => typeof id === "string" && id.length < 120))].slice(0, 200)
    : [];
  return { active, level, progress, discovered };
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

// What harming bystanders costs. Funds never go below zero.
export const CIVILIAN_PENALTY = 10;
export const POLICE_PENALTY = 20;

export function penalise(campaign, amount) {
  return { ...campaign, funds: Math.max(0, campaign.funds - Math.max(0, amount)) };
}

// FreeSynd left a note to pay for every persuaded person who is not an agent (it never did). We pay a little for each one
// still following the squad when an operation is won: enemy agents are recruited instead.
export const PERSUADED_BONUS = 15;

export function persuadedBonus(units) {
  const count = units.filter(
    (unit) => unit.persuaded && !unit.disabled && !unit.escaped && unit.side !== "team" && unit.definition?.role !== "enemy-agent",
  ).length;
  return { count, amount: count * PERSUADED_BONUS };
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

// Research is not a purchase: pick an item and a funding level, and it runs on game time (see strategy.js), paid for
// by the hour. Several items can be researched at once (up to MAX_ACTIVE_RESEARCH), each at its own funding level.
export function researchBlockers(campaign, item, catalog) {
  return missingRequirements(item, campaign.items, catalog);
}

export function canResearchItem(campaign, item, catalog = []) {
  return (item.researchCost ?? 0) > 0 && !isItemAvailable(campaign, item) && researchBlockers(campaign, item, catalog).length === 0;
}

export function startResearch(campaign, item, catalog = [], level = campaign.research.level) {
  if (!canResearchItem(campaign, item, catalog)) return campaign;
  const chosen = Math.min(RESEARCH_LEVELS, Math.max(1, level));
  const active = campaign.research.active;
  const existing = active.find((entry) => entry.id === item.id);
  if (!existing && active.length >= MAX_ACTIVE_RESEARCH) return campaign;
  const next = existing
    ? active.map((entry) => (entry.id === item.id ? { ...entry, level: chosen } : entry))
    : [...active, { id: item.id, level: chosen }];
  return { ...campaign, research: { ...campaign.research, active: next, level: chosen } };
}

/** Set the funding level of one research under way (by id), or the level new research starts at (no id). */
export function setResearchLevel(campaign, level, id = null) {
  const chosen = Math.min(RESEARCH_LEVELS, Math.max(1, Math.round(level)));
  if (id === null) {
    return chosen === campaign.research.level ? campaign : { ...campaign, research: { ...campaign.research, level: chosen } };
  }
  if (!campaign.research.active.some((entry) => entry.id === id)) return campaign;
  const active = campaign.research.active.map((entry) => (entry.id === id ? { ...entry, level: chosen } : entry));
  return { ...campaign, research: { ...campaign.research, active, level: chosen } };
}

/** Pause one research (its progress is kept), or all of them with no id. */
export function suspendResearch(campaign, id = null) {
  const active = id === null ? [] : campaign.research.active.filter((entry) => entry.id !== id);
  return active.length === campaign.research.active.length ? campaign : { ...campaign, research: { ...campaign.research, active } };
}

// Territories: one per operation, created when the operations are known.
export function ensureTerritories(campaign, entries) {
  let territories = campaign.territories;
  for (const entry of entries) {
    if (territories[entry.id]) continue;
    territories = { ...territories, [entry.id]: newTerritory(entry.id, entry.population) };
  }
  return territories === campaign.territories ? campaign : { ...campaign, territories };
}

export function setTerritoryTax(campaign, id, tax) {
  const territory = campaign.territories[id];
  if (!territory) return campaign;
  const next = withTax(territory, tax);
  return next === territory ? campaign : { ...campaign, territories: { ...campaign.territories, [id]: next } };
}

// Winning an operation holds its territory (a territory in revolt is won back).
export function winTerritory(campaign, id) {
  const territory = campaign.territories[id];
  if (!territory) return campaign;
  const next = holdTerritory(territory);
  return next === territory ? campaign : { ...campaign, territories: { ...campaign.territories, [id]: next } };
}

export const dayOf = (campaign) => Math.floor(campaign.hours / HOURS_PER_DAY);

/**
 * Game hours pass. Each hour moves research along (paid from funds); each day collects tax and moves population and
 * mood. Returns the new campaign and what happened: { type: "researched" | "day" | "revolt", ... }.
 */
export function advanceCampaign(campaign, hours, catalog) {
  let next = campaign;
  const events = [];
  for (let step = 0; step < hours; step += 1) {
    const hour = next.hours + 1;
    let { research, funds } = next;
    const done = researchHour(research, funds, catalog);
    research = done.research;
    funds = done.funds;
    let items = next.items;
    for (const itemId of done.finished) {
      items = [...items, itemId];
      events.push({ type: "researched", itemId });
    }
    let territories = next.territories;
    if (hour % HOURS_PER_DAY === 0) {
      const day = hour / HOURS_PER_DAY;
      let income = 0;
      territories = { ...territories };
      for (const [id, territory] of Object.entries(territories)) {
        const result = advanceTerritoryDay(territory, day);
        territories[id] = result.territory;
        income += result.income;
        if (territory.status !== "rebel" && result.territory.status === "rebel") events.push({ type: "revolt", id });
      }
      funds = Math.round((funds + income) * 100) / 100;
      events.push({ type: "day", day, income: Math.round(income * 100) / 100 });
    }
    next = { ...next, hours: hour, research, funds, items, territories };
  }
  return { campaign: next, events };
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

// FreeSynd's discovery rule: a weapon brought home that is not yet researched does not unlock. If its research is the
// one under way it gets a 25 percent boost, once per item; reaching 100 finishes it. Returns the new campaign and a
// "discovered" event for every boost.
export const DISCOVERY_BOOST = 25;

export function discoverItems(campaign, itemIds, catalog) {
  let next = campaign;
  const events = [];
  for (const id of itemIds) {
    const item = catalog.find((entry) => entry.id === id);
    const research = next.research;
    if (!item || isItemAvailable(next, item) || !research.active.some((entry) => entry.id === id) || research.discovered.includes(id)) {
      continue;
    }
    const progress = Math.min(100, (research.progress[id] ?? 0) + DISCOVERY_BOOST);
    const finished = progress >= 100 - 1e-9;
    next = {
      ...next,
      items: finished ? [...next.items, id] : next.items,
      research: {
        ...research,
        active: finished ? research.active.filter((entry) => entry.id !== id) : research.active,
        progress: { ...research.progress, [id]: finished ? 100 : progress },
        discovered: [...research.discovered, id],
      },
    };
    events.push({ type: "discovered", itemId: id, finished });
  }
  return { campaign: next, events };
}

// Items kept from a successful operation: gear that is already available joins the operative's loadout while there
// is room. Gear that is not yet researched is not kept (see discoverItems).
export function captureItems(campaign, operatorId, itemIds, catalog, defaults) {
  let next = campaign;
  for (const id of itemIds) {
    const item = catalog.find((entry) => entry.id === id);
    if (!item || !isItemAvailable(next, item)) continue;
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

export function slotItem(campaign, operatorId, slot, catalog, defaults) {
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

// Mission intelligence, bought before an operation (FreeSynd sells briefing detail by the level):
//   level 1  patrol survey: every enemy agent and guard shows on the minimap for the whole operation
//   level 2  full survey: police, criminals, civilians and vehicles show as well
// The price rises with the number of enemies, and each level costs twice the one before.
export const INTEL_LEVELS = 2;
export const INTEL_LABELS = Object.freeze(["No survey", "Patrol survey", "Full survey"]);

export const intelLevel = (campaign, missionId) => campaign.intel?.[missionId] ?? 0;

export function intelPrice(level, enemies) {
  return (10 + 2 * enemies) * 2 ** (level - 1);
}

export function buyIntel(campaign, missionId, enemies) {
  const next = intelLevel(campaign, missionId) + 1;
  if (next > INTEL_LEVELS) return campaign;
  const price = intelPrice(next, enemies);
  if (campaign.funds < price) return campaign;
  return { ...campaign, funds: campaign.funds - price, intel: { ...campaign.intel, [missionId]: next } };
}

// The figures shown for an item in the shop (FreeSynd lists rounds, price per round, range, damage and weight).
export function describeStats(item) {
  const effect = item.effect ?? {};
  const parts = [];
  if (item.action === "disable-pulse") {
    const pellets = effect.pellets ? ` x${effect.pellets}` : "";
    parts.push(`Damage ${effect.attack}${pellets}`, `Range ${effect.range}`, `Recharge ${effect.cooldown} s`);
    if (effect.pierce) parts.push("Pierces");
    if (effect.burn) parts.push(`Burns ${effect.burn.dps} a second for ${effect.burn.seconds} s`);
  } else if (item.action === "time-bomb") {
    parts.push(`Blast ${effect.attack}`, `Radius ${effect.radius}`, `Fuse ${effect.fuse} s`);
  } else if (item.action === "shield") {
    parts.push(`Lasts ${effect.duration} s`);
  } else if (item.action === "scan") {
    parts.push(`Reach ${effect.radius}`, `Lasts ${effect.duration} s`);
  } else if (item.action === "restore-vitality") {
    parts.push(effect.restoreFull ? "Restores to full" : `Restores ${effect.restoreVitality}`);
  } else if (item.action === "persuade") {
    parts.push(`Range ${effect.range}`);
  }
  if (item.charges) {
    const each = roundPrice(item);
    parts.push(`${item.charges} ${item.action === "disable-pulse" ? "rounds" : "uses"}`);
    if (each > 0) parts.push(`${each.toFixed(2)} funds each to refill`);
  }
  if (item.weight) parts.push(`Weight ${item.weight}`);
  return parts;
}

/**
 * Enemy agents are fitted with the best of every body part the squad has (FreeSynd gives them the highest version
 * available), so upgrading your own agents makes theirs tougher, faster and steadier too.
 */
export function enemyUpgrades(campaign) {
  const best = emptyUpgrades();
  for (const member of campaign.roster ?? []) {
    if (!member.alive) continue;
    const owned = upgradesOf(campaign, member.id);
    for (const part of PART_NAMES) best[part] = Math.max(best[part], owned[part]);
  }
  return best;
}

/**
 * Enemies are armed from your progress (FreeSynd gives the opposition the weapons you have researched): every other enemy
 * agent in the operation carries one of the researched weapons, in turn, the dearest first. Returns a Map from the
 * placement id to the equipment item, so the same campaign always meets the same armament.
 */
export function enemyArmament(enemyIds, campaign, catalog) {
  const researched = campaign.items
    .map((id) => catalog.find((entry) => entry.id === id))
    .filter((item) => item && item.action === "disable-pulse" && !item.missionItem)
    .sort((left, right) => (right.researchCost ?? 0) - (left.researchCost ?? 0) || (left.id < right.id ? -1 : 1));
  const arms = new Map();
  if (researched.length === 0) return arms;
  enemyIds.forEach((id, index) => {
    if (index % 2 === 1) arms.set(id, researched[Math.floor(index / 2) % researched.length]);
  });
  return arms;
}

/**
 * The end of the campaign: once every main mission is won, the world is held. Returns the summary the ending shows
 * (days played, funds, operatives lost, territories held) and whether it has been shown already.
 */
export function campaignEnding(campaign, completedIds, missionIds) {
  const won = missionIds.length > 0 && missionIds.every((id) => completedIds.includes(id));
  return {
    won,
    shown: campaign.ended === true,
    days: dayOf(campaign),
    funds: Math.floor(campaign.funds),
    lost: campaign.roster.filter((member) => !member.alive).length,
    held: Object.values(campaign.territories).filter((territory) => territory.status !== "rebel").length,
  };
}

export function markEnded(campaign) {
  return campaign.ended === true ? campaign : { ...campaign, ended: true };
}
