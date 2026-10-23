// SPDX-License-Identifier: GPL-2.0-or-later

import assert from "node:assert/strict";
import test from "node:test";

import {
  CIVILIAN_PENALTY,
  POLICE_PENALTY,
  penalise,
  SLOTS_PER_OPERATIVE,
  earnAchievement,
  advanceCampaign,
  dayOf,
  ensureTerritories,
  setTerritoryTax,
  winTerritory,
  startResearch,
  setResearchLevel,
  suspendResearch,
  researchBlockers,
  brainEffect,
  buyIntoSlot,
  canBuy,
  campaignEnding,
  captureItems,
  discoverItems,
  markEnded,
  netCost,
  sellFromSlot,
  sellValue,
  canResearchItem,
  ROSTER_MAX,
  SQUAD_MAX,
  HIRE_PRICE,
  aliveMembers,
  bench,
  deploy,
  deployedMembers,
  hire,
  loseOperatives,
  recruit,
  INTEL_LEVELS,
  enemyArmament,
  enemyUpgrades,
  describeStats,
  buyIntel,
  intelLevel,
  intelPrice,
  canFit,
  resupplyCost,
  roundPrice,
  fitUpgrade,
  removeUpgrade,
  upgradesOf,
  emptyCampaign,
  heartEffect,
  isItemAvailable,
  loadoutFor,
  parseCampaign,
  sanitizeLoadouts,
  serializeCampaign,
  setSlot,
} from "../src/campaign.js";

const catalog = [
  { id: "pulse", researchCost: 0 },
  { id: "kit" },
  { id: "heavy", researchCost: 12 },
  { id: "stim", researchCost: 8 },
];

test("an achievement pays its reward once", () => {
  const achievement = { id: "first", reward: 15 };
  let campaign = earnAchievement({ ...emptyCampaign(), funds: 0 }, achievement);
  assert.deepEqual([campaign.funds, campaign.achievements], [15, ["first"]]);
  assert.equal(earnAchievement(campaign, achievement), campaign);
});

test("body parts are fitted per operative in three tiers priced 1x, 5x and 10x", () => {
  let campaign = { ...emptyCampaign(), funds: 100000 };
  assert.deepEqual(upgradesOf(campaign, "op1"), { legs: 0, arms: 0, chest: 0, heart: 0, eyes: 0, brain: 0 });
  campaign = fitUpgrade(campaign, "op1", "legs");
  assert.deepEqual([campaign.funds, upgradesOf(campaign, "op1").legs], [94000, 1], "tier 1 costs FreeSynd's 6000 for legs");
  campaign = fitUpgrade(campaign, "op1", "legs");
  assert.deepEqual([campaign.funds, upgradesOf(campaign, "op1").legs], [64000, 2], "tier 2 costs 30000");
  assert.equal(canFit(campaign, "op1", "legs"), true);
  campaign = fitUpgrade(campaign, "op1", "legs");
  assert.deepEqual([campaign.funds, upgradesOf(campaign, "op1").legs], [4000, 3], "tier 3 costs 60000");
  assert.equal(canFit(campaign, "op1", "legs"), false, "nothing above tier 3");
  assert.equal(fitUpgrade(campaign, "op1", "legs"), campaign);
  assert.equal(fitUpgrade(campaign, "op1", "brain"), campaign, "cannot afford the brain (4500)");
  assert.equal(upgradesOf(campaign, "op2").legs, 0, "other operatives are untouched");
  assert.equal(fitUpgrade(campaign, "op1", "tail"), campaign, "no such part");
});

test("taking a part off returns what its top tier cost", () => {
  let campaign = { ...emptyCampaign(), funds: 100000 };
  campaign = fitUpgrade(fitUpgrade(campaign, "op1", "chest"), "op1", "chest");
  assert.equal(campaign.funds, 100000 - 8000 - 40000);
  campaign = removeUpgrade(campaign, "op1", "chest");
  assert.deepEqual([campaign.funds, upgradesOf(campaign, "op1").chest], [100000 - 8000, 1]);
  assert.equal(removeUpgrade({ ...emptyCampaign(), funds: 0 }, "op1", "chest").funds, 0);
});

