// SPDX-License-Identifier: GPL-2.0-or-later

import assert from "node:assert/strict";
import test from "node:test";

import { createTileGrid } from "../src/engine.js";
import {
  WEIGHT_CAPACITY,
  advanceBurning,
  advanceCombat,
  advanceScanners,
  advanceUnits,
  carriedWeight,
  fireManual,
  pelletsLanding,
  scannedUnits,
  useScanner,
  weightPace,
} from "../src/simulation.js";

const street = createTileGrid({
  dimensions: { width: 40, height: 9 },
  regions: [{ id: "road", x: 0, y: 0, width: 40, height: 9, surface: "service-concrete", walkable: true, elevation: 0 }],
});

const weapon = (effect, extra = {}) => ({
  definition: { id: "w", name: "W", action: "disable-pulse", effect, ...extra },
  charges: null,
});
const person = (id, side, x, y, over = {}) => ({
  id,
  side,
  position: { x, y },
  path: [],
  health: 100,
  disabled: false,
  targetId: null,
  cooldownRemaining: 0,
  equipment: [],
  levels: { speed: 3, brain: 3 },
  stamina: 1,
  focus: 1,
  definition: { role: side, stats: { speed: 3, vitality: 100, awareness: 80, range: 1, attack: 1, cooldown: 1 } },
  ...over,
});

test("a scatter weapon lands more pellets the closer the target", () => {
  const stats = { pellets: 5, range: 6, attack: 6 };
  assert.equal(pelletsLanding(stats, 0), 5);
  assert.equal(pelletsLanding(stats, 3), 4, "half way: 1 - 0.3 = 70 percent");
  assert.equal(pelletsLanding(stats, 6), 2, "at the edge about two fifths");
  assert.equal(pelletsLanding({ attack: 6, range: 6 }, 2), 1, "an ordinary weapon lands one");
});

test("automatic scatter fire hurts a close target more than a distant one", () => {
  const damageAt = (distance) => {
    const gun = weapon({ attack: 6, range: 6, cooldown: 1, pellets: 5, spread: 36 });
    const shooter = person("e", "opposition", 5, 4, { equipment: [gun], targetId: "t" });
    const target = person("t", "team", 5 + distance, 4);
    advanceCombat([shooter, target], 0.033, street, 10);
    return 100 - target.health;
  };
  assert.equal(damageAt(1), 30);
  assert.ok(damageAt(5.5) < damageAt(1));
});

test("a hand-fired scatter shot fans out and each enemy takes a hit per pellet", () => {
  const gun = weapon({ attack: 6, range: 8, cooldown: 1, pellets: 5, spread: 40 });
  const shooter = person("op", "team", 5, 4, { equipment: [gun], activeSlot: 0 });
  const near = person("a", "opposition", 8, 4);
  const side = person("b", "opposition", 8, 5.6);
  const result = fireManual(shooter, { x: 20, y: 4 }, [shooter, near, side], street);
  assert.equal(result.fired, true);
  const damage = result.events.filter((event) => event.type === "damage");
  assert.ok(damage.length >= 1);
  const hitA = damage.find((event) => event.targetId === "a");
  assert.ok(hitA.pellets >= 1);
  assert.equal(hitA.amount, 6 * hitA.pellets);
  assert.equal(shooter.cooldownRemaining > 0, true);
});

test("burning damages a unit every second after the flame stops, then fades", () => {
  const gun = weapon({ attack: 4, range: 4, cooldown: 0.25, pierce: true, burn: { dps: 8, seconds: 3 }, damageType: "burn" });
  const shooter = person("op", "team", 5, 4, { equipment: [gun], activeSlot: 0 });
  const victim = person("v", "opposition", 7, 4);
  const hit = fireManual(shooter, { x: 7, y: 4 }, [shooter, victim], street);
  assert.equal(hit.events[0].damageType, "burn");
  assert.equal(victim.health, 96);
  assert.ok(victim.burning);
  const events = [];
  for (let step = 0; step < 100; step += 1) events.push(...advanceBurning([victim], 1 / 30));
  assert.equal(victim.health, 96 - 24, "8 a second for 3 seconds");
  assert.equal(victim.burning, null, "the fire has gone out");
  assert.ok(events.every((event) => event.type === "burn"));
});

