// SPDX-License-Identifier: GPL-2.0-or-later

// Breakable windows (FreeSynd: bullets and blasts break them). Windows are not map objects of their own: every building
// draws large windows on its two visible walls, one bay per two tiles on each upper floor, and a window is named by
// building, wall, floor and bay. This module works out which window a shot or a blast breaks; the page keeps the set of
// broken ones and draws them shattered. Pure, so it can be tested.

// A building's outline in map units (tiles are centred on whole numbers).
export function outline(building) {
  return { x0: building.x - 0.5, y0: building.y - 0.5, x1: building.x + building.width - 0.5, y1: building.y + building.height - 0.5 };
}

/** Wall 0 runs along the south edge (y1), wall 1 along the east edge (x1): the two walls the view shows. */
export const windowKey = (buildingId, wall, floor, bay) => `${buildingId}:${wall}:${floor}:${bay}`;

/** How many bays a wall has: one per two tiles of its length. */
export function baysOf(building, wall) {
  const box = outline(building);
  const across = wall === 0 ? box.x1 - box.x0 : box.y1 - box.y0;
  return Math.max(1, Math.floor(across / 2));
}

/** Windows start on the first floor above the ground: a one-storey building has none. */
export const hasWindows = (building) => building.elevation + 1 > 1;

/**
 * Where a segment from `from` to `to` first enters the building through a visible wall: { wall, u } with u from 0 to 1
 * along the wall in the order the walls are drawn, or null if it misses or comes in through a wall nobody can see.
 */
export function wallHit(building, from, to) {
  const box = outline(building);
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  let enter = 0;
  let wall = null;
  // Slab test on both axes, remembering which axis the segment crosses last on the way in.
  let low = 0;
  let high = 1;
  for (const [axis, start, delta, min, max] of [["x", from.x, dx, box.x0, box.x1], ["y", from.y, dy, box.y0, box.y1]]) {
    if (Math.abs(delta) < 1e-9) {
      if (start < min || start > max) return null;
      continue;
    }
    let near = (min - start) / delta;
    let far = (max - start) / delta;
    if (near > far) [near, far] = [far, near];
    if (near > low) {
      low = near;
      enter = near;
      wall = axis;
    }
    high = Math.min(high, far);
    if (low > high) return null;
  }
  if (wall === null) return null; // it started inside
  const hit = { x: from.x + dx * enter, y: from.y + dy * enter };
  if (wall === "y" && dy < 0 && Math.abs(hit.y - box.y1) < 1e-6) return { wall: 0, u: clamp01((hit.x - box.x0) / (box.x1 - box.x0)) };
  if (wall === "x" && dx < 0 && Math.abs(hit.x - box.x1) < 1e-6) return { wall: 1, u: clamp01((box.y1 - hit.y) / (box.y1 - box.y0)) };
  return null;
}

const clamp01 = (value) => Math.min(1, Math.max(0, value));

/** The window a shot breaks (key), or null: the bay along the wall it struck, on a floor picked from `seed` (0 to 1). */
export function windowShot(building, from, to, seed) {
  if (!hasWindows(building)) return null;
  const hit = wallHit(building, from, to);
  if (!hit) return null;
  const bays = baysOf(building, hit.wall);
  const bay = Math.min(bays - 1, Math.floor(hit.u * bays));
  const floor = 1 + Math.min(building.elevation - 1, Math.floor(seed * building.elevation));
  return windowKey(building.id, hit.wall, floor, bay);
}

/** Every window on the two visible walls within `radius` of a blast. */
export function windowsInBlast(building, at, radius) {
  if (!hasWindows(building)) return [];
  const box = outline(building);
  const keys = [];
  for (const wall of [0, 1]) {
    const bays = baysOf(building, wall);
    for (let bay = 0; bay < bays; bay += 1) {
      const middle = (bay + 0.5) / bays;
      const centre = wall === 0
        ? { x: box.x0 + middle * (box.x1 - box.x0), y: box.y1 }
        : { x: box.x1, y: box.y1 - middle * (box.y1 - box.y0) };
      if (Math.hypot(centre.x - at.x, centre.y - at.y) > radius) continue;
      for (let floor = 1; floor < building.elevation + 1; floor += 1) keys.push(windowKey(building.id, wall, floor, bay));
    }
  }
  return keys;
}