test("old heart and brain research is refunded when a saved campaign is read", () => {
  const old = parseCampaign(JSON.stringify({ funds: 5, heart: 2, brain: 1 }));
  assert.equal(old.funds, 5 + 20 + 30 + 20);
  assert.equal("heart" in old, false);
});

test("new items must be researched before they can be used, and research runs on game hours", () => {
  let campaign = { ...emptyCampaign(), funds: 10000 };
  const [pulse, kit, heavy, stim] = catalog;
  assert.equal(isItemAvailable(campaign, pulse), true);
  assert.equal(isItemAvailable(campaign, kit), true);
  assert.equal(isItemAvailable(campaign, heavy), false);
  assert.equal(canResearchItem(campaign, pulse, catalog), false, "a starting item needs no research");
  assert.equal(canResearchItem(campaign, stim, catalog), true);
  campaign = startResearch(campaign, stim, catalog, 10);
  assert.deepEqual([campaign.research.active, campaign.research.level], [[{ id: "stim", level: 10 }], 10]);
  assert.equal(campaign.funds, 10000, "nothing is paid until time passes");
  const result = advanceCampaign(campaign, 24, catalog);
  assert.equal(result.campaign.hours, 24);
  assert.ok(result.campaign.funds < 10000, "paid by the hour");
  assert.equal(result.campaign.research.progress.stim, 100, "the top level finishes in a day");
  assert.deepEqual(result.events.filter((event) => event.type === "researched"), [{ type: "researched", itemId: "stim" }]);
  assert.deepEqual(result.campaign.items, ["stim"]);
  assert.deepEqual(result.campaign.research.active, []);
  assert.equal(isItemAvailable(result.campaign, stim), true);
  assert.equal(startResearch(result.campaign, stim, catalog), result.campaign, "already researched");
});

test("several items are researched at once and pausing one keeps its progress", () => {
  let campaign = { ...emptyCampaign(), funds: 500 };
  const [, , heavy, stim] = catalog;
  campaign = startResearch(campaign, heavy, catalog, 5);
  campaign = startResearch(campaign, stim, catalog, 8);
  assert.deepEqual(campaign.research.active.map((entry) => [entry.id, entry.level]), [["heavy", 5], ["stim", 8]]);
  campaign = advanceCampaign(campaign, 2, catalog).campaign;
  const heavyProgress = campaign.research.progress.heavy;
  assert.ok(heavyProgress > 0 && campaign.research.progress.stim > 0, "both moved");
  // Pausing one leaves the other going and keeps what was done.
  campaign = suspendResearch(campaign, "heavy");
  assert.deepEqual(campaign.research.active.map((entry) => entry.id), ["stim"]);
  campaign = advanceCampaign(campaign, 1, catalog).campaign;
  assert.equal(campaign.research.progress.heavy, heavyProgress);
  // Starting it again resumes; starting an active one again changes its level instead of adding it twice.
  campaign = startResearch(campaign, heavy, catalog, 5);
  campaign = startResearch(campaign, heavy, catalog, 9);
  assert.equal(campaign.research.active.filter((entry) => entry.id === "heavy").length, 1);
  assert.equal(campaign.research.active.find((entry) => entry.id === "heavy").level, 9);
  campaign = advanceCampaign(campaign, 1, catalog).campaign;
  assert.ok(campaign.research.progress.heavy > heavyProgress, "picks up where it stopped");
  assert.deepEqual(suspendResearch(campaign).research.active, [], "no id pauses everything");
  assert.equal(setResearchLevel(campaign, 99).research.level, 10);
  assert.equal(setResearchLevel(campaign, 0).research.level, 1);
  assert.equal(setResearchLevel(campaign, 3, "stim").research.active.find((entry) => entry.id === "stim").level, 3);
  assert.equal(setResearchLevel(campaign, 3, "nope"), campaign, "an unknown research is left alone");
});

test("an old save with one research under way reads as a list", () => {
  const old = parseCampaign(JSON.stringify({ research: { active: "stim", level: 6, progress: { stim: 20 } } }));
  assert.deepEqual(old.research.active, [{ id: "stim", level: 6 }]);
  const again = parseCampaign(JSON.stringify(old));
  assert.deepEqual(again.research.active, old.research.active);
  assert.deepEqual(parseCampaign(JSON.stringify({ research: { active: null } })).research.active, []);
});

