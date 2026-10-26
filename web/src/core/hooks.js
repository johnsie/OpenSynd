// SPDX-License-Identifier: GPL-2.0-or-later

// What the game core tells whoever is running it. The core never draws, plays a sound or writes a line to the screen; it reports
// what happened through these hooks. The browser turns them into sound, effects and the status line, a server forwards them to
// its players, and a test just records them.
//
//   message(text)                a line for the status line (or the log)
//   sound(name, { at, friendly, weapon })   a cue; `at` is where it happened (the client makes it quieter the further off it is)
//   effect(kind, data)           something to show: "muzzle", "impact", "puff", "blast", "flame", "persuade", "restore"
//   changed()                    the squad or its surroundings changed: redraw the panels
//   selectionChanged()           somebody went down: whoever is selected may need dropping from the selection
//   looted(unit, items)          a unit picked something up
//   penalise(amount, reason)     the city charges the squad for something

export function silentHooks() {
  return {
    message() {},
    sound() {},
    effect() {},
    changed() {},
    selectionChanged() {},
    looted() {},
    penalise() {},
  };
}

/** Hooks that keep everything reported, for tests and for a server to forward: `events` is the list in order. */
export function recordingHooks() {
  const events = [];
  const note = (type) => (...details) => events.push({ type, details });
  return {
    events,
    message: (text) => events.push({ type: "message", text }),
    sound: (name, where = {}) => events.push({ type: "sound", name, ...where }),
    effect: (kind, data = {}) => events.push({ type: "effect", kind, ...data }),
    changed: note("changed"),
    selectionChanged: note("selectionChanged"),
    looted: (unit, items) => events.push({ type: "looted", unitId: unit.id, items: items.map((item) => item.definition.id) }),
    penalise: (amount, reason) => events.push({ type: "penalise", amount, reason }),
  };
}
