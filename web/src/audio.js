// SPDX-License-Identifier: GPL-2.0-or-later

// Procedural cues only: every sound is synthesized here, so no audio asset needs provenance. Short
// cues are a few tones; weapon, blast and shield sounds are built from filtered noise and sweeps so each
// weapon sounds like what it is. Each cue carries a caption for players who cannot hear it.

// Which cue a weapon makes when it fires, by the `sound` field of its equipment definition.
export const SHOT_CUES = Object.freeze({
  pistol: "shot-pistol",
  smg: "shot-smg",
  rotary: "shot-rotary",
  rifle: "shot-rifle",
  coil: "shot-coil",
  longshot: "shot-longshot",
  scatter: "shot-scatter",
  flame: "shot-flame",
  beam: "shot-beam",
});

export function shotCue(sound) {
  return SHOT_CUES[sound] ?? SHOT_CUES.pistol;
}

// Gunfire gets quieter the further it is from what the player is looking at.
export function shotVolume(distanceInTiles, own = false) {
  const falloff = Math.max(0.2, 1 - distanceInTiles / 45);
  return own ? Math.max(0.6, falloff) : falloff * 0.8;
}

// Building blocks for the synthesized cues. `audio` is the AudioContext, `at` a start time and `out`
// where the sound goes.
function noise(audio, out, at, { seconds, gain, filter = "bandpass", from = 2000, to = from, q = 0.8 }) {
  const length = Math.max(1, Math.floor(audio.sampleRate * seconds));
  const buffer = audio.createBuffer(1, length, audio.sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < length; index += 1) data[index] = Math.random() * 2 - 1;
  const source = audio.createBufferSource();
  source.buffer = buffer;
  const biquad = audio.createBiquadFilter();
  biquad.type = filter;
  biquad.Q.value = q;
  biquad.frequency.setValueAtTime(from, at);
  biquad.frequency.exponentialRampToValueAtTime(Math.max(20, to), at + seconds);
  const level = audio.createGain();
  level.gain.setValueAtTime(gain, at);
  level.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
  source.connect(biquad).connect(level).connect(out);
  source.start(at);
  source.stop(at + seconds);
}

function tone(audio, out, at, { seconds, gain, type = "sine", from, to = from }) {
  const oscillator = audio.createOscillator();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(from, at);
  oscillator.frequency.exponentialRampToValueAtTime(Math.max(10, to), at + seconds);
  const level = audio.createGain();
  level.gain.setValueAtTime(gain, at);
  level.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
  oscillator.connect(level).connect(out);
  oscillator.start(at);
  oscillator.stop(at + seconds);
}

// The victory themes. All are four bars of a march ending on one big hit; the player picks one in the settings.
//   march: drums alone (a dotted marching snare, bass drum, timpani-like toms, a closing roll).
//   brass: the same drums under a tuba and a bugle-like brass call.
//   band: a driving kit under a pumping bass, chord stabs and a brass-like fanfare.
// Built as plain data so it can be tested; the cue below plays it. Times are in sixteenth-note steps from the start.
export const VICTORY_THEMES = Object.freeze({ march: "Drum march", brass: "Brass and drums", band: "Full band" });
export const DEFAULT_VICTORY_THEME = "march";
export const VICTORY_TEMPO = 108;
export const VICTORY_BARS = 4;
const MARCH_SNARE = [0, 3, 4, 6, 8, 10, 11, 12, 14]; // steps of the marching snare figure in a bar
const TIMPANI = [[0, 43], [8, 38], [12, 43]]; // [step, pitch] of the low toms in a bar
const TUBA = [36, 43, 41, 36]; // the bass note of each bar
// A bugle-like call in C: [step, pitch, length in steps]
const BUGLE = [
  [0, 67, 3], [3, 67, 1], [4, 72, 4], [8, 76, 4], [12, 79, 4],
  [16, 79, 3], [19, 79, 1], [20, 76, 4], [24, 72, 4], [28, 67, 4],
  [32, 69, 3], [35, 72, 1], [36, 76, 4], [40, 72, 4], [44, 69, 4],
  [48, 67, 2], [50, 72, 2], [52, 76, 2], [54, 79, 2], [56, 84, 6], [62, 79, 2],
];
const BAND_CHORDS = [
  { root: 36, stab: [60, 64, 67] }, // C
  { root: 43, stab: [59, 62, 67] }, // G
  { root: 45, stab: [60, 64, 69] }, // A minor
  { root: 41, stab: [60, 65, 69] }, // F
];

