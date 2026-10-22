// SPDX-License-Identifier: GPL-2.0-or-later

import assert from "node:assert/strict";
import test from "node:test";

import { STEPS_PER_BAR, buildPattern, createMusic, midiToFrequency } from "../src/music.js";

const A_MINOR_SCALE = new Set([9, 11, 0, 2, 4, 5, 7]);

test("concert A converts to 440 Hz and octaves double", () => {
  assert.equal(midiToFrequency(69), 440);
  assert.equal(midiToFrequency(81), 880);
});

test("the pattern is deterministic, ordered and stays in the key", () => {
  const first = buildPattern();
  assert.deepEqual(first, buildPattern());
  for (let index = 1; index < first.length; index += 1) {
    assert.ok(first[index].step >= first[index - 1].step);
  }
  for (const note of first) {
    assert.ok(A_MINOR_SCALE.has(note.midi % 12), `note ${note.midi} is out of key`);
    assert.ok(note.step >= 0 && note.step < 4 * STEPS_PER_BAR);
  }
  assert.deepEqual(new Set(first.map((note) => note.voice)), new Set(["bass", "pad", "arp"]));
});

test("music stays silent and safe without audio or with music off", () => {
  const settings = { music: true, musicVolume: 0.3, muted: false };
  assert.doesNotThrow(() => createMusic({ getSettings: () => settings }).start());

  let constructed = 0;
  const music = createMusic({
    getSettings: () => ({ ...settings, music: false }),
    AudioContextClass: class {
      constructor() {
        constructed += 1;
      }
    },
  });
  music.start();
  music.refresh();
  assert.equal(constructed, 0);
});
