// SPDX-License-Identifier: GPL-2.0-or-later

// Time bombs (the Delay Charge): planted where an operative stands, they blast everyone nearby when
// the fuse runs out, friend or foe. Pure rules; drawing and funds live in the app.
export function plantBomb(unit, item, bombs) {
  if (!item || item.charges === 0 || unit.disabled) return null;
  if (item.charges !== null) item.charges -= 1;
  const { attack, radius, fuse } = item.definition.effect;
  const bomb = {
    id: `bomb-${bombs.length + 1}-${Math.round(unit.position.x)}-${Math.round(unit.position.y)}`,
    at: { x: unit.position.x, y: unit.position.y },
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

/**
 * Count the fuses down. Each bomb that reaches zero is removed and reported as one "blast" event
 * listing everyone it hurt, with how much, what they have left and whether it disabled them.
 */
export function advanceBombs(bombs, units, deltaSeconds) {
  const events = [];
  for (let index = bombs.length - 1; index >= 0; index -= 1) {
    const bomb = bombs[index];
    bomb.left = Math.max(0, bomb.left - deltaSeconds);
    if (bomb.left > 0) continue;
    bombs.splice(index, 1);
    const hits = [];
    for (const unit of units) {
      if (unit.disabled) continue;
      const distance = Math.hypot(unit.position.x - bomb.at.x, unit.position.y - bomb.at.y);
      const amount = blastDamage(bomb.attack, distance, bomb.radius);
      if (amount === 0) continue;
      unit.health = Math.max(0, unit.health - amount);
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