test("research follows its chain: an item waits for the ones it builds on", () => {
  const chain = [{ id: "base", researchCost: 40 }, { id: "next", researchCost: 80, requires: ["base"] }];
  let campaign = { ...emptyCampaign(), funds: 300 };
  assert.deepEqual(researchBlockers(campaign, chain[1], chain), ["base"]);
  assert.equal(startResearch(campaign, chain[1], chain), campaign);
  campaign = { ...campaign, items: ["base"] };
  assert.deepEqual(researchBlockers(campaign, chain[1], chain), []);
  assert.deepEqual(startResearch(campaign, chain[1], chain).research.active.map((entry) => entry.id), ["next"]);
});

test("bringing home the item being researched boosts it by a quarter, once", () => {
  let campaign = startResearch({ ...emptyCampaign(), funds: 50 }, catalog[3], catalog);
  const found = discoverItems(campaign, ["stim"], catalog);
  assert.deepEqual(found.events, [{ type: "discovered", itemId: "stim", finished: false }]);
  assert.equal(found.campaign.research.progress.stim, 25);
  assert.deepEqual(found.campaign.research.active.map((entry) => entry.id), ["stim"]);
  assert.deepEqual(found.campaign.items, [], "not unlocked yet");
  const again = discoverItems(found.campaign, ["stim"], catalog);
  assert.deepEqual(again.events, [], "an item boosts its research only once");
  assert.equal(again.campaign.research.progress.stim, 25);
  // Items nobody is researching, and unknown ones, do nothing.
  assert.deepEqual(discoverItems(emptyCampaign(), ["stim", "ghost"], catalog).events, []);
  // Enough progress already: the boost finishes it.
  campaign = { ...campaign, research: { ...campaign.research, progress: { stim: 80 } } };
  const done = discoverItems(campaign, ["stim"], catalog);
  assert.deepEqual(done.events, [{ type: "discovered", itemId: "stim", finished: true }]);
  assert.deepEqual(done.campaign.items, ["stim"]);
  assert.deepEqual(done.campaign.research.active, []);
});

test("every 24 hours a day passes: tax is collected from held territories and moods move", () => {
  const fresh = { ...emptyCampaign(), funds: 0 };
  let campaign = ensureTerritories(fresh, [{ id: "m1", population: 3_000_000 }, { id: "m2", population: 4_000_000 }]);
  assert.deepEqual(Object.keys(campaign.territories), ["m1", "m2"]);
  assert.equal(ensureTerritories(campaign, [{ id: "m1" }]), campaign, "existing territories are kept");
  let result = advanceCampaign(campaign, 24, catalog);
  assert.equal(result.campaign.funds, 0, "nothing held, no tax");
  assert.equal(dayOf(result.campaign), 1);
  campaign = winTerritory(campaign, "m1");
  campaign = setTerritoryTax(campaign, "m1", 60);
  result = advanceCampaign(campaign, 24, catalog);
  const day = result.events.find((event) => event.type === "day");
  assert.equal(day.day, 1);
  assert.ok(day.income > 9.9 && result.campaign.funds === day.income, "60 percent pays more than the 30 percent base of 9.9");
  assert.equal(advanceCampaign(campaign, 23, catalog).campaign.funds, 0, "no tax before the day is out");
});

test("a territory taxed too hard rebels, and winning it back ends the revolt", () => {
  let campaign = ensureTerritories(emptyCampaign(), [{ id: "m1" }]);
  campaign = setTerritoryTax(winTerritory(campaign, "m1"), "m1", 95);
  const result = advanceCampaign(campaign, 24 * 4, catalog);
  assert.equal(result.campaign.territories.m1.status, "rebel");
  assert.equal(result.events.filter((event) => event.type === "revolt").length, 1);
  const calmer = winTerritory(result.campaign, "m1");
  assert.equal(calmer.territories.m1.status, "finished");
  assert.equal(calmer.territories.m1.mood, 2);
  assert.equal(setTerritoryTax(campaign, "ghost", 40), campaign);
});

