// SPDX-License-Identifier: GPL-2.0-or-later

import assert from "node:assert/strict";
import test from "node:test";

import {
  HOURS_PER_DAY,
  IMPROVE_DAYS,
  MOODS,
  MOOD_START,
  RESEARCH_FUNDING,
  RESEARCH_RATES,
  SECONDS_PER_DAY,
  TAX_DEFAULT,
  TAKEOVER_DAYS,
  TAKEOVER_FIRST_DAY,
  advanceTerritoryDay,
  dailyTax,
  defendTerritory,
  takeoverChance,
  takeoverDaysLeft,
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
  assert.equal(dailyTax(territory), 165, "FreeSynd: (3 + 1) x 1375 x 30 / 1000");
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
  assert.deepEqual(repaired, {
    id: "x", base: 3_000_000, population: 3_002_000, tax: 100, mood: 5, moodDays: 0, status: "open", threat: null,
  });
  assert.equal(sanitizeTerritory("x", { tax: 40, status: "rebel" }).status, "rebel");
  assert.deepEqual(sanitizeTerritory("x", { status: "finished", threat: { until: 9 } }).threat, { until: 9 });
  assert.equal(sanitizeTerritory("x", { status: "finished", threat: { until: -2 } }).threat, null, "nonsense deadlines are dropped");
  assert.equal(sanitizeTerritory("x", { status: "open", threat: { until: 9 } }).threat, null, "only a held territory can be under threat");
  assert.equal(sanitizeTerritory("x", { status: "rebel", threat: { until: 9 } }).threat, null);
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
  assert.deepEqual([...RESEARCH_FUNDING], [1, 2, 4, 6, 10, 15, 30, 50, 75, 100], "FreeSynd's funding multiples");
  assert.equal(researchHourlyCost(catalog[0], 1), 100 / 24, "a day's minimum funding spread over 24 hours");
  assert.equal(researchHourlyCost(catalog[0], 10), 10000 / 24);
  assert.ok(researchHourlyCost(catalog[0], 10) > researchHourlyCost(catalog[0], 1) * 12, "speed is paid for");
  assert.equal(researchHoursLeft(0, 1), 240, "ten days at the lowest level");
  assert.equal(researchHoursLeft(0, 10), 24);
  assert.equal(researchHoursLeft(95, 10), 1);
});

test("an hour of research pays the hourly cost and moves the active item along", () => {
  const start = { active: [{ id: "a", level: 4 }], level: 4, progress: {} };
  const { research, funds, finished } = researchHour(start, 100, catalog);
  assert.deepEqual(finished, []);
  assert.equal(research.progress.a, 1.666);
  assert.ok(Math.abs(funds - (100 - researchHourlyCost(catalog[0], 4))) < 0.01);
  assert.equal(start.progress.a, undefined, "the input is not changed");
});

test("with too little money research slows to what can be paid, and with none it waits", () => {
  const cost = researchHourlyCost(catalog[0], 4);
  const half = researchHour({ active: [{ id: "a", level: 4 }], level: 4, progress: {} }, cost / 2, catalog);
  assert.equal(half.research.progress.a, 0.833);
  assert.equal(half.funds, 0);
  const broke = researchHour({ active: [{ id: "a", level: 4 }], level: 4, progress: { a: 10 } }, 0, catalog);
  assert.equal(broke.research.progress.a, 10);
  assert.deepEqual(broke.finished, []);
});

