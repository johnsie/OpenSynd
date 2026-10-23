// SPDX-License-Identifier: GPL-2.0-or-later

// The rules behind the mission editor: moving and adding placements, checking a draft against its map, and writing
// it back out as mission JSON. Everything here is pure (it returns new objects) so the page can undo, and tests can
// check it without a browser.
import { createTileGrid } from "./engine.js";

export const GROUPS = Object.freeze(["team", "opponents", "bystanders", "vehicles"]);
export const MAX_TEAM = 4;

const clone = (value) => JSON.parse(JSON.stringify(value));

/** Every placement in a mission as { group, id, position }, for drawing and picking. */
export function placements(mission) {
  const items = [];
  for (const group of GROUPS) {
    for (const item of mission[group] ?? []) items.push({ group, id: item.id, position: { ...item.position }, item });
  }
  return items;
}

/** The nearest placement within `reach` tiles of a point, or null. */
export function pickPlacement(mission, point, reach = 0.8) {
  let best = null;
  let bestDistance = reach;
  for (const entry of placements(mission)) {
    const distance = Math.hypot(entry.position.x - point.x, entry.position.y - point.y);
    if (distance <= bestDistance) {
      best = entry;
      bestDistance = distance;
    }
  }
  return best;
}

export function moveItem(mission, group, id, position) {
  const next = clone(mission);
  const item = (next[group] ?? []).find((entry) => entry.id === id);
  if (!item) return mission;
  item.position = { x: Math.round(position.x), y: Math.round(position.y) };
  return next;
}

export function removeItem(mission, group, id) {
  if (!(mission[group] ?? []).some((entry) => entry.id === id)) return mission;
  const next = clone(mission);
  next[group] = next[group].filter((entry) => entry.id !== id);
  return next;
}

// A fresh id for a placement: the stem and the next free number.
export function freeId(mission, stem) {
  const taken = new Set(placements(mission).map((entry) => entry.id));
  for (let number = 1; number < 1000; number += 1) {
    const id = `${stem}-${number}`;
    if (!taken.has(id)) return id;
  }
  return `${stem}-${taken.size + 1}`;
}

/** Add a unit or vehicle. `kind` is the file the placement points at, `stem` names it, `position` is where it stands. */
export function addItem(mission, group, { kind, stem, position, equipment = [], driver = null }) {
  if (!GROUPS.includes(group)) return mission;
  if (group === "team" && (mission.team ?? []).length >= MAX_TEAM) return mission;
  const next = clone(mission);
  const id = freeId(mission, stem);
  const at = { x: Math.round(position.x), y: Math.round(position.y) };
  const entry =
    group === "vehicles"
      ? { id, vehicle: kind, position: at, ...(driver ? { driver } : {}) }
      : { id, unit: kind, position: at, equipment: [...equipment] };
  next[group] = [...(next[group] ?? []), entry];
  return next;
}

const find = (mission, group, id) => (mission[group] ?? []).find((entry) => entry.id === id);

/** Add a waypoint to a placement's patrol route (the route starts from where it stands). */
export function addPatrolPoint(mission, group, id, point) {
  if (!find(mission, group, id)) return mission;
  const next = clone(mission);
  const item = find(next, group, id);
  const at = { x: Math.round(point.x), y: Math.round(point.y) };
  item.patrol = [...(item.patrol ?? []), at];
  return next;
}

/** Take a placement's patrol route away. */
export function clearPatrol(mission, group, id) {
  if (!find(mission, group, id)?.patrol) return mission;
  const next = clone(mission);
  delete find(next, group, id).patrol;
  return next;
}

const SCRIPT_TYPES = ["walk", "wait", "trigger", "escape", "say", "enter", "drive", "leave"];
const isPoint = (value) => Number.isInteger(value?.x) && Number.isInteger(value?.y);

/**
 * Read script text typed into the editor: a JSON list of steps (walk and escape need `to`, wait needs `seconds`,
 * trigger needs `at` and may have `radius`, say needs `text`). Returns { steps } or { error } in plain words.
 */
