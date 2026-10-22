// SPDX-License-Identifier: GPL-2.0-or-later

// The score. If music tracks are given it plays them from files on a loop: a calm one ("The Core" by
// p0ss, dark industrial techno) and an intense one ("Electric Stream", CC0) that crossfades in while an
// enemy has seen the squad (see provenance/assets.json). If the files cannot be played, or none is given,
// it falls back to an original generative score: a four-chord loop in A minor played by a bass, a
// soft pad and a delayed arpeggio, all synthesized. buildPattern is pure so the score can be tested.
export const TEMPO = 92;
export const STEPS_PER_BAR = 16;

// Each chord: bass root and the chord tones above it (MIDI note numbers).
const PROGRESSION = [
  { bass: 45, tones: [57, 60, 64, 67] }, // A minor
  { bass: 41, tones: [53, 57, 60, 64] }, // F major
  { bass: 36, tones: [55, 60, 64, 67] }, // C major
  { bass: 43, tones: [50, 55, 59, 62] }, // G major
];
const ARPEGGIO = [0, 1, 2, 3, 2, 1, 2, 3];

export function midiToFrequency(note) {
  return 440 * 2 ** ((note - 69) / 12);
}

// Returns notes as { step, midi, steps, voice } for the given number of bars.
export function buildPattern(bars = PROGRESSION.length) {
  const notes = [];
  for (let bar = 0; bar < bars; bar += 1) {
    const chord = PROGRESSION[bar % PROGRESSION.length];
    const start = bar * STEPS_PER_BAR;
    notes.push({ step: start, midi: chord.bass, steps: 6, voice: "bass" });
    notes.push({ step: start + 8, midi: chord.bass, steps: 4, voice: "bass" });
    for (const tone of chord.tones.slice(0, 3)) {
      notes.push({ step: start, midi: tone, steps: STEPS_PER_BAR, voice: "pad" });
    }
    for (let index = 0; index < 8; index += 1) {
      const tone = chord.tones[ARPEGGIO[index]] + 12;
      notes.push({ step: start + index * 2, midi: tone, steps: 2, voice: "arp" });
    }
  }
  return notes.sort((left, right) => left.step - right.step);
}

export const FADE_SECONDS = 1.2;

