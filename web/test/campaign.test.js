// SPDX-License-Identifier: GPL-2.0-or-later

import assert from "node:assert/strict";
import test from "node:test";

import {
  SLOTS_PER_OPERATIVE,
  earnAchievement,
  earnTime,
  brainEffect,
  captureItems,
  canResearchItem,
  canResearchTrack,
  emptyCampaign,
  heartEffect,
  isItemAvailable,
  loadoutFor,
  nextTrackCost,
  parseCampaign,
  researchItem,
  researchTrack,
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

test("heart and brain research costs points, rises by level and stops at the top", () => {
  let campaign = { ...emptyCampaign(), funds: 25 };
  assert.equal(nextTrackCost(campaign, "heart"), 20);
  assert.equal(canResearchTrack(campaign, "heart"), true);
  campaign = researchTrack(campaign, "heart");
  assert.deepEqual([campaign.funds, campaign.heart], [5, 1]);
  assert.equal(nextTrackCost(campaign, "heart"), 30);
  assert.equal(researchTrack(campaign, "heart"), campaign, "cannot afford the next level");
  assert.equal(researchTrack(campaign, "brain"), campaign, "cannot afford brain either");

  const maxed = { ...emptyCampaign(), funds: 999, heart: 5 };
  assert.equal(nextTrackCost(maxed, "heart"), null);
  assert.equal(researchTrack(maxed, "heart"), maxed);
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
  campaign = researchTrack(campaign, "heart");
  campaign = setSlot(campaign, "op1", 0, "kit", catalog, ["pulse"]);
  assert.deepEqual(parseCampaign(serializeCampaign(campaign)), campaign);

  assert.deepEqual(parseCampaign("garbage"), emptyCampaign());
  assert.deepEqual(parseCampaign("[1,2]"), emptyCampaign());
  const repaired = parseCampaign(JSON.stringify({
    funds: -3, carry: 7, heart: 99, brain: "x", items: ["a", 4, "a", ""], loadouts: { op: ["x", 5, "y"], bad: "no" },
    achievements: "none",
  }));
  assert.deepEqual(repaired, {
    funds: 0, carry: 0, heart: 5, brain: 0, items: ["a"], loadouts: { op: ["x", "y"] }, achievements: [],
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