function marchDrums(events) {
  for (let bar = 0; bar < VICTORY_BARS; bar += 1) {
    const start = bar * 16;
    const last = bar === VICTORY_BARS - 1;
    events.push({ step: start, kind: "kick" }, { step: start + 8, kind: "kick" });
    for (const [step, midi] of TIMPANI) events.push({ step: start + step, kind: "tom", midi });
    for (const step of MARCH_SNARE) {
      // The last bar's second half rolls instead of marching.
      if (last && step >= 8) continue;
      events.push({ step: start + step, kind: "snare" });
    }
    if (bar % 2 === 1) events.push({ step: start + 15, kind: "snare" }); // a pickup into the next phrase
    if (last) {
      for (let step = 8; step < 16; step += 1) events.push({ step: start + step, kind: "snare" });
      events.push({ step: start + 12, kind: "tom", midi: 50 }, { step: start + 14, kind: "tom", midi: 47 });
    }
  }
}

function bandKit(events) {
  for (let bar = 0; bar < VICTORY_BARS; bar += 1) {
    const start = bar * 16;
    const chord = BAND_CHORDS[bar];
    for (let beat = 0; beat < 4; beat += 1) {
      events.push({ step: start + beat * 4, kind: "kick" });
      events.push({ step: start + beat * 4, kind: "stab", midi: chord.stab, steps: 2 });
    }
    events.push({ step: start + 4, kind: "snare" }, { step: start + 12, kind: "snare" });
    for (let eighth = 0; eighth < 8; eighth += 1) {
      events.push({ step: start + eighth * 2, kind: eighth % 2 === 1 ? "open-hat" : "hat" });
      events.push({ step: start + eighth * 2, kind: "bass", midi: chord.root + (eighth % 4 === 3 ? 12 : 0), steps: 2 });
    }
    if (bar === VICTORY_BARS - 1) {
      for (let step = 12; step < 16; step += 1) events.push({ step: start + step, kind: "snare" });
      events.push({ step: start + 8, kind: "tom", midi: 50 }, { step: start + 10, kind: "tom", midi: 47 });
    }
  }
}

export function buildVictory(chosen = DEFAULT_VICTORY_THEME) {
  const theme = chosen in VICTORY_THEMES ? chosen : DEFAULT_VICTORY_THEME;
  const events = [];
  const end = VICTORY_BARS * 16;
  if (theme === "band") bandKit(events);
  else marchDrums(events);
  if (theme === "brass") {
    // A tuba on the beat and the bugle call over the top.
    for (let bar = 0; bar < VICTORY_BARS; bar += 1) {
      for (const step of [0, 8]) events.push({ step: bar * 16 + step, kind: "tuba", midi: TUBA[bar], steps: 6 });
    }
    for (const [step, midi, steps] of BUGLE) events.push({ step, kind: "brass", midi, steps });
  }
  if (theme === "band") {
    for (const [step, midi, steps] of BUGLE) events.push({ step, kind: "lead", midi, steps });
  }
  events.push({ step: end, kind: "crash" }, { step: end, kind: "kick" }, { step: end, kind: "snare" });
  events.push({ step: end, kind: "tom", midi: 38 });
  if (theme !== "march") {
    events.push({ step: end, kind: "tuba", midi: 36, steps: 12 }, { step: end, kind: "brass", midi: 72, steps: 12 });
    events.push({ step: end, kind: "brass", midi: 79, steps: 12 }, { step: end, kind: "brass", midi: 84, steps: 12 });
  }
  return events.sort((left, right) => left.step - right.step);
}

let victoryTheme = DEFAULT_VICTORY_THEME;
/** Chooses which victory theme the `victory` cue plays. */
export function setVictoryTheme(theme) {
  victoryTheme = theme in VICTORY_THEMES ? theme : DEFAULT_VICTORY_THEME;
}

const frequencyOf = (midi) => 440 * 2 ** ((midi - 69) / 12);

