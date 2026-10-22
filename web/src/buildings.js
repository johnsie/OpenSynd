// SPDX-License-Identifier: GPL-2.0-or-later

// Buildings are drawn as single structures, not as rows of tiles. This module holds the pure
// parts: which map regions are buildings, the order to draw them in with units, and the
// deterministic choices (window lights, roof equipment) that make each one different.
export const BUILDING_SURFACE = "utility-building";

export function buildingsFromMap(map) {
  return map.regions
    .filter((region) => region.surface === BUILDING_SURFACE && !region.walkable)
    .map((region) => ({
      id: region.id,
      x: region.x,
      y: region.y,
      width: region.width,
      height: region.height,
      elevation: region.elevation,
      color: region.color,
    }));
}

// A small deterministic hash so a building always looks the same: windows lit, trim colour, roof kit.
export function hashString(text) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

// A stream of repeatable numbers in [0, 1) from a seed.
export function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Is the point (a unit's grid position) in front of the building, i.e. nearer the camera? The camera
// looks from the +x, +y corner, so anything east or south of the footprint is in front of it.
export function inFront(position, building) {
  return position.x >= building.x + building.width - 0.5 || position.y >= building.y + building.height - 0.5;
}

// Draw order for buildings and units together (back to front). Buildings are sorted by the sum of
// their far corner; each unit is drawn just before the first building it is behind, so it is
// hidden by that building but stands in front of the ones drawn earlier. Returns a list of
// { kind: "building" | "unit", item } entries.
export function drawOrder(buildings, units) {
  const sorted = [...buildings].sort(
    (left, right) =>
      left.x + left.width + left.y + left.height - (right.x + right.width + right.y + right.height) ||
      left.x - right.x ||
      left.y - right.y,
  );
  const pending = [...units].sort(
    (left, right) => left.position.x + left.position.y - (right.position.x + right.position.y),
  );
  const order = [];
  for (const building of sorted) {
    for (let index = 0; index < pending.length; ) {
      if (!inFront(pending[index].position, building)) {
        order.push({ kind: "unit", item: pending[index], behind: building });
        pending.splice(index, 1);
      } else {
        index += 1;
      }
    }
    order.push({ kind: "building", item: building });
  }
  for (const unit of pending) order.push({ kind: "unit", item: unit });
  return order;
}

// The look of one building, from its id: trim colour, window density and roof equipment.
const TRIM_COLOURS = ["#42d6d0", "#e86bd6", "#e1b35a", "#79d59b"];

export function buildingStyle(building) {
  const random = seededRandom(hashString(building.id));
  const tall = building.elevation >= 4 && building.width >= 6 && building.height >= 6;
  return {
    trim: TRIM_COLOURS[Math.floor(random() * TRIM_COLOURS.length)],
    lit: 0.28 + random() * 0.3,
    tiers: tall ? 2 : 1,
    antenna: random() < 0.55,
    units: Math.floor(random() * 3) + 1,
    seed: hashString(`${building.id}:windows`),
  };
}
