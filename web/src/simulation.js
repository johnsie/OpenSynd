// SPDX-License-Identifier: GPL-2.0-or-later

import { findPath } from "./engine.js";
import { cooldownMultiplier, effectiveLevels, nextFocus, nextStamina, speedMultiplier } from "./stats.js";

export const FIXED_STEP_SECONDS = 1 / 30;
export const MAX_STEPS_PER_FRAME = 8;

const ARRIVAL_EPSILON = 1e-9;

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
const CHASE_SPEED_FACTOR = 0.85;
const SIGHT_TILES_PER_AWARENESS = 0.1;
const LOSE_SIGHT_FACTOR = 1.6;
const STOP_RANGE_FACTOR = 0.9;
// A watcher that has spotted someone calls its neighbours: those within this many tiles see
// further, so they close in too.
export const CALL_RADIUS = 14;
export const CALL_SIGHT_FACTOR = 1.8;

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

function nearestVisibleOperator(unit, units, sight) {
  let best = null;
  let bestDistance = Infinity;
  for (const candidate of units) {
    if (candidate.side !== "team" || candidate.disabled) continue;
    const distance = distanceBetween(unit, candidate);
    if (distance <= sight * stealthFactor(candidate) && distance < bestDistance) {
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
export function advancePatrols(units, deltaSeconds, grid = null) {
  const events = [];
  const byId = new Map(units.map((unit) => [unit.id, unit]));
  for (const unit of units) {
    if (unit.side === "team" || unit.disabled) continue;
    const hasRoute = unit.patrol && unit.patrol.route.length > 0;
    if (!hasRoute && !grid) continue;

    if (unit.targetId !== null) {
      const target = byId.get(unit.targetId);
      const engaged =
        target && !target.disabled && distanceBetween(unit, target) <= combatStats(unit).range;
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
        other.side !== "team" &&
        !other.disabled &&
        other.alertedBy &&
        distanceBetween(unit, other) <= CALL_RADIUS,
    );
    const sight = unit.definition.stats.awareness * SIGHT_TILES_PER_AWARENESS * (called ? CALL_SIGHT_FACTOR : 1);
    const seen = grid
      ? nearestVisibleOperator(unit, units, unit.alertedBy ? sight * LOSE_SIGHT_FACTOR : sight)
      : null;

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

function automaticTarget(attacker, units) {
  const stats = combatStats(attacker);
  return units
    .filter(
      (candidate) =>
        !candidate.disabled &&
        candidate.side !== attacker.side &&
        distanceBetween(attacker, candidate) <= stats.range,
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
export function pickWeapon(unit, distance = null) {
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
export function heldWeapon(unit) {
  if (unit.disabled) return null;
  if (unit.side === "team") {
    const chosen = Number.isInteger(unit.activeSlot) ? unit.equipment?.[unit.activeSlot] : null;
    if (chosen && chosen.definition.action === "disable-pulse" && chosen.charges !== 0) return chosen;
    // Not selected, but firing at a locked target: the weapon is out while it shoots.
    return unit.targetId ? pickWeapon(unit).item : null;
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
export function advanceCombat(units, deltaSeconds) {
  const events = [];
  const byId = new Map(units.map((unit) => [unit.id, unit]));

  for (const attacker of units) {
    if (attacker.disabled) continue;
    attacker.cooldownRemaining = Math.max(
      0,
      attacker.cooldownRemaining - deltaSeconds,
    );

    if (attacker.side === "opposition" && attacker.targetId === null) {
      attacker.targetId = automaticTarget(attacker, units)?.id ?? null;
    }

    const target = byId.get(attacker.targetId);
    if (!target || target.disabled || target.side === attacker.side) {
      attacker.targetId = null;
      continue;
    }
    const distance = distanceBetween(attacker, target);
    const { item: weapon, stats } = pickWeapon(attacker, distance);
    if (stats.range <= 0 || distance > stats.range || attacker.cooldownRemaining > ARRIVAL_EPSILON) continue;
    // Firing spends a round; the weapon that fires is the one that loses it.
    if (weapon && weapon.charges !== null) weapon.charges -= 1;

    const amount = stats.attack;
    target.health = Math.max(0, target.health - amount);
    attacker.cooldownRemaining =
      stats.cooldown * cooldownMultiplier(effectiveLevels(attacker.levels, attacker.stamina, attacker.focus));
    events.push({
      type: "damage",
      attackerId: attacker.id,
      targetId: target.id,
      amount,
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

  return events;
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
