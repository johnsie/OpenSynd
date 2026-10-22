// SPDX-License-Identifier: GPL-2.0-or-later

import { findPath } from "./engine.js";
import { cooldownMultiplier, effectiveLevels, nextFocus, nextStamina, speedMultiplier } from "./stats.js";

export const FIXED_STEP_SECONDS = 1 / 30;
export const MAX_STEPS_PER_FRAME = 8;

const ARRIVAL_EPSILON = 1e-9;

/**
 * Pursuit: an operative with a `followId` chases that watcher. It walks toward it (re-routing as
 * the watcher moves) until the watcher is within range of the weapon it would fire (the selected
 * weapon, or the best loaded one), then stops and locks on to shoot. If the watcher walks out of
 * range it is chased again. Pursuit ends when the watcher is disabled, the operative has no
 * rounds left, or the operative is given another order (which clears `followId`).
 * Returns "ended" events so the interface can say why.
 */
export function advancePursuit(units, grid) {
  const events = [];
  const byId = new Map(units.map((unit) => [unit.id, unit]));
  for (const unit of units) {
    if (unit.side !== "team" || !unit.followId) continue;
    const target = byId.get(unit.followId);
    if (unit.disabled || !target || target.disabled) {
      events.push({ type: "ended", unitId: unit.id, reason: target?.disabled ? "disabled" : "lost" });
      unit.followId = null;
      continue;
    }
    if (!hasWeaponSelected(unit) && roundsLeft(unit) !== 0) {
      events.push({ type: "ended", unitId: unit.id, reason: "none-selected" });
      unit.followId = null;
      unit.targetId = null;
      continue;
    }
    if (roundsLeft(unit) === 0) {
      events.push({ type: "ended", unitId: unit.id, reason: "no-rounds" });
      unit.followId = null;
      unit.targetId = null;
      continue;
    }
    const distance = distanceBetween(unit, target);
    const reach = combatStats(unit, distance).range;
    const clear = hasLineOfSight(grid, unit.position, target.position);
    if (distance <= reach * STOP_RANGE_FACTOR && clear) {
      // In range and in the clear: stand and shoot.
      unit.path = [];
      unit.targetId = target.id;
      continue;
    }
    if (distance <= reach && clear && unit.targetId === target.id) continue; // already firing, still in range
    unit.targetId = null;
    const goal = tileOf(target.position);
    const end = unit.path.at(-1);
    if (!end || Math.abs(end.x - goal.x) + Math.abs(end.y - goal.y) > 1) {
      unit.path = findPath(grid, tileOf(unit.position), goal);
    }
  }
  return events;
}

/** Mental fatigue: Brain turned above the baseline drains focus; otherwise it recovers. */
export function advanceFocus(units, deltaSeconds) {
  for (const unit of units) {
    if (unit.side !== "team" || unit.disabled) continue;
    unit.focus = nextFocus(unit.focus, unit.levels, deltaSeconds, unit.research);
  }
}

/**
 * Advance unit movement by one simulation step.
 *
 * Rendering is deliberately absent from this module. Given equivalent unit
 * state and a fixed sequence of step durations, it produces equivalent state
 * and arrival events in every browser.
 */
export function advanceUnits(units, deltaSeconds) {
  const arrivals = [];

  for (const unit of units) {
    if (unit.side !== "team") continue;
    // Walking drains stamina; standing still recovers it.
    const walking = unit.path.length > 0 && !unit.disabled;
    unit.stamina = nextStamina(unit.stamina, unit.levels, walking, deltaSeconds, unit.research);
    if (!walking) continue;

    // Tired legs take levels off the Legs bar, so the pace follows the effective level.
    const pace = speedMultiplier(effectiveLevels(unit.levels, unit.stamina, unit.focus));
    let remaining = deltaSeconds * unit.definition.stats.speed * pace * 0.7;
    while (remaining > 0 && unit.path.length > 0) {
      const destination = unit.path[0];
      const offsetX = destination.x - unit.position.x;
      const offsetY = destination.y - unit.position.y;
      const distance = Math.hypot(offsetX, offsetY);

      if (distance <= remaining + ARRIVAL_EPSILON) {
        unit.position = { ...destination };
        unit.path.shift();
        remaining = Math.max(0, remaining - distance);
        arrivals.push({ unitId: unit.id, position: { ...destination } });
      } else {
        unit.position = {
          x: unit.position.x + (offsetX / distance) * remaining,
          y: unit.position.y + (offsetY / distance) * remaining,
        };
        remaining = 0;
      }
    }
  }

  return arrivals;
}

