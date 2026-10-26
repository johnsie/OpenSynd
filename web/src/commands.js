// SPDX-License-Identifier: GPL-2.0-or-later

// Everything a player can ask their agents to do, as small plain records. A command names agents by id and places by grid
// position, never by screen position or object, so the same record can be sent to a server, checked there, recorded in a replay
// and applied by the game core. validateCommand is the server's first line of defence: it says whether a record is well formed
// and refers to things that exist; the rules themselves decide whether the agents can actually do it.
export const COMMAND_VERSION = 1;
export const MAX_COMMAND_UNITS = 16;

const SHAPES = Object.freeze({
  move: { units: true, fields: { to: "tile", queue: "bool?" } },
  attack: { units: true, fields: { targetId: "id", queue: "bool?" } },
  follow: { units: true, fields: { targetId: "id", queue: "bool?" } },
  fire: { units: true, fields: { at: "point", held: "bool?" } },
  holdFire: { units: true, fields: { on: "bool", at: "point?" } },
  useItem: { units: true, fields: { by: "id", slot: "slot", at: "point?", plant: "bool?" } },
  dropItem: { units: true, fields: { by: "id", slot: "slot", queue: "bool?" } },
  board: { units: true, fields: { vehicleId: "id", queue: "bool?" } },
  vehicle: { units: true, fields: { queue: "bool?" } },
  loot: { units: true, fields: { bodyId: "id?", queue: "bool?" } },
  interact: { units: true, fields: {} },
  clearQueue: { units: true, fields: {} },
});

export const COMMAND_TYPES = Object.freeze(Object.keys(SHAPES));

const isId = (value) => typeof value === "string" && value.length > 0 && value.length < 120;
const isTile = (value, size) =>
  value !== null &&
  typeof value === "object" &&
  Number.isInteger(value.x) &&
  Number.isInteger(value.y) &&
  value.x >= 0 &&
  value.y >= 0 &&
  (!size || (value.x < size.width && value.y < size.height));
const isPoint = (value, size) =>
  value !== null &&
  typeof value === "object" &&
  Number.isFinite(value.x) &&
  Number.isFinite(value.y) &&
  value.x >= 0 &&
  value.y >= 0 &&
  (!size || (value.x <= size.width && value.y <= size.height));

const CHECKS = {
  tile: (value, size) => isTile(value, size),
  point: (value, size) => isPoint(value, size),
  id: isId,
  bool: (value) => typeof value === "boolean",
  slot: (value) => Number.isInteger(value) && value >= 0 && value < 8,
};

/**
 * Check a command record. `context` may give `size` ({ width, height } of the map), `owns(unitId)` (true when the sender controls
 * the agent) and `exists(id)` (true when a unit, vehicle or body with that id is in the operation).
 * Returns { ok: true } or { ok: false, error } with a short reason that is safe to show.
 */
export function validateCommand(command, context = {}) {
  if (command === null || typeof command !== "object" || Array.isArray(command)) return { ok: false, error: "not a command" };
  const shape = SHAPES[command.type];
  if (!shape) return { ok: false, error: "unknown command" };
  if (shape.units) {
    const ids = command.unitIds;
    if (!Array.isArray(ids) || ids.length === 0 || ids.length > MAX_COMMAND_UNITS) return { ok: false, error: "no agents named" };
    if (!ids.every(isId) || new Set(ids).size !== ids.length) return { ok: false, error: "bad agent list" };
    if (context.owns && !ids.every((id) => context.owns(id))) return { ok: false, error: "not your agent" };
  }
  if (command.by !== undefined && Array.isArray(command.unitIds) && !command.unitIds.includes(command.by)) {
    return { ok: false, error: "by is not one of the agents named" };
  }
  const allowed = new Set(["type", "unitIds", ...Object.keys(shape.fields)]);
  for (const key of Object.keys(command)) {
    if (!allowed.has(key)) return { ok: false, error: `unexpected field ${key}` };
  }
  for (const [field, spec] of Object.entries(shape.fields)) {
    const optional = spec.endsWith("?");
    const kind = optional ? spec.slice(0, -1) : spec;
    const value = command[field];
    if (value === undefined) {
      if (optional) continue;
      return { ok: false, error: `missing ${field}` };
    }
    if (!CHECKS[kind](value, context.size)) return { ok: false, error: `bad ${field}` };
    if (kind === "id" && context.exists && !context.exists(value)) return { ok: false, error: `unknown ${field}` };
  }
  return { ok: true };
}

// Builders keep the shape in one place. Positions are copied so a command never aliases live game state.
const copy = (point) => ({ x: point.x, y: point.y });
export const commands = Object.freeze({
  move: (unitIds, to, queue = false) => ({ type: "move", unitIds: [...unitIds], to: copy(to), queue }),
  attack: (unitIds, targetId, queue = false) => ({ type: "attack", unitIds: [...unitIds], targetId, queue }),
  follow: (unitIds, targetId, queue = false) => ({ type: "follow", unitIds: [...unitIds], targetId, queue }),
  fire: (unitIds, at, held = false) => ({ type: "fire", unitIds: [...unitIds], at: copy(at), held }),
  holdFire: (unitIds, on, at) => ({ type: "holdFire", unitIds: [...unitIds], on, ...(at ? { at: copy(at) } : {}) }),
  useItem: (unitIds, by, slot, options = {}) => ({
    type: "useItem",
    unitIds: [...unitIds],
    by,
    slot,
    ...(options.at ? { at: copy(options.at) } : {}),
    ...(options.plant ? { plant: true } : {}),
  }),
  dropItem: (unitIds, by, slot, queue = false) => ({ type: "dropItem", unitIds: [...unitIds], by, slot, queue }),
  board: (unitIds, vehicleId, queue = false) => ({ type: "board", unitIds: [...unitIds], vehicleId, queue }),
  vehicle: (unitIds, queue = false) => ({ type: "vehicle", unitIds: [...unitIds], queue }),
  loot: (unitIds, bodyId, queue = false) => ({ type: "loot", unitIds: [...unitIds], ...(bodyId ? { bodyId } : {}), queue }),
  interact: (unitIds) => ({ type: "interact", unitIds: [...unitIds] }),
  clearQueue: (unitIds) => ({ type: "clearQueue", unitIds: [...unitIds] }),
});
