// SPDX-License-Identifier: GPL-2.0-or-later

// Sending a world from one place to another. A server runs an operation; each player's browser builds the same operation from the
// same content (so the map, the people's definitions and the long fixed routes are already there) and is sent only what changes
// as it plays: where people are, their health and gear, what is done, what is lying about. Everything here is plain data, so it
// travels as JSON.
const SKIPPED = new Set(["definition", "initialEquipment", "upgrades", "walkPhase", "initialPosition"]);

// Equipment and drops name their definition by id on the wire; the long fixed parts of a person (a patrol's route, a script's
// steps) are left out, since the receiver has them.
function replacer(key, value) {
  if (key === "definition" && value && typeof value === "object") return value.id ?? value;
  if (key === "route" && this && typeof this === "object" && "index" in this) return undefined;
  if (key === "steps" && this && typeof this === "object" && "index" in this && "waitLeft" in this) return undefined;
  return value;
}

// A person's route can be long and changes every step. The squad's own routes are sent whole (the player sees them drawn); for
// everyone else only the next step and how many remain are, which is all that is needed to show them walking.
function compactPath(unit) {
  if (unit.side === "team" || unit.path.length === 0) return unit.path;
  return { next: unit.path[0], left: unit.path.length };
}

/** Everything about one person (or vehicle) that changes while an operation is played, as plain data. */
export function unitFields(unit) {
  const dynamic = {};
  for (const [key, value] of Object.entries(unit)) if (!SKIPPED.has(key)) dynamic[key] = value;
  if (unit.path) dynamic.path = compactPath(unit);
  return JSON.parse(JSON.stringify(dynamic, replacer));
}

/** One person as text (the whole of them). */
export const packUnit = (unit) => JSON.stringify(unitFields(unit));

/** Everyone, as a Map from id to text. */
export function packUnits(world) {
  return new Map(world.units.map((unit) => [unit.id, packUnit(unit)]));
}

/** The parts of the world other than the people. */
export function packWorld(world) {
  return JSON.parse(
    JSON.stringify(
      {
        steps: world.steps,
        elapsed: world.elapsed,
        missionSeconds: world.missionSeconds,
        outcome: world.outcome,
        objectives: world.objectives.map(({ id, complete, progress }) => ({ id, complete, progress: progress ?? 0 })),
        props: world.props.map(({ id, health, state, burnLeft }) => ({ id, health, state, burnLeft })),
        drops: world.drops,
        bombs: world.bombs,
        windowsBroken: [...world.windowsBroken],
        targeted: world.targeted,
        opStats: world.opStats,
        debrief: world.debrief,
      },
      replacer,
    ),
  );
}

// Equipment entries come back with their definitions: { definition: "id", charges } becomes { definition: {...}, charges }.
function restore(value, lookup) {
  if (Array.isArray(value)) return value.map((item) => restore(item, lookup));
  if (value && typeof value === "object") {
    const result = {};
    for (const [key, inner] of Object.entries(value)) {
      const named = key === "definition" && typeof inner === "string";
      result[key] = named ? (lookup(inner) ?? { id: inner, name: inner }) : restore(inner, lookup);
    }
    return result;
  }
  return value;
}

/**
 * Put one person's received state onto the local copy of them, keeping what the local copy already has that is fixed. `received`
 * is the whole state (text or data) or, when `removed` names fields, just what changed.
 */
export function applyUnit(unit, received, lookup, removed = null) {
  const state = restore(typeof received === "string" ? JSON.parse(received) : received, lookup);
  if (removed) {
    for (const key of removed) delete unit[key];
  } else {
    for (const key of Object.keys(unit)) {
      if (!SKIPPED.has(key) && !(key in state) && key !== "patrol" && key !== "script") delete unit[key];
    }
  }
  for (const [key, value] of Object.entries(state)) {
    if (key === "patrol") {
      if (unit.patrol && value) unit.patrol.index = value.index;
    } else if (key === "script") {
      if (unit.script && value) Object.assign(unit.script, { ...value, steps: unit.script.steps });
    } else if (key === "vehicle") {
      const route = unit.vehicle?.route;
      unit.vehicle = { ...value, route: route ? { ...route, index: value.route?.index ?? route.index } : (value.route ?? null) };
    } else if (key === "path" && value && !Array.isArray(value)) {
      unit.path = [value.next]; // somebody else's route: the next step is enough to show them walking
      unit.pathLeft = value.left;
    } else {
      unit[key] = value;
    }
  }
  if (Array.isArray(state.path)) unit.pathLeft = state.path.length;
}

/** Put a received world (see packWorld) onto the local copy. */
export function applyWorld(world, packed, lookup) {
  world.steps = packed.steps;
  world.elapsed = packed.elapsed;
  world.missionSeconds = packed.missionSeconds;
  world.outcome = packed.outcome;
  for (const received of packed.objectives) {
    const objective = world.objectives.find((item) => item.id === received.id);
    if (objective) Object.assign(objective, { complete: received.complete, progress: received.progress });
  }
  for (const received of packed.props) {
    const prop = world.props.find((item) => item.id === received.id);
    if (prop) Object.assign(prop, received);
  }
  world.drops = restore(packed.drops, lookup);
  world.bombs = restore(packed.bombs, lookup);
  world.windowsBroken = new Set(packed.windowsBroken);
  world.targeted = packed.targeted;
  world.opStats = packed.opStats;
  world.debrief = packed.debrief;
}

/** A definition lookup by id over a pack's equipment, for applyUnit and applyWorld. */
export function equipmentLookup(equipment) {
  const byId = new Map([...equipment.values()].map((definition) => [definition.id, definition]));
  return (id) => byId.get(id);
}

/**
 * What to send a player to bring them up to date: for each person who changed, only the fields that did ({ id, set, remove }).
 * `known` (a Map from person to a Map from field to its last text) is what the player has been sent so far, and is brought up to date.
 */
export function changedUnits(world, known) {
  const changes = [];
  for (const unit of world.units) {
    const fields = unitFields(unit);
    const before = known.get(unit.id) ?? new Map();
    const set = {};
    let any = false;
    const next = new Map();
    for (const [key, value] of Object.entries(fields)) {
      const text = JSON.stringify(value);
      next.set(key, text);
      if (before.get(key) !== text) {
        set[key] = value;
        any = true;
      }
    }
    const remove = [...before.keys()].filter((key) => !next.has(key));
    known.set(unit.id, next);
    if (any || remove.length > 0) changes.push({ id: unit.id, set, ...(remove.length > 0 ? { remove } : {}) });
  }
  return changes;
}

/**
 * Bring a local copy of an operation up to date with what the server sent (a "start" or an "update" message): the people who
 * changed, then the rest of the world. `smoother` (see online.js) is told where people were so they can be shown walking to
 * their new places; leave it out for the first message.
 */
export function applyServerMessage(world, message, lookup, { smoother = null, now = 0 } = {}) {
  if (smoother && Number.isInteger(message.step)) smoother.arrived(message.step, now);
  for (const change of message.units) {
    const unit = world.units.find((item) => item.id === change.id);
    if (!unit) continue;
    applyUnit(unit, change.set ?? change, lookup, change.remove ?? []);
    if (smoother && change.set?.position) smoother.observe(unit, message.step);
  }
  applyWorld(world, message.world, lookup);
}
