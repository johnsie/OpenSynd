// SPDX-License-Identifier: GPL-2.0-or-later

import assert from "node:assert/strict";
import test from "node:test";

import { advanceBombs, blastDamage, plantBomb } from "../src/bombs.js";

const charge = (charges = 3) => ({
  definition: { id: "bomb", action: "time-bomb", effect: { attack: 55, radius: 3, fuse: 6 } },
  charges,
});
const person = (id, x, y, health = 100) => ({ id, position: { x, y }, health, disabled: false, path: [], targetId: null });

test("planting a bomb spends a charge and sets the fuse where the operative stands", () => {
  const item = charge(2);
  const bombs = [];
  const bomb = plantBomb(person("op", 4, 5), item, bombs);
  assert.equal(item.charges, 1);
  assert.deepEqual(bomb.at, { x: 4, y: 5 });
  assert.equal(bomb.left, 6);
  assert.equal(bombs.length, 1);
  assert.equal(plantBomb(person("op", 0, 0), charge(0), bombs), null, "none left");
  assert.equal(plantBomb({ ...person("op", 0, 0), disabled: true }, charge(), bombs), null, "a disabled operative cannot");
});

test("damage falls from full at the centre to 40% at the edge, and nothing outside", () => {
  assert.equal(blastDamage(50, 0, 3), 50);
  assert.equal(blastDamage(50, 3, 3), 20);
  assert.equal(blastDamage(50, 1.5, 3), 35);
  assert.equal(blastDamage(50, 3.01, 3), 0);
});

test("the fuse counts down, then the blast hurts everyone in range, friend or foe, and may disable", () => {
  const bombs = [];
  plantBomb(person("planter", 10, 10), charge(), bombs);
  const units = [person("planter", 10, 10), person("near", 11, 10, 40), person("edge", 12.9, 10), person("far", 20, 10)];
  assert.deepEqual(advanceBombs(bombs, units, 5), [], "still ticking");
  assert.equal(bombs.length, 1);
  const [blast] = advanceBombs(bombs, units, 1.5);
  assert.equal(bombs.length, 0, "a bomb goes off once");
  assert.equal(blast.type, "blast");
  const byId = Object.fromEntries(blast.hits.map((hit) => [hit.unitId, hit]));
  assert.equal(byId.planter.amount, 55, "the planter standing on it takes the full blast");
  assert.equal(byId.near.disabled, true, "40 health does not survive 40-odd damage");
  assert.equal(units[1].disabled, true);
  assert.ok(byId.edge.amount < byId.planter.amount && byId.edge.amount >= 20);
  assert.equal(byId.far, undefined);
  assert.equal(units[3].health, 100);
  assert.deepEqual(advanceBombs(bombs, units, 5), [], "nothing left to blow");
});
