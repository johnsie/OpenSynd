// SPDX-License-Identifier: GPL-2.0-or-later

import { hasLineOfSight } from "./engine.js";

// Time bombs (the Delay Charge): planted where an operative stands, they blast everyone nearby when
// the fuse runs out, friend or foe, unless a wall is between: a blast only reaches what it has a clear line to
// (FreeSynd). A blast also sets off any other bomb within its radius. Pure rules; drawing and funds live in the app.
// A bomb set off by another blast goes off this long afterwards.
export const CHAIN_DELAY = 0.3;

// How far an operative can throw a charge.
export const THROW_RANGE = 6;

// Plant a charge where the operative stands, or (with `at`) throw it to that spot.
export function plantBomb(unit, item, bombs, at = null) {
  if (!item || item.charges === 0 || unit.disabled) return null;
  if (item.charges !== null) item.charges -= 1;
  const { attack, radius, fuse } = item.definition.effect;
  const bomb = {
    id: `bomb-${bombs.length + 1}-${Math.round((at ?? unit.position).x)}-${Math.round((at ?? unit.position).y)}`,
    at: { x: (at ?? unit.position).x, y: (at ?? unit.position).y },
    attack,
    radius,
    fuse,
    left: fuse,
    plantedBy: unit.id,
  };
  bombs.push(bomb);
  return bomb;
}

// Damage falls from full at the centre to 40% at the edge of the blast.
export function blastDamage(attack, distance, radius) {
  if (distance > radius) return 0;
  return Math.max(1, Math.round(attack * (1 - 0.6 * (distance / radius))));
}

// A bomb on the ground goes off when a shot passes it (FreeSynd): any bomb within BOMB_HIT_RADIUS of the line from
// `from` to `to` is set to blow a moment later. Returns how many were set off.
export const BOMB_HIT_RADIUS = 0.6;

export function shootBombs(bombs, from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const lengthSquared = dx * dx + dy * dy;
  let hit = 0;
  for (const bomb of bombs) {
    const projected = ((bomb.at.x - from.x) * dx + (bomb.at.y - from.y) * dy) / lengthSquared;
    const along = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, projected));
    const gap = Math.hypot(bomb.at.x - (from.x + dx * along), bomb.at.y - (from.y + dy * along));
    if (gap <= BOMB_HIT_RADIUS && bomb.left > CHAIN_DELAY) {
      bomb.left = CHAIN_DELAY;
      hit += 1;
    }
  }
  return hit;
}

/**
 * Count the fuses down. Each bomb that reaches zero is removed and reported as one "blast" event
 * listing everyone it hurt, with how much, what they have left and whether it disabled them.
 */
export function advanceBombs(bombs, units, deltaSeconds, grid = null) {
  const events = [];
  for (let index = bombs.length - 1; index >= 0; index -= 1) {
    const bomb = bombs[index];
    bomb.left = Math.max(0, bomb.left - deltaSeconds);
    if (bomb.left > 0) continue;
    bombs.splice(index, 1);
    const hits = [];
    // Another bomb caught in the blast goes off a moment later, in a chain.
    for (const other of bombs) {
      const gap = Math.hypot(other.at.x - bomb.at.x, other.at.y - bomb.at.y);
      if (gap <= bomb.radius && hasLineOfSight(grid, bomb.at, other.at)) other.left = Math.min(other.left, CHAIN_DELAY);
    }
    for (const unit of units) {
      if (unit.disabled || unit.inVehicle) continue; // a vehicle shields whoever is inside it
      const distance = Math.hypot(unit.position.x - bomb.at.x, unit.position.y - bomb.at.y);
      const amount = blastDamage(bomb.attack, distance, bomb.radius);
      if (amount === 0 || !hasLineOfSight(grid, bomb.at, unit.position)) continue;
      unit.health = Math.max(0, unit.health - amount);
      unit.lastDamageType = "explosion";
      const down = unit.health === 0;
      if (down) {
        unit.disabled = true;
        unit.path = [];
        unit.targetId = null;
      }
      hits.push({ unitId: unit.id, amount, remaining: unit.health, disabled: down });
    }
    events.push({ type: "blast", at: { ...bomb.at }, radius: bomb.radius, plantedBy: bomb.plantedBy, hits });
  }
  return events;
}