test("each operative holds at most eight items and only available ones", () => {
  const defaults = ["pulse", "kit"];
  let campaign = { ...emptyCampaign(), items: ["stim"] };
  assert.deepEqual(loadoutFor(campaign, "op1", defaults), defaults);

  for (let slot = 0; slot < 12; slot += 1) {
    campaign = setSlot(campaign, "op1", loadoutFor(campaign, "op1", defaults).length, "kit", catalog, defaults);
  }
  assert.equal(loadoutFor(campaign, "op1", defaults).length, SLOTS_PER_OPERATIVE);

  // Unresearched items and out-of-range slots are refused.
  assert.equal(setSlot(campaign, "op1", 0, "heavy", catalog, defaults), campaign);
  assert.equal(setSlot(campaign, "op1", 8, "kit", catalog, defaults), campaign);
  assert.equal(setSlot(campaign, "op1", -1, "kit", catalog, defaults), campaign);
  assert.equal(setSlot(campaign, "op1", 0, "nonsense", catalog, defaults), campaign);

  // Replacing and clearing slots.
  const swapped = setSlot(campaign, "op1", 0, "stim", catalog, defaults);
  assert.equal(loadoutFor(swapped, "op1", defaults)[0], "stim");
  const cleared = setSlot(swapped, "op1", 0, null, catalog, defaults);
  assert.equal(loadoutFor(cleared, "op1", defaults).length, 7);
  assert.equal(setSlot(emptyCampaign(), "op2", 5, null, catalog, defaults).loadouts.op2, undefined);
});

test("loadouts are independent per operative", () => {
  const defaults = ["pulse"];
  const campaign = setSlot(emptyCampaign(), "op1", 1, "kit", catalog, defaults);
  assert.deepEqual(loadoutFor(campaign, "op1", defaults), ["pulse", "kit"]);
  assert.deepEqual(loadoutFor(campaign, "op2", defaults), ["pulse"]);
});

test("loadouts lose items that are no longer available", () => {
  const campaign = {
    ...emptyCampaign(),
    loadouts: { op1: ["pulse", "heavy", "gone", "kit"] },
  };
  assert.deepEqual(sanitizeLoadouts(campaign, catalog).loadouts.op1, ["pulse", "kit"]);
});

test("research effects scale the fatigue rates", () => {
  assert.deepEqual(heartEffect(0), { drain: 1, recover: 1 });
  assert.ok(Math.abs(heartEffect(5).drain - 0.4) < 1e-9);
  assert.ok(Math.abs(heartEffect(5).recover - 1.75) < 1e-9);
  assert.ok(Math.abs(brainEffect(5).drain - 0.25) < 1e-9);
  assert.ok(brainEffect(3).recover > brainEffect(1).recover);
});

test("the campaign round-trips and damaged data is repaired or ignored", () => {
  let campaign = earnAchievement({ ...emptyCampaign(), funds: 20 }, { id: "a", reward: 5 });
  campaign = fitUpgrade(campaign, "op1", "eyes");
  campaign = setSlot(campaign, "op1", 0, "kit", catalog, ["pulse"]);
  assert.deepEqual(parseCampaign(serializeCampaign(campaign)), campaign);

  assert.deepEqual(parseCampaign("garbage"), emptyCampaign());
  assert.deepEqual(parseCampaign("[1,2]"), emptyCampaign());
  const repaired = parseCampaign(JSON.stringify({
    funds: -3, heart: 99, brain: "x", upgrades: { op: { legs: 9, arms: -2, tail: 1 }, bad: 3 },
    items: ["a", 4, "a", ""], loadouts: { op: ["x", 5, "y"], bad: "no" },
    achievements: "none",
  }));
  assert.deepEqual(repaired, {
    funds: 200,
    upgrades: {
      op: { legs: 3, arms: 0, chest: 0, heart: 0, eyes: 0, brain: 0 },
      bad: { legs: 0, arms: 0, chest: 0, heart: 0, eyes: 0, brain: 0 },
    },
    items: ["a"], loadouts: { op: ["x", "y"] }, achievements: [],
    roster: emptyCampaign().roster, squad: emptyCampaign().squad, permadeath: true,
    hours: 0, territories: {}, research: { active: [], level: 4, progress: {}, discovered: [] }, intel: {}, ended: false,
  });
  assert.equal(parseCampaign(JSON.stringify({ loadouts: { o: Array(20).fill("kit") } })).loadouts.o.length, 8);
});