test("research finishes at 100 percent, clears the active slot, and other items keep their progress", () => {
  const state = { active: [{ id: "a", level: 10 }], level: 10, progress: { a: 97, b: 33 } };
  const done = researchHour(state, 5000, catalog);
  assert.deepEqual(done.finished, ["a"]);
  assert.deepEqual(done.research.active, []);
  assert.equal(done.research.progress.a, 100);
  assert.equal(done.research.progress.b, 33);
  const nothing = researchHour({ active: [], level: 3, progress: {} }, 50, catalog);
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

test("several researches run at once, each at its own level, paid in the order they were started", () => {
  const both = { active: [{ id: "a", level: 2 }, { id: "free", level: 9 }, { id: "c", level: 5 }], level: 4, progress: {} };
  const { research, finished } = researchHour(both, 1000, catalog);
  assert.deepEqual(finished, []);
  assert.ok(research.progress.a > 0 && research.progress.c > 0, "both items moved this hour");
  assert.ok(research.progress.c > research.progress.a, "the higher funding level is faster");
  // With money for only the first, the later ones wait.
  const tight = researchHour(
    { active: [{ id: "a", level: 4 }, { id: "c", level: 4 }], level: 4, progress: {} },
    researchHourlyCost(catalog[0], 4),
    catalog,
  );
  assert.equal(tight.research.progress.a, 1.666);
  assert.equal(tight.research.progress.c ?? 0, 0, "nothing left for the second");
  assert.equal(tight.funds, 0);
  // Two can finish in the same hour.
  const nearly = { active: [{ id: "a", level: 10 }, { id: "c", level: 10 }], level: 10, progress: { a: 97, c: 97 } };
  const twice = researchHour(nearly, 10000, catalog);
  assert.deepEqual(twice.finished, ["a", "c"]);
  assert.deepEqual(twice.research.active, []);
});

// ---- takeover attempts by a rival company

// The first day on which this territory is chosen for an attempt, searching forward from the earliest allowed day.
function firstAttempt(territory, allow = true) {
  for (let day = TAKEOVER_FIRST_DAY; day < TAKEOVER_FIRST_DAY + 2000; day += 1) {
    const result = advanceTerritoryDay(territory, day, allow);
    if (result.event === "takeover") return { day, result };
  }
  return null;
}

test("a rival company sometimes moves on a held territory, never early, never when not allowed, and always the same way", () => {
  const found = firstAttempt(held());
  assert.ok(found && found.day >= TAKEOVER_FIRST_DAY, "it happens, but not in the first days");
  assert.deepEqual(found.result.territory.threat, { until: found.day + TAKEOVER_DAYS }, "with days to answer it");
  assert.equal(found.result.territory.status, "finished", "the territory is still yours meanwhile");
  assert.deepEqual(firstAttempt(held()).result, found.result, "the same every time");
  assert.equal(firstAttempt(held(), false), null, "never when attempts are not allowed (too many already)");
  for (let day = 1; day < TAKEOVER_FIRST_DAY; day += 1) {
    assert.equal(advanceTerritoryDay(held(), day, true).event, null, `no attempt on day ${day}`);
  }
  assert.equal(advanceTerritoryDay(newTerritory("t"), 50, true).event, null, "a territory you do not hold is not attacked");
  assert.equal(advanceTerritoryDay(held({ status: "rebel" }), 50, true).event, null, "nor one in revolt");
});

test("attempts are rare, and likelier where people are unhappy", () => {
  let calm = 0;
  let angry = 0;
  for (let day = TAKEOVER_FIRST_DAY; day < TAKEOVER_FIRST_DAY + 3000; day += 1) {
    if (advanceTerritoryDay(held({ id: "calm" }), day, true).event === "takeover") calm += 1;
    if (advanceTerritoryDay(held({ id: "angry", mood: 4 }), day, true).event === "takeover") angry += 1;
  }
  assert.ok(calm > 20 && calm < 250, `about 3 in 100 days: ${calm} in 3000`);
  assert.ok(takeoverChance(4) > takeoverChance(0));
});

test("a threatened territory pays tax until the deadline, then falls to the rival and must be taken again", () => {
  const threatened = held({ threat: { until: 20 } });
  assert.equal(takeoverDaysLeft(threatened, 17), 3);
  assert.equal(takeoverDaysLeft(held(), 17), null);
  const midway = advanceTerritoryDay(threatened, 19, true);
  assert.equal(midway.event, null);
  assert.equal(midway.territory.status, "finished");
  assert.ok(midway.income > 0, "still pays");
  assert.deepEqual(midway.territory.threat, { until: 20 });
  const lost = advanceTerritoryDay(threatened, 20, true);
  assert.equal(lost.event, "takeover-lost");
  assert.deepEqual([lost.territory.status, lost.territory.threat, lost.territory.mood], ["open", null, MOOD_START]);
  assert.equal(advanceTerritoryDay(lost.territory, 21).income, 0, "and pays nothing now");
});

test("seeing off the attempt ends the threat and settles the people; winning a territory clears any threat", () => {
  const safe = defendTerritory(held({ threat: { until: 30 }, mood: 3, moodDays: 4 }));
  assert.deepEqual([safe.threat, safe.mood, safe.moodDays], [null, 2, 0]);
  const calm = held();
  assert.equal(defendTerritory(calm), calm, "nothing to defend against");
  assert.equal(holdTerritory({ ...newTerritory("t"), status: "rebel", threat: { until: 3 } }).threat, null);
  const becomingRebel = advanceTerritoryDay(held({ mood: 5, threat: { until: 99 } }), 10, true);
  assert.equal(becomingRebel.territory.status, "rebel");
  assert.equal(becomingRebel.territory.threat, null, "a revolt ends the threat: the rival has nothing left to take");
});