function playVictory(audio, destination, at) {
  const step = 60 / VICTORY_TEMPO / 4;
  // Many voices land together on the final hit: a compressor keeps the whole theme under clipping.
  const out = audio.createDynamicsCompressor();
  out.threshold.value = -12;
  out.ratio.value = 6;
  out.connect(destination);
  // A held pitch from a single oscillator (or two for a brassy edge).
  const note = (time, midi, seconds, gain, type, octave = 1) => {
    const frequency = frequencyOf(midi) * octave;
    tone(audio, out, time, { seconds, gain, type, from: frequency, to: frequency });
  };
  for (const event of buildVictory(victoryTheme)) {
    const time = at + event.step * step;
    const length = (event.steps ?? 1) * step;
    switch (event.kind) {
      case "kick":
        tone(audio, out, time, { seconds: 0.2, gain: 0.75, from: 160, to: 42 });
        noise(audio, out, time, { seconds: 0.03, gain: 0.3, filter: "lowpass", from: 2000, to: 400 });
        break;
      case "snare":
        noise(audio, out, time, { seconds: 0.12, gain: 0.7, from: 3200, to: 1400, q: 0.7 });
        tone(audio, out, time, { seconds: 0.1, gain: 0.35, type: "triangle", from: 210, to: 130 });
        break;
      case "tom":
        tone(audio, out, time, { seconds: 0.25, gain: 0.7, from: frequencyOf(event.midi) * 2, to: frequencyOf(event.midi) });
        break;
      case "crash":
        noise(audio, out, time, { seconds: 1.8, gain: 0.4, filter: "highpass", from: 5500, to: 3500, q: 0.4 });
        break;
      case "hat":
        noise(audio, out, time, { seconds: 0.04, gain: 0.22, filter: "highpass", from: 7500, to: 6500 });
        break;
      case "open-hat":
        noise(audio, out, time, { seconds: 0.16, gain: 0.2, filter: "highpass", from: 7000, to: 5500 });
        break;
      case "bass":
        note(time, event.midi, Math.max(0.12, length * 0.9), 0.4, "sawtooth");
        break;
      case "tuba":
        note(time, event.midi, Math.max(0.15, length * 0.85), 0.45, "sawtooth");
        note(time, event.midi, Math.max(0.15, length * 0.85), 0.2, "triangle", 2);
        break;
      case "brass":
        // Two slightly apart sawtooths and a square an octave down give the blare of a section.
        note(time, event.midi, Math.max(0.2, length * 0.95), 0.12, "sawtooth");
        note(time, event.midi, Math.max(0.2, length * 0.95), 0.1, "sawtooth", 1.006);
        note(time, event.midi, Math.max(0.2, length * 0.95), 0.06, "square", 0.5);
        break;
      case "stab":
        for (const midi of [].concat(event.midi)) note(time, midi, Math.max(0.12, length), 0.1, "square");
        break;
      case "lead":
        note(time, event.midi, Math.max(0.18, length * 1.1), 0.16, "sawtooth");
        note(time, event.midi, Math.max(0.18, length * 1.1), 0.1, "triangle", 2);
        break;
      default:
        break;
    }
  }
}