test("gear that is already researched joins the loadout while there is room; new gear is not kept", () => {
  const defaults = ["pulse", "kit"];
  let campaign = captureItems({ ...emptyCampaign(), items: ["stim"] }, "op1", ["heavy", "stim", "ghost"], catalog, defaults);
  assert.deepEqual(campaign.items, ["stim"], "the unresearched heavy emitter does not unlock");
  assert.deepEqual(loadoutFor(campaign, "op1", defaults), ["pulse", "kit", "stim"]);

  campaign = { ...emptyCampaign(), items: ["stim"], loadouts: { op1: Array(8).fill("kit") } };
  campaign = captureItems(campaign, "op1", ["stim"], catalog, defaults);
  assert.equal(campaign.loadouts.op1.length, 8);
  assert.ok(!campaign.loadouts.op1.includes("stim"));
});

const shop = [
  { id: "pulse", price: 15, researchCost: 0 },
  { id: "kit", price: 10 },
  { id: "heavy", price: 40, researchCost: 60 },
  { id: "stim", price: 20, researchCost: 40 },
];

test("buying an item costs its price and fills the slot", () => {
  const defaults = ["pulse", "kit"];
  const funds = { ...emptyCampaign(), funds: 50, items: ["stim"] };
  const bought = buyIntoSlot(funds, "op1", 2, shop[3], shop, defaults);
  assert.equal(bought.funds, 30);
  assert.deepEqual(loadoutFor(bought, "op1", defaults), ["pulse", "kit", "stim"]);

  // A slot far past the end still packs the item at the end.
  const packed = buyIntoSlot(funds, "op1", 7, shop[3], shop, defaults);
  assert.deepEqual(loadoutFor(packed, "op1", defaults), ["pulse", "kit", "stim"]);
});

test("replacing an item refunds its full price, as FreeSynd sells at cost", () => {
  const defaults = ["pulse", "kit"];
  const funds = { ...emptyCampaign(), funds: 20, items: ["stim"] };
  assert.equal(sellValue(shop[1]), 10);
  assert.equal(netCost(funds, "op1", 1, shop[3], shop, defaults), 10, "stim 20 minus the kit's 10");
  const swapped = buyIntoSlot(funds, "op1", 1, shop[3], shop, defaults);
  assert.equal(swapped.funds, 10);
  assert.deepEqual(loadoutFor(swapped, "op1", defaults), ["pulse", "stim"]);
});

test("purchases need funds and a researched item", () => {
  const defaults = ["pulse"];
  const poor = { ...emptyCampaign(), funds: 10, items: ["stim", "heavy"] };
  assert.equal(canBuy(poor, "op1", 1, shop[3], shop, defaults), false, "stim costs 20");
  assert.equal(buyIntoSlot(poor, "op1", 1, shop[3], shop, defaults), poor);
  assert.equal(canBuy({ ...poor, funds: 20 }, "op1", 1, shop[3], shop, defaults), true);

  const rich = { ...emptyCampaign(), funds: 500 };
  assert.equal(canBuy(rich, "op1", 1, shop[2], shop, defaults), false, "heavy is not researched yet");
  assert.equal(canBuy(rich, "op1", 1, shop[1], shop, defaults), true, "starting items need no research");
  assert.equal(canBuy(rich, "op1", 8, shop[1], shop, defaults), false, "only eight slots");
  assert.equal(canBuy(rich, "op1", -1, shop[1], shop, defaults), false);
});

test("selling an item returns its full price and packs the loadout", () => {
  const defaults = ["pulse", "kit"];
  const campaign = { ...emptyCampaign(), funds: 0 };
  const sold = sellFromSlot(campaign, "op1", 0, shop, defaults);
  assert.equal(sold.funds, 15, "the pulse emitter's 15");
  assert.deepEqual(loadoutFor(sold, "op1", defaults), ["kit"]);
  assert.equal(sellFromSlot(campaign, "op1", 5, shop, defaults), campaign, "nothing in that slot");
});

test("penalising takes funds but never below zero, and bystanders cost nothing (FreeSynd charges nothing for them)", () => {
  const campaign = { ...emptyCampaign(), funds: 100 };
  assert.equal(CIVILIAN_PENALTY, 0);
  assert.equal(POLICE_PENALTY, 0);
  assert.equal(penalise(campaign, 30).funds, 70);
  assert.equal(penalise(campaign, 500).funds, 0);
  assert.equal(penalise(campaign, -5).funds, 100, "a negative penalty never pays");
});

