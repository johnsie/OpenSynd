// SPDX-License-Identifier: GPL-2.0-or-later

import assert from "node:assert/strict";
import test from "node:test";

import {
  DRUG_NAMES,
  NEUTRAL,
  adrenalineAim,
  adrenalineSpeed,
  advanceDrug,
  advanceDrugs,
  drugMultiplier,
  intelligenceRecharge,
  newDrugs,
  perceptionReach,
  sanitizeDrugs,
  setDrug,
} from "../src/drugs.js";

const run = (drug, seconds, step = 0.5) => {
  let timers = { effect: 0, dependency: 0 };
  const log = [];
  for (let at = step; at <= seconds + 1e-9; at += step) {
    timers = advanceDrug(drug, timers, step);
    log.push({ at, ...drug });
  }
  return log;
};

test("everyone starts neutral and nothing changes at neutral", () => {
  const drugs = newDrugs();
  assert.deepEqual(DRUG_NAMES, ["adrenaline", "perception", "intelligence"]);
  for (const name of DRUG_NAMES) {
    assert.deepEqual(drugs[name], { amount: NEUTRAL, effect: NEUTRAL, dependency: NEUTRAL });
    assert.equal(drugMultiplier(drugs, name), 1);
  }
  const drug = drugs.adrenaline;
  run(drug, 60);
  assert.deepEqual(drug, { amount: 50, effect: 50, dependency: 50 });
});

test("the effect climbs one notch a second toward the dose, then the dose wears off on its own", () => {
  const drug = { amount: 100, effect: 50, dependency: 50 };
  const log = run(drug, 40, 1);
  assert.equal(log[0].effect, 55, "one notch after the first second");
  assert.equal(log[8].effect, 95);
  assert.equal(log[9].effect, 100, "full effect after ten seconds");
  // From then on both effect and amount drift back toward the body's tolerance mark.
  assert.ok(log[12].amount < 100 && log[12].effect < 100);
  assert.ok(log.at(-1).effect < 100);
});

test("the dependency creeps toward the dose every 4.5 seconds", () => {
  const drug = { amount: 100, effect: 100, dependency: 50 };
  const timers = { effect: 0, dependency: 0 };
  advanceDrug(drug, timers, 4.4);
  assert.equal(drug.dependency, 50);
  const later = advanceDrug(drug, { effect: 0, dependency: 4.4 }, 0.2);
  assert.equal(drug.dependency, 55);
  assert.ok(later.dependency < 0.2);
});

test("a dose held for a long time stops working and ends below neutral: the multiplier falls under 1", () => {
  const drug = { amount: 100, effect: 50, dependency: 50 };
  let peak = 1;
  let timers = { effect: 0, dependency: 0 };
  const seen = [];
  for (let second = 0; second < 600; second += 1) {
    timers = advanceDrug(drug, timers, 1);
    drug.amount = 100;
    const multiplier = drugMultiplier({ x: drug }, "x");
    seen.push(multiplier);
    peak = Math.max(peak, multiplier);
  }
  assert.ok(peak > 1.5, `a real surge at first: ${peak}`);
  assert.ok(seen.at(-1) <= 1.001, "but held long enough it does nothing");
  const down = { amount: 0, effect: 50, dependency: 50 };
  run(down, 12, 1);
  assert.ok(drugMultiplier({ x: down }, "x") < 1, "a low dose slows things down");
});

test("the multiplier runs from 0.5 to 2 and is 1 at neutral", () => {
  const above = { x: { amount: 100, effect: 100, dependency: 50 } };
  const below = { x: { amount: 0, effect: 0, dependency: 50 } };
  assert.equal(drugMultiplier(above, "x"), 2);
  assert.equal(drugMultiplier(below, "x"), 0.5);
  assert.equal(drugMultiplier({ x: { amount: 70, effect: 50, dependency: 50 } }, "x"), 1);
  assert.equal(drugMultiplier(null, "x"), 1);
  assert.equal(drugMultiplier({}, "missing"), 1);
});

test("what each drug does: adrenaline speed and a worse aim, perception reach, intelligence recharge", () => {
  const surge = (name) => ({ ...newDrugs(), [name]: { amount: 100, effect: 100, dependency: 50 } });
  assert.equal(adrenalineSpeed(surge("adrenaline")), 2);
  assert.ok(adrenalineAim(surge("adrenaline")) < 1, "a racing pulse shortens the reach");
  assert.ok(perceptionReach(surge("perception")) > 1.3);
  assert.ok(intelligenceRecharge(surge("intelligence")) < 0.75, "a quick mind recharges faster");
  assert.equal(adrenalineSpeed(newDrugs()), 1);
  assert.equal(intelligenceRecharge(newDrugs()), 1);
});

test("setting a slider changes only its amount and keeps it in range", () => {
  const drugs = newDrugs();
  const next = setDrug(drugs, "perception", 80);
  assert.equal(next.perception.amount, 80);
  assert.equal(next.perception.effect, 50);
  assert.equal(drugs.perception.amount, 50, "the original is untouched");
  assert.equal(setDrug(drugs, "perception", 500).perception.amount, 100);
  assert.equal(setDrug(drugs, "perception", -9).perception.amount, 0);
  assert.equal(setDrug(drugs, "nonsense", 10), drugs);
});

test("every operative's drugs move on with time, and the fallen do not change", () => {
  const live = { drugs: setDrug(newDrugs(), "adrenaline", 100), disabled: false };
  const down = { drugs: setDrug(newDrugs(), "adrenaline", 100), disabled: true };
  const none = { disabled: false };
  for (let second = 0; second < 5; second += 1) advanceDrugs([live, down, none], 1);
  assert.equal(live.drugs.adrenaline.effect, 75);
  assert.equal(down.drugs.adrenaline.effect, 50);
});

test("damaged records are repaired", () => {
  assert.deepEqual(sanitizeDrugs(null), newDrugs());
  const repaired = sanitizeDrugs({ adrenaline: { amount: 900, effect: -4, dependency: "x" }, tail: { amount: 1 }, perception: 5 });
  assert.deepEqual(repaired.adrenaline, { amount: 100, effect: 0, dependency: 50 });
  assert.deepEqual(repaired.perception, { amount: 50, effect: 50, dependency: 50 });
  assert.equal(repaired.tail, undefined);
});
