// SPDX-License-Identifier: GPL-2.0-or-later

export const ACTIONS = Object.freeze([
  "panLeft",
  "panRight",
  "panUp",
  "panDown",
  "cursorLeft",
  "cursorRight",
  "cursorUp",
  "cursorDown",
  "move",
  "interact",
  "repair",
  "useStim",
  "loot",
  "selectAll",
  "centre",
  "zoomIn",
  "zoomOut",
  "deselect",
  "pause",
]);

// Values are KeyboardEvent.key (case-insensitive) or "Space" for event.code.
export const DEFAULT_BINDINGS = Object.freeze({
  panLeft: "ArrowLeft",
  panRight: "ArrowRight",
  panUp: "ArrowUp",
  panDown: "ArrowDown",
  cursorLeft: "j",
  cursorRight: "l",
  cursorUp: "i",
  cursorDown: "k",
  move: "Enter",
  interact: "e",
  repair: "r",
  useStim: "t",
  loot: "f",
  selectAll: "a",
  centre: "c",
  zoomIn: "=",
  zoomOut: "-",
  deselect: "Escape",
  pause: "Space",
});

function keyName(event) {
  return event.code === "Space" ? "space" : String(event.key).toLowerCase();
}

// Invalid or duplicate entries fall back to defaults so every action stays
// reachable and no key triggers two actions.
export function normalizeBindings(raw) {
  const source = raw !== null && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const bindings = { ...DEFAULT_BINDINGS };
  const used = new Set();
  for (const action of ACTIONS) {
    const candidate = source[action];
    const key = typeof candidate === "string" && candidate.length > 0 ? candidate : bindings[action];
    const lowered = key.toLowerCase();
    if (used.has(lowered)) {
      bindings[action] = DEFAULT_BINDINGS[action];
    } else {
      bindings[action] = key;
    }
    used.add(bindings[action].toLowerCase());
  }
  return bindings;
}

export function resolveAction(bindings, event) {
  const name = keyName(event);
  return ACTIONS.find((action) => bindings[action].toLowerCase() === name) ?? null;
}

export const ACTION_LABELS = Object.freeze({
  panLeft: "Pan view left",
  panRight: "Pan view right",
  panUp: "Pan view up",
  panDown: "Pan view down",
  cursorLeft: "Cursor left",
  cursorRight: "Cursor right",
  cursorUp: "Cursor up",
  cursorDown: "Cursor down",
  move: "Move selected operator",
  interact: "Interact",
  repair: "Use repair kit",
  useStim: "Use stim injector",
  loot: "Loot a disabled watcher",
  selectAll: "Select all operators",
  centre: "Centre view on selection",
  zoomIn: "Zoom in",
  zoomOut: "Zoom out",
  deselect: "Deselect",
  pause: "Pause / resume",
});

export function bindingFromEvent(event) {
  return event.code === "Space" ? "Space" : event.key;
}

export function bindingLabel(binding) {
  return binding.length === 1 ? binding.toUpperCase() : binding;
}

// Returns the action already using this key, or null.
export function findConflict(bindings, action, key) {
  const lowered = key.toLowerCase();
  return ACTIONS.find((other) => other !== action && bindings[other].toLowerCase() === lowered) ?? null;
}