test("refilling spent rounds costs the item's ammunition price for each round, as in FreeSynd", () => {
  const rifle = { price: 1000, charges: 12, ammoPrice: 2 };
  assert.equal(roundPrice(rifle), 2);
  assert.equal(roundPrice({ price: 50, charges: null, ammoPrice: 3 }), 0, "unlimited items never need refilling");
  assert.equal(roundPrice({ price: 50, charges: 5 }), 0, "no ammunition price, no charge");
  const entries = [
    { definition: rifle, charges: 4 },
    { definition: { price: 0, charges: 24 }, charges: 24 },
    { definition: { price: 40, charges: null }, charges: null },
    { definition: { price: 500, charges: 1, ammoPrice: 1 }, charges: 0 },
  ];
  assert.equal(resupplyCost(entries), 8 * 2 + 1);
  assert.equal(resupplyCost([]), 0);
});

test("a campaign starts with four operatives named and deployed, and death is permanent", () => {
  const campaign = emptyCampaign();
  assert.deepEqual(campaign.roster.map((member) => member.id), ["operator-one", "operator-two", "operator-three", "operator-four"]);
  assert.equal(new Set(campaign.roster.map((member) => member.name)).size, 4, "each has a different surname");
  assert.deepEqual(campaign.squad, campaign.roster.map((member) => member.id));
  assert.equal(campaign.permadeath, true);
});

test("a fallen operative is lost with their kit and parts, and leaves the squad", () => {
  let campaign = { ...emptyCampaign(), funds: 50 };
  campaign = fitUpgrade(campaign, "operator-two", "legs");
  campaign = setSlot(campaign, "operator-two", 0, "kit", catalog, ["pulse"]);
  const after = loseOperatives(campaign, ["operator-two", "nobody"]);
  assert.equal(after.roster.find((member) => member.id === "operator-two").alive, false);
  assert.deepEqual(after.squad, ["operator-one", "operator-three", "operator-four"]);
  assert.equal(after.loadouts["operator-two"], undefined);
  assert.equal(after.upgrades["operator-two"], undefined);
  assert.equal(aliveMembers(after).length, 3);
  assert.deepEqual(deployedMembers(after).map((member) => member.id), after.squad);
  // With permadeath off nothing is lost.
  assert.equal(loseOperatives({ ...campaign, permadeath: false }, ["operator-two"]).roster, campaign.roster);
  // Already-fallen operatives are not lost twice.
  assert.equal(loseOperatives(after, ["operator-two"]), after);
});

test("the squad holds at most four living operatives and always at least one", () => {
  let campaign = emptyCampaign();
  ({ campaign } = recruit(campaign));
  assert.equal(campaign.roster.length, 5);
  assert.equal(campaign.squad.length, SQUAD_MAX, "the new recruit waits on the bench: the squad is full");
  assert.equal(deploy(campaign, "agent-5"), campaign, "no room");
  campaign = bench(campaign, "operator-four");
  campaign = deploy(campaign, "agent-5");
  assert.deepEqual(campaign.squad, ["operator-one", "operator-two", "operator-three", "agent-5"]);
  let lone = emptyCampaign();
  for (const id of ["operator-two", "operator-three", "operator-four"]) lone = bench(lone, id);
  assert.equal(bench(lone, "operator-one"), lone, "the last one cannot be benched");
  assert.equal(deploy(lone, "ghost"), lone);
});

test("recruits bring their gear and parts, and the roster is capped at eight", () => {
  let campaign = emptyCampaign();
  const result = recruit(campaign, { items: ["heavy", "stim"], upgrades: { legs: 2 } });
  assert.deepEqual(result.campaign.loadouts[result.member.id], ["heavy", "stim"]);
  assert.equal(result.campaign.upgrades[result.member.id].legs, 2);
  campaign = result.campaign;
  while (aliveMembers(campaign).length < ROSTER_MAX) ({ campaign } = recruit(campaign));
  const full = recruit(campaign);
  assert.equal(full.member, null);
  assert.equal(full.campaign, campaign);
  assert.equal(new Set(campaign.roster.map((member) => member.name)).size, campaign.roster.length, "names stay unique");
});

