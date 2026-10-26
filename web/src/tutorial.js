// SPDX-License-Identifier: GPL-2.0-or-later

// The guided training operation: a list of steps, each with a prompt and a test over what the game reports. The game builds an
// observation every fraction of a second (see observeTutorial) and the tutorial moves on when the current step's test holds. It
// only reads; it never changes the operation, and it is plain data so a bot (or the server, later) can follow the same prompts.
export const STEPS = Object.freeze([
  {
    id: "select",
    text: "Select the second operator: click them, or press 2. Press 1 to go back to the first.",
    done: (seen) => seen.selectedIds.includes("operator-two"),
  },
  {
    id: "walk",
    text: "Select an operator and click the glowing square ahead to walk there. Drag, or use the arrow keys, to look around.",
    done: (seen) => seen.onWalkPad,
  },
  {
    id: "weapon",
    text: "Click the Pulse Emitter in an operator's inventory to take it out. Nobody fires without a weapon selected.",
    done: (seen) => seen.weaponOut,
  },
  {
    id: "shoot",
    text: "Right-click the grey practice target to fire; hold the button to keep firing. It is unarmed and cannot hurt you.",
    done: (seen) => seen.targetDown,
  },
  {
    id: "loot",
    text: "Walk up to the fallen target and press F to take their kit.",
    done: (seen) => seen.looted,
  },
  {
    id: "queue",
    text: "Hold Shift and click two different spots on the street to queue a route. The operator walks them in order.",
    done: (seen) => seen.queued,
  },
  {
    id: "persuade",
    text: "Click the Persuader in operator 1's inventory to switch it on, then stand next to the civilian until they follow you.",
    done: (seen) => seen.persuaded,
  },
  {
    id: "drive",
    text: "Walk next to the parked car and press V to get in, then click the road to drive to the second glowing square.",
    done: (seen) => seen.carAtDrivePad,
  },
  {
    id: "gate",
    text: "Press V to get out. Stand on the console square and press E to open the gate.",
    done: (seen) => seen.gateOpen,
  },
  {
    id: "exit",
    text: "Bring everyone into the green exit zone to finish training.",
    done: (seen) => seen.won,
  },
]);

export function createTutorial() {
  return { index: 0, finished: false, skipped: [] };
}

export const currentStep = (tutorial) => (tutorial.finished ? null : STEPS[tutorial.index]);

export function tutorialProgress(tutorial) {
  return { number: Math.min(tutorial.index + 1, STEPS.length), total: STEPS.length };
}

// Move past every step whose test now holds. Returns the same object when nothing changed.
export function observeTutorial(tutorial, seen) {
  if (tutorial.finished) return tutorial;
  let index = tutorial.index;
  while (index < STEPS.length && STEPS[index].done(seen)) index += 1;
  if (index === tutorial.index) return tutorial;
  return { ...tutorial, index: Math.min(index, STEPS.length), finished: index >= STEPS.length };
}

// For a player who is stuck: leave this step undone and go on to the next.
export function skipStep(tutorial) {
  if (tutorial.finished) return tutorial;
  const step = STEPS[tutorial.index];
  const index = tutorial.index + 1;
  return { index, finished: index >= STEPS.length, skipped: [...tutorial.skipped, step.id] };
}

export const NOTHING_SEEN = Object.freeze({
  selectedIds: [],
  onWalkPad: false,
  weaponOut: false,
  targetDown: false,
  looted: false,
  queued: false,
  persuaded: false,
  carAtDrivePad: false,
  gateOpen: false,
  won: false,
});