const PATROL_SPEED_FACTOR = 0.45;
const CHASE_SPEED_FACTOR = 1.0;
// Awareness 90 sees 14.4 tiles: watchers notice a squad from well down the street.
const SIGHT_TILES_PER_AWARENESS = 0.16;
// Once alert, a watcher keeps the squad in mind to twice its sight before giving up the chase.
const LOSE_SIGHT_FACTOR = 2.0;
const STOP_RANGE_FACTOR = 0.9;
// A watcher that has spotted someone calls its neighbours: those within this many tiles see
// further, so they close in too.
export const CALL_RADIUS = 14;
export const CALL_SIGHT_FACTOR = 1.35;

// Walk a unit along its own `path`; returns true while it still has path left.
function followPath(unit, deltaSeconds, speedFactor) {
  let remaining = deltaSeconds * unit.definition.stats.speed * 0.7 * speedFactor;
  while (remaining > 0 && unit.path.length > 0) {
    const destination = unit.path[0];
    const offsetX = destination.x - unit.position.x;
    const offsetY = destination.y - unit.position.y;
    const distance = Math.hypot(offsetX, offsetY);
    if (distance <= remaining + ARRIVAL_EPSILON) {
      unit.position = { ...destination };
      unit.path.shift();
      remaining = Math.max(0, remaining - distance);
    } else {
      unit.position = {
        x: unit.position.x + (offsetX / distance) * remaining,
        y: unit.position.y + (offsetY / distance) * remaining,
      };
      remaining = 0;
    }
  }
  return unit.path.length > 0;
}

function tileOf(position) {
  return { x: Math.round(position.x), y: Math.round(position.y) };
}

// Equipment that shortens how far watchers can see its wearer (the best cloak counts).
export function stealthFactor(unit) {
  let factor = 1;
  for (const item of unit.equipment ?? []) {
    if (item.definition.action === "stealth") factor = Math.min(factor, item.definition.effect.sightFactor);
  }
  return factor;
}

// What stops a watcher seeing across a tile: solid ground such as buildings and walls. Fences,
// gates and water are see-through. Anything off the map blocks.
const SEE_THROUGH_SURFACES = new Set(["service-fence", "runoff-channel"]);
export const SIGHT_STEP = 0.25;
export const PANIC_SECONDS = 6;
export const PANIC_RADIUS = 10;
const PANIC_SPEED_FACTOR = 1.6;
// A chasing watcher keeps hold of a quarry this close even round a corner.
export const LOST_TRACK_CLOSE = 4;

function blocksSight(tile) {
  if (!tile) return true;
  if (tile.walkable || tile.gate) return false;
  return !SEE_THROUGH_SURFACES.has(tile.surface);
}

/** Can one position see another with nothing solid between them? Without a grid, always. */
export function hasLineOfSight(grid, from, to) {
  if (!grid) return true;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  const startTile = tileOf(from);
  const endTile = tileOf(to);
  for (let travelled = SIGHT_STEP; travelled < length; travelled += SIGHT_STEP) {
    const point = { x: from.x + (dx / length) * travelled, y: from.y + (dy / length) * travelled };
    const tile = tileOf(point);
    if ((tile.x === startTile.x && tile.y === startTile.y) || (tile.x === endTile.x && tile.y === endTile.y)) continue;
    if (blocksSight(grid[tile.y]?.[tile.x])) return false;
  }
  return true;
}