test("hiring costs funds, except when the whole roster has been lost", () => {
  const poor = { ...emptyCampaign(), funds: HIRE_PRICE - 1 };
  assert.equal(hire(poor).member, null);
  const paid = hire({ ...emptyCampaign(), funds: HIRE_PRICE + 5 });
  assert.equal(paid.campaign.funds, 5);
  assert.ok(paid.member);
  const wiped = loseOperatives({ ...emptyCampaign(), funds: 0 }, ["operator-one", "operator-two", "operator-three", "operator-four"]);
  assert.equal(aliveMembers(wiped).length, 0);
  const volunteer = hire(wiped);
  assert.equal(volunteer.campaign.funds, 0, "a volunteer is free");
  assert.deepEqual(volunteer.campaign.squad, [volunteer.member.id]);
});

test("a damaged roster is repaired", () => {
  const damaged = { roster: [{ id: "a" }, { id: "a" }, 5, { id: "b", alive: false }], squad: ["a", "b", "zzz"] };
  const repaired = parseCampaign(JSON.stringify(damaged));
  assert.deepEqual(repaired.roster.map((member) => [member.id, member.alive]), [["a", true], ["b", false]]);
  assert.deepEqual(repaired.squad, ["a"], "the dead and the unknown are not deployed");
  assert.equal(parseCampaign(JSON.stringify({ roster: [] })).roster.length, 4);
});

test("survey intelligence is bought a level at a time, priced by the enemies, and kept per operation", () => {
  assert.equal(intelPrice(1, 12), 34);
  assert.equal(intelPrice(2, 12), 68);
  let campaign = { ...emptyCampaign(), funds: 120 };
  assert.equal(intelLevel(campaign, "m1"), 0);
  campaign = buyIntel(campaign, "m1", 12);
  assert.deepEqual([campaign.funds, intelLevel(campaign, "m1")], [86, 1]);
  campaign = buyIntel(campaign, "m1", 12);
  assert.deepEqual([campaign.funds, intelLevel(campaign, "m1")], [18, 2]);
  assert.equal(buyIntel(campaign, "m1", 12), campaign, "there is nothing beyond the full survey");
  assert.equal(INTEL_LEVELS, 2);
  assert.equal(intelLevel(campaign, "m2"), 0, "other operations are untouched");
  assert.equal(buyIntel({ ...emptyCampaign(), funds: 5 }, "m1", 12).intel.m1, undefined, "too poor");
  assert.equal(parseCampaign(JSON.stringify({ intel: { a: 9, b: 1, c: -1, d: "x" } })).intel.a, 2);
  assert.deepEqual(Object.keys(parseCampaign(JSON.stringify({ intel: { a: 9, b: 1, c: -1, d: "x" } })).intel), ["a", "b"]);
});

test("the shop lists an item's figures", () => {
  const rifle = {
    action: "disable-pulse", effect: { attack: 24, range: 15, cooldown: 1.8 }, charges: 12, price: 1000, ammoPrice: 2, weight: 5,
  };
  assert.deepEqual(describeStats(rifle), ["Damage 24", "Range 15", "Recharge 1.8 s", "12 rounds", "2 funds each to refill", "Weight 5"]);
  const scatter = { action: "disable-pulse", effect: { attack: 6, range: 6, cooldown: 1.1, pellets: 5 }, charges: 8, price: 70, weight: 6 };
  assert.ok(describeStats(scatter).includes("Damage 6 x5"));
  const flame = { action: "disable-pulse", effect: { attack: 4, range: 4.5, cooldown: 0.25, pierce: true, burn: { dps: 8, seconds: 4 } } };
  assert.ok(describeStats(flame).includes("Pierces") && describeStats(flame).includes("Burns 8 a second for 4 s"));
  const bomb = { action: "time-bomb", effect: { attack: 55, radius: 3, fuse: 6 }, charges: 3, price: 70 };
  assert.deepEqual(describeStats(bomb).slice(0, 3), ["Blast 55", "Radius 3", "Fuse 6 s"]);
  assert.deepEqual(describeStats({ action: "shield", effect: { duration: 8 } }), ["Lasts 8 s"]);
  assert.deepEqual(describeStats({ action: "stealth", effect: {} }), []);
});

