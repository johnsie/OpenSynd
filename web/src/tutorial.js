// SPDX-License-Identifier: GPL-2.0-or-later

// The guided training operation: a list of steps, each with a prompt and a test over what the game reports. The game builds an
// observation every fraction of a second (see observeTutorial) and the tutorial moves on when the current step's test holds. It
// only reads; it never changes the operation, and it is plain data so a bot (or the server, later) can follow the same prompts.
export const STEPS = Object.freeze([
  {
    id: "select",
    text: "Click Op 2 in the squad panel to select only them (tick the box beside a name to add someone instead). Keys 1 to 4 do the same.",
    point: () => [{ unit: "operator-two" }, { roster: "operator-two" }],
    done: (seen) => seen.selectedIds.includes("operator-two"),
  },
  {
    id: "all",
    text: "Click Select all, or the diamond between the squad cards, or press A, to give orders to the whole squad at once.",
    point: () => [{ button: "#select-all-button" }, { button: "#select-all-hub" }],
    done: (seen) => seen.allSelected,
  },
  {
    id: "walk",
    text: "Click the glowing square marked by the arrow to walk there; everyone selected goes together. Drag to look around.",
    point: () => ({ zone: "walk-pad" }),
    done: (seen) => seen.onWalkPad,
  },
  {
    id: "weapon",
    text: "Click the Pulse Emitter in an operator's inventory to take it out. Nobody fires without a weapon selected.",
    point: () => ({ slotAction: "disable-pulse" }),
    done: (seen) => seen.weaponOut,
  },
  {
    id: "shoot",
    text: "Right-click the practice target (the enemy agent under the arrow) to fire; hold the button to keep firing. It cannot hurt you.",
    point: () => ({ unit: "practice-target" }),
    done: (seen) => seen.targetDown,
  },
  {
    id: "loot",
    text: "Walk an operator up to the fallen target (under the arrow) and press F to take their kit.",
    point: () => ({ unit: "practice-target" }),
    done: (seen) => seen.looted,
  },
  {
    id: "queue",
    text: "Hold Shift and click two different spots on the street to queue a route. The operator walks them in order.",
    point: () => [{ tile: { x: 14, y: 20 } }, { tile: { x: 19, y: 19 } }],
    done: (seen) => seen.queued,
  },
  {
    id: "persuade",
    text:
      "Click the Persuader in operator 1's inventory: switching it on puts the weapon away (it is one or the other). " +
      "Then stand next to the civilian until they follow you.",
    point: () => [{ slotAction: "persuade" }, { unit: "civilian-1" }],
    done: (seen) => seen.persuaded,
  },
  {
    id: "drive",
    text: "Walk next to the parked car and press V to get in, then click the road to drive it to the second glowing square.",
    point: (seen) => (seen.inCar ? { zone: "drive-pad" } : { unit: "training-car" }),
    done: (seen) => seen.carAtDrivePad,
  },
  {
    id: "gate",
    text: "Press V to get out. Stand on the console square marked by the arrow and press E to open the gate.",
    point: () => ({ zone: "gate-panel" }),
    done: (seen) => seen.gateOpen,
  },
  {
    id: "exit",
    text: "Bring everyone into the green exit zone to finish training.",
    point: () => ({ zone: "safe-exit" }),
    done: (seen) => seen.won,
  },
]);

// What the bouncing arrows point at for the current step, as a list. Anything the player has to click or go to gets one:
// { unit } a person or vehicle in the world, { zone } a marked square, { tile } a spot on the street,
// { roster } an operator's card, { button } a page button by selector,
// { slotAction } an inventory square holding an item that does that (e.g. "persuade").
export function pointerFor(tutorial, seen) {
  const step = currentStep(tutorial);
  const found = step?.point ? step.point(seen) : [];
  return (Array.isArray(found) ? found : [found]).filter(Boolean);
}

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
  allSelected: false,
  onWalkPad: false,
  weaponOut: false,
  targetDown: false,
  looted: false,
  queued: false,
  persuaded: false,
  inCar: false,
  carAtDrivePad: false,
  gateOpen: false,
  won: false,
});
