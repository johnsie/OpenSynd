// SPDX-License-Identifier: GPL-2.0-or-later

// Procedural cues only: every sound is synthesized here, so no audio asset
// needs provenance. Each cue carries a caption for players who cannot hear it.
export const CUES = Object.freeze({
  select: { caption: "Operator selected", notes: [[660, 0.06]] },
  move: { caption: "Move order acknowledged", notes: [[440, 0.05], [550, 0.07]] },
  pulse: { caption: "Disabling pulse fired", notes: [[880, 0.04], [330, 0.12]] },
  repair: { caption: "Repair kit applied", notes: [[392, 0.08], [523, 0.08], [659, 0.1]] },
  objective: { caption: "Objective complete", notes: [[523, 0.1], [659, 0.1], [784, 0.16]] },
  alert: { caption: "Watcher alerted", notes: [[740, 0.07], [740, 0.07], [988, 0.12]] },
  disabled: { caption: "Unit disabled", notes: [[220, 0.14], [147, 0.2]] },
});

export function createAudio({ getSettings, onCaption, AudioContextClass }) {
  let context = null;

  function ensureContext() {
    if (context || !AudioContextClass) return context;
    try {
      context = new AudioContextClass();
    } catch {
      context = null;
    }
    return context;
  }

  function play(cueName) {
    const cue = CUES[cueName];
    if (!cue) return;
    const settings = getSettings();
    if (settings.captions && onCaption) onCaption(cue.caption);
    if (settings.muted || settings.volume <= 0) return;
    const audio = ensureContext();
    if (!audio) return;
    if (audio.state === "suspended") audio.resume?.();

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
