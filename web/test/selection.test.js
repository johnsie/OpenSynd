// SPDX-License-Identifier: GPL-2.0-or-later

import assert from "node:assert/strict";
import test from "node:test";

import {
  emptySelection,
  isMulti,
  isSelected,
  prune,
  selectMany,
  selectOnly,
  toggle,
} from "../src/selection.js";

test("selecting one operator replaces everything else", () => {
  assert.deepEqual(selectOnly("b"), { primary: "b", ids: ["b"] });
  assert.equal(isMulti(selectOnly("b")), false);
  assert.deepEqual(emptySelection(), { primary: null, ids: [] });
});

test("toggling adds and removes operators and keeps at least one", () => {
  let selection = selectOnly("a");
  selection = toggle(selection, "c");
  assert.deepEqual(selection, { primary: "c", ids: ["a", "c"] });
  assert.equal(isMulti(selection), true);
  assert.equal(isSelected(selection, "a"), true);

  selection = toggle(selection, "c");
  assert.deepEqual(selection, { primary: "a", ids: ["a"] });
  assert.equal(toggle(selection, "a"), selection);
});

test("select many keeps the first as primary", () => {
  assert.deepEqual(selectMany(["x", "y", "z"]), { primary: "x", ids: ["x", "y", "z"] });
});

test("pruning removes unavailable operators and repairs the primary", () => {
  const selection = { primary: "b", ids: ["a", "b", "c"] };
  assert.deepEqual(prune(selection, ["a", "b", "c"]), selection);
  assert.deepEqual(prune(selection, ["a", "c"]), { primary: "a", ids: ["a", "c"] });
  assert.deepEqual(prune(selection, ["d"]), { primary: "d", ids: ["d"] });
  assert.deepEqual(prune(selection, []), { primary: null, ids: [] });
});
