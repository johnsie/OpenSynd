// SPDX-License-Identifier: GPL-2.0-or-later

import assert from "node:assert/strict";
import test from "node:test";

import { FADE_SECONDS, STEPS_PER_BAR, buildPattern, createMusic, midiToFrequency } from "../src/music.js";

// A stand-in for the browser's audio element.
const made = [];
class FakeAudio {
  constructor(url) {
    this.url = url;
    this.volume = 1;
    this.paused = true;
    this.currentTime = 0;
    this.loop = false;
    this.listeners = {};
    made.push(this);
  }

  addEventListener(name, handler) {
    this.listeners[name] = handler;
  }

  play() {
    this.paused = false;
    return Promise.resolve();
  }

  pause() {
    this.paused = true;
  }
}

function setup(t, overrides = {}) {
  made.length = 0;
  const settings = { music: true, muted: false, musicVolume: 0.5, ...overrides };
  const music = createMusic({
    getSettings: () => settings,
    AudioContextClass: null,
    trackUrl: "calm.mp3",
    alertTrackUrl: "alert.mp3",
    AudioElementClass: FakeAudio,
  });
  t.after(() => music.stop());
  const find = (url) => () => made.find((item) => item.url === url);
  return { music, settings, calm: find("calm.mp3"), alert: find("alert.mp3") };
}

test("the calm track loops at the music volume and the intense one waits", (t) => {
  const { music, calm, alert } = setup(t);
  music.start();
  assert.equal(calm().paused, false);
  assert.equal(calm().loop, true);
  assert.equal(calm().volume, 0.5);
  assert.equal(alert().paused, true, "the intense track is not playing yet");
  assert.deepEqual(
    { track: music.status().track, playing: music.status().playing, intense: music.status().intense },
    { track: true, playing: true, intense: false },
  );
});

test("when an enemy sees the squad the intense track fades in from its start and the calm one fades out", (t) => {
  const { music, calm, alert } = setup(t);
  music.start();
  alert().currentTime = 99; // left over from an earlier alert
  music.setAlert(true);
  music.advance(FADE_SECONDS / 2);
  assert.equal(alert().paused, false);
  assert.equal(alert().currentTime, 0, "it comes in from the beginning");
  assert.ok(Math.abs(alert().volume - 0.25) < 1e-9 && Math.abs(calm().volume - 0.25) < 1e-9, "half way through the crossfade");
  music.advance(FADE_SECONDS);
  assert.equal(alert().volume, 0.5);
  assert.equal(calm().paused, true, "the calm track is gone once fully faded");
  assert.equal(music.status().intense, true);
  assert.equal(music.status().mix, 1);
});

test("when the alert ends the calm score fades back and the intense one stops", (t) => {
  const { music, calm, alert } = setup(t);
  music.start();
  music.setAlert(true);
  music.advance(FADE_SECONDS * 2);
  music.setAlert(false);
  music.advance(FADE_SECONDS / 2);
  assert.equal(calm().paused, false);
  assert.equal(alert().paused, false);
  music.advance(FADE_SECONDS);
  assert.equal(alert().paused, true);
  assert.equal(calm().volume, 0.5);
});

test("muting silences both tracks, and turning music off stops them", (t) => {
  const { music, settings, calm, alert } = setup(t);
  music.start();
  music.setAlert(true);
  music.advance(FADE_SECONDS / 2);
  settings.muted = true;
  music.refresh();
  assert.equal(calm().volume, 0);
  assert.equal(alert().volume, 0);
  settings.muted = false;
  settings.music = false;
  music.refresh();
  assert.equal(calm().paused, true);
  assert.equal(alert().paused, true);
});

test("a track that cannot be loaded falls back to the generated score without crashing", (t) => {
  const { music, calm } = setup(t);
  music.start();
  calm().listeners.error();
  assert.equal(music.status().track, false);
  assert.doesNotThrow(() => music.start());
});

test("the generated score is still a four-bar loop", () => {
  const pattern = buildPattern();
  assert.ok(pattern.every((note) => note.step < STEPS_PER_BAR * 4));
  assert.equal(Math.round(midiToFrequency(69)), 440);
});

test("the score ducks while the victory theme plays and comes back after", (t) => {
  const { music, calm } = setup(t);
  music.start();
  assert.equal(calm().volume, 0.5);
  music.duck(10);
  assert.ok(calm().volume < 0.1, "turned right down");
  music.advance(5);
  assert.ok(calm().volume < 0.1, "still quiet halfway");
  music.advance(5.1);
  assert.equal(calm().volume, 0.5, "back to normal afterwards");
});
