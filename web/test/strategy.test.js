// SPDX-License-Identifier: GPL-2.0-or-later

import assert from "node:assert/strict";
import test from "node:test";

import {
  HOURS_PER_DAY,
  IMPROVE_DAYS,
  MOODS,
  MOOD_START,
  RESEARCH_RATES,
  SECONDS_PER_DAY,
  TAX_DEFAULT,
  advanceTerritoryDay,
  dailyTax,
  hashNumbers,
  holdTerritory,
  missingRequirements,
  moodRule,
  newTerritory,
  researchHour,
  researchHourlyCost,
  researchHoursLeft,
  sanitizeTerritory,
  withTax,
} from "../src/strategy.js";

const held = (over = {}) => ({ ...newTerritory("t", 3_000_000), status: "finished", ...over });

test("a game day is 24 hours of four seconds each", () => {
  assert.equal(SECONDS_PER_DAY, 96);
  assert.equal(HOURS_PER_DAY, 24);
});

test("only territories you hold pay, in proportion to people and rate, and none while in revolt", () => {
  const territory = held();
  assert.equal(dailyTax(newTerritory("t")), 0, "not yet won");
  assert.equal(dailyTax({ ...territory, status: "rebel" }), 0);
  assert.equal(dailyTax(territory), 9.9, "(3 + 1) x 1375 x 30% / 1000 x 6");
  assert.ok(dailyTax(held({ tax: 60 })) > dailyTax(territory));
  assert.ok(dailyTax(held({ population: 5_000_000 })) > dailyTax(territory));
  assert.equal(dailyTax(held({ tax: 0 })), 0);
});

test("the mood timer: at 30 percent or less things improve every 15 days; above that they worsen faster the higher the tax", () => {
  assert.deepEqual(moodRule(30), { direction: "better", days: IMPROVE_DAYS });
  assert.deepEqual(moodRule(0), { direction: "better", days: IMPROVE_DAYS });
  assert.deepEqual(moodRule(50), { direction: "worse", days: 6 });
  assert.deepEqual(moodRule(80), { direction: "worse", days: 2 });
  assert.deepEqual(moodRule(95), { direction: "worse", days: 1 });
  assert.ok(moodRule(40).days > moodRule(70).days);
});

test("a territory's mood moves on schedule, from content to revolt, and stops improving at very happy", () => {
  let territory = held({ tax: 50 });
  const log = [];
  for (let day = 1; day <= 40 && territory.status !== "rebel"; day += 1) {
    const before = territory.mood;
    territory = advanceTerritoryDay(territory, day).territory;
    if (territory.mood !== before) log.push([day, MOODS[territory.mood]]);
  }
  assert.deepEqual(log, [[6, "unhappy"], [12, "discontent"], [18, "rebel"]]);
  assert.equal(territory.status, "rebel");
  assert.equal(advanceTerritoryDay(territory, 19).income, 0, "rebels pay nothing");

  let calm = held({ tax: 20 });
  for (let day = 1; day <= 100; day += 1) calm = advanceTerritoryDay(calm, day).territory;
  assert.equal(calm.mood, 0, "very happy, and no better");
  assert.equal(calm.status, "finished");
});

test("changing the tax across 30 percent restarts the mood timer; elsewhere it carries on", () => {
  const t = held({ tax: 50, moodDays: 4 });
  assert.equal(withTax(t, 60).moodDays, 4);
  assert.equal(withTax(t, 30).moodDays, 0);
  assert.equal(withTax(t, 50), t);
  assert.equal(withTax(held({ tax: 20, moodDays: 3 }), 30).moodDays, 3, "30 is still the calm side");
  assert.equal(withTax(t, 400).tax, 100);
  assert.equal(withTax(t, -5).tax, 0);
});

test("winning a territory holds it; winning back a revolt calms its people", () => {
  const won = holdTerritory(newTerritory("t"));
  assert.equal(won.status, "finished");
  const revolt = held({ status: "rebel", mood: 5, moodDays: 3 });
  const back = holdTerritory(revolt);
  assert.deepEqual([back.status, back.mood, back.moodDays], ["finished", MOOD_START, 0]);
  assert.equal(holdTerritory(won), won, "nothing changes if already held");
});

