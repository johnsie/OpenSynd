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
// Tax revenue: ((population in millions + 1) x 1375 x rate) / 1000 funds a day, scaled to this game's prices.
export const TAX_SCALE = 6;
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

export function newTerritory(id, population = DEFAULT_POPULATION) {
  return { id, base: population, population, tax: TAX_DEFAULT, mood: MOOD_START, moodDays: 0, status: "open" };
}

export function sanitizeTerritory(id, value) {
  const base = Number.isFinite(value?.base) && value.base > 0 ? Math.round(value.base) : DEFAULT_POPULATION;
  const population = Number.isFinite(value?.population) ? Math.round(value.population) : base;
  const tax = Number.isInteger(value?.tax) ? Math.min(100, Math.max(0, value.tax)) : TAX_DEFAULT;
  const mood = Number.isInteger(value?.mood) ? Math.min(MOODS.length - 1, Math.max(0, value.mood)) : MOOD_START;
  const moodDays = Number.isInteger(value?.moodDays) && value.moodDays >= 0 ? value.moodDays : 0;
  const status = ["open", "finished", "rebel"].includes(value?.status) ? value.status : "open";
  return { id, base, population: Math.min(base + 2000, Math.max(base - 1000, population)), tax, mood, moodDays, status };
}

/** Funds a territory pays each day: only territories you hold, and none while they are in revolt. */
export function dailyTax(territory) {
  if (territory.status !== "finished") return 0;
  return Math.round(((((territory.population / 1_000_000) + 1) * 1375 * territory.tax) / 100 / 1000) * TAX_SCALE * 100) / 100;
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
  return { ...territory, status: "finished", mood: territory.status === "rebel" ? MOOD_START : territory.mood, moodDays: 0 };
}

/** One day passes: the population drifts a little, the mood timer runs, and tax is collected. */
export function advanceTerritoryDay(territory, day) {
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
  const moved = { ...territory, population, mood, moodDays, status };
  return { territory: moved, income: dailyTax(territory) };
}

// ---------------------------------------------------------------- research

// How fast research runs at each of ten funding levels (percent of the research done per game hour), and what
// speeding it up costs: level 1 pays the item's price, each level above that a seventh more.
export const RESEARCH_RATES = Object.freeze([1.5, 2, 3, 4, 5.5, 7, 9, 11, 14, 18]);
export const RESEARCH_LEVELS = RESEARCH_RATES.length;
export const RESEARCH_PREMIUM = 0.15;

export function researchPremium(level) {
  return 1 + RESEARCH_PREMIUM * (level - 1);
}

/** Funds spent per game hour on an item at a funding level. */
export function researchHourlyCost(item, level) {
  return (item.researchCost * RESEARCH_RATES[level - 1] * researchPremium(level)) / 100;
}

/** Hours the research would take from this progress at this level, if funds hold out. */
export function researchHoursLeft(progress, level) {
  return Math.ceil((100 - progress) / RESEARCH_RATES[level - 1]);
}

/** What an item still needs before it can be researched: the ids of unfinished items it requires. */
export function missingRequirements(item, researchedIds, catalog) {
  return (item.requires ?? []).filter((id) => {
    const required = catalog.find((entry) => entry.id === id);
    return required && (required.researchCost ?? 0) > 0 && !researchedIds.includes(id);
  });
}

/**
 * One game hour of research. Only the chosen item moves; if funds fall short the progress made is in proportion to
 * what could be paid. Returns the new research record, the funds left, and the item finished this hour, if any.
 */
export function researchHour(research, funds, catalog) {
  const item = catalog.find((entry) => entry.id === research.active);
  if (!item) return { research, funds, finished: null };
  const level = Math.min(RESEARCH_LEVELS, Math.max(1, research.level));
  const cost = researchHourlyCost(item, level);
  const affordable = cost <= 0 ? 1 : Math.min(1, funds / cost);
  if (affordable <= 0) return { research, funds, finished: null };
  const progress = Math.min(100, (research.progress[item.id] ?? 0) + RESEARCH_RATES[level - 1] * affordable);
  const spent = cost * affordable;
  const finished = progress >= 100 - 1e-9 ? item.id : null;
  const next = {
    ...research,
    active: finished ? null : research.active,
    progress: { ...research.progress, [item.id]: finished ? 100 : Math.round(progress * 1000) / 1000 },
  };
  return { research: next, funds: Math.max(0, Math.round((funds - spent) * 1000) / 1000), finished };
}
