// SPDX-License-Identifier: GPL-2.0-or-later

import { SLOTS_PER_OPERATIVE } from "./campaign.js";
import { deathKind } from "./death.js";

// How close an operator must stand to a body to loot it.
export const LOOT_RANGE = 1.6;

export function distanceBetween(left, right) {
  return Math.hypot(left.position.x - right.position.x, left.position.y - right.position.y);
}

// Something on the ground worth picking up: a drop that still holds an item.
export function lootableBody(body) {
  return body.kind === "drop" && (body.equipment?.length ?? 0) > 0;
}

// A dropped item on the map: shaped like a small container so looting works on it as on anything that holds gear.
export function makeDrop(id, item, position) {
  return {
    id,
    kind: "drop",
    side: "drop",
    disabled: true,
    position: { x: position.x, y: position.y },
    equipment: [item],
    definition: { name: item.definition.name },
  };
}

// Where the things a fallen person carried land: spread on the ground around them, each on its own bit of floor.
const SCATTER = [
  [0.7, 0.2], [-0.6, 0.5], [0.2, -0.8], [-0.5, -0.5], [0.9, -0.6], [-1.0, -0.1],
  [0.4, 0.95], [-0.2, 1.0], [1.2, 0.6], [-1.2, 0.7], [0.0, -1.3], [1.3, -0.2],
];

// A bit of open floor near a point where nothing else lies: the SCATTER offsets in turn from `start`, then further out.
function freeSpot(position, grid, drops, start = 0) {
  for (let ring = 1; ring <= 3; ring += 1) {
    for (let attempt = 0; attempt < SCATTER.length; attempt += 1) {
      const [dx, dy] = SCATTER[(start + attempt) % SCATTER.length];
      const at = { x: position.x + dx * ring, y: position.y + dy * ring };
      const floor = grid?.[Math.round(at.y)]?.[Math.round(at.x)];
      const clear = !grid || (floor && floor.walkable);
      if (clear && drops.every((other) => Math.hypot(other.position.x - at.x, other.position.y - at.y) > 0.4)) return at;
    }
  }
  return { x: position.x, y: position.y };
}

let dropSerial = 0;

/**
 * FreeSynd lets an agent drop a weapon or item they carry: it leaves the slot and lies on the ground beside them, free
 * for anyone to pick up (even them again). Returns the drop, or null if the slot is empty or the operative is down.
 */
export function dropItem(unit, slot, drops, grid = null) {
  const entry = unit.equipment?.[slot];
  if (!entry || unit.disabled) return null;
  unit.equipment = unit.equipment.filter((_, index) => index !== slot);
  if (Number.isInteger(unit.activeSlot)) {
    if (unit.activeSlot === slot) unit.activeSlot = null;
    else if (unit.activeSlot > slot) unit.activeSlot -= 1;
  }
  if (entry.definition.action === "persuade") unit.persuading = false;
  dropSerial += 1;
  const drop = makeDrop(`dropped-${unit.id}-${dropSerial}`, entry, freeSpot(unit.position, grid, drops));
  drop.droppedBy = unit.id;
  drops.push(drop);
  return drop;
}

/**
 * FreeSynd's death rule: a person shot down drops everything they carry (`dropAllWeapons`); one killed by a beam, or by
 * fire or a blast without the second-version chest to survive it, loses it all. Every disabled person with gear is dealt
 * with once. `drops` is added to; returns what happened as events.
 */
export function collectFallen(units, drops, grid = null) {
  const events = [];
  for (const unit of units) {
    const carried = [...(unit.equipment ?? []), ...(unit.sidearm ?? [])];
    if (!unit.disabled || unit.escaped || unit.droppedAll || carried.length === 0) continue;
    if (unit.kind === "drop" || unit.definition?.vehicle) continue;
    unit.droppedAll = true;
    // FreeSynd treats a collision like a bullet: the person is thrown down and what they carried falls with them.
    const keeps = deathKind(unit) === "shot";
    const items = carried;
    unit.equipment = [];
    unit.sidearm = [];
    if (!keeps) {
      events.push({ type: "destroyed", unitId: unit.id, items: items.map((item) => item.definition.name) });
      continue;
    }
    items.forEach((item, index) => {
      drops.push(makeDrop(`drop-${unit.id}-${index}`, item, freeSpot(unit.position, grid, drops, index)));
    });
    events.push({ type: "dropped", unitId: unit.id, items: items.map((item) => item.definition.name) });
  }
  return events;
}

export function inLootReach(operator, body) {
  return distanceBetween(operator, body) <= LOOT_RANGE;
}

export function freeSlots(unit, capacity = SLOTS_PER_OPERATIVE) {
  return Math.max(0, capacity - (unit.equipment?.length ?? 0));
}