test("a fire that kills disables the unit", () => {
  const victim = person("v", "opposition", 7, 4, { health: 5, burning: { left: 3, dps: 10, by: "op", carry: 0 } });
  const events = [];
  for (let step = 0; step < 30; step += 1) events.push(...advanceBurning([victim], 1 / 30));
  assert.equal(victim.disabled, true);
  assert.ok(events.some((event) => event.type === "disabled"));
});

test("a shield stops the flame's first hit from setting the target alight", () => {
  const gun = weapon({ attack: 4, range: 4, cooldown: 0.25, burn: { dps: 8, seconds: 3 } });
  const shooter = person("op", "team", 5, 4, { equipment: [gun], activeSlot: 0 });
  const victim = person("v", "opposition", 7, 4, { shieldLeft: 5 });
  fireManual(shooter, { x: 7, y: 4 }, [shooter, victim], street);
  assert.equal(victim.burning ?? null, null);
});

test("a beam pierces everyone on its line", () => {
  const gun = weapon({ attack: 34, range: 11, cooldown: 1.4, pierce: true, damageType: "beam" });
  const shooter = person("op", "team", 5, 4, { equipment: [gun], activeSlot: 0 });
  const a = person("a", "opposition", 8, 4);
  const b = person("b", "opposition", 12, 4);
  const result = fireManual(shooter, { x: 16, y: 4 }, [shooter, a, b], street);
  assert.deepEqual(result.events.filter((e) => e.type === "damage").map((e) => e.targetId), ["a", "b"]);
  assert.equal(a.health, 66);
});

test("gear weight beyond capacity slows the walk", () => {
  const light = person("l", "team", 2, 4, { equipment: [weapon({ attack: 1, range: 1, cooldown: 1 }, { weight: 4 })] });
  assert.equal(weightPace(light), 1);
  const heavy = person("h", "team", 2, 4, {
    equipment: [weapon({}, { weight: 10 }), weapon({}, { weight: 10 }), weapon({}, { weight: 5 })],
  });
  assert.equal(carriedWeight(heavy), 25);
  assert.ok(Math.abs(weightPace(heavy) - (1 - (25 - WEIGHT_CAPACITY) * 0.03)) < 1e-9);
  const absurd = person("a", "team", 2, 4, { equipment: [weapon({}, { weight: 30 }), weapon({}, { weight: 30 })] });
  assert.equal(weightPace(absurd), 0.6, "never slower than 60 percent");

  const distance = (unit) => {
    unit.path = [{ x: 30, y: 4 }];
    for (let step = 0; step < 30; step += 1) advanceUnits([unit], 1 / 30);
    return unit.position.x - 2;
  };
  assert.ok(distance(heavy) < distance(light));
});

test("a scanner shows everyone within its radius for its duration", () => {
  const scanner = { definition: { action: "scan", effect: { radius: 10, duration: 5 } }, charges: 2 };
  const agent = person("op", "team", 5, 4, { equipment: [scanner] });
  const near = person("near", "opposition", 12, 4);
  const far = person("far", "opposition", 30, 4);
  const down = person("down", "opposition", 8, 4, { disabled: true });
  const units = [agent, near, far, down];
  assert.deepEqual(scannedUnits(units), [], "nothing is shown until it is switched on");
  assert.ok(useScanner(agent));
  assert.equal(scanner.charges, 1);
  assert.deepEqual(scannedUnits(units).map((unit) => unit.id), ["near"]);
  assert.equal(useScanner(agent), null, "already scanning");
  advanceScanners(units, 6);
  assert.deepEqual(scannedUnits(units), []);
  assert.ok(useScanner(agent));
  advanceScanners(units, 0);
  scanner.charges = 0;
  agent.scanLeft = 0;
  assert.equal(useScanner(agent), null, "a spent scanner does nothing");
});
