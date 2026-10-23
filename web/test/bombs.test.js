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

import { createTileGrid } from "../src/engine.js";

const walled = createTileGrid({
  dimensions: { width: 20, height: 5 },
  regions: [
    { id: "ground", x: 0, y: 0, width: 20, height: 5, surface: "street", walkable: true, elevation: 0 },
    { id: "wall", x: 10, y: 0, width: 1, height: 5, surface: "service-wall", walkable: false, elevation: 0 },
  ],
});

test("a wall between a bomb and a person shields them from the blast", () => {
  const bombs = [{ id: "b", at: { x: 8, y: 2 }, attack: 55, radius: 5, fuse: 1, left: 0, plantedBy: "x" }];
  const behind = person("behind", 12, 2);
  const open = person("open", 5, 2);
  const [blast] = advanceBombs(bombs, [behind, open], 0.1, walled);
  assert.deepEqual(blast.hits.map((hit) => hit.unitId), ["open"]);
  assert.equal(behind.health, 100);
  const again = [{ id: "b", at: { x: 8, y: 2 }, attack: 55, radius: 5, fuse: 1, left: 0, plantedBy: "x" }];
  const [free] = advanceBombs(again, [person("behind", 12, 2)], 0.1, null);
  assert.equal(free.hits.length, 1, "without a map there is nothing in the way");
});

test("a blast sets off a bomb within reach, a moment later, in a chain; a bomb behind a wall is spared", () => {
  const near = { id: "near", at: { x: 6, y: 2 }, attack: 30, radius: 2, fuse: 9, left: 9, plantedBy: "x" };
  const shielded = { id: "shielded", at: { x: 12, y: 2 }, attack: 30, radius: 2, fuse: 9, left: 9, plantedBy: "x" };
  const first = { id: "first", at: { x: 8, y: 2 }, attack: 30, radius: 4, fuse: 1, left: 0, plantedBy: "x" };
  const bombs = [first, near, shielded];
  advanceBombs(bombs, [], 0.1, walled);
  assert.equal(bombs.length, 2);
  assert.ok(near.left <= 0.3, "the neighbour was set off");
  assert.ok(shielded.left > 8, "the wall protected the other");
  const events = [];
  for (let step = 0; step < 10; step += 1) events.push(...advanceBombs(bombs, [], 0.1, walled));
  assert.equal(events.length, 1);
  assert.equal(bombs.length, 1);
});
