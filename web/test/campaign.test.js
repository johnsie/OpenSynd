// SPDX-License-Identifier: GPL-2.0-or-later

import assert from "node:assert/strict";
import test from "node:test";

import {
  CIVILIAN_PENALTY,
  POLICE_PENALTY,
  penalise,
  SLOTS_PER_OPERATIVE,
  earnAchievement,
  earnTime,
  brainEffect,
  buyIntoSlot,
  canBuy,
  captureItems,
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
  researchItem,
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

test("funds trickle in during game time and the remainder carries over", () => {
  let campaign = emptyCampaign();
  campaign = earnTime(campaign, 5);
  assert.deepEqual([campaign.funds, campaign.carry.toFixed(2)], [0, "0.50"]);
  campaign = earnTime(campaign, 5);
  assert.deepEqual([campaign.funds, campaign.carry.toFixed(2)], [1, "0.00"]);
  campaign = earnTime(campaign, 60);
  assert.equal(campaign.funds, 7, "six per minute of play");
  assert.equal(earnTime(campaign, 0), campaign);
  assert.equal(earnTime(campaign, -50), campaign);
});

test("an achievement pays its reward once", () => {
  const achievement = { id: "first", reward: 15 };
  let campaign = earnAchievement(emptyCampaign(), achievement);
  assert.deepEqual([campaign.funds, campaign.achievements], [15, ["first"]]);
  assert.equal(earnAchievement(campaign, achievement), campaign);
});

test("body parts are fitted per operative in three tiers priced 1x, 5x and 10x", () => {
  let campaign = { ...emptyCampaign(), funds: 100 };
  assert.deepEqual(upgradesOf(campaign, "op1"), { legs: 0, arms: 0, chest: 0, heart: 0, eyes: 0, brain: 0 });
  campaign = fitUpgrade(campaign, "op1", "legs");
  assert.deepEqual([campaign.funds, upgradesOf(campaign, "op1").legs], [94, 1], "tier 1 costs the base price of 6");
  campaign = fitUpgrade(campaign, "op1", "legs");
  assert.deepEqual([campaign.funds, upgradesOf(campaign, "op1").legs], [64, 2], "tier 2 costs 30");
  assert.equal(canFit(campaign, "op1", "legs"), true);
  campaign = fitUpgrade(campaign, "op1", "legs");
  assert.deepEqual([campaign.funds, upgradesOf(campaign, "op1").legs], [4, 3], "tier 3 costs 60");
  assert.equal(canFit(campaign, "op1", "legs"), false, "nothing above tier 3");
  assert.equal(fitUpgrade(campaign, "op1", "legs"), campaign);
  assert.equal(fitUpgrade(campaign, "op1", "brain"), campaign, "cannot afford the brain (8)");
  assert.equal(upgradesOf(campaign, "op2").legs, 0, "other operatives are untouched");
  assert.equal(fitUpgrade(campaign, "op1", "tail"), campaign, "no such part");
});

test("taking a part off returns what its top tier cost", () => {
  let campaign = { ...emptyCampaign(), funds: 100 };
  campaign = fitUpgrade(fitUpgrade(campaign, "op1", "chest"), "op1", "chest");
  assert.equal(campaign.funds, 100 - 8 - 40);
  campaign = removeUpgrade(campaign, "op1", "chest");
  assert.deepEqual([campaign.funds, upgradesOf(campaign, "op1").chest], [100 - 8, 1]);
  assert.equal(removeUpgrade(emptyCampaign(), "op1", "chest").funds, 0);
});

test("old heart and brain research is refunded when a saved campaign is read", () => {
  const old = parseCampaign(JSON.stringify({ funds: 5, heart: 2, brain: 1 }));
  assert.equal(old.funds, 5 + 20 + 30 + 20);
  assert.equal("heart" in old, false);
});

test("new items must be researched before they can be used", () => {
  let campaign = { ...emptyCampaign(), funds: 9 };
  const [pulse, kit, heavy, stim] = catalog;
  assert.equal(isItemAvailable(campaign, pulse), true);
  assert.equal(isItemAvailable(campaign, kit), true);
  assert.equal(isItemAvailable(campaign, heavy), false);
  assert.equal(canResearchItem(campaign, heavy), false, "12 points needed");
  campaign = researchItem(campaign, stim);
  assert.deepEqual([campaign.funds, campaign.items], [1, ["stim"]]);
  assert.equal(isItemAvailable(campaign, stim), true);
  assert.equal(researchItem(campaign, stim), campaign, "already researched");
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
    funds: -3, carry: 7, heart: 99, brain: "x", upgrades: { op: { legs: 9, arms: -2, tail: 1 }, bad: 3 },
    items: ["a", 4, "a", ""], loadouts: { op: ["x", 5, "y"], bad: "no" },
    achievements: "none",
  }));
  assert.deepEqual(repaired, {
    funds: 200, carry: 0,
    upgrades: {
      op: { legs: 3, arms: 0, chest: 0, heart: 0, eyes: 0, brain: 0 },
      bad: { legs: 0, arms: 0, chest: 0, heart: 0, eyes: 0, brain: 0 },
    },
    items: ["a"], loadouts: { op: ["x", "y"] }, achievements: [],
    roster: emptyCampaign().roster, squad: emptyCampaign().squad, permadeath: true,
  });
  assert.equal(parseCampaign(JSON.stringify({ loadouts: { o: Array(20).fill("kit") } })).loadouts.o.length, 8);
});

