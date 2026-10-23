// SPDX-License-Identifier: GPL-2.0-or-later

import assert from "node:assert/strict";
import test from "node:test";

import { createTileGrid } from "../src/engine.js";
import { newDrugs } from "../src/drugs.js";
import { createRandom } from "../src/random.js";
import {
  AIM_CONE_DEGREES,
  advanceCombat,
  aimValue,
  fireManual,
  missFraction,
  seedSimulation,
  setRandomSource,
} from "../src/simulation.js";

const street = createTileGrid({
  dimensions: { width: 40, height: 9 },
  regions: [{ id: "r", x: 0, y: 0, width: 40, height: 9, surface: "street", walkable: true, elevation: 0 }],
});

const gun = (effect = {}) => ({
  definition: { id: "g", name: "Gun", action: "disable-pulse", effect: { attack: 5, range: 20, cooldown: 0.2, ...effect } },
  charges: null,
});
const person = (id, side, role, x, y, over = {}) => ({
  id, side, position: { x, y }, path: [], health: 100000, disabled: false, targetId: null,
  cooldownRemaining: 0, equipment: [], activeSlot: 0, definition: { role, stats: { vitality: 100000 } }, ...over,
});

test("the random source is seeded and repeatable", () => {
  const first = createRandom(7);
  const second = createRandom(7);
  const run = (draw) => Array.from({ length: 5 }, draw);
  assert.deepEqual(run(first), run(second));
  assert.notDeepEqual(run(createRandom(8)), run(createRandom(7)));
  assert.ok(run(createRandom(3)).every((value) => value >= 0 && value < 1));
});

test("aim starts from the kind of person and grows with upgrades; drugs add or take away", () => {
  const agent = person("a", "team", "operator", 1, 1);
  assert.equal(aimValue(agent), 0.5);
  assert.equal(aimValue(person("g", "opposition", "guard", 1, 1)), 0.45);
  assert.equal(aimValue(person("p", "opposition", "police", 1, 1)), 0.4);
  assert.equal(aimValue(person("c", "neutral", "civilian", 1, 1)), 0.2);

  const upgraded = { ...agent, upgrades: { legs: 3, arms: 3, chest: 3, heart: 3, eyes: 3, brain: 3 } };
  assert.ok(Math.abs(aimValue(upgraded) - (0.5 + 5 * 3 * 0.006)) < 1e-9, "chest does not steady the aim");
  const heart = { ...agent, upgrades: { heart: 2 } };
  assert.ok(Math.abs(aimValue(heart) - 0.512) < 1e-9);

  const withDrug = (name, effect) => {
    const drugs = newDrugs();
    drugs[name] = { amount: effect, effect, dependency: 50 };
    return { ...agent, drugs };
  };
  assert.equal(aimValue({ ...agent, drugs: newDrugs() }), 0.5, "no dose, no change");
  assert.ok(aimValue(withDrug("perception", 100)) > 0.5, "Perception steadies the aim");
  assert.ok(aimValue(withDrug("adrenaline", 100)) < 0.5, "Adrenaline spoils it");
});

test("a better shooter or a better weapon misses by less", () => {
  const stats = { accuracy: 0.7 };
  const agent = person("a", "team", "operator", 1, 1);
  const police = person("p", "opposition", "police", 1, 1);
  assert.ok(Math.abs(missFraction(agent, stats) - (0.7 * 0.5 + 0.3)) < 1e-9);
  assert.ok(missFraction(agent, stats) < missFraction(police, stats));
  assert.ok(missFraction({ ...agent, upgrades: { eyes: 3, brain: 3 } }, stats) < missFraction(agent, stats));
  assert.ok(missFraction(agent, { accuracy: 0.95 }) < 1 && missFraction(agent, { accuracy: 0.2 }) > 0.8);
  assert.equal(missFraction(agent, {}), missFraction(agent, { accuracy: 0.7 }), "the default weapon accuracy");
});

test("a shot at close range always lands; at long range a share goes wide, fewer for a better shooter", (t) => {
  t.after(() => seedSimulation(1));
  const hitRate = (shooterOver, gap) => {
    seedSimulation(11);
    let hits = 0;
    const trials = 400;
    for (let trial = 0; trial < trials; trial += 1) {
      const shooter = person("op", "team", "operator", 5, 4, { equipment: [gun()], ...shooterOver });
      const target = person("t", "opposition", "guard", 5 + gap, 4, { cooldownRemaining: 99 });
      const result = fireManual(shooter, { ...target.position }, [shooter, target], street);
      if (result.events.some((event) => event.type === "damage")) hits += 1;
    }
    return hits / trials;
  };
  assert.equal(hitRate({}, 1), 1);
  const bare = hitRate({}, 16);
  const trained = hitRate({ upgrades: { eyes: 3, brain: 3, arms: 3, heart: 3, legs: 3 } }, 16);
  assert.ok(bare > 0.2 && bare < 0.9, `an unupgraded agent hits some of the time at 16 tiles (${bare})`);
  assert.ok(trained >= bare, "upgrades never make it worse");
  assert.equal(hitRate({}, 16), bare, "the same seed gives the same result");
});

test("a missed shot is reported as a shot that landed beside the target", (t) => {
  t.after(() => seedSimulation(1));
  setRandomSource(() => 0); // the largest miss to one side
  const shooter = person("op", "team", "operator", 5, 4, { equipment: [gun()], targetId: "t" });
  const target = person("t", "opposition", "guard", 25, 4, { cooldownRemaining: 99 });
  const events = advanceCombat([shooter, target], 1 / 30, street);
  assert.deepEqual(events.map((event) => event.type), ["shot"]);
  assert.equal(target.health, 100000, "nobody was hurt");
  assert.ok(Math.abs(events[0].end.y - 4) > 1, "it landed to one side of the target");
  assert.ok(AIM_CONE_DEGREES > 0);

  setRandomSource(() => 0.5); // exactly on aim
  shooter.cooldownRemaining = 0;
  assert.deepEqual(advanceCombat([shooter, target], 1 / 30, street).map((event) => event.type), ["damage"]);
});
