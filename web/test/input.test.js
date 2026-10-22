// SPDX-License-Identifier: GPL-2.0-or-later

import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_BINDINGS, normalizeBindings, resolveAction } from "../src/input.js";

test("default bindings resolve keyboard events", () => {
  assert.equal(resolveAction(DEFAULT_BINDINGS, { key: "ArrowLeft", code: "ArrowLeft" }), "panLeft");
  assert.equal(resolveAction(DEFAULT_BINDINGS, { key: "j", code: "KeyJ" }), "cursorLeft");
  assert.equal(resolveAction(DEFAULT_BINDINGS, { key: "E", code: "KeyE" }), "interact");
  assert.equal(resolveAction(DEFAULT_BINDINGS, { key: " ", code: "Space" }), "pause");
  assert.equal(resolveAction(DEFAULT_BINDINGS, { key: "q", code: "KeyQ" }), null);
});

test("remapped keys replace the default", () => {
  const bindings = normalizeBindings({ interact: "f" });
  assert.equal(resolveAction(bindings, { key: "f", code: "KeyF" }), "interact");
  assert.equal(resolveAction(bindings, { key: "e", code: "KeyE" }), null);
});

test("duplicate or malformed bindings revert to defaults", () => {
  const bindings = normalizeBindings({ repair: "e", move: 5, pause: "" });
  assert.equal(bindings.interact, "e");
  assert.equal(bindings.repair, "r");
  assert.equal(bindings.move, "Enter");
  assert.equal(bindings.pause, "Space");
});

test("saved bindings that put the cursor on the arrow keys lose them to panning", () => {
  const bindings = normalizeBindings({ cursorLeft: "ArrowLeft", cursorRight: "ArrowRight" });
  assert.equal(resolveAction(bindings, { key: "ArrowLeft", code: "ArrowLeft" }), "panLeft");
  assert.equal(bindings.cursorLeft, "j");
  assert.equal(bindings.cursorRight, "l");
});