test("captured gear counts as researched and joins the loadout while there is room", () => {
  const defaults = ["pulse", "kit"];
  let campaign = captureItems(emptyCampaign(), "op1", ["heavy", "stim"], catalog, defaults);
  assert.deepEqual(campaign.items, ["heavy", "stim"]);
  assert.deepEqual(loadoutFor(campaign, "op1", defaults), ["pulse", "kit", "heavy", "stim"]);
  assert.equal(isItemAvailable(campaign, catalog[2]), true, "no research needed any more");

  // Unknown items are ignored; a full loadout still unlocks the item but cannot hold it.
  campaign = { ...emptyCampaign(), loadouts: { op1: Array(8).fill("kit") } };
  campaign = captureItems(campaign, "op1", ["ghost", "heavy"], catalog, defaults);
  assert.deepEqual(campaign.items, ["heavy"]);
  assert.equal(campaign.loadouts.op1.length, 8);
  assert.ok(!campaign.loadouts.op1.includes("heavy"));
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

test("replacing an item refunds half of its price", () => {
  const defaults = ["pulse", "kit"];
  const funds = { ...emptyCampaign(), funds: 20, items: ["stim"] };
  assert.equal(sellValue(shop[1]), 5);
  assert.equal(netCost(funds, "op1", 1, shop[3], shop, defaults), 15, "stim 20 minus half of the kit's 10");
  const swapped = buyIntoSlot(funds, "op1", 1, shop[3], shop, defaults);
  assert.equal(swapped.funds, 5);
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

test("selling an item returns half its price and packs the loadout", () => {
  const defaults = ["pulse", "kit"];
  const campaign = { ...emptyCampaign(), funds: 0 };
  const sold = sellFromSlot(campaign, "op1", 0, shop, defaults);
  assert.equal(sold.funds, 7, "half of the pulse emitter's 15");
  assert.deepEqual(loadoutFor(sold, "op1", defaults), ["kit"]);
  assert.equal(sellFromSlot(campaign, "op1", 5, shop, defaults), campaign, "nothing in that slot");
});

test("harming bystanders costs funds, but never below zero", () => {
  const campaign = { ...emptyCampaign(), funds: 100 };
  assert.equal(penalise(campaign, CIVILIAN_PENALTY).funds, 60);
  assert.ok(POLICE_PENALTY > CIVILIAN_PENALTY, "police cost more");
  assert.equal(penalise(campaign, 500).funds, 0);
  assert.equal(penalise(campaign, -5).funds, 100, "a negative penalty never pays");
});

test("refilling spent rounds costs a quarter of the item's price spread over its load", () => {
  const rifle = { price: 120, charges: 12 };
  assert.equal(roundPrice(rifle), 2.5);
  assert.equal(roundPrice({ price: 50, charges: null }), 0, "unlimited items never need refilling");
  const entries = [
    { definition: rifle, charges: 4 },
    { definition: { price: 15, charges: 24 }, charges: 24 },
    { definition: { price: 40, charges: null }, charges: null },
    { definition: { price: 10, charges: 1 }, charges: 0 },
  ];
  assert.equal(resupplyCost(entries), Math.round(8 * 2.5 + 0 + 0 + 2.5));
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
  const wiped = loseOperatives(emptyCampaign(), ["operator-one", "operator-two", "operator-three", "operator-four"]);
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