test("enemy agents carry the weapons you have researched: every other one, dearest first, the same every time", () => {
  const weapons = [
    { id: "pistol", action: "disable-pulse", researchCost: 0 },
    { id: "mid", action: "disable-pulse", researchCost: 70 },
    { id: "big", action: "disable-pulse", researchCost: 160 },
    { id: "kit", action: "restore-vitality", researchCost: 20 },
    { id: "key", action: "key", researchCost: 0, missionItem: true },
  ];
  const ids = ["e1", "e2", "e3", "e4", "e5"];
  assert.equal(enemyArmament(ids, emptyCampaign(), weapons).size, 0, "nothing researched, nothing issued");
  const some = { ...emptyCampaign(), items: ["mid", "kit", "key"] };
  const arms = enemyArmament(ids, some, weapons);
  assert.deepEqual([...arms.keys()], ["e2", "e4"]);
  assert.deepEqual([...arms.values()].map((item) => item.id), ["mid", "mid"], "only weapons count");
  const more = enemyArmament(ids, { ...emptyCampaign(), items: ["mid", "big"] }, weapons);
  assert.deepEqual([...more.values()].map((item) => item.id), ["big", "mid"]);
  assert.deepEqual([...enemyArmament(ids, some, weapons)], [...arms], "repeatable");
});

test("enemy agents are fitted with the best of every part the living squad has", () => {
  assert.deepEqual(enemyUpgrades(emptyCampaign()), { legs: 0, arms: 0, chest: 0, heart: 0, eyes: 0, brain: 0 });
  const campaign = {
    ...emptyCampaign(),
    roster: [
      { id: "a", name: "A", alive: true },
      { id: "b", name: "B", alive: true },
      { id: "c", name: "C", alive: false },
    ],
    upgrades: {
      a: { legs: 2, arms: 0, chest: 1, heart: 0, eyes: 0, brain: 0 },
      b: { legs: 1, arms: 3, chest: 0, heart: 0, eyes: 2, brain: 0 },
      c: { legs: 3, arms: 3, chest: 3, heart: 3, eyes: 3, brain: 3 },
    },
  };
  assert.deepEqual(enemyUpgrades(campaign), { legs: 2, arms: 3, chest: 1, heart: 0, eyes: 2, brain: 0 }, "the fallen do not count");
});

test("the campaign ends when every main mission is won, and the ending is only shown once", () => {
  const ids = ["a", "b", "c"];
  const campaign = {
    ...emptyCampaign(),
    hours: 24 * 40 + 5,
    funds: 123.9,
    roster: [{ id: "x", name: "X", alive: true }, { id: "y", name: "Y", alive: false }],
    territories: { a: { status: "held" }, b: { status: "rebel" }, c: { status: "held" } },
  };
  assert.equal(campaignEnding(campaign, ["a", "b"], ids).won, false, "one still to go");
  assert.equal(campaignEnding(campaign, [], []).won, false, "no missions is not a win");
  const ending = campaignEnding(campaign, ["c", "b", "a"], ids);
  assert.deepEqual(ending, { won: true, shown: false, days: 40, funds: 123, lost: 1, held: 2 });
  const after = markEnded(campaign);
  assert.equal(campaignEnding(after, ids, ids).shown, true);
  assert.equal(markEnded(after), after);
  assert.equal(parseCampaign(JSON.stringify(after)).ended, true);
  assert.equal(parseCampaign(JSON.stringify(campaign)).ended, false);
});

test("a repair kit that restores to full says so, and one with a fixed amount shows the number", () => {
  const medikit = { action: "restore-vitality", effect: { restoreFull: true }, charges: 1, price: 10, weight: 2 };
  assert.ok(describeStats(medikit).includes("Restores to full"));
  const small = { action: "restore-vitality", effect: { restoreVitality: 30 }, charges: 1, price: 10, weight: 2 };
  assert.ok(describeStats(small).includes("Restores 30"));
});

test("a new campaign starts with funds, enough for a few weapons from the Armoury", async () => {
  const { STARTING_FUNDS } = await import("../src/campaign.js");
  assert.equal(emptyCampaign().funds, STARTING_FUNDS);
  assert.ok(STARTING_FUNDS >= 300);
});