// Sound cues built from noise and sweeps. Each is (audio, out, at).
const SYNTH = Object.freeze({
  // A sharp pistol crack with a quick falling snap.
  "shot-pistol": {
    caption: "Pistol shot",
    gap: 0.05,
    play(audio, out, at) {
      noise(audio, out, at, { seconds: 0.08, gain: 0.9, from: 3200, to: 900 });
      tone(audio, out, at, { seconds: 0.09, gain: 0.45, from: 1300, to: 170 });
    },
  },
  // A lighter, snappier crack: meant to be heard many times a second.
  "shot-smg": {
    caption: "Machine pistol burst",
    gap: 0.05,
    play(audio, out, at) {
      noise(audio, out, at, { seconds: 0.045, gain: 0.7, from: 4200, to: 1500 });
      tone(audio, out, at, { seconds: 0.05, gain: 0.25, from: 1800, to: 320 });
    },
  },
  // A buzzing chatter from spinning barrels.
  "shot-rotary": {
    caption: "Rotary cannon fire",
    gap: 0.06,
    play(audio, out, at) {
      noise(audio, out, at, { seconds: 0.035, gain: 0.55, filter: "highpass", from: 2600, to: 1800 });
      tone(audio, out, at, { seconds: 0.04, gain: 0.2, type: "square", from: 230, to: 110 });
    },
  },
  // A deep boom with a body of low noise.
  "shot-rifle": {
    caption: "Rifle shot",
    gap: 0.08,
    play(audio, out, at) {
      noise(audio, out, at, { seconds: 0.16, gain: 1.0, filter: "lowpass", from: 2600, to: 260 });
      tone(audio, out, at, { seconds: 0.2, gain: 0.7, from: 420, to: 48 });
      tone(audio, out, at, { seconds: 0.1, gain: 0.2, type: "triangle", from: 1000, to: 140 });
    },
  },
  // A rising electric whine, then a hard crack and a thump: the coil gun charges and releases.
  "shot-coil": {
    caption: "Coil gun discharge",
    gap: 0.3,
    play(audio, out, at) {
      tone(audio, out, at, { seconds: 0.2, gain: 0.3, type: "sawtooth", from: 160, to: 2600 });
      noise(audio, out, at + 0.2, { seconds: 0.09, gain: 1.0, from: 5000, to: 800, q: 0.5 });
      tone(audio, out, at + 0.2, { seconds: 0.3, gain: 0.7, from: 140, to: 36 });
    },
  },
  // A loud, ringing crack with a long, fading echo off the buildings.
  "shot-longshot": {
    caption: "Long-range rifle shot",
    gap: 0.1,
    play(audio, out, at) {
      noise(audio, out, at, { seconds: 0.28, gain: 1.0, from: 2400, to: 500, q: 0.6 });
      tone(audio, out, at, { seconds: 0.3, gain: 0.55, from: 760, to: 80 });
      noise(audio, out, at + 0.16, { seconds: 0.3, gain: 0.28, from: 1400, to: 300, q: 0.5 });
    },
  },
  // A heavy, wide thump with a spray of gritty noise: a fan of pulses leaving at once.
  "shot-scatter": {
    caption: "Scatter Emitter blast",
    gap: 0.1,
    play(audio, out, at) {
      noise(audio, out, at, { seconds: 0.22, gain: 1.0, filter: "lowpass", from: 3400, to: 320, q: 0.5 });
      tone(audio, out, at, { seconds: 0.25, gain: 0.8, from: 260, to: 40 });
      noise(audio, out, at + 0.03, { seconds: 0.12, gain: 0.5, filter: "highpass", from: 3000, to: 1500 });
    },
  },
  // A rushing roar of fire.
  "shot-flame": {
    caption: "Incinerator roar",
    gap: 0.05,
    play(audio, out, at) {
      noise(audio, out, at, { seconds: 0.22, gain: 0.55, filter: "bandpass", from: 700, to: 1500, q: 0.4 });
      tone(audio, out, at, { seconds: 0.22, gain: 0.18, type: "sawtooth", from: 110, to: 70 });
    },
  },
  // A bright electric zap that falls away.
  "shot-beam": {
    caption: "Beam Projector discharge",
    gap: 0.15,
    play(audio, out, at) {
      tone(audio, out, at, { seconds: 0.35, gain: 0.45, type: "sawtooth", from: 3200, to: 380 });
      tone(audio, out, at, { seconds: 0.4, gain: 0.25, type: "square", from: 1600, to: 190 });
      noise(audio, out, at, { seconds: 0.12, gain: 0.5, from: 6000, to: 2000, q: 0.5 });
    },
  },
  // A door sliding open or shut.
  door: {
    caption: "Door",
    gap: 0.15,
    play(audio, out, at) {
      noise(audio, out, at, { seconds: 0.22, gain: 0.35, filter: "lowpass", from: 1800, to: 500, q: 0.7 });
      tone(audio, out, at + 0.2, { seconds: 0.05, gain: 0.25, type: "square", from: 220, to: 160 });
    },
  },
  // A window breaking: a sharp crack and falling shards.
  glass: {
    caption: "Breaking glass",
    gap: 0.1,
    play(audio, out, at) {
      noise(audio, out, at, { seconds: 0.08, gain: 0.5, filter: "highpass", from: 4000, to: 7000, q: 0.8 });
      for (let i = 0; i < 5; i += 1) {
        tone(audio, out, at + 0.06 + i * 0.045, { seconds: 0.05, gain: 0.14, type: "triangle", from: 5200 - i * 380, to: 3000 });
      }
    },
  },
  // The success theme at the end of a won operation: drums, bass, stabs and a fanfare.
  victory: {
    caption: "Victory march with drums",
    gap: 5,
    play: playVictory,
  },
  // A big, rolling explosion.
  blast: {
    caption: "Explosion",
    gap: 0.2,
    play(audio, out, at) {
      noise(audio, out, at, { seconds: 1.0, gain: 1.0, filter: "lowpass", from: 2400, to: 70, q: 0.5 });
      tone(audio, out, at, { seconds: 0.9, gain: 0.9, from: 95, to: 26 });
      noise(audio, out, at + 0.12, { seconds: 0.5, gain: 0.5, filter: "lowpass", from: 900, to: 80 });
    },
  },
  // A bomb's fuse ticking.
  tick: {
    caption: "Bomb ticking",
    gap: 0.2,
    play(audio, out, at) {
      tone(audio, out, at, { seconds: 0.04, gain: 0.35, type: "square", from: 1700, to: 1500 });
    },
  },
  // A rising shimmer as a shield comes up.
  "shield-up": {
    caption: "Shield raised",
    gap: 0.2,
    play(audio, out, at) {
      tone(audio, out, at, { seconds: 0.4, gain: 0.3, from: 300, to: 1500 });
      tone(audio, out, at + 0.05, { seconds: 0.3, gain: 0.15, type: "triangle", from: 600, to: 2600 });
    },
  },
  // A bullet pinging off the field.
  "shield-hit": {
    caption: "Shield deflects a bullet",
    gap: 0.05,
    play(audio, out, at) {
      tone(audio, out, at, { seconds: 0.14, gain: 0.3, type: "triangle", from: 2600, to: 1900 });
      noise(audio, out, at, { seconds: 0.04, gain: 0.3, filter: "highpass", from: 5000, to: 3000 });
    },
  },
  // A dull thud as a hit lands.
  hit: {
    caption: "Hit",
    gap: 0.04,
    play(audio, out, at) {
      noise(audio, out, at, { seconds: 0.09, gain: 0.6, filter: "lowpass", from: 700, to: 150 });
      tone(audio, out, at, { seconds: 0.12, gain: 0.5, from: 170, to: 55 });
    },
  },
  // A warbling suggestion.
  persuade: {
    caption: "Persuader hum",
    gap: 0.3,
    play(audio, out, at) {
      tone(audio, out, at, { seconds: 0.6, gain: 0.2, from: 480, to: 760 });
      tone(audio, out, at + 0.08, { seconds: 0.5, gain: 0.14, type: "triangle", from: 720, to: 500 });
    },
  },
});

