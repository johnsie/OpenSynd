// SPDX-License-Identifier: GPL-2.0-or-later

import assert from "node:assert/strict";
import test from "node:test";

import { createAudio } from "../src/audio.js";
import {
  DEFAULT_SETTINGS,
  normalizeSettings,
  parseSettings,
  prefersReducedMotion,
  serializeSettings,
} from "../src/settings.js";

test("settings round-trip through JSON", () => {
  const custom = { ...DEFAULT_SETTINGS, volume: 0.2, muted: true, textScale: 1.5 };
  assert.deepEqual(parseSettings(serializeSettings(custom)), custom);
});

test("damaged or foreign settings fall back to defaults", () => {
  assert.deepEqual(parseSettings("not json"), DEFAULT_SETTINGS);
  assert.deepEqual(parseSettings('{"format":"other","formatVersion":1}'), DEFAULT_SETTINGS);
  assert.deepEqual(
    parseSettings('{"format":"opensynd-settings","formatVersion":99,"settings":{}}'),
    DEFAULT_SETTINGS,
  );
});

test("out-of-range and mistyped fields are corrected", () => {
  const settings = normalizeSettings({
    volume: 7,
    muted: "yes",
    captions: false,
    reducedMotion: "sometimes",
    textScale: 0,
  });
  assert.equal(settings.volume, 1);
  assert.equal(settings.muted, false);
  assert.equal(settings.captions, false);
  assert.equal(settings.reducedMotion, "system");
  assert.equal(settings.textScale, 0.75);
});

test("reduced motion honours explicit override over system preference", () => {
  assert.equal(prefersReducedMotion({ reducedMotion: "system" }, true), true);
  assert.equal(prefersReducedMotion({ reducedMotion: "off" }, true), false);
  assert.equal(prefersReducedMotion({ reducedMotion: "on" }, false), true);
});

test("cues caption even when muted and never need an audio context", () => {
  const captions = [];
  let constructed = 0;
  const audio = createAudio({
    getSettings: () => ({ ...DEFAULT_SETTINGS, muted: true }),
    onCaption: (text) => captions.push(text),
    AudioContextClass: class {
      constructor() {
        constructed += 1;
      }
    },
  });
  audio.play("objective");
  audio.play("unknown-cue");
  assert.deepEqual(captions, ["Objective complete"]);
  assert.equal(constructed, 0);
});

test("audio is optional when the browser lacks Web Audio", () => {
  const audio = createAudio({ getSettings: () => DEFAULT_SETTINGS });
  assert.doesNotThrow(() => audio.play("select"));
});

test("music settings default on, clamp volume and reject bad types", () => {
  assert.equal(DEFAULT_SETTINGS.music, true);
  const settings = normalizeSettings({ music: "loud", musicVolume: 3 });
  assert.equal(settings.music, true);
  assert.equal(settings.musicVolume, 1);
});