export function parseScript(text) {
  if (text.trim() === "") return { steps: [] };
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    return { error: "That is not valid JSON: check the commas and quotes." };
  }
  if (!Array.isArray(value)) return { error: "A script is a list of steps, written between [ and ]." };
  if (value.length > 40) return { error: "A script can have at most 40 steps." };
  for (const [index, step] of value.entries()) {
    const label = `Step ${index + 1}`;
    if (step === null || typeof step !== "object" || !SCRIPT_TYPES.includes(step.type)) {
      return { error: `${label} needs a type: ${SCRIPT_TYPES.join(", ")}.` };
    }
    if ((step.type === "walk" || step.type === "escape") && !isPoint(step.to)) {
      return { error: `${label} (${step.type}) needs "to": {"x": 1, "y": 2}.` };
    }
    if (step.type === "wait" && !(step.seconds > 0 && step.seconds <= 600)) {
      return { error: `${label} (wait) needs "seconds" between 0 and 600.` };
    }
    if (step.type === "trigger" && !isPoint(step.at)) return { error: `${label} (trigger) needs "at": {"x": 1, "y": 2}.` };
    if (step.type === "trigger" && step.radius !== undefined && !(step.radius > 0 && step.radius <= 60)) {
      return { error: `${label} (trigger) has a radius outside 0 to 60.` };
    }
    if (step.type === "enter" && !(typeof step.vehicle === "string" && step.vehicle.length > 0)) {
      return { error: `${label} (enter) needs "vehicle": the id of the vehicle to get into.` };
    }
    if (step.type === "drive" && !isPoint(step.to)) return { error: `${label} (drive) needs "to": {"x": 1, "y": 2}.` };
    if (step.type === "say" && !(typeof step.text === "string" && step.text.length > 0 && step.text.length <= 200)) {
      return { error: `${label} (say) needs "text" of up to 200 characters.` };
    }
    const allowed = {
      walk: ["to"],
      escape: ["to"],
      wait: ["seconds"],
      trigger: ["at", "radius"],
      say: ["text"],
      enter: ["vehicle"],
      drive: ["to"],
      leave: [],
    }[step.type];
    const extra = Object.keys(step).filter((key) => key !== "type" && !allowed.includes(key));
    if (extra.length > 0) return { error: `${label} has "${extra[0]}", which a ${step.type} step does not use.` };
  }
  return { steps: value };
}

/** Give a unit placement a script (an empty list removes it). */
export function setScript(mission, group, id, steps) {
  if (!find(mission, group, id) || group === "vehicles") return mission;
  const next = clone(mission);
  const item = find(next, group, id);
  if (steps.length === 0) delete item.script;
  else item.script = clone(steps);
  return next;
}

/** Change an objective's text or whether it is required. */
export function editObjective(mission, id, changes) {
  const next = clone(mission);
  const objective = next.objectives.find((entry) => entry.id === id);
  if (!objective) return mission;
  if (typeof changes.description === "string" && changes.description.length > 0) {
    objective.description = changes.description.slice(0, 240);
  }
  if (typeof changes.required === "boolean") objective.required = changes.required;
  return next;
}

/**
 * What is wrong with a draft, as sentences: positions off the map or on blocked ground, duplicate ids, too many or no
 * operators, objectives that point at zones or people that are not there, and scripted steps that leave the map.
 */
