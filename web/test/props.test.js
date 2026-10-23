// SPDX-License-Identifier: GPL-2.0-or-later

import assert from "node:assert/strict";
import test from "node:test";

import { FIRE_SECONDS, PROP_KINDS, advanceProps, damageProp, newProp, propsAlong, propsNear } from "../src/props.js";

const prop = (kind, x = 5, y = 5, id = `${kind}-${x}-${y}`) => newProp({ id, kind, position: { x, y } });

test("a prop starts standing with its kind's health", () => {
  const tree = prop("tree");
  assert.deepEqual([tree.state, tree.health, tree.burnLeft], ["standing", PROP_KINDS.tree.health, 0]);
  assert.equal(Object.keys(PROP_KINDS).length, 4);
});

test("a tree shrugs off bullets and is set alight by fire", () => {
  const tree = prop("tree");
  assert.equal(damageProp(tree, 50, "bullet"), null);
  assert.equal(tree.health, PROP_KINDS.tree.health, "bullets do nothing to it");
  assert.deepEqual(damageProp(tree, 3, "burn"), { type: "prop", propId: tree.id, state: "burning" });
  assert.equal(tree.burnLeft, FIRE_SECONDS);
  assert.equal(damageProp(tree, 3, "burn"), null, "already burning");
});

test("a beam or a blast fells a tree, which then burns", () => {
  const hit = prop("tree");
  assert.equal(damageProp(hit, 10, "beam"), null, "it takes two beams");
  assert.equal(hit.health, PROP_KINDS.tree.health - 10);
  assert.equal(damageProp(hit, 20, "beam").state, "burning");
  const blasted = prop("tree", 8, 8);
  assert.equal(damageProp(blasted, 45, "explosion").state, "burning");
});

test("a streetlight or a bin is destroyed by gunfire and does not burn", () => {
  const light = prop("streetlight");
  assert.equal(damageProp(light, 6, "bullet"), null);
  assert.deepEqual(damageProp(light, 6, "bullet"), { type: "prop", propId: light.id, state: "destroyed" });
  assert.equal(damageProp(light, 6, "bullet"), null, "nothing left to break");
  const bin = prop("bin");
  assert.equal(damageProp(bin, 99, "burn").state, "destroyed");
});

test("fire burns for ten seconds, spreads to flammable neighbours, and leaves a wreck", () => {
  const near = prop("tree", 5, 5);
  const close = prop("tree", 6, 5);
  const far = prop("tree", 12, 5);
  const lamp = prop("streetlight", 5, 6);
  const props = [near, close, far, lamp];
  damageProp(near, 0, "burn");
  const events = [];
  for (let step = 0; step < 100; step += 1) events.push(...advanceProps(props, [], 0.1).events);
  assert.equal(near.state, "destroyed", "burnt out after ten seconds");
  assert.equal(close.state, "destroyed", "the neighbour caught and burnt out too");
  assert.equal(far.state, "standing", "out of reach");
  assert.equal(lamp.state, "standing", "not flammable");
  assert.ok(events.some((event) => event.propId === close.id && event.state === "burning"));
});

test("people standing by a fire catch light, once", () => {
  const tree = prop("tree", 5, 5);
  damageProp(tree, 0, "burn");
  const close = { id: "close", position: { x: 5.5, y: 5 }, disabled: false };
  const far = { id: "far", position: { x: 9, y: 9 }, disabled: false };
  const result = advanceProps([tree], [close, far], 0.1);
  assert.deepEqual(result.ignited, ["close"]);
  assert.ok(close.burning);
  assert.equal(far.burning, undefined);
  assert.deepEqual(advanceProps([tree], [close, far], 0.1).ignited, [], "already alight");
});

test("a shot's line and a blast's circle pick out the props they touch", () => {
  const a = prop("tree", 8, 5);
  const b = prop("tree", 8, 7);
  const c = prop("tree", 3, 5);
  const d = prop("tree", 40, 5);
  const props = [a, b, c, d];
  assert.deepEqual(propsAlong(props, { x: 5, y: 5 }, { x: 1, y: 0 }, 10), [a], "on the line and in range, not behind or off to the side");
  assert.deepEqual(propsAlong(props, { x: 5, y: 5 }, { x: 1, y: 0 }, 10, 3), [a, b]);
  assert.deepEqual(propsNear(props, { x: 8, y: 6 }, 1.2).map((p) => p.id), [a.id, b.id]);
});

import { createTileGrid } from "../src/engine.js";
import { fireManual, seedSimulation, setRandomSource } from "../src/simulation.js";

test("a shot fired by hand damages the scenery it passes, by the weapon's damage type", (t) => {
  setRandomSource(() => 0.5); // aim exactly
  t.after(() => seedSimulation(1));
  const grid = createTileGrid({
    dimensions: { width: 30, height: 9 },
    regions: [{ id: "r", x: 0, y: 0, width: 30, height: 9, surface: "street", walkable: true, elevation: 0 }],
  });
  const weapon = (effect) => ({ definition: { id: "w", name: "W", action: "disable-pulse", effect }, charges: null });
  const shooter = (gun) => ({
    id: "op", side: "team", position: { x: 2, y: 4 }, path: [], health: 100, disabled: false, targetId: null,
    cooldownRemaining: 0, equipment: [gun], activeSlot: 0,
    definition: { role: "operator", stats: { vitality: 100 } },
  });
  const make = () => [prop("tree", 8, 4, "t"), prop("streetlight", 10, 4, "l"), prop("tree", 8, 8, "off")];

  let props = make();
  let result = fireManual(shooter(weapon({ attack: 12, range: 14, cooldown: 1 })), { x: 20, y: 4 }, [], grid, props);
  assert.deepEqual(result.events.filter((e) => e.type === "prop"), [{ type: "prop", propId: "l", state: "destroyed" }]);
  assert.equal(props[0].health, PROP_KINDS.tree.health, "the tree ignores a bullet");

  props = make();
  const flame = weapon({ attack: 4, range: 14, cooldown: 0.25, pierce: true, damageType: "burn" });
  result = fireManual(shooter(flame), { x: 20, y: 4 }, [], grid, props);
  const changes = result.events.filter((e) => e.type === "prop").map((e) => [e.propId, e.state]);
  assert.deepEqual(changes, [["t", "burning"]], "the tree is alight; the light is only scorched");
  assert.equal(props[1].health, PROP_KINDS.streetlight.health - 4);
  assert.equal(props[2].state, "standing", "the one off the line is untouched");

  props = make();
  result = fireManual(shooter(weapon({ attack: 4, range: 6, cooldown: 0.25 })), { x: 20, y: 4 }, [], grid, props);
  assert.equal(props[1].health, PROP_KINDS.streetlight.health, "out of range of the short weapon");
});
