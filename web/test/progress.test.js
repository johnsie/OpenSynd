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

import { prerequisites } from "../src/progress.js";

test("operations can form a graph: winning one opens the ones it lists, and any one prerequisite is enough", () => {
  const entries = [
    { id: "a", unlocks: ["b", "c"] },
    { id: "b", unlocks: ["d"] },
    { id: "c", unlocks: ["d"] },
    { id: "d", unlocks: [] },
  ];
  assert.deepEqual(prerequisites(entries, 0), []);
  assert.deepEqual(prerequisites(entries, 1), ["a"]);
  assert.deepEqual(prerequisites(entries, 3), ["b", "c"]);
  let progress = emptyProgress();
  assert.deepEqual([1, 2, 3].map((index) => isUnlocked(progress, entries, index)), [false, false, false]);
  progress = markCompleted(progress, "a");
  assert.deepEqual([1, 2, 3].map((index) => isUnlocked(progress, entries, index)), [true, true, false], "b and c both open");
  progress = markCompleted(progress, "c");
  assert.equal(isUnlocked(progress, entries, 3), true, "either route to d will do");
});

test("with no unlocks listed, operations open as a chain", () => {
  const entries = [{ id: "a" }, { id: "b", unlocks: [] }, { id: "c" }];
  assert.deepEqual(prerequisites(entries, 2), ["b"]);
  assert.equal(isUnlocked(markCompleted(emptyProgress(), "a"), entries, 2), false);
  assert.equal(isUnlocked(markCompleted(emptyProgress(), "b"), entries, 2), true);
});

import { clearGameStorage } from "../src/progress.js";

test("a new game wipes the campaign, progress and saves but keeps the settings and other sites' data", () => {
  const data = new Map([
    ["opensynd.campaign.v1", "{}"],
    ["opensynd.progress.v1", "{}"],
    ["opensynd.save.developer.restore-relay", "{}"],
    ["opensynd.settings.v1", "{}"],
    ["somebody.else", "keep"],
  ]);
  const storage = {
    get length() {
      return data.size;
    },
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => data.delete(key),
  };
  assert.equal(clearGameStorage(storage), 3);
  assert.deepEqual([...data.keys()].sort(), ["opensynd.settings.v1", "somebody.else"]);
  assert.equal(clearGameStorage(storage), 0);
});

test("a new game keeps the company name, the sign-in to a server and the settings, and wipes the rest", async () => {
  const { COMPANY_KEY, clearGameStorage } = await import("../src/progress.js");
  const { SETTINGS_KEY } = await import("../src/settings.js");
  const items = new Map([
    [COMPANY_KEY, "Skels Team"],
    [SETTINGS_KEY, "{}"],
    ["opensynd.server.v1", '{"url":"https://x","token":"t"}'],
    ["opensynd.campaign.v1", "{}"],
    ["opensynd.save.slot1", "{}"],
    ["somebody.else", "kept"],
  ]);
  const storage = {
    get length() {
      return items.size;
    },
    key: (index) => [...items.keys()][index] ?? null,
    removeItem: (key) => items.delete(key),
  };
  clearGameStorage(storage);
  assert.deepEqual([...items.keys()].sort(), [COMPANY_KEY, SETTINGS_KEY, "opensynd.server.v1", "somebody.else"].sort());
});
