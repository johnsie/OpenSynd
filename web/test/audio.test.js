// SPDX-License-Identifier: GPL-2.0-or-later

import assert from "node:assert/strict";
import test from "node:test";

import { CUES, SHOT_CUES, createAudio, shotCue, shotVolume } from "../src/audio.js";

// A stand-in for the Web Audio context that records what each cue builds.
function fakeContext() {
  const made = { oscillators: 0, sources: 0, gains: 0, filters: 0, ramps: 0 };
  const param = () => ({
    value: 0,
    setValueAtTime() {},
    exponentialRampToValueAtTime() {
      made.ramps += 1;
    },
  });
  const node = (counter) => () => {
    made[counter] += 1;
    const item = {
      connect: (next) => next ?? item,
      start() {},
      stop() {},
      frequency: param(),
      gain: param(),
      Q: param(),
      type: "",
      buffer: null,
    };
    return item;
  };
  class FakeContext {
    constructor() {
      this.currentTime = 0;
      this.sampleRate = 8000;
      this.destination = {};
      this.state = "running";
    }

    createOscillator = node("oscillators");
    createGain = node("gains");
    createBiquadFilter = node("filters");
    createBufferSource = node("sources");
    createBuffer(channels, length) {
      return { getChannelData: () => new Float32Array(length) };
    }
  }
  return { FakeContext, made };
}

const settings = { volume: 0.6, muted: false, captions: true };

test("every weapon sound maps to its own cue, and an unknown one falls back to the pistol", () => {
  assert.equal(new Set(Object.values(SHOT_CUES)).size, 9, "nine weapons, nine distinct sounds");
  for (const cue of Object.values(SHOT_CUES)) assert.ok(CUES[cue], `${cue} exists`);
  assert.equal(shotCue("rifle"), "shot-rifle");
  assert.equal(shotCue("coil"), "shot-coil");
  assert.equal(shotCue("nonsense"), "shot-pistol");
  assert.equal(shotCue(undefined), "shot-pistol");
});

test("gunfire is quieter the further it is, your own fire stays clear, and nothing is ever silent", () => {
  assert.ok(shotVolume(0) > shotVolume(20));
  assert.ok(shotVolume(20) > shotVolume(60) - 1e-9);
  assert.ok(shotVolume(500) >= 0.15);
  assert.ok(shotVolume(40, true) >= 0.6, "an operative's own shot is always heard");
  assert.ok(shotVolume(0, true) > shotVolume(0, false), "and louder than the same shot from an enemy");
});

test("each cue builds real sound: weapon cues use noise and tones, and none throws", () => {
  const names = [
    ...Object.values(SHOT_CUES), "blast", "tick", "shield-up", "shield-hit", "hit", "persuade", "door", "glass",
    "train-horn", "flame-death",
  ];
  for (const name of names) {
    const { FakeContext, made } = fakeContext();
    const audio = createAudio({ getSettings: () => settings, AudioContextClass: FakeContext });
    assert.doesNotThrow(() => audio.play(name), name);
    assert.ok(made.oscillators + made.sources > 0, `${name} makes sound`);
  }
  const { FakeContext, made } = fakeContext();
  createAudio({ getSettings: () => settings, AudioContextClass: FakeContext }).play("shot-rifle");
  assert.ok(made.sources >= 1 && made.oscillators >= 1, "a rifle shot is noise plus a low boom");
});

test("rapid fire is throttled per cue so many shooters do not flood the mix or the captions", () => {
  const { FakeContext, made } = fakeContext();
  const captions = [];
  const audio = createAudio({ getSettings: () => settings, AudioContextClass: FakeContext, onCaption: (text) => captions.push(text) });
  for (let shot = 0; shot < 10; shot += 1) audio.play("shot-pistol");
  assert.equal(captions.length, 1, "ten shots in the same instant make one sound and one caption");
  const once = made.sources;
  audio.play("shot-rifle");
  assert.ok(made.sources > once, "a different weapon is not blocked");
});

test("weapon cues have captions and respect muting", () => {
  const captions = [];
  const { FakeContext, made } = fakeContext();
  const audio = createAudio({
    getSettings: () => ({ ...settings, muted: true }),
    AudioContextClass: FakeContext,
    onCaption: (text) => captions.push(text),
  });
  audio.play("blast");
  assert.deepEqual(captions, ["Explosion"]);
  assert.equal(made.sources + made.oscillators, 0, "muted: captioned but silent");
});

test("the victory theme is a drum-only march that ends on a crash", async () => {
  const { buildVictory, VICTORY_BARS, CUES } = await import("../src/audio.js");
  const events = buildVictory();
  const kinds = new Set(events.map((event) => event.kind));
  for (const kind of ["kick", "snare", "tom", "crash"]) {
    assert.ok(kinds.has(kind), `has ${kind}`);
  }
  assert.ok(events.every((event) => ["kick", "snare", "tom", "crash"].includes(event.kind)), "nothing but drums");
  assert.ok(events.filter((event) => event.kind === "snare").length >= VICTORY_BARS * 8, "a busy marching snare");
  assert.deepEqual(events.map((event) => event.step), [...events.map((event) => event.step)].sort((a, b) => a - b));
  const last = events.at(-1);
  assert.equal(last.step, VICTORY_BARS * 16, "the final hit lands on the downbeat after the last bar");
  assert.ok(events.some((event) => event.kind === "crash" && event.step === last.step));
  assert.match(CUES.victory.caption, /drums/);
});

test("the victory themes are chosen by name: drums alone, drums with brass, or the full band", async () => {
  const { buildVictory, VICTORY_THEMES } = await import("../src/audio.js");
  const kindsOf = (theme) => new Set(buildVictory(theme).map((event) => event.kind));
  assert.deepEqual(Object.keys(VICTORY_THEMES), ["march", "brass", "band"]);
  assert.ok(kindsOf("brass").has("brass") && kindsOf("brass").has("tuba") && !kindsOf("brass").has("lead"));
  assert.ok(kindsOf("band").has("bass") && kindsOf("band").has("stab") && kindsOf("band").has("lead"));
  assert.ok(!kindsOf("march").has("brass") && !kindsOf("march").has("bass"));
  assert.deepEqual(buildVictory("nonsense"), buildVictory("march"));
});

test("spoken cues are read aloud only when allowed, quietly, and never twice in quick succession", async () => {
  const { createAudio } = await import("../src/audio.js");
  const said = [];
  const speech = { speak: (line) => said.push([line.text, line.volume]) };
  class Utterance {
    constructor(text) {
      this.text = text;
    }
  }
  const make = (settings) => createAudio({ getSettings: () => settings, speech, Utterance, AudioContextClass: null });
  const base = { volume: 0.6, muted: false, captions: false, spoken: true };
  const talker = make(base);
  talker.play("complete");
  talker.play("failed");
  talker.play("select");
  talker.play("select");
  assert.deepEqual(said, [["Mission completed", 0.6], ["Mission failed", 0.6], ["Agent selected", 0.6]], "the second select is too soon");
  make({ ...base, spoken: false }).play("complete");
  make({ ...base, muted: true }).play("complete");
  make({ ...base, volume: 0 }).play("complete");
  talker.play("move");
  assert.equal(said.length, 3, "off, muted and silent cues, and cues with no line, say nothing");
  const failing = { speak() { throw new Error("no voice"); } };
  const broken = createAudio({ getSettings: () => base, speech: failing, Utterance, AudioContextClass: null });
  assert.doesNotThrow(() => broken.play("police-warning"));
});
