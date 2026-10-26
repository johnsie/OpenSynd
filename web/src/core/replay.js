// SPDX-License-Identifier: GPL-2.0-or-later

// Recording an operation and playing it back. A recording is the content version, the seed and every command with the step it was
// given on: because the world is seeded and every change comes through the same fixed step and the same commands, playing the
// recording again gives the very same operation. That is what lets a server check a score, and what a replay shows.
import { FIXED_STEP_SECONDS } from "../simulation.js";
import { applyCommand } from "./apply.js";
import { silentHooks } from "./hooks.js";
import { stepWorld } from "./world.js";

export const RECORDING_VERSION = 1;
export const CORE_VERSION = 1; // changes whenever a rule changes in a way that alters how an operation plays out

/** Start a recording for a world that is about to begin. `details` says what the world was made from. */
export function startRecording(details) {
  return { recording: RECORDING_VERSION, core: CORE_VERSION, ...details, commands: [], steps: 0 };
}

/** Give a command to the world and put it in the recording at the step it was given on. Returns what applyCommand returns. */
export function giveRecorded(world, hooks, recording, command, context = {}) {
  recording.commands.push({ step: world.steps, command: JSON.parse(JSON.stringify(command)) });
  return applyCommand(world, hooks, command, context);
}

/** Step the world once and keep the recording's length up to date. */
export function stepRecorded(world, hooks, recording) {
  stepWorld(world, FIXED_STEP_SECONDS, hooks);
  recording.steps = world.steps;
}

/** Play a recording into a freshly made world, up to the step it ends on (or `until`). Returns how many steps were run. */
export function playRecording(world, recording, hooks = silentHooks(), until = recording.steps) {
  let next = 0;
  while (world.steps < until && world.outcome === "active") {
    while (next < recording.commands.length && recording.commands[next].step <= world.steps) {
      applyCommand(world, hooks, recording.commands[next].command);
      next += 1;
    }
    stepWorld(world, FIXED_STEP_SECONDS, hooks);
  }
  return world.steps;
}

// A small, stable fingerprint of where an operation stands: who is where with how much health, which objectives are done and the
// counts so far. Two worlds that played the same way have the same one.
const round = (value) => Math.round(value * 1000) / 1000;
export function stateHash(world) {
  const parts = [
    world.steps,
    world.outcome,
    ...world.units.map((unit) => {
      const place = `${round(unit.position.x)},${round(unit.position.y)}`;
      return `${unit.id}:${place}:${round(unit.health)}:${unit.disabled ? 1 : 0}`;
    }),
    ...world.objectives.map((objective) => `${objective.id}:${objective.complete ? 1 : 0}:${round(objective.progress ?? 0)}`),
    ...world.drops.map((drop) => `${drop.id}:${round(drop.position.x)},${round(drop.position.y)}`),
    JSON.stringify(world.opStats),
  ];
  let hash = 2166136261;
  for (const char of parts.join("|")) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
