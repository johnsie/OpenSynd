// SPDX-License-Identifier: GPL-2.0-or-later

import assert from "node:assert/strict";
import test from "node:test";

import {
  NOTHING_SEEN,
  STEPS,
  createTutorial,
  currentStep,
  observeTutorial,
  pointerFor,
  skipStep,
  tutorialProgress,
} from "../src/tutorial.js";

const seeing = (changes) => ({ ...NOTHING_SEEN, ...changes });

test("the tutorial starts at the first step and nothing seen does not move it", () => {
  const tutorial = createTutorial();
  assert.equal(currentStep(tutorial).id, "select");
  assert.equal(observeTutorial(tutorial, NOTHING_SEEN), tutorial, "the same object comes back when nothing changed");
  assert.deepEqual(tutorialProgress(tutorial), { number: 1, total: STEPS.length });
});

test("each step moves on only when its own condition holds, in order", () => {
  let tutorial = createTutorial();
  const order = [
    ["select", { selectedIds: ["operator-two"] }],
    ["all", { allSelected: true }],
    ["walk", { onWalkPad: true }],
    ["weapon", { weaponOut: true }],
    ["shoot", { targetDown: true }],
    ["loot", { looted: true }],
    ["queue", { queued: true }],
    ["persuade", { persuaded: true }],
    ["drive", { carAtDrivePad: true }],
    ["gate", { gateOpen: true }],
    ["exit", { won: true }],
  ];
  let seen = NOTHING_SEEN;
  for (const [id, change] of order) {
    assert.equal(currentStep(tutorial).id, id);
    assert.equal(observeTutorial(tutorial, seen), tutorial, `${id} waits for its own condition`);
    seen = seeing({ ...seen, ...change });
    tutorial = observeTutorial(tutorial, seen);
  }
  assert.equal(tutorial.finished, true);
  assert.equal(currentStep(tutorial), null);
  assert.equal(observeTutorial(tutorial, seen), tutorial);
});

test("a later step's condition does not skip an earlier one that has not been done", () => {
  const tutorial = observeTutorial(createTutorial(), seeing({ won: true, gateOpen: true }));
  assert.equal(currentStep(tutorial).id, "select");
});

test("several steps already done move on together", () => {
  const done = { selectedIds: ["operator-two"], allSelected: true, onWalkPad: true, weaponOut: true };
  const tutorial = observeTutorial(createTutorial(), seeing(done));
  assert.equal(currentStep(tutorial).id, "shoot");
});

test("a stuck player can skip a step; skipped steps are remembered and the end still finishes", () => {
  let tutorial = createTutorial();
  for (let index = 0; index < STEPS.length; index += 1) tutorial = skipStep(tutorial);
  assert.equal(tutorial.finished, true);
  assert.deepEqual(tutorial.skipped, STEPS.map((step) => step.id));
  assert.equal(skipStep(tutorial), tutorial);
});

test("every step has a prompt a player can read and a unique id", () => {
  assert.equal(new Set(STEPS.map((step) => step.id)).size, STEPS.length);
  for (const step of STEPS) {
    assert.ok(step.text.length > 20 && step.text.length < 200, step.id);
    assert.equal(typeof step.done, "function");
  }
});

test("arrows point at everything the step wants clicked or walked to", () => {
  let tutorial = createTutorial();
  const at = (id, seen = NOTHING_SEEN) => {
    while (currentStep(tutorial).id !== id) tutorial = skipStep(tutorial);
    return pointerFor(tutorial, seen);
  };
  assert.deepEqual(pointerFor(tutorial, NOTHING_SEEN), [{ unit: "operator-two" }, { roster: "operator-two" }]);
  assert.deepEqual(at("all"), [{ button: "#select-all-button" }], "the Select all button");
  assert.deepEqual(at("walk"), [{ zone: "walk-pad" }]);
  assert.deepEqual(at("weapon"), [{ slotAction: "disable-pulse" }], "the item to click");
  assert.deepEqual(at("shoot"), [{ unit: "practice-target" }]);
  assert.deepEqual(at("loot"), [{ unit: "practice-target" }]);
  assert.equal(at("queue").length, 2, "two spots to Shift+click");
  assert.deepEqual(at("persuade"), [{ slotAction: "persuade" }, { unit: "civilian-1" }], "the item, then the person");
  assert.deepEqual(at("drive"), [{ unit: "training-car" }], "the car first");
  assert.deepEqual(pointerFor(tutorial, seeing({ inCar: true })), [{ zone: "drive-pad" }], "then where to drive it");
  assert.deepEqual(at("gate"), [{ zone: "gate-panel" }]);
  assert.deepEqual(at("exit"), [{ zone: "safe-exit" }]);
  assert.deepEqual(pointerFor({ ...tutorial, finished: true }, NOTHING_SEEN), []);
});
