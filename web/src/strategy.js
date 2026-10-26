// SPDX-License-Identifier: GPL-2.0-or-later

// The strategic layer, after FreeSynd's: a campaign clock, territories that pay tax and change mood, and research
// that runs on game time and is paid for by the hour. Everything here is pure and deterministic: the same
// campaign and the same hours give the same result, so saves and tests agree.

// A game hour is four seconds of play and a day is 24 hours. The clock runs while an operation is on.
export const SECONDS_PER_HOUR = 4;
export const HOURS_PER_DAY = 24;
export const SECONDS_PER_DAY = SECONDS_PER_HOUR * HOURS_PER_DAY;

export const MOODS = Object.freeze(["very happy", "happy", "content", "unhappy", "discontent", "rebel"]);
export const MOOD_START = 2;
export const TAX_DEFAULT = 30;
export const TAX_STEP = 10;
export const IMPROVE_DAYS = 15;
// Tax revenue, as FreeSynd has it: ((whole millions of people + 1) x 1375 x rate) / 1000 funds a day.
export const DEFAULT_POPULATION = 3_000_000;

// A cheap integer hash, so "random" population drift is the same every time for the same day and place.
export function hashNumbers(...values) {
  let hash = 2166136261;
  for (const value of values) {
    for (const char of String(value)) {
      hash ^= char.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    hash ^= 0x9e37;
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967296;
}

// Rival companies try to take over the territories you hold. An attempt gives a deadline (in game days) to play the territory's
// defence operation; if it passes, the rival has the territory and it must be taken again. Attempts are rare, more likely where
// people are unhappy, never before the first days are over, and never more than a couple at once.
export const TAKEOVER_DAYS = 6;
export const TAKEOVER_FIRST_DAY = 4;
export const TAKEOVER_MAX_AT_ONCE = 2;
export const takeoverChance = (mood) => 0.03 + 0.01 * mood;
const takeoverRoll = (id, day) => hashNumbers("takeover", id, day);

export function newTerritory(id, population = DEFAULT_POPULATION) {
  return { id, base: population, population, tax: TAX_DEFAULT, mood: MOOD_START, moodDays: 0, status: "open", threat: null };
}

export function sanitizeTerritory(id, value) {
  const base = Number.isFinite(value?.base) && value.base > 0 ? Math.round(value.base) : DEFAULT_POPULATION;
  const population = Number.isFinite(value?.population) ? Math.round(value.population) : base;
  const tax = Number.isInteger(value?.tax) ? Math.min(100, Math.max(0, value.tax)) : TAX_DEFAULT;
  const mood = Number.isInteger(value?.mood) ? Math.min(MOODS.length - 1, Math.max(0, value.mood)) : MOOD_START;
  const moodDays = Number.isInteger(value?.moodDays) && value.moodDays >= 0 ? value.moodDays : 0;
  const status = ["open", "finished", "rebel"].includes(value?.status) ? value.status : "open";
  // Only a territory you hold can be under threat of takeover.
  const until = value?.threat?.until;
  const threat = status === "finished" && Number.isInteger(until) && until >= 0 ? { until } : null;
  return { id, base, population: Math.min(base + 2000, Math.max(base - 1000, population)), tax, mood, moodDays, status, threat };
}

/** Funds a territory pays each day: only territories you hold, and none while they are in revolt. */
export function dailyTax(territory) {
  if (territory.status !== "finished") return 0;
  return Math.floor(((Math.floor(territory.population / 1_000_000) + 1) * 1375 * territory.tax) / 1000);
}

/** Days between mood changes at this tax rate, and which way the mood is heading. */
export function moodRule(tax) {
  if (tax <= TAX_DEFAULT) return { direction: "better", days: IMPROVE_DAYS };
  if (tax > 90) return { direction: "worse", days: 1 };
  return { direction: "worse", days: Math.max(1, Math.round(((100 - tax) * 12) / 100)) };
}

/** Change the tax rate; crossing the 30 percent line restarts the mood timer. */
export function withTax(territory, tax) {
  const next = Math.min(100, Math.max(0, Math.round(tax)));
  if (next === territory.tax) return territory;
  const crossed = (next <= TAX_DEFAULT) !== (territory.tax <= TAX_DEFAULT);
  return { ...territory, tax: next, moodDays: crossed ? 0 : territory.moodDays };
}

/** A territory won (or won back from revolt) is held, and its people start content. */
export function holdTerritory(territory) {
  if (territory.status === "finished") return territory;
  return { ...territory, status: "finished", mood: territory.status === "rebel" ? MOOD_START : territory.mood, moodDays: 0, threat: null };
}

/** A takeover attempt that has been seen off: the threat is over and the people feel safer. */
export function defendTerritory(territory) {
  if (!territory.threat) return territory;
  return { ...territory, threat: null, mood: Math.max(0, territory.mood - 1), moodDays: 0 };
}

/** The rival company's attempt, and how many days are left to answer it (0 on the day it falls). */
export function takeoverDaysLeft(territory, day) {
  return territory.threat ? Math.max(0, territory.threat.until - day) : null;
}

/**
 * One day passes: the population drifts a little, the mood timer runs, and tax is collected. A rival company may begin a takeover
 * (only if `allowThreat`), and one that has run out of time succeeds. `event` says which: "takeover" or "takeover-lost".
 */
export function advanceTerritoryDay(territory, day, allowThreat = false) {
  const roll = hashNumbers("pop", territory.id, day);
  const size = 100 + Math.floor(hashNumbers("size", territory.id, day) * 201);
  const drift = roll < 0.6 ? size : -size;
  const population = Math.min(territory.base + 2000, Math.max(territory.base - 1000, territory.population + drift));
  let { mood, moodDays, status } = territory;
  // Only territories you hold (or have lost to revolt) have a mood that moves.
  if (status !== "open") {
    moodDays += 1;
    const rule = moodRule(territory.tax);
    if (moodDays >= rule.days) {
      moodDays = 0;
      if (rule.direction === "better") mood = Math.max(0, mood - 1);
      else mood = Math.min(MOODS.length - 1, mood + 1);
    }
    if (mood === MOODS.length - 1 && status === "finished") status = "rebel";
  }
  let moved = { ...territory, population, mood, moodDays, status };
  let event = null;
  if (status !== "finished") {
    moved.threat = null;
  } else if (moved.threat && day >= moved.threat.until) {
    // The deadline has passed: the rival has it. It is taken again like any territory, and its people start from content.
    moved = { ...moved, status: "open", threat: null, mood: MOOD_START, moodDays: 0 };
    event = "takeover-lost";
  } else if (!moved.threat && allowThreat && day >= TAKEOVER_FIRST_DAY && takeoverRoll(territory.id, day) < takeoverChance(mood)) {
    moved = { ...moved, threat: { until: day + TAKEOVER_DAYS } };
    event = "takeover";
  }
  return { territory: moved, income: dailyTax(territory), event };
}

// ---------------------------------------------------------------- research

// FreeSynd's research funding: ten levels. Each research has a minimum funding (a day's cost at level 1); the funding level
// multiplies it, and the percent of the research done per game hour grows with it, a little less than in proportion.
export const RESEARCH_RATES = Object.freeze([0.416, 0.83, 1.25, 1.666, 2.083, 2.5, 2.941, 3.333, 3.846, 4.166]);
export const RESEARCH_FUNDING = Object.freeze([1, 2, 4, 6, 10, 15, 30, 50, 75, 100]);
export const RESEARCH_LEVELS = RESEARCH_RATES.length;

/** Funds spent per game hour on an item at a funding level: its minimum funding times the level's multiple, over 24. */
export function researchHourlyCost(item, level) {
  return (item.researchCost * RESEARCH_FUNDING[level - 1]) / HOURS_PER_DAY;
}

/** Hours the research would take from this progress at this level, if funds hold out. */
export function researchHoursLeft(progress, level) {
  return Math.floor((100 - progress) / RESEARCH_RATES[level - 1] + 1e-9);
}

/** What an item still needs before it can be researched: the ids of unfinished items it requires. */
export function missingRequirements(item, researchedIds, catalog) {
  return (item.requires ?? []).filter((id) => {
    const required = catalog.find((entry) => entry.id === id);
    return required && (required.researchCost ?? 0) > 0 && !researchedIds.includes(id);
  });
}

/** The most items that can be researched at once. */
export const MAX_ACTIVE_RESEARCH = 6;

/** What is being researched as a list of { id, level } (older saves held a single id and one level). */
export function activeResearch(research) {
  if (Array.isArray(research.active)) return research.active;
  return typeof research.active === "string" ? [{ id: research.active, level: research.level }] : [];
}

/**
 * One game hour of research. Everything under way moves along at once (FreeSynd lets several researches run together), each
 * at its own funding level, paid from the funds in the order they were started; if funds fall short the progress made is in
 * proportion to what could be paid. Returns the new research record, the funds left, and the ids finished this hour.
 */
export function researchHour(research, funds, catalog) {
  let money = funds;
  const progress = { ...research.progress };
  const finished = [];
  const active = [];
  for (const entry of activeResearch(research)) {
    const item = catalog.find((candidate) => candidate.id === entry.id);
    if (!item) continue;
    const level = Math.min(RESEARCH_LEVELS, Math.max(1, entry.level));
    const cost = researchHourlyCost(item, level);
    const affordable = cost <= 0 ? 1 : Math.min(1, money / cost);
    if (affordable <= 0) {
      active.push(entry);
      continue;
    }
    const rate = RESEARCH_RATES[level - 1];
    const reached = Math.min(100, (progress[item.id] ?? 0) + rate * affordable);
    money -= cost * affordable;
    // FreeSynd works the finishing hour out as a whole number, so the last fraction of an hour's progress is not waited for.
    if (reached >= 100 - 1e-9 || reached > 100 - rate + 1e-9) {
      progress[item.id] = 100;
      finished.push(item.id);
    } else {
      progress[item.id] = Math.round(reached * 1000) / 1000;
      active.push(entry);
    }
  }
  return { research: { ...research, active, progress }, funds: Math.max(0, Math.round(money * 1000) / 1000), finished };
}