// Move as many of the body's items as fit into the operator's slots. Returns what
// was taken and what had to be left behind.
export function lootBody(operator, body, capacity = SLOTS_PER_OPERATIVE) {
  const room = freeSlots(operator, capacity);
  const taken = body.equipment.slice(0, room);
  body.equipment = body.equipment.slice(room);
  operator.equipment = [...(operator.equipment ?? []), ...taken];
  // Gear someone put down themselves is not loot (it does not count for discoveries).
  if (body.droppedBy !== operator.id) operator.looted = [...(operator.looted ?? []), ...taken.map((item) => item.definition.id)];
  return { taken, left: body.equipment.length };
}

// The nearest lootable body within reach of any of the given operators.
export function findLoot(operators, units) {
  let best = null;
  for (const operator of operators) {
    if (operator.disabled) continue;
    for (const body of units) {
      if (!lootableBody(body) || !inLootReach(operator, body)) continue;
      const distance = distanceBetween(operator, body);
      if (!best || distance < best.distance) best = { operator, body, distance };
    }
  }
  return best;
}

// A lootable body at (or within `radius` tiles of) a grid position, nearest first.
// Used to turn a click on the ground where an enemy fell into a pickup order.
export function lootableAt(units, position, radius = 0.8) {
  let best = null;
  for (const body of units) {
    if (!lootableBody(body)) continue;
    const distance = Math.hypot(body.position.x - position.x, body.position.y - position.y);
    if (distance <= radius && (!best || distance < best.distance)) best = { body, distance };
  }
  return best?.body ?? null;
}

// The lootable body closest to a unit, anywhere on the map.
export function nearestLootable(from, units) {
  let best = null;
  for (const body of units) {
    if (!lootableBody(body)) continue;
    const distance = distanceBetween(from, body);
    if (!best || distance < best.distance) best = { body, distance };
  }
  return best?.body ?? null;
}

// How alike two weapons are (0 is identical): their reach, damage and recharge, and whether they burn, pierce or scatter.
export function weaponDistance(left, right) {
  const a = left.effect ?? {};
  const b = right.effect ?? {};
  const gap = (x, y) => (Math.max(x ?? 0, y ?? 0) === 0 ? 0 : Math.abs((x ?? 0) - (y ?? 0)) / Math.max(x ?? 0, y ?? 0));
  let distance = gap(a.range, b.range) + gap(a.attack, b.attack) + gap(a.cooldown, b.cooldown);
  if ((a.damageType ?? "bullet") !== (b.damageType ?? "bullet")) distance += 0.6;
  if (Boolean(a.pierce) !== Boolean(b.pierce)) distance += 0.4;
  if ((a.pellets ?? 1) > 1 !== (b.pellets ?? 1) > 1) distance += 0.4;
  if (left.carry !== right.carry) distance += 0.2;
  return distance;
}

// The slot an operative would raise to match `reference`: their own copy of it (the fullest one) if they carry it,
// otherwise the loaded weapon most like it. -1 if they have nothing loaded.
export function matchingSlot(unit, reference) {
  let best = -1;
  let bestDistance = Infinity;
  unit.equipment.forEach((item, slot) => {
    if (item.definition.action !== "disable-pulse" || item.charges === 0) return;
    const distance = item.definition.id === reference.id ? -1 : weaponDistance(reference, item.definition);
    const rounds = item.charges ?? Infinity;
    const better =
      distance < bestDistance || (distance === bestDistance && best !== -1 && rounds > (unit.equipment[best].charges ?? Infinity));
    if (better) {
      best = slot;
      bestDistance = distance;
    }
  });
  return best;
}

// Choose a weapon for several operatives (FreeSynd: one choice for the whole selection). Each takes up their own copy of
// it, in whatever slot it is (the one with most rounds if they carry several); an operative without it takes the most
// similar weapon they do have. Returns who got it, who got a stand-in, and who has nothing loaded.
export function selectWeaponForAll(units, definitionId) {
  const reference = units.flatMap((unit) => unit.equipment).find((item) => item.definition.id === definitionId)?.definition;
  const selected = [];
  const substituted = [];
  const missing = [];
  for (const unit of units) {
    const slot = reference ? matchingSlot(unit, reference) : -1;
    if (slot === -1) {
      missing.push(unit.id);
      continue;
    }
    unit.activeSlot = slot;
    (unit.equipment[slot].definition.id === definitionId ? selected : substituted).push(unit.id);
  }
  return { selected, substituted, missing };
}

// Put the weapon away for several operatives: whoever raised it (or its stand-in) goes back to automatic.
export function clearWeaponForAll(units, definitionId) {
  const reference = units.flatMap((unit) => unit.equipment).find((item) => item.definition.id === definitionId)?.definition;
  for (const unit of units) {
    if (reference && Number.isInteger(unit.activeSlot) && unit.activeSlot === matchingSlot(unit, reference)) unit.activeSlot = null;
  }
}