export function validateDraft(mission, map) {
  const problems = [];
  const grid = createTileGrid(map);
  const { width, height } = map.dimensions;
  const inside = (point) =>
    Number.isInteger(point?.x) && Number.isInteger(point?.y) && point.x >= 0 && point.y >= 0 && point.x < width && point.y < height;
  const ids = new Set();
  for (const entry of placements(mission)) {
    if (ids.has(entry.id)) problems.push(`Two placements share the id ${entry.id}.`);
    ids.add(entry.id);
    if (!inside(entry.position)) {
      problems.push(`${entry.id} is outside the map.`);
      continue;
    }
    // A train stands on its viaduct, which nobody can walk on.
    if (!entry.item.stops && !grid[entry.position.y]?.[entry.position.x]?.walkable) {
      const gate = (map.objects ?? []).some(
        (object) =>
          entry.position.x >= object.position.x && entry.position.x < object.position.x + object.width &&
          entry.position.y >= object.position.y && entry.position.y < object.position.y + object.height,
      );
      if (!gate) problems.push(`${entry.id} stands on ground nobody can stand on (${entry.position.x}, ${entry.position.y}).`);
    }
    for (const step of entry.item.script ?? []) {
      for (const point of [step.to, step.at].filter(Boolean)) {
        if (!inside(point)) problems.push(`${entry.id} has a script step off the map.`);
      }
    }
    for (const point of entry.item.patrol ?? []) {
      if (!inside(point)) problems.push(`${entry.id} has a patrol point off the map.`);
    }
  }
  const team = mission.team ?? [];
  if (team.length === 0) problems.push("There must be at least one operator.");
  if (team.length > MAX_TEAM) problems.push(`There can be at most ${MAX_TEAM} operators.`);
  const zones = new Set(map.zones.map((zone) => zone.id));
  const known = new Set(placements(mission).map((entry) => entry.id));
  const seen = new Set();
  for (const objective of mission.objectives ?? []) {
    if (seen.has(objective.id)) problems.push(`Two objectives share the id ${objective.id}.`);
    seen.add(objective.id);
    if (objective.targetZone && !zones.has(objective.targetZone)) problems.push(`${objective.id} points at a zone that is not on the map.`);
    for (const target of objective.targets ?? []) {
      if (!known.has(target)) problems.push(`${objective.id} names ${target}, who is not in the mission.`);
    }
  }
  if (!(mission.objectives ?? []).some((objective) => objective.required)) problems.push("At least one objective must be required.");
  return problems;
}

/** The mission as JSON text, ready to save into a content pack. */
export function exportMission(mission) {
  return `${JSON.stringify(mission, null, 2)}\n`;
}

// ---- Map editing: painting the ground, streets, buildings and so on, one rectangle at a time.

/** What can be painted. A painted rectangle is a new region laid over the ones before it (the last one on a tile wins). */
export const PAINTS = Object.freeze({
  ground: { label: "Ground (open pavement)", surface: "service-concrete", walkable: true, elevation: 0, color: "#293138" },
  street: { label: "Street", surface: "street", walkable: true, elevation: 0, color: "#2d363d" },
  building: { label: "Building (blocked, three floors)", surface: "utility-building", walkable: false, elevation: 2, color: "#3d4a54" },
  tower: { label: "Tall building (blocked, five floors)", surface: "utility-building", walkable: false, elevation: 4, color: "#4a4d5c" },
  fence: { label: "Fence (blocked, see-through)", surface: "service-fence", walkable: false, elevation: 0, color: "#6b7a84" },
  wall: { label: "Low wall (blocked)", surface: "service-wall", walkable: false, elevation: 0, color: "#55636d" },
  water: { label: "Water channel (blocked)", surface: "runoff-channel", walkable: false, elevation: 0, color: "#12313d" },
  bridge: { label: "Bridge (walkable, raised)", surface: "signal-grate", walkable: true, elevation: 1, color: "#59717a" },
});

export const MAX_MAP_SIZE = 256;

/** A new, empty map: open ground, a team entry on the west side and an exit on the east. Size is clamped to 24..256. */
export function newMap(id, name, size = 64) {
  const side = Math.max(24, Math.min(MAX_MAP_SIZE, Math.round(size)));
  return {
    formatVersion: 1,
    id,
    name,
    license: "CC0-1.0",
    projection: "isometric",
    dimensions: { width: side, height: side },
    cellSize: { width: 64, height: 32 },
    regions: [{ id: "ground", x: 0, y: 0, width: side, height: side, ...pick(PAINTS.ground) }],
    zones: [
      { id: "team-entry", kind: "entry", position: { x: 2, y: Math.floor(side / 2) }, width: 2, height: 2 },
      { id: "safe-exit", kind: "exit", position: { x: side - 4, y: Math.floor(side / 2) }, width: 2, height: 2 },
    ],
    objects: [],
    props: [],
  };
}

function pick({ surface, walkable, elevation, color }) {
  return { surface, walkable, elevation, color };
}