export function createMusic({
  getSettings,
  AudioContextClass,
  trackUrl = null,
  alertTrackUrl = null,
  AudioElementClass = null,
}) {
  const pattern = buildPattern();
  const loopSteps = STEPS_PER_BAR * PROGRESSION.length;
  const stepSeconds = 60 / TEMPO / 4;
  let context = null;
  let master = null;
  let timer = null;
  let nextStep = 0;
  let nextTime = 0;
  // The recorded tracks: a calm score and an intense one that takes over while an enemy has seen
  // the squad. Each is one looping audio element; their gains crossfade and follow the settings.
  const tracks = {};
  let trackFailed = false;
  let trackStarted = false;
  let alertOn = false;
  let mix = 0; // 0 = all calm, 1 = all intense
  let fadeTimer = null;

  function createTrack(name, url) {
    if (!url || !AudioElementClass) return;
    const element = new AudioElementClass(url);
    element.loop = true;
    element.preload = "auto";
    element.addEventListener("error", () => {
      trackFailed = true;
      for (const other of Object.values(tracks)) other.pause?.();
      for (const key of Object.keys(tracks)) delete tracks[key];
      api.start();
    });
    tracks[name] = element;
  }

  function trackVolume(gain) {
    const settings = getSettings();
    const audible = settings.music && !settings.muted;
    return audible ? Math.min(1, Math.max(0, settings.musicVolume)) * gain : 0;
  }

  // Set each element's volume from the mix, starting one that has come in and pausing one that is gone.
  function applyMix() {
    const gains = { calm: 1 - mix, alert: mix };
    for (const [name, element] of Object.entries(tracks)) {
      element.volume = trackVolume(gains[name]);
      if (gains[name] > 0 && element.paused) {
        if (name === "alert") element.currentTime = 0; // the intense track always comes in from its start
        element.play?.()?.catch?.(() => {
          trackStarted = false; // blocked until the next gesture; start() runs again on the next input
        });
      } else if (gains[name] === 0 && !element.paused) {
        element.pause?.();
      }
    }
  }

  // Move the crossfade along by `seconds`; also called on a timer.
  function advance(seconds) {
    const target = alertOn ? 1 : 0;
    if (mix === target) return;
    const step = seconds / FADE_SECONDS;
    mix = target > mix ? Math.min(target, mix + step) : Math.max(target, mix - step);
    applyMix();
  }

  function startTracks() {
    if (!trackUrl || !AudioElementClass || trackFailed) return false;
    if (!tracks.calm) {
      createTrack("calm", trackUrl);
      createTrack("alert", alertTrackUrl);
    }
    applyMix();
    if (fadeTimer === null) fadeTimer = setInterval(() => advance(0.1), 100);
    return true;
  }

  function ensureContext() {
    if (context || !AudioContextClass) return context;
    try {
      context = new AudioContextClass();
    } catch {
      return null;
    }
    master = context.createGain();
    const delay = context.createDelay();
    delay.delayTime.value = stepSeconds * 3;
    const feedback = context.createGain();
    feedback.gain.value = 0.35;
    delay.connect(feedback).connect(delay);
    master.connect(context.destination);
    delay.connect(master);
    context.musicDelay = delay;
    return context;
  }

  function playNote(note, time) {
    const length = note.steps * stepSeconds;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    const levels = { bass: 0.5, pad: 0.12, arp: 0.14 };
    oscillator.type = note.voice === "bass" ? "sawtooth" : note.voice === "pad" ? "triangle" : "square";
    filter.frequency.value = note.voice === "bass" ? 380 : note.voice === "pad" ? 1400 : 2200;
    oscillator.frequency.value = midiToFrequency(note.midi);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(levels[note.voice], time + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + length * 0.95);
    oscillator.connect(filter).connect(gain);
    gain.connect(master);
    if (note.voice === "arp") gain.connect(context.musicDelay);
    oscillator.start(time);
    oscillator.stop(time + length);
  }

  function schedule() {
    // Queue everything due in the next quarter second.
    while (nextTime < context.currentTime + 0.25) {
      for (const note of pattern) {
        if (note.step === nextStep) playNote(note, nextTime);
      }
      nextTime += stepSeconds;
      nextStep = (nextStep + 1) % loopSteps;
    }
  }

  function refresh() {
    if (!context) return;
    const settings = getSettings();
    const audible = settings.music && !settings.muted;
    master.gain.value = audible ? settings.musicVolume : 0;
  }

  const api = {
    // For tests: whether the recorded score is in use, what is playing and how far the mix is toward intense.
    status() {
      const calm = tracks.calm;
      return {
        track: Boolean(calm) && !trackFailed,
        playing: Boolean(calm && !calm.paused) || Boolean(tracks.alert && !tracks.alert.paused),
        intense: alertOn,
        mix,
        volume: calm?.volume ?? 0,
      };
    },
    // Switch to the intense score while an enemy has seen the squad, and back to calm when it is over.
    setAlert(value) {
      alertOn = Boolean(value);
    },
    advance,
    // Browsers require a user gesture before audio, so the game calls this on first input.
    start() {
      const settings = getSettings();
      if (timer !== null || !settings.music) return;
      if (trackUrl && !trackFailed && AudioElementClass) {
        if (!trackStarted || tracks.calm?.paused) {
          trackStarted = true;
          startTracks();
        }
        return;
      }
      if (!ensureContext()) return;
      if (context.state === "suspended") context.resume?.();
      nextStep = 0;
      nextTime = context.currentTime + 0.1;
      timer = setInterval(schedule, 100);
      refresh();
    },
    stop() {
      if (timer !== null) clearInterval(timer);
      timer = null;
      for (const element of Object.values(tracks)) element.pause?.();
      if (fadeTimer !== null) clearInterval(fadeTimer);
      fadeTimer = null;
      trackStarted = false;
    },
    refresh() {
      const settings = getSettings();
      if (!settings.music) this.stop();
      else if (tracks.calm && !trackStarted) this.start();
      else if (timer === null && context && !tracks.calm) this.start();
      refresh();
      if (settings.music) applyMix();
    },
  };
  return api;
}
