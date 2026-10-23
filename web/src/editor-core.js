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
    if (!grid[entry.position.y]?.[entry.position.x]?.walkable) {
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