export const CUES = Object.freeze({
  select: { caption: "Operator selected", notes: [[660, 0.06]] },
  move: { caption: "Move order acknowledged", notes: [[440, 0.05], [550, 0.07]] },
  pulse: { caption: "Disabling pulse fired", notes: [[880, 0.04], [330, 0.12]] },
  repair: { caption: "Repair kit applied", notes: [[392, 0.08], [523, 0.08], [659, 0.1]] },
  objective: { caption: "Objective complete", notes: [[523, 0.1], [659, 0.1], [784, 0.16]] },
  alert: { caption: "Enemy agent alerted", notes: [[740, 0.07], [740, 0.07], [988, 0.12]] },
  disabled: { caption: "Unit disabled", notes: [[220, 0.14], [147, 0.2]] },
  "police-warning": {
    caption: "Police: put down your weapon",
    notes: [[880, 0.14], [660, 0.14], [880, 0.14], [660, 0.14]],
  },
  scan: { caption: "Scanner ping", notes: [[1320, 0.05], [1760, 0.14]] },
  complete: { caption: "Operation complete", notes: [[523, 0.12], [659, 0.12], [784, 0.12], [1047, 0.32]] },
  failed: { caption: "Operation lost", notes: [[392, 0.2], [311, 0.2], [247, 0.45]] },
  ...Object.fromEntries(Object.entries(SYNTH).map(([name, cue]) => [name, { caption: cue.caption }])),
});

export function createAudio({ getSettings, onCaption, AudioContextClass }) {
  let context = null;
  const lastPlayed = new Map();

  function ensureContext() {
    if (context || !AudioContextClass) return context;
    try {
      context = new AudioContextClass();
    } catch {
      context = null;
    }
    return context;
  }

  // `volume` scales the cue (distance falloff and the like).
  function play(cueName, { volume = 1 } = {}) {
    const cue = CUES[cueName];
    if (!cue) return;
    const settings = getSettings();
    const synth = SYNTH[cueName];
    const silent = settings.muted || settings.volume <= 0;
    const audio = silent ? null : ensureContext();
    // Rapid fire would drown the mix and the caption: never repeat a cue faster than its gap.
    const now = audio ? audio.currentTime : Date.now() / 1000;
    if (synth && now - (lastPlayed.get(cueName) ?? -Infinity) < synth.gap) return;
    lastPlayed.set(cueName, now);
    if (settings.captions && onCaption) onCaption(cue.caption);
    if (silent || !audio) return;
    if (audio.state === "suspended") audio.resume?.();

    if (synth) {
      const gain = audio.createGain();
      gain.gain.value = settings.volume * 0.5 * Math.max(0, Math.min(1, volume));
      gain.connect(audio.destination);
      synth.play(audio, gain, audio.currentTime);
      return;
    }
    let start = audio.currentTime;
    for (const [frequency, duration] of cue.notes) {
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.type = "triangle";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(settings.volume * 0.25, start);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      oscillator.connect(gain).connect(audio.destination);
      oscillator.start(start);
      oscillator.stop(start + duration);
      start += duration;
    }
  }

  return { play };
}