// An operator with a weapon drawn (selected, or firing a moment ago). Police only react to these.
export function gunOut(unit, now) {
  return now !== null && now !== undefined && Boolean(heldWeapon(unit, now));
}

function nearestVisibleOperator(unit, units, sight, grid = null, accept = null) {
  let best = null;
  let bestDistance = Infinity;
  for (const candidate of units) {
    if (candidate.side !== "team" || candidate.disabled) continue;
    if (accept && !accept(candidate)) continue;
    const distance = distanceBetween(unit, candidate);
    const holdsTrack = unit.alertedBy === candidate.id && distance <= LOST_TRACK_CLOSE;
    if (
      distance <= sight * stealthFactor(candidate) &&
      distance < bestDistance &&
      (holdsTrack || hasLineOfSight(grid, unit.position, candidate.position))
    ) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * Move opposition units. A watcher holds position while it has a target in
 * pulse range; otherwise it chases the nearest operator within sight (slower
 * than operators can run), returns to its patrol route when it loses them, and
 * walks the route otherwise. With a `grid` it paths around obstacles; without
 * one it only follows its route. Returns "spotted" events when a watcher first
 * notices an operator.
 */
export function advancePatrols(units, deltaSeconds, grid = null, now = null) {
  const events = [];
  const byId = new Map(units.map((unit) => [unit.id, unit]));
  for (const unit of units) {
    if (unit.side === "team" || unit.disabled) continue;
    if (unit.persuaded) {
      if (grid) followAgent(unit, byId.get(unit.persuadedBy), grid, deltaSeconds);
      continue;
    }
    const hasRoute = unit.patrol && unit.patrol.route.length > 0;
    if (!hasRoute && !grid) continue;

    if (unit.targetId !== null) {
      const target = byId.get(unit.targetId);
      const engaged =
        target &&
        !target.disabled &&
        distanceBetween(unit, target) <= combatStats(unit).range &&
        hasLineOfSight(grid, unit.position, target.position) &&
        (unit.side !== "police" || gunOut(target, now));
      if (engaged) {
        unit.path = [];
        continue;
      }
      unit.targetId = null;
    }

    const stopRange = combatStats(unit).range * STOP_RANGE_FACTOR;
    const called = units.some(
      (other) =>
        other !== unit &&
        other.side === "opposition" &&
        !other.disabled &&
        other.alertedBy &&
        distanceBetween(unit, other) <= CALL_RADIUS,
    );
    const sight = unit.definition.stats.awareness * SIGHT_TILES_PER_AWARENESS * (called ? CALL_SIGHT_FACTOR : 1);
    // Civilians notice nothing; police only notice operators who have a weapon out.
    const watching = grid && unit.side !== "civilian";
    const seen = watching
      ? nearestVisibleOperator(
          unit,
          units,
          unit.alertedBy ? sight * LOSE_SIGHT_FACTOR : sight,
          grid,
          unit.side === "police" ? (candidate) => gunOut(candidate, now) : null,
        )
      : null;

    if (unit.side === "civilian" && now !== null && now < (unit.panicUntil ?? 0) && unit.path.length > 0) {
      followPath(unit, deltaSeconds, PANIC_SPEED_FACTOR);
      continue;
    }

    if (seen) {
      if (!unit.alertedBy) events.push({ type: "spotted", unitId: unit.id, targetId: seen.id });
      unit.alertedBy = seen.id;
      if (distanceBetween(unit, seen) <= stopRange) {
        unit.path = [];
        continue;
      }
      const goal = tileOf(seen.position);
      const end = unit.path.at(-1);
      if (!end || Math.abs(end.x - goal.x) + Math.abs(end.y - goal.y) > 1) {
        unit.path = findPath(grid, tileOf(unit.position), goal);
      }
      followPath(unit, deltaSeconds, CHASE_SPEED_FACTOR);
      continue;
    }
    unit.alertedBy = null;

    if (!hasRoute) continue;
    if (unit.path.length > 0) {
      followPath(unit, deltaSeconds, PATROL_SPEED_FACTOR);
      continue;
    }

    const { route } = unit.patrol;
    const waypoint = route[unit.patrol.index % route.length];
    // Far from the route after a chase: walk back along real streets.
    if (grid && distanceBetween(unit, { position: waypoint }) > 1.5) {
      unit.path = findPath(grid, tileOf(unit.position), waypoint);
      if (unit.path.length > 0) {
        followPath(unit, deltaSeconds, PATROL_SPEED_FACTOR);
        continue;
      }
    }
    let remaining = deltaSeconds * unit.definition.stats.speed * 0.7 * PATROL_SPEED_FACTOR;
    while (remaining > 0) {
      const destination = route[unit.patrol.index % route.length];
      const offsetX = destination.x - unit.position.x;
      const offsetY = destination.y - unit.position.y;
      const distance = Math.hypot(offsetX, offsetY);
      if (distance <= remaining + ARRIVAL_EPSILON) {
        unit.position = { ...destination };
        unit.patrol.index = (unit.patrol.index + 1) % route.length;
        remaining = Math.max(0, remaining - distance);
      } else {
        unit.position = {
          x: unit.position.x + (offsetX / distance) * remaining,
          y: unit.position.y + (offsetY / distance) * remaining,
        };
        remaining = 0;
      }
    }
  }
  return events;
}

function distanceBetween(left, right) {
  return Math.hypot(
    left.position.x - right.position.x,
    left.position.y - right.position.y,
  );
}

// Who an armed unit may open fire on by itself. Opposition and alerted police shoot operators (police
// only ones with a weapon out); a persuaded follower shoots whoever is hostile to the squad.
function isHostileTo(attacker, candidate, now) {
  if (candidate.disabled || candidate === attacker) return false;
  if (attacker.persuaded) {
    if (candidate.persuaded) return false;
    return candidate.side === "opposition" || (candidate.side === "police" && Boolean(candidate.alertedBy));
  }
  if (candidate.side !== "team") return false;
  return attacker.side !== "police" || gunOut(candidate, now);
}

function automaticTarget(attacker, units, grid = null, now = null) {
  const stats = combatStats(attacker);
  return units
    .filter(
      (candidate) =>
        isHostileTo(attacker, candidate, now) &&
        distanceBetween(attacker, candidate) <= stats.range &&
        hasLineOfSight(grid, attacker.position, candidate.position),
    )
    .sort(
      (left, right) =>
        distanceBetween(attacker, left) - distanceBetween(attacker, right) ||
        (left.id < right.id ? -1 : left.id > right.id ? 1 : 0),
    )[0] ?? null;
}

// Pulse weapons carried by a unit, empty ones included.
function pulseItems(unit) {
  return (unit.equipment ?? []).filter((item) => item.definition.action === "disable-pulse");
}

// A weapon with rounds left (null charges means unlimited).
function loaded(item) {
  return item.charges !== 0;
}

// A unit that cannot fire: it carries pulse weapons but every one is out of rounds.
const DISARMED = Object.freeze({ attack: 0, range: 0, cooldown: 1 });

/**
 * The weapon a unit fires: its item (null for a unit's own natural attack) and the stats.
 * Empty weapons never fire. A unit with no pulse weapons at all fights with its own stats,
 * but one whose weapons have all run dry is disarmed. An operative who picked a weapon
 * (activeSlot) uses exactly that one while it has rounds. Otherwise, without a distance this
 * is the unit's reach (its longest-ranged loaded weapon); with one, the hardest-hitting
 * loaded weapon that reaches that far, falling back to the longest-ranged one when the
 * target is out of reach.
 */
// Operators fire only after choosing a weapon: with nothing selected they hold fire. Once one is
// selected and runs dry, they carry on with the next loaded weapon they have.
export function hasWeaponSelected(unit) {
  return unit.side !== "team" || Number.isInteger(unit.activeSlot);
}

export function pickWeapon(unit, distance = null) {
  if (!hasWeaponSelected(unit)) return { item: null, stats: DISARMED };
  const all = pulseItems(unit);
  if (all.length === 0) return { item: null, stats: unit.definition.stats };
  const chosen = Number.isInteger(unit.activeSlot) ? unit.equipment?.[unit.activeSlot] : null;
  if (chosen && chosen.definition.action === "disable-pulse" && loaded(chosen)) {
    return { item: chosen, stats: chosen.definition.effect };
  }
  const ready = all.filter(loaded);
  if (ready.length === 0) return { item: null, stats: DISARMED };
  const longest = ready.reduce((best, item) => (item.definition.effect.range > best.definition.effect.range ? item : best));
  if (distance === null) return { item: longest, stats: longest.definition.effect };
  const usable = ready.filter((item) => item.definition.effect.range >= distance);
  const pick =
    usable.length === 0
      ? longest
      : usable.reduce((best, item) => (item.definition.effect.attack > best.definition.effect.attack ? item : best));
  return { item: pick, stats: pick.definition.effect };
}

/**
 * The weapon a unit is seen holding, or null. An operative holds a weapon while one is selected
 * (and still has rounds) or while it is firing at a locked target; otherwise the hands are
 * empty. A watcher has no selection, so it draws its best loaded weapon while it is alert or
 * has a target.
 */
export const RECENT_FIRE_SECONDS = 0.8;

export function heldWeapon(unit, now = null) {
  if (unit.disabled) return null;
  if (unit.side === "team") {
    const chosen = Number.isInteger(unit.activeSlot) ? unit.equipment?.[unit.activeSlot] : null;
    if (chosen && chosen.definition.action === "disable-pulse" && chosen.charges !== 0) return chosen;
    // Not selected, but firing (at a locked target, or a moment ago by hand): the weapon is out.
    const justFired = now !== null && unit.firedAt !== undefined && now - unit.firedAt < RECENT_FIRE_SECONDS;
    return unit.targetId || justFired ? pickWeapon(unit).item : null;
  }
  return unit.alertedBy || unit.targetId ? pickWeapon(unit).item : null;
}

export function combatStats(unit, distance = null) {
  return pickWeapon(unit, distance).stats;
}

// Rounds left across a unit's pulse weapons, or null when it has none (natural attack).
export function roundsLeft(unit) {
  const all = pulseItems(unit);
  if (all.length === 0) return null;
  return all.reduce((sum, item) => sum + (item.charges === null ? Infinity : item.charges), 0);
}

/** Advance cooldowns and resolve deterministic, non-random combat pulses. */
export function advanceCombat(units, deltaSeconds, grid = null, now = null) {
  const events = [];
  const byId = new Map(units.map((unit) => [unit.id, unit]));

  for (const attacker of units) {
    if (attacker.disabled) continue;
    attacker.cooldownRemaining = Math.max(
      0,
      attacker.cooldownRemaining - deltaSeconds,
    );

    const hostile =
      (attacker.persuaded && combatStats(attacker).attack > 0) ||
      (!attacker.persuaded && attacker.side === "opposition") ||
      (!attacker.persuaded && attacker.side === "police" && attacker.alertedBy);
    if (hostile && attacker.targetId === null) {
      attacker.targetId = automaticTarget(attacker, units, grid, now)?.id ?? null;
    }

    const target = byId.get(attacker.targetId);
    if (!target || target.disabled || (target.side === attacker.side && !attacker.persuaded)) {
      attacker.targetId = null;
      continue;
    }
    const distance = distanceBetween(attacker, target);
    const { item: weapon, stats } = pickWeapon(attacker, distance);
    if (attacker.persuaded && (distance > stats.range || stats.range <= 0)) {
      attacker.targetId = null; // a follower that cannot reach its target drops it and keeps up with its leader
      continue;
    }
    if (!hasLineOfSight(grid, attacker.position, target.position)) continue;
    if (stats.range <= 0 || distance > stats.range || attacker.cooldownRemaining > ARRIVAL_EPSILON) continue;
    // Firing spends a round; the weapon that fires is the one that loses it.
    if (weapon && weapon.charges !== null) weapon.charges -= 1;

    startCooldown(attacker, stats);
    strike(attacker, target, weapon, stats, events);
  }

  return events;
}

// The recharge before a unit can fire again: the weapon's cooldown, scaled by its effective Brain.
function startCooldown(unit, stats) {
  unit.cooldownRemaining =
    stats.cooldown * cooldownMultiplier(effectiveLevels(unit.levels, unit.stamina, unit.focus));
}

// Apply a hit and report it; a unit reduced to zero health is disabled.
function strike(attacker, target, weapon, stats, events) {
  target.health = Math.max(0, target.health - stats.attack);
  events.push({
    type: "damage",
    attackerId: attacker.id,
    targetId: target.id,
    amount: stats.attack,
    remaining: target.health,
    outOfRounds: weapon !== null && weapon.charges === 0,
    weapon: weapon ? weapon.definition.name : null,
  });
  if (target.health === 0) {
    target.disabled = true;
    target.path = [];
    target.targetId = null;
    events.push({ type: "disabled", unitId: target.id });
  }
}

export const HIT_RADIUS = 0.65;
export const RAY_STEP = 0.2;

/**
 * Trace a shot from the shooter toward `aim` (grid coordinates) for up to `range` tiles. It stops
 * at the first standing enemy within HIT_RADIUS of its path, or at the first tile that cannot be
 * walked on (a wall, a building, a closed gate). Returns the enemy hit (or null) and where the
 * shot ended.
 */
export function castShot(shooter, aim, units, grid, range) {
  const dx = aim.x - shooter.position.x;
  const dy = aim.y - shooter.position.y;
  const length = Math.hypot(dx, dy);
  if (length < 1e-6) return { target: null, end: { ...shooter.position } };
  const direction = { x: dx / length, y: dy / length };
  const enemies = units.filter((unit) => unit.side !== shooter.side && !unit.disabled && !unit.persuaded);
  let last = { ...shooter.position };
  for (let travelled = RAY_STEP * 2; travelled <= range + 1e-9; travelled += RAY_STEP) {
    const point = {
      x: shooter.position.x + direction.x * travelled,
      y: shooter.position.y + direction.y * travelled,
    };
    const tile = grid[Math.round(point.y)]?.[Math.round(point.x)];
    if (!tile || !tile.walkable) return { target: null, end: last };
    for (const enemy of enemies) {
      if (Math.hypot(enemy.position.x - point.x, enemy.position.y - point.y) <= HIT_RADIUS) {
        return { target: enemy, end: { ...enemy.position } };
      }
    }
    last = point;
  }
  return { target: null, end: last };
}

/**
 * A shot fired by hand (right-click): the selected weapon, or the longest-ranged loaded one if none
 * is selected, fires in the direction of `aim`. It needs the weapon recharged and a round left, spends
 * the round and starts the recharge. Returns { fired, reason, events }; events use the same shapes as
 * automatic combat ("damage", "disabled") plus a "shot" event for a shot that hit nothing.
 */
export function fireManual(shooter, aim, units, grid) {
  if (shooter.disabled) return { fired: false, reason: "down", events: [] };
  if (shooter.cooldownRemaining > ARRIVAL_EPSILON) return { fired: false, reason: "recharging", events: [] };
  const { item: weapon, stats } = pickWeapon(shooter);
  if (stats.range <= 0) {
    const reason = pulseItems(shooter).length === 0 ? "no-weapon" : roundsLeft(shooter) === 0 ? "no-rounds" : "none-selected";
    return { fired: false, reason, events: [] };
  }
  const shot = castShot(shooter, aim, units, grid, stats.range);
  if (weapon && weapon.charges !== null) weapon.charges -= 1;
  startCooldown(shooter, stats);
  shooter.aimAt = { ...aim };
  const events = [];
  if (shot.target) {
    strike(shooter, shot.target, weapon, stats, events);
  } else {
    events.push({
      type: "shot",
      attackerId: shooter.id,
      end: shot.end,
      outOfRounds: weapon !== null && weapon.charges === 0,
      weapon: weapon ? weapon.definition.name : null,
    });
  }
  return { fired: true, reason: null, events };
}

/**
 * Consume whole fixed steps while retaining fractional time for the next
 * animation frame. The per-frame limit avoids a runaway catch-up loop after a
 * suspended tab; excess wall-clock time is intentionally discarded.
 */
export function consumeFixedSteps(clock, elapsedSeconds, step) {
  const acceptedElapsed = Math.min(
    Math.max(0, elapsedSeconds),
    FIXED_STEP_SECONDS * MAX_STEPS_PER_FRAME,
  );
  clock.accumulator += acceptedElapsed;

  let steps = 0;
  while (
    clock.accumulator + ARRIVAL_EPSILON >= FIXED_STEP_SECONDS &&
    steps < MAX_STEPS_PER_FRAME
  ) {
    step(FIXED_STEP_SECONDS);
    clock.accumulator -= FIXED_STEP_SECONDS;
    steps += 1;
  }

  if (clock.accumulator < ARRIVAL_EPSILON) clock.accumulator = 0;
  return steps;
}

/**
 * Gunfire at `source` sends civilians within PANIC_RADIUS running away from it for PANIC_SECONDS.
 * Each picks the furthest reachable tile in the direction away (trying a few angles), or stays
 * put, frightened, when boxed in. Returns how many started to flee.
 */
export function startPanic(units, source, grid, now) {
  let fled = 0;
  for (const unit of units) {
    if (unit.side !== "civilian" || unit.disabled || unit.persuaded) continue;
    const away = { x: unit.position.x - source.x, y: unit.position.y - source.y };
    const distance = Math.hypot(away.x, away.y);
    if (distance > PANIC_RADIUS) continue;
    const base = distance < 0.01 ? 0 : Math.atan2(away.y, away.x);
    unit.panicUntil = now + PANIC_SECONDS;
    unit.path = [];
    for (const reach of [14, 9, 5]) {
      let done = false;
      for (const turn of [0, 0.6, -0.6, 1.2, -1.2]) {
        const angle = base + turn;
        const goal = tileOf({
          x: unit.position.x + Math.cos(angle) * reach,
          y: unit.position.y + Math.sin(angle) * reach,
        });
        if (!grid[goal.y]?.[goal.x]?.walkable) continue;
        const path = findPath(grid, tileOf(unit.position), goal);
        if (path.length > 0) {
          unit.path = path;
          fled += 1;
          done = true;
          break;
        }
      }
      if (done) break;
    }
  }
  return fled;
}

/**
 * The Persuader. An operator with it switched on (`persuading`) wins over people within its range,
 * one at a time, nearest first. Civilians can always be persuaded; police only once that operator
 * has persuaded POLICE_NEEDS_CIVILIANS civilians; enemy agents only after ENEMY_NEEDS_POLICE police.
 * A persuaded unit follows its persuader and stops being hostile to the squad.
 */
export const POLICE_NEEDS_CIVILIANS = 6;
export const ENEMY_NEEDS_POLICE = 4;
const KIND_BY_SIDE = { civilian: "civilian", police: "police", opposition: "opposition" };

export function newPersuasions() {
  return { civilian: 0, police: 0, opposition: 0 };
}

/** Whether `agent` may persuade `target` now; otherwise what is still needed, if anything. */
export function persuadeCheck(agent, target) {
  const kind = KIND_BY_SIDE[target.side];
  if (!kind || target.disabled || target.persuaded) return { ok: false, kind: null };
  const done = agent.persuasions ?? newPersuasions();
  if (kind === "police" && done.civilian < POLICE_NEEDS_CIVILIANS) {
    return { ok: false, kind, needs: `${POLICE_NEEDS_CIVILIANS - done.civilian} more civilians` };
  }
  if (kind === "opposition" && done.police < ENEMY_NEEDS_POLICE) {
    return { ok: false, kind, needs: `${ENEMY_NEEDS_POLICE - done.police} more police` };
  }
  return { ok: true, kind };
}

function persuasionItem(unit) {
  return (unit.equipment ?? []).find((item) => item.definition.action === "persuade" && item.charges !== 0) ?? null;
}

export function advancePersuasion(units, deltaSeconds, grid = null) {
  const events = [];
  for (const agent of units) {
    if (agent.side !== "team" || agent.disabled || !agent.persuading) continue;
    const item = persuasionItem(agent);
    if (!item) continue;
    agent.persuadeCooldown = Math.max(0, (agent.persuadeCooldown ?? 0) - deltaSeconds);
    if (agent.persuadeCooldown > 0) continue;
    const reach = item.definition.effect.range;
    const near = units
      .filter(
        (other) =>
          other !== agent &&
          other.side !== "team" &&
          !other.disabled &&
          !other.persuaded &&
          distanceBetween(agent, other) <= reach &&
          hasLineOfSight(grid, agent.position, other.position),
      )
      .sort((left, right) => distanceBetween(agent, left) - distanceBetween(agent, right));
    let blocked = null;
    for (const target of near) {
      const check = persuadeCheck(agent, target);
      if (!check.ok) {
        blocked ??= { target, check };
        continue;
      }
      target.persuaded = true;
      target.persuadedBy = agent.id;
      target.alertedBy = null;
      target.targetId = null;
      target.path = [];
      target.panicUntil = 0;
      if (item.charges !== null) item.charges -= 1;
      agent.persuadeCooldown = item.definition.effect.cooldown;
      agent.persuasions = { ...newPersuasions(), ...(agent.persuasions ?? {}) };
      agent.persuasions[check.kind] += 1;
      events.push({
        type: "persuaded",
        agentId: agent.id,
        targetId: target.id,
        kind: check.kind,
        count: agent.persuasions[check.kind],
        outOfCharges: item.charges === 0,
      });
      blocked = null;
      break;
    }
    if (blocked && (agent.persuadeNoticeAt ?? -Infinity) <= (agent.persuadeClock ?? 0)) {
      agent.persuadeNoticeAt = (agent.persuadeClock ?? 0) + 4;
      const { target, check } = blocked;
      events.push({ type: "refused", agentId: agent.id, targetId: target.id, needs: check.needs, kind: check.kind });
    }
    agent.persuadeClock = (agent.persuadeClock ?? 0) + deltaSeconds;
  }
  return events;
}

// A follower keeps close to its persuader, walking real streets to do it.
const FOLLOW_DISTANCE = 1.8;
const FOLLOW_SPEED_FACTOR = 1.5;
function followAgent(unit, agent, grid, deltaSeconds) {
  if (!agent || agent.disabled) {
    unit.path = [];
    return;
  }
  const distance = distanceBetween(unit, agent);
  if (distance <= FOLLOW_DISTANCE) {
    unit.path = [];
    return;
  }
  const goal = tileOf(agent.position);
  const end = unit.path.at(-1);
  if (!end || Math.abs(end.x - goal.x) + Math.abs(end.y - goal.y) > 1) {
    unit.path = findPath(grid, tileOf(unit.position), goal);
  }
  followPath(unit, deltaSeconds, FOLLOW_SPEED_FACTOR);
}
