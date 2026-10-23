// SPDX-License-Identifier: GPL-2.0-or-later

import assert from "node:assert/strict";
import test from "node:test";

import { createTileGrid } from "../src/engine.js";
import { advanceUnits, fireManual, maxHealth, pickWeapon, weightPace } from "../src/simulation.js";
import {
  PARTS,
  PART_NAMES,
  armsCapacity,
  armsCooldown,
  chestVitality,
  emptyUpgrades,
  eyesRange,
  aimBonus,
  legsPace,
  sanitizeUpgrades,
  upgradePrice,
} from "../src/upgrades.js";

const street = createTileGrid({
  dimensions: { width: 40, height: 9 },
  regions: [{ id: "road", x: 0, y: 0, width: 40, height: 9, surface: "street", walkable: true, elevation: 0 }],
});
const gun = (effect = { attack: 12, range: 8, cooldown: 1 }, weight = 0) => ({
  definition: { id: "g", name: "G", action: "disable-pulse", effect, weight },
  charges: null,
});
const operator = (upgrades, over = {}) => ({
  id: "op",
  side: "team",
  position: { x: 2, y: 4 },
  path: [],
  health: 100,
  disabled: false,
  targetId: null,
  cooldownRemaining: 0,
  equipment: [gun()],
  activeSlot: 0,
  upgrades,
  definition: { role: "operator", stats: { speed: 3, vitality: 100 } },
  ...over,
});

test("six parts, each with a tier 0 to 3 effect, priced 1x, 5x and 10x", () => {
  assert.deepEqual(PART_NAMES, ["legs", "arms", "chest", "heart", "eyes", "brain"]);
  for (const part of PART_NAMES) {
    assert.equal(PARTS[part].tiers.length, 4);
    const prices = [1, 2, 3].map((tier) => upgradePrice(part, tier));
    assert.deepEqual(prices, [1, 5, 10].map((times) => PARTS[part].base * times));
  }
  assert.deepEqual(emptyUpgrades(), { legs: 0, arms: 0, chest: 0, heart: 0, eyes: 0, brain: 0 });
  assert.deepEqual(sanitizeUpgrades({ legs: 7, arms: -1, chest: 1.5, eyes: "x", tail: 3 }), {
    legs: 3, arms: 0, chest: 0, heart: 0, eyes: 0, brain: 0,
  });
  assert.deepEqual(sanitizeUpgrades(null), emptyUpgrades());
});

test("each part's effect rises with its tier and nothing fitted changes nothing", () => {
  const bare = emptyUpgrades();
  const effects = (up) => [legsPace(up), armsCooldown(up), armsCapacity(up), chestVitality(up), eyesRange(up), aimBonus(up)];
  assert.deepEqual(effects(bare), [1, 1, 0, 0, 1, 0]);
  assert.deepEqual([legsPace(undefined), chestVitality(null)], [1, 0], "a unit with no upgrades is fine");
  const full = { legs: 3, arms: 3, chest: 3, heart: 3, eyes: 3, brain: 3 };
  assert.deepEqual(effects(full).slice(0, 5), [1.5, 0.7, 12, 70, 1.3]);
  assert.ok(Math.abs(aimBonus(full) - 5 * 3 * 0.006) < 1e-9, "five parts add the aim bonus, three tiers each");
});

test("Legs make an operative walk faster", () => {
  const distance = (upgrades) => {
    const unit = operator(upgrades, { path: [{ x: 38, y: 4 }] });
    for (let step = 0; step < 30; step += 1) advanceUnits([unit], 1 / 30);
    return unit.position.x - 2;
  };
  assert.ok(Math.abs(distance({ legs: 3 }) / distance({ legs: 0 }) - 1.5) < 0.01);
});

test("Arms recharge a weapon faster and carry more weight freely", () => {
  const cooldownAfterShot = (upgrades) => {
    const unit = operator(upgrades);
    fireManual(unit, { x: 10, y: 4 }, [unit], street);
    return unit.cooldownRemaining;
  };
  assert.ok(Math.abs(cooldownAfterShot({ arms: 3 }) / cooldownAfterShot({ arms: 0 }) - 0.7) < 1e-9);
  const heavy = (upgrades) => operator(upgrades, { equipment: [gun(undefined, 14), gun(undefined, 10)] });
  assert.ok(weightPace(heavy({ arms: 0 })) < 1);
  assert.equal(weightPace(heavy({ arms: 2 })), 1, "24 weight against a capacity of 16 + 8");
});

test("Chest adds integrity", () => {
  assert.equal(maxHealth(operator({ chest: 0 })), 100);
  assert.equal(maxHealth(operator({ chest: 2 })), 140);
  assert.equal(maxHealth({ definition: { stats: { vitality: 60 } } }), 60);
});

test("Eyes lengthen the reach of whatever is fired", () => {
  assert.equal(pickWeapon(operator({ eyes: 0 })).stats.range, 8);
  assert.ok(Math.abs(pickWeapon(operator({ eyes: 3 })).stats.range - 8 * 1.3) < 1e-9);
  const bare = operator(null);
  assert.equal(pickWeapon(bare).stats.range, 8, "no upgrade record at all is fine");
});

import { followPace } from "../src/simulation.js";

test("followers move at their owner's pace: quicker legs drag a faster flock, a heavy load a slower one", () => {
  assert.equal(followPace(operator({ legs: 0 })), 1);
  assert.equal(followPace(operator({ legs: 2 })), 1.5);
});

import { advanceRegeneration } from "../src/simulation.js";

// A fresh operator with this chest tier, hit for `damage` (the regeneration sees the loss on its next step).
function woundedOperator(chest, damage) {
  const unit = operator({ chest });
  unit.health = maxHealth(unit);
  advanceRegeneration([unit], 1 / 30);
  unit.health -= damage;
  return unit;
}
const runFor = (unit, seconds) => {
  for (let step = 0; step < Math.round(seconds * 30); step += 1) advanceRegeneration([unit], 1 / 30);
  return unit.health;
};

test("a chest of the second version or better heals a hit agent a sixteenth every four seconds, until whole", () => {
  const unit = woundedOperator(2, 40); // vitality 100 + 40 from the chest = 140; a sixteenth is 9 (rounded)
  const start = unit.health;
  assert.equal(runFor(unit, 3.9), start, "not yet");
  assert.equal(runFor(unit, 0.2), start + 9, "the first point after four seconds");
  assert.equal(runFor(unit, 4), start + 18);
  assert.equal(runFor(unit, 60), 140, "stops at full health");
  assert.equal(unit.regenerating, false);
  assert.equal(runFor(unit, 30), 140, "and does not start again without another hit");
});

test("the first version of the chest, and no chest, do not regenerate", () => {
  assert.equal(runFor(woundedOperator(1, 30), 60), 100 + 20 - 30);
  assert.equal(runFor(woundedOperator(0, 30), 60), 100 - 30);
});

test("a new hit while healing keeps the healing going", () => {
  const unit = woundedOperator(3, 50);
  runFor(unit, 4.1);
  const mid = unit.health;
  unit.health -= 10;
  assert.equal(runFor(unit, 4), mid - 10 + 11, "a sixteenth of 170 is 11");
});
