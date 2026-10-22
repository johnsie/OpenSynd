// SPDX-License-Identifier: GPL-2.0-or-later

import assert from "node:assert/strict";
import test from "node:test";

import {
  emptyProgress,
  isCompleted,
  isUnlocked,
  markCompleted,
  parseProgress,
  serializeProgress,
} from "../src/progress.js";

const ids = ["one", "two", "three"];

test("progress starts empty and only the first operation is open", () => {
  const progress = emptyProgress();
  assert.deepEqual(progress, { completed: [] });
  assert.equal(isUnlocked(progress, ids, 0), true);
  assert.equal(isUnlocked(progress, ids, 1), false);
  assert.equal(isUnlocked(progress, ids, 2), false);
});

test("completing an operation opens the next one and is idempotent", () => {
  let progress = markCompleted(emptyProgress(), "one");
  assert.equal(isCompleted(progress, "one"), true);
  assert.equal(isUnlocked(progress, ids, 1), true);
  assert.equal(isUnlocked(progress, ids, 2), false);
  assert.equal(markCompleted(progress, "one"), progress);
  progress = markCompleted(progress, "two");
  assert.equal(isUnlocked(progress, ids, 2), true);
});

test("progress round-trips and bad data is ignored", () => {
  const progress = markCompleted(markCompleted(emptyProgress(), "one"), "two");
  assert.deepEqual(parseProgress(serializeProgress(progress)), progress);
  assert.deepEqual(parseProgress("not json"), emptyProgress());
  assert.deepEqual(parseProgress('{"completed":"all"}'), emptyProgress());
  assert.deepEqual(parseProgress("null"), emptyProgress());
  assert.deepEqual(
    parseProgress('{"completed":["one",5,"",null,"one","two"]}'),
    { completed: ["one", "two"] },
  );
});
