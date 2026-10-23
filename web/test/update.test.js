// SPDX-License-Identifier: GPL-2.0-or-later

import assert from "node:assert/strict";
import test from "node:test";

import { IDLE_SECONDS, canApplyQuietly, isNewerRelease, releaseBase, watchForUpdates } from "../src/update.js";

test("the running release is where the code was loaded from", () => {
  assert.equal(releaseBase("https://game.example/r/abc123/app.js"), "https://game.example/r/abc123/");
  assert.equal(releaseBase("http://127.0.0.1:8000/app.js"), "http://127.0.0.1:8000/");
});

test("only a different, known revision counts as an update", () => {
  assert.equal(isNewerRelease("abc", "def"), true);
  assert.equal(isNewerRelease("abc", "abc"), false);
  assert.equal(isNewerRelease("abc", null), false);
  assert.equal(isNewerRelease(null, "def"), false);
  assert.equal(isNewerRelease("working-tree", "def"), false, "a local build never updates itself");
});

test("an update is switched in on its own only when it cannot cost the player anything", () => {
  const ready = { waiting: true, operationActive: false, hidden: false, idleSeconds: 0 };
  assert.equal(canApplyQuietly(ready), false, "the player is using the page");
  assert.equal(canApplyQuietly({ ...ready, hidden: true }), true, "the tab is out of sight between operations");
  assert.equal(canApplyQuietly({ ...ready, idleSeconds: IDLE_SECONDS }), true, "left idle between operations");
  assert.equal(canApplyQuietly({ ...ready, hidden: true, operationActive: true }), false, "never in the middle of an operation");
  assert.equal(canApplyQuietly({ ...ready, hidden: true, waiting: false }), false, "nothing to apply");
});

test("the watcher tells the page once per new release, ignores failures and stops when asked", async () => {
  const intervals = [];
  const timers = { setInterval: (fn) => (intervals.push(fn), intervals.length), clearInterval() {} };
  const published = ["abc", "abc", "def", "def", null];
  let call = 0;
  const heard = [];
  const stop = watchForUpdates({
    running: "abc",
    fetchPublished: async () => {
      const next = published[call];
      call += 1;
      if (next === null) throw new Error("offline");
      return next;
    },
    onWaiting: (revision) => heard.push(revision),
    timers,
  });
  for (let index = 0; index < 5; index += 1) await intervals[0]();
  assert.deepEqual(heard, ["def"]);
  stop();
  call = 2;
  await intervals[0]();
  assert.deepEqual(heard, ["def"], "stopped");
});
