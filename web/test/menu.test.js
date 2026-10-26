// SPDX-License-Identifier: GPL-2.0-or-later

import assert from "node:assert/strict";
import test from "node:test";

import { continueNote, continueTarget } from "../src/menu.js";

test("a fresh browser has nothing to continue", () => {
  assert.equal(continueTarget({ hasAutosave: false, completedCount: 0 }), null);
  assert.equal(continueNote(null), "");
});

test("a saved operation wins over a campaign with wins in it", () => {
  assert.equal(continueTarget({ hasAutosave: true, completedCount: 4 }), "operation");
  assert.equal(continueTarget({ hasAutosave: false, completedCount: 4 }), "campaign");
});

test("the note says what Continue will do", () => {
  assert.equal(continueNote("operation", { operationName: "First Light" }), 'Back into "First Light".');
  assert.equal(continueNote("operation"), "Back into your operation.");
  assert.match(continueNote("campaign", { completedCount: 1 }), /^1 operation won/);
  assert.match(continueNote("campaign", { completedCount: 3 }), /^3 operations won/);
});