const clampRect = (map, a, b) => {
  const { width, height } = map.dimensions;
  const x0 = Math.max(0, Math.min(Math.round(a.x), Math.round(b.x)));
  const y0 = Math.max(0, Math.min(Math.round(a.y), Math.round(b.y)));
  const x1 = Math.min(width - 1, Math.max(Math.round(a.x), Math.round(b.x)));
  const y1 = Math.min(height - 1, Math.max(Math.round(a.y), Math.round(b.y)));
  return x1 < x0 || y1 < y0 ? null : { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
};

/** Paint a rectangle between two corner tiles (both included). Returns the same map if the rectangle is off it or the kind is unknown. */
export function paintRegion(map, from, to, kind) {
  const paint = PAINTS[kind];
  const rect = clampRect(map, from, to);
  if (!paint || !rect) return map;
  const next = clone(map);
  let number = 1;
  while (next.regions.some((region) => region.id === `painted-${number}`)) number += 1;
  next.regions.push({ id: `painted-${number}`, ...rect, ...pick(paint) });
  return next;
}

/** The top-most painted region at a tile (the base ground and generated regions are not erased, only what was painted). */
export function paintedAt(map, point) {
  for (let index = map.regions.length - 1; index >= 0; index -= 1) {
    const region = map.regions[index];
    if (!region.id.startsWith("painted-")) continue;
    const insideX = point.x >= region.x && point.x < region.x + region.width;
    const insideY = point.y >= region.y && point.y < region.y + region.height;
    if (insideX && insideY) return region;
  }
  return null;
}

export function removeRegion(map, id) {
  if (!map.regions.some((region) => region.id === id)) return map;
  const next = clone(map);
  next.regions = next.regions.filter((region) => region.id !== id);
  return next;
}

/**
 * What is wrong with a map, as sentences: regions off the map, repeated ids, zones off it or on blocked ground, and zones the
 * entry cannot reach.
 */
export function validateMap(map) {
  const problems = [];
  const { width, height } = map.dimensions ?? {};
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 8 || height < 8 || width > MAX_MAP_SIZE || height > MAX_MAP_SIZE) {
    return [`The map must be between 8 and ${MAX_MAP_SIZE} tiles each way.`];
  }
  const ids = new Set();
  for (const region of map.regions ?? []) {
    if (ids.has(region.id)) problems.push(`Two regions share the id ${region.id}.`);
    ids.add(region.id);
    if (region.x < 0 || region.y < 0 || region.x + region.width > width || region.y + region.height > height) {
      problems.push(`Region ${region.id} reaches off the map.`);
    }
  }
  const grid = createTileGrid(map);
  const zones = map.zones ?? [];
  for (const zone of zones) {
    const { x, y } = zone.position;
    if (x < 0 || y < 0 || x + zone.width > width || y + zone.height > height) {
      problems.push(`Zone ${zone.id} reaches off the map.`);
    } else if (zone.kind !== "hold" && !grid[y]?.[x]?.walkable) {
      problems.push(`Zone ${zone.id} starts on ground nobody can stand on (${x}, ${y}).`);
    }
  }
  const entry = zones.find((zone) => zone.kind === "entry");
  if (!entry) {
    problems.push("The map needs an entry zone for the squad.");
    return problems;
  }
  // Which tiles the entry can walk to (four ways, over walkable tiles).
  const seen = new Set([`${entry.position.x},${entry.position.y}`]);
  const queue = [{ x: entry.position.x, y: entry.position.y }];
  while (queue.length > 0) {
    const { x, y } = queue.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const key = `${x + dx},${y + dy}`;
      if (!seen.has(key) && grid[y + dy]?.[x + dx]?.walkable) {
        seen.add(key);
        queue.push({ x: x + dx, y: y + dy });
      }
    }
  }
  for (const zone of zones) {
    if (zone === entry || zone.kind === "hold") continue;
    if (grid[zone.position.y]?.[zone.position.x]?.walkable && !seen.has(`${zone.position.x},${zone.position.y}`)) {
      problems.push(`The squad cannot walk from the entry to zone ${zone.id}.`);
    }
  }
  return problems;
}

/** The map as JSON text, ready to save into a content pack. */
export function exportMap(map) {
  return `${JSON.stringify(map, null, 2)}\n`;
}
