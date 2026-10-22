// SPDX-License-Identifier: GPL-2.0-or-later

export const FIXED_STEP_SECONDS = 1 / 30;
export const MAX_STEPS_PER_FRAME = 8;

const ARRIVAL_EPSILON = 1e-9;

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
    if (unit.side !== "team" || unit.path.length === 0) continue;

    let remaining = deltaSeconds * unit.definition.stats.speed * 0.7;
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

/**
 * Walk opposition units that have a patrol route. A patrolling unit holds its
 * position while it has a target in pulse range and resumes once the target is
 * disabled or out of range.
 */
export function advancePatrols(units, deltaSeconds) {
  const byId = new Map(units.map((unit) => [unit.id, unit]));
  for (const unit of units) {
    if (unit.side === "team" || unit.disabled || !unit.patrol || unit.patrol.route.length === 0) continue;

    if (unit.targetId !== null) {
      const target = byId.get(unit.targetId);
      const engaged =
        target && !target.disabled && distanceBetween(unit, target) <= combatStats(unit).range;
      if (engaged) continue;
      unit.targetId = null;
    }

    const { route } = unit.patrol;
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

function combatStats(unit) {
  return unit.equipment?.find(
    (item) => item.definition.action === "disable-pulse",
  )?.definition.effect ?? unit.definition.stats;
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
    const stats = combatStats(attacker);
    if (
      distanceBetween(attacker, target) > stats.range ||
      attacker.cooldownRemaining > ARRIVAL_EPSILON
    ) {
      continue;
    }

    const amount = stats.attack;
    target.health = Math.max(0, target.health - amount);
    attacker.cooldownRemaining = stats.cooldown;
    events.push({
      type: "damage",
      attackerId: attacker.id,
      targetId: target.id,
      amount,
      remaining: target.health,
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