test("population drifts 100 to 300 a day within its limits, the same way every time", () => {
  let territory = held();
  const seen = [];
  for (let day = 1; day <= 200; day += 1) {
    const next = advanceTerritoryDay(territory, day).territory;
    const change = Math.abs(next.population - territory.population);
    seen.push(change);
    territory = next;
    assert.ok(territory.population >= territory.base - 1000 && territory.population <= territory.base + 2000);
  }
  assert.ok(seen.every((change) => change <= 300), "at most 300 a day");
  assert.ok(seen.filter((change) => change >= 100).length > 150, "and mostly 100 or more, except where a limit holds it");
  assert.deepEqual(advanceTerritoryDay(held(), 7), advanceTerritoryDay(held(), 7));
  assert.notEqual(hashNumbers("a", 1), hashNumbers("a", 2));
});

test("damaged territory records are repaired", () => {
  assert.deepEqual(sanitizeTerritory("x", null), { ...newTerritory("x"), id: "x" });
  const repaired = sanitizeTerritory("x", { base: -4, population: 1e12, tax: 500, mood: 99, moodDays: -3, status: "weird" });
  assert.deepEqual(repaired, { id: "x", base: 3_000_000, population: 3_002_000, tax: 100, mood: 5, moodDays: 0, status: "open" });
  assert.equal(sanitizeTerritory("x", { tax: 40, status: "rebel" }).status, "rebel");
});

// ---- research

const catalog = [
  { id: "a", researchCost: 100 },
  { id: "b", researchCost: 200, requires: ["a"] },
  { id: "free", researchCost: 0 },
  { id: "c", researchCost: 50, requires: ["free", "b"] },
];

test("research costs rise with the funding level, and so does the pace", () => {
  assert.equal(RESEARCH_RATES.length, 10);
  assert.ok(RESEARCH_RATES.every((rate, index) => index === 0 || rate > RESEARCH_RATES[index - 1]));
  assert.equal(researchHourlyCost(catalog[0], 1), 1.5);
  assert.ok(researchHourlyCost(catalog[0], 10) > researchHourlyCost(catalog[0], 1) * 12, "speed is paid for");
  assert.equal(researchHoursLeft(0, 1), 67);
  assert.equal(researchHoursLeft(0, 10), 6);
  assert.equal(researchHoursLeft(94, 10), 1);
});

test("an hour of research pays the hourly cost and moves the active item along", () => {
  const start = { active: "a", level: 4, progress: {} };
  const { research, funds, finished } = researchHour(start, 100, catalog);
  assert.equal(finished, null);
  assert.equal(research.progress.a, 4);
  assert.ok(Math.abs(funds - (100 - researchHourlyCost(catalog[0], 4))) < 0.01);
  assert.equal(start.progress.a, undefined, "the input is not changed");
});

test("with too little money research slows to what can be paid, and with none it waits", () => {
  const cost = researchHourlyCost(catalog[0], 4);
  const half = researchHour({ active: "a", level: 4, progress: {} }, cost / 2, catalog);
  assert.equal(half.research.progress.a, 2);
  assert.equal(half.funds, 0);
  const broke = researchHour({ active: "a", level: 4, progress: { a: 10 } }, 0, catalog);
  assert.equal(broke.research.progress.a, 10);
  assert.equal(broke.finished, null);
});

test("research finishes at 100 percent, clears the active slot, and other items keep their progress", () => {
  const state = { active: "a", level: 10, progress: { a: 90, b: 33 } };
  const done = researchHour(state, 500, catalog);
  assert.equal(done.finished, "a");
  assert.equal(done.research.active, null);
  assert.equal(done.research.progress.a, 100);
  assert.equal(done.research.progress.b, 33);
  const nothing = researchHour({ active: null, level: 3, progress: {} }, 50, catalog);
  assert.equal(nothing.funds, 50);
});

test("an item needs the unfinished items it builds on", () => {
  assert.deepEqual(missingRequirements(catalog[1], [], catalog), ["a"]);
  assert.deepEqual(missingRequirements(catalog[1], ["a"], catalog), []);
  assert.deepEqual(missingRequirements(catalog[3], ["a"], catalog), ["b"], "starting items never block");
  assert.deepEqual(missingRequirements(catalog[0], [], catalog), []);
  assert.deepEqual(missingRequirements({ id: "z", requires: ["ghost"] }, [], catalog), [], "unknown requirements are ignored");
  assert.equal(TAX_DEFAULT, 30);
});
