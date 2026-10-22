// SPDX-License-Identifier: GPL-2.0-or-later

import { SLOTS_PER_OPERATIVE } from "./campaign.js";

// How close an operator must stand to a body to loot it.
export const LOOT_RANGE = 1.6;

export function distanceBetween(left, right) {
  return Math.hypot(left.position.x - right.position.x, left.position.y - right.position.y);
}

// A body worth looting: a disabled opponent that still carries something.
export function lootableBody(body) {
  return body.side === "opposition" && body.disabled && (body.equipment?.length ?? 0) > 0;
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
  operator.looted = [...(operator.looted ?? []), ...taken.map((item) => item.definition.id)];
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

// The first stimulant the unit can still use.
export function energyItem(unit) {
  return (
    (unit.equipment ?? []).find(
      (item) => item.definition.action === "restore-energy" && item.charges !== 0,
    ) ?? null
  );
}

// Use a stimulant: restores stamina and focus, then spends a charge. Returns the
// item used, or null when there is none or nothing to restore.
export function useEnergyItem(unit) {
  const item = energyItem(unit);
  if (!item || unit.disabled) return null;
  const effect = item.definition.effect;
  const stamina = Math.min(1, (unit.stamina ?? 1) + (effect.restoreStamina ?? 0));
  const focus = Math.min(1, (unit.focus ?? 1) + (effect.restoreFocus ?? 0));
  if (stamina === (unit.stamina ?? 1) && focus === (unit.focus ?? 1)) return null;
  unit.stamina = stamina;
  unit.focus = focus;
  if (item.charges !== null) item.charges -= 1;
  return item;
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
