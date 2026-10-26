// SPDX-License-Identifier: GPL-2.0-or-later

import assert from "node:assert/strict";
import test from "node:test";

import {
  NOTHING_SEEN,
  STEPS,
  createTutorial,
  currentStep,
  observeTutorial,
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
  const tutorial = observeTutorial(createTutorial(), seeing({ selectedIds: ["operator-two"], onWalkPad: true, weaponOut: true }));
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
