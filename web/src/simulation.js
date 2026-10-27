// SPDX-License-Identifier: GPL-2.0-or-later

import { findPath, hasLineOfSight, SIGHT_STEP } from "./engine.js";
import { LOOT_RANGE, lootBody, lootableBody } from "./inventory.js";
import { ENTER_RANGE, VEHICLE_HIT_RADIUS, ejectAll, ejectDriver, isSquadVehicle, isVehicle } from "./vehicles.js";
import { damageProp, propsAlong } from "./props.js";
import { adrenalineAim, adrenalineSpeed, drugMultiplier, intelligenceRecharge, perceptionReach } from "./drugs.js";
import { aimBonus, armsCapacity, armsCooldown, chestTier, chestVitality, eyesRange, legsPace } from "./upgrades.js";
import { createRandom } from "./random.js";

// The simulation's sources of chance. An operation has its own pair of streams: one for shot accuracy and a second for chance
// that is not about shots (which window a bullet breaks), so drawing from it never changes where shots land. They are seeded, so
// the same operation and the same orders always play out the same way. Several operations can run in one process (a server runs
// many): each world keeps its streams and makes them the active ones for the moment it is being stepped (see useStreams).
export function createStreams(seed = 1) {
  return { shots: createRandom(seed), world: createRandom((seed ^ 0x9e3779b9) >>> 0) };
}
let streams = createStreams(1);
const random = () => streams.shots();
export function useStreams(next) {
  streams = next;
}
/** Start the active streams afresh from a seed (for a single operation running alone). */
export function seedSimulation(seed = 1) {
  streams = createStreams(seed);
}
/** A chance from the operation's seeded world stream (0 to 1). Rules must use this or the shot stream, never Math.random. */
export function worldChance() {
  return streams.world();
}
/** Replace the source of shot chance (a function returning 0 to 1); tests use it to aim exactly (always 0.5). */
export function setRandomSource(source) {
  streams = { ...streams, shots: source };
}

export const FIXED_STEP_SECONDS = 1 / 30;
export const MAX_STEPS_PER_FRAME = 8;

const ARRIVAL_EPSILON = 1e-9;

// How close a follower stays to the person they follow (FreeSynd: about three quarters of a tile).
export const TAIL_DISTANCE = 1.1;

/**
 * Following (FreeSynd's left click on a person): an operative with a `tailId` walks after that person and stops beside them,
 * setting off again whenever they move. It never fires. It ends when the person is disabled or gone.
 * Returns "ended" events so the interface can say so.
 */
export function advanceTails(units, grid) {
  const events = [];
  const byId = new Map(units.map((unit) => [unit.id, unit]));
  for (const unit of units) {
    if ((!unit.playerUnit && unit.side !== "team") || !unit.tailId) continue;
    const target = byId.get(unit.tailId);
    if (unit.disabled || !target || target.disabled) {
      events.push({ type: "ended", unitId: unit.id, reason: target?.disabled ? "disabled" : "lost" });
      unit.tailId = null;
      unit.path = [];
      continue;
    }
    if (unit.inVehicle || target.inVehicle) continue;
    if (distanceBetween(unit, target) <= TAIL_DISTANCE) {
      unit.path = [];
      continue;
    }
    const goal = tileOf(target.position);
    const end = unit.path.at(-1);
    if (!end || Math.abs(end.x - goal.x) + Math.abs(end.y - goal.y) > 1) {
      unit.path = findPath(grid, tileOf(unit.position), goal);
    }
  }
  return events;
}

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
    if ((!unit.playerUnit && unit.side !== "team") || !unit.followId) continue;
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

// FreeSynd's chest regeneration: an agent with the second version of the chest (tier 2 or 3) who has been hit heals one
// point every four seconds until whole again (a sixteenth of the agent's health a time on our scale). It starts on a hit
// (any loss of health) and stops at full health. Everyone else heals only with a repair kit.
export const REGEN_SECONDS = 4;
export const REGEN_FROM_TIER = 2;
export const REGEN_SHARE = 1 / 16;

export function advanceRegeneration(units, deltaSeconds) {
  for (const unit of units) {
    if (unit.disabled || chestTier(unit.upgrades) < REGEN_FROM_TIER) {
      unit.healthSeen = unit.health;
      unit.regenerating = false;
      continue;
    }
    if (unit.healthSeen !== undefined && unit.health < unit.healthSeen) unit.regenerating = true;
    if (unit.regenerating) {
      unit.regenClock = (unit.regenClock ?? 0) + deltaSeconds;
      while (unit.regenClock >= REGEN_SECONDS - 1e-9 && unit.regenerating) {
        unit.regenClock -= REGEN_SECONDS;
        const full = maxHealth(unit);
        unit.health = Math.min(full, unit.health + Math.max(1, Math.round(full * REGEN_SHARE)));
        if (unit.health >= full) {
          unit.regenerating = false;
          unit.regenClock = 0;
        }
      }
    }
    unit.healthSeen = unit.health;
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
    if ((!unit.playerUnit && unit.side !== "team") || unit.inVehicle) continue;
    if (unit.path.length === 0 || unit.disabled || unit.hitStun > 0) continue;

    const pace = weightPace(unit) * legsPace(unit.upgrades) * adrenalineSpeed(unit.drugs);
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

// Gear has weight. An operator carries WEIGHT_CAPACITY units freely; every unit beyond slows them by 3 percent,
// down to a floor of 60 percent of their pace.
export const WEIGHT_CAPACITY = 16;
export const WEIGHT_SLOWDOWN = 0.03;
export const WEIGHT_PACE_FLOOR = 0.6;

export function carriedWeight(unit) {
  return (unit.equipment ?? []).reduce((sum, item) => sum + (item.definition.weight ?? 0), 0);
}

export function weightPace(unit) {
  const over = Math.max(0, carriedWeight(unit) - WEIGHT_CAPACITY - armsCapacity(unit.upgrades));
  return Math.max(WEIGHT_PACE_FLOOR, 1 - over * WEIGHT_SLOWDOWN);
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

// Sight (see engine.js): solid ground such as buildings and walls stops it; fences, gates and water do not.
export { SIGHT_STEP, hasLineOfSight };

// Street-life behaviour, mapped from FreeSynd's behaviour components (see ROADMAP.md) and scaled to this
// game's tiles. Civilians scout for anyone with a weapon out and run from them; police go on alert when
// anyone draws a weapon, warn, then shoot any armed non-police unit until its weapon is put away;
// enemy agents and guards go for the squad after a short reaction time.
export const CIVILIAN_SCOUT = 6;
export const CIVILIAN_RUN = 2.6;
const CIVILIAN_SCOUT_PERIOD = 0.5;
const CIVILIAN_RUN_FACTOR = 1.8;
export const POLICE_SCOUT = 8;
const POLICE_SCOUT_PERIOD = 0.2;
// Police shout their warning for two seconds before they shoot (FreeSynd's warning time).
export const POLICE_WARNING = 2;
export const POLICE_PENDING = 1.5;
// How long an enemy waits, after it first sees the squad, before it opens fire.
export const REACTION_SECONDS = Object.freeze({ "enemy-agent": 0.4, guard: 0.3, criminal: 0.4 });
// Followers hunt for a dropped weapon this far away when their owner has one out.
export const FOLLOWER_WEAPON_SEARCH = 3;
// A retaliating criminal gives up on someone who gets this far away.
const CRIMINAL_GIVE_UP = 30;
// A chasing watcher keeps hold of a quarry this close even round a corner.
export const LOST_TRACK_CLOSE = 4;

// An operator with a weapon drawn (selected, or firing a moment ago). Police only react to these.
export function gunOut(unit, now) {
  return now !== null && now !== undefined && Boolean(heldWeapon(unit, now));
}

function nearestVisibleOperator(unit, units, sight, grid = null, accept = null) {
  let best = null;
  let bestDistance = Infinity;
  for (const candidate of units) {
    const asSquad = candidate.side === "team" ? !candidate.inVehicle : isSquadVehicle(candidate);
    if (!asSquad || candidate.disabled) continue;
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

/** Whether a unit has its weapon out: what civilians run from and police react to. */
export function armedOut(unit, now, byId = null) {
  if (unit.disabled || unit.inVehicle || now === null || now === undefined) return false;
  if (isVehicle(unit)) return false;
  if (unit.side === "team") return gunOut(unit, now);
  if (unit.persuaded) {
    const owner = byId?.get(unit.persuadedBy);
    return Boolean(owner && gunOut(owner, now) && pulseItems(unit).some(loaded));
  }
  if (unit.side === "civilian") return false;
  return Boolean(unit.alertedBy || unit.targetId);
}

// A unit walks its patrol route (or back to it after a chase, along real streets).
// Scripted people (a `script` list on the placement) follow their steps instead of a patrol route:
//   walk {to}        walk to a tile along the streets
//   wait {seconds}   stand still
//   trigger {at, radius}   stand until an operator comes within `radius` tiles of `at`
//   say {text}       speak a line (shown as a caption and in the status line)
//   escape {to}      walk, or drive the vehicle they occupy, to a tile and leave the map
// The list repeats when the placement says `scriptLoop`. Anyone alerted drops the script and fights or flees as usual.
const SCRIPT_SPEED_FACTOR = 0.8;
const SCRIPT_TRIGGER_RADIUS = 8;
let scriptUnits = [];
let scriptEvents = [];

export function advanceScript(unit, deltaSeconds, grid, units) {
  const script = unit.script;
  if (!script || script.done) return;
  const step = script.steps[script.index];
  if (!step) {
    if (script.loop && script.steps.length > 0) script.index = 0;
    else script.done = true;
    return;
  }
  const next = () => {
    script.index += 1;
    script.waitLeft = null;
  };
  if (step.type === "wait") {
    script.waitLeft ??= step.seconds;
    script.waitLeft -= deltaSeconds;
    if (script.waitLeft <= 0) next();
  } else if (step.type === "trigger") {
    const radius = step.radius ?? SCRIPT_TRIGGER_RADIUS;
    const near = units.some(
      (other) =>
        other.side === "team" && !other.disabled && Math.hypot(other.position.x - step.at.x, other.position.y - step.at.y) <= radius,
    );
    if (near) next();
  } else if (step.type === "say") {
    scriptEvents.push({ type: "say", unitId: unit.id, text: step.text });
    next();
  } else if (step.type === "enter") {
    // Walk to the named vehicle and get in as its driver (a car with someone at the wheel, or the squad's, is skipped).
    const vehicle = units.find((other) => other.id === step.vehicle && isVehicle(other));
    if (unit.inVehicle || !vehicle || vehicle.disabled || vehicle.vehicle.driverId || vehicle.vehicle.controlledBy) {
      next();
      return;
    }
    if (distanceBetween(unit, vehicle) <= ENTER_RANGE) {
      unit.inVehicle = vehicle.id;
      unit.path = [];
      unit.position = { ...vehicle.position };
      vehicle.vehicle.occupantIds.push(unit.id);
      vehicle.vehicle.driverId = unit.id;
      vehicle.vehicle.route = null;
      vehicle.path = [];
      next();
      return;
    }
    const goal = tileOf(vehicle.position);
    const end = unit.path.at(-1);
    if (!end || Math.abs(end.x - goal.x) + Math.abs(end.y - goal.y) > 1) {
      unit.path = grid ? findPath(grid, tileOf(unit.position), goal) : [];
    }
    if (unit.path.length === 0) {
      next(); // no way to the car: skip the step
      return;
    }
    followPath(unit, deltaSeconds, SCRIPT_SPEED_FACTOR);
  } else if (step.type === "drive") {
    // The vehicle drives to the point along the roads and the step ends when it is there.
    const vehicle = units.find((other) => other.id === unit.inVehicle);
    if (!vehicle || vehicle.disabled) {
      next();
      return;
    }
    const goal = tileOf(step.to);
    if (!vehicle.vehicle.route || vehicle.vehicle.route.scripted !== step) {
      vehicle.vehicle.route = { route: [goal], index: 0, scripted: step };
      vehicle.path = [];
    }
    if (Math.hypot(vehicle.position.x - goal.x, vehicle.position.y - goal.y) <= 1.6) {
      vehicle.vehicle.route = null;
      vehicle.path = [];
      next();
    }
  } else if (step.type === "escape" && unit.inVehicle) {
    // A scripted target can flee in the car they entered. At the edge, the car and everyone in it leave the operation; marking
    // the target escaped makes an unfinished disable objective fail immediately rather than treating the target as killed.
    const vehicle = units.find((other) => other.id === unit.inVehicle && isVehicle(other));
    if (!vehicle || vehicle.disabled) {
      next();
      return;
    }
    const goal = tileOf(step.to);
    if (Math.hypot(vehicle.position.x - goal.x, vehicle.position.y - goal.y) <= 1.6) {
      for (const id of vehicle.vehicle.occupantIds) {
        const rider = units.find((other) => other.id === id);
        if (!rider) continue;
        rider.escaped = true;
        rider.disabled = true;
        rider.health = 0;
        rider.inVehicle = null;
        rider.path = [];
      }
      vehicle.escaped = true;
      vehicle.path = [];
      vehicle.vehicle.route = null;
      vehicle.vehicle.driverId = null;
      vehicle.vehicle.occupantIds = [];
      next();
      return;
    }
    if (!vehicle.vehicle.route || vehicle.vehicle.route.scripted !== step) {
      vehicle.vehicle.route = { route: [goal], index: 0, scripted: step };
      vehicle.path = [];
    }
  } else if (step.type === "leave") {
    const vehicle = units.find((other) => other.id === unit.inVehicle);
    if (vehicle) {
      ejectAll(vehicle, units, grid ?? []);
      vehicle.vehicle.route = null;
    }
    next();
  } else if (step.type === "walk" || step.type === "escape") {
    const goal = tileOf(step.to);
    if (unit.path.length === 0) {
      if (distanceBetween(unit, { position: goal }) <= 0.6) {
        if (step.type === "escape") {
          unit.escaped = true;
          unit.disabled = true;
          unit.health = 0;
          unit.path = [];
        }
        next();
        return;
      }
      unit.path = grid ? findPath(grid, tileOf(unit.position), goal) : [];
      if (unit.path.length === 0) {
        next(); // no way there: skip the step rather than stand forever
        return;
      }
    }
    followPath(unit, deltaSeconds, SCRIPT_SPEED_FACTOR);
  } else {
    next();
  }
}

function walkPatrol(unit, deltaSeconds, grid) {
  if (unit.script) {
    advanceScript(unit, deltaSeconds, grid, scriptUnits);
    return;
  }
  if (!unit.patrol || unit.patrol.route.length === 0) return;
  if (unit.path.length > 0) {
    followPath(unit, deltaSeconds, PATROL_SPEED_FACTOR);
    return;
  }
  const { route } = unit.patrol;
  const waypoint = route[unit.patrol.index % route.length];
  // Far from the route after a chase: walk back along real streets.
  if (grid && distanceBetween(unit, { position: waypoint }) > 1.5) {
    unit.path = findPath(grid, tileOf(unit.position), waypoint);
    if (unit.path.length > 0) {
      followPath(unit, deltaSeconds, PATROL_SPEED_FACTOR);
      return;
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

// Set off along the furthest reachable tile away from `from` (trying a few angles); returns whether it could.
function runAwayFrom(unit, from, grid, reaches) {
  const away = { x: unit.position.x - from.x, y: unit.position.y - from.y };
  const base = Math.hypot(away.x, away.y) < 0.01 ? 0 : Math.atan2(away.y, away.x);
  for (const reach of reaches) {
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
        return true;
      }
    }
  }
  return false;
}

function nearestOf(unit, candidates, within, grid = null, needSight = false) {
  let best = null;
  let bestDistance = within;
  for (const other of candidates) {
    const distance = distanceBetween(unit, other);
    if (distance > bestDistance) continue;
    if (needSight && !hasLineOfSight(grid, unit.position, other.position)) continue;
    best = other;
    bestDistance = distance;
  }
  return best;
}

// Civilians (FreeSynd's panic behaviour): every half second look for anyone with a weapon out nearby;
// if there is one, run the other way for a short stretch, then look again. Persuaded civilians do not panic.
function advanceCivilian(unit, armed, deltaSeconds, grid) {
  const panic = (unit.panic ??= { fleeing: false, scoutLeft: 0 });
  if (unit.fleeFrom && grid) {
    // Thrown out of a car: run from it, like any armed person (FreeSynd treats ejection as a panic trigger).
    panic.fleeing = runAwayFrom(unit, unit.fleeFrom, grid, [CIVILIAN_RUN * 1.5, CIVILIAN_RUN]);
    unit.fleeFrom = null;
  }
  if (panic.fleeing && unit.path.length > 0) {
    followPath(unit, deltaSeconds, CIVILIAN_RUN_FACTOR);
    return;
  }
  panic.scoutLeft -= deltaSeconds;
  if (grid && panic.scoutLeft <= 0) {
    panic.scoutLeft = CIVILIAN_SCOUT_PERIOD;
    const threat = nearestOf(unit, armed, CIVILIAN_SCOUT);
    panic.fleeing = Boolean(threat) && runAwayFrom(unit, threat.position, grid, [CIVILIAN_RUN, CIVILIAN_RUN / 2]);
    if (panic.fleeing) {
      followPath(unit, deltaSeconds, CIVILIAN_RUN_FACTOR);
      return;
    }
  }
  panic.fleeing = false;
  walkPatrol(unit, deltaSeconds, grid);
}

// Police (FreeSynd's police behaviour): on patrol until anyone draws a weapon; then alert, scouting
// every fifth of a second for an armed non-police unit nearby; warn it and wait; follow it and shoot;
// when it puts its weapon away wait a moment, then look for another target or go back on patrol.
function advancePolice(unit, units, armed, deltaSeconds, grid, events) {
  const police = (unit.police ??= { status: "patrol", scoutLeft: 0, warnLeft: 0, pendingLeft: 0, targetId: null });
  const targets = armed.filter((other) => other.side !== "police" && other !== unit);
  const engage = (target) => {
    police.status = "warn";
    police.warnLeft = POLICE_WARNING;
    police.targetId = target.id;
    unit.path = [];
    if (target.side === "team") events.push({ type: "warning", unitId: unit.id, targetId: target.id });
    if (!unit.alertedBy && target.side === "team") events.push({ type: "spotted", unitId: unit.id, targetId: target.id });
    unit.alertedBy = target.id;
  };
  const stand = () => {
    unit.path = [];
    unit.targetId = null;
  };

  if (police.status === "patrol") {
    if (targets.length === 0) {
      walkPatrol(unit, deltaSeconds, grid);
      return;
    }
    police.status = "alert";
  }
  if (police.status === "alert") {
    police.scoutLeft -= deltaSeconds;
    if (police.scoutLeft <= 0) {
      police.scoutLeft = POLICE_SCOUT_PERIOD;
      const target = nearestOf(unit, targets, POLICE_SCOUT, grid, true);
      if (target) {
        engage(target);
        return;
      }
    }
    if (targets.length === 0) police.status = "patrol";
    walkPatrol(unit, deltaSeconds, grid);
    return;
  }
  if (police.status === "warn") {
    stand();
    police.warnLeft -= deltaSeconds;
    if (police.warnLeft <= 0) police.status = "engage";
    return;
  }
  if (police.status === "engage") {
    const target = units.find((other) => other.id === police.targetId);
    if (!target || target.disabled || !targets.includes(target)) {
      police.status = "pending";
      police.pendingLeft = POLICE_PENDING;
      unit.alertedBy = null;
      stand();
      return;
    }
    const reach = combatStats(unit).range * STOP_RANGE_FACTOR;
    if (distanceBetween(unit, target) <= reach && hasLineOfSight(grid, unit.position, target.position)) {
      unit.path = [];
      unit.targetId = target.id;
      return;
    }
    unit.targetId = null;
    const goal = tileOf(target.position);
    const end = unit.path.at(-1);
    if (grid && (!end || Math.abs(end.x - goal.x) + Math.abs(end.y - goal.y) > 1)) {
      unit.path = findPath(grid, tileOf(unit.position), goal);
    }
    followPath(unit, deltaSeconds, CHASE_SPEED_FACTOR);
    return;
  }
  // pending: the target put its weapon away; wait, then re-engage or go back to patrol.
  stand();
  police.pendingLeft -= deltaSeconds;
  if (police.pendingLeft > 0) return;
  const next = nearestOf(unit, targets, POLICE_SCOUT, grid, true);
  if (next) {
    engage(next);
    return;
  }
  police.status = targets.length > 0 ? "alert" : "patrol";
  unit.alertedBy = null;
}

// Enemy agents, guards and criminals who have been attacked (FreeSynd's "player hostile" behaviour):
// spot someone, wait the reaction time, chase and shoot, and drop back to patrol when the quarry is gone.
// An enemy agent who carries a time bomb plants it when the squad is close (FreeSynd gives them one), then backs away for
// a few seconds. The simulation only says so ("plant-bomb" event); the bombs themselves live in the game state.
export const BOMB_PLANT_RANGE = 5.5;
export const BOMB_COOLDOWN = 30;
export const BOMB_RETREAT_SECONDS = 4.5;
const bombItem = (unit) => (unit.equipment ?? []).find((item) => item.definition.action === "time-bomb" && item.charges !== 0) ?? null;

function advanceHostile(unit, units, byId, deltaSeconds, grid, now, events) {
  const role = unit.definition.role;
  unit.bombCooldown = Math.max(0, (unit.bombCooldown ?? 0) - deltaSeconds);
  if ((unit.retreatLeft ?? 0) > 0 && grid && unit.bombAt) {
    unit.retreatLeft = Math.max(0, unit.retreatLeft - deltaSeconds);
    if (unit.path.length === 0) runAwayFrom(unit, unit.bombAt, grid, [9, 6, 4]);
    followPath(unit, deltaSeconds, CHASE_SPEED_FACTOR);
    return;
  }
  if (unit.side === "criminal" && !unit.hostileTo) {
    walkPatrol(unit, deltaSeconds, grid);
    return;
  }
  if (unit.targetId !== null) {
    const target = byId.get(unit.targetId);
    const engaged =
      target &&
      !target.disabled &&
      distanceBetween(unit, target) <= combatStats(unit).range &&
      hasLineOfSight(grid, unit.position, target.position);
    if (engaged) {
      unit.path = [];
      unit.alertedBy ??= unit.targetId;
      return;
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
  let seen = null;
  if (grid) {
    if (unit.side === "criminal") {
      const attacker = byId.get(unit.hostileTo);
      const close = attacker && !attacker.disabled && distanceBetween(unit, attacker) <= CRIMINAL_GIVE_UP;
      if (close) seen = attacker;
      else unit.hostileTo = null;
    } else {
      seen = nearestVisibleOperator(unit, units, unit.alertedBy ? sight * LOSE_SIGHT_FACTOR : sight, grid);
    }
  }

  if (seen) {
    if (!unit.alertedBy) {
      events.push({ type: "spotted", unitId: unit.id, targetId: seen.id });
      unit.reactLeft = REACTION_SECONDS[role] ?? 0.4;
    }
    unit.alertedBy = seen.id;
    if ((unit.reactLeft ?? 0) > 0) {
      unit.path = []; // taken a moment to react before moving or firing
      return;
    }
    if (role === "enemy-agent" && unit.bombCooldown <= 0 && bombItem(unit) && distanceBetween(unit, seen) <= BOMB_PLANT_RANGE) {
      events.push({ type: "plant-bomb", unitId: unit.id, targetId: seen.id });
      unit.bombCooldown = BOMB_COOLDOWN;
      unit.bombAt = { x: unit.position.x, y: unit.position.y };
      unit.retreatLeft = BOMB_RETREAT_SECONDS;
      unit.path = [];
      return;
    }
    if (distanceBetween(unit, seen) <= stopRange) {
      unit.path = [];
      return;
    }
    const goal = tileOf(seen.position);
    const end = unit.path.at(-1);
    if (!end || Math.abs(end.x - goal.x) + Math.abs(end.y - goal.y) > 1) {
      unit.path = findPath(grid, tileOf(unit.position), goal);
    }
    followPath(unit, deltaSeconds, CHASE_SPEED_FACTOR);
    return;
  }
  unit.alertedBy = null;
  if (unit.investigate && grid) {
    // Heard glass break: go and look, then pick the patrol up again.
    unit.investigate.left -= deltaSeconds;
    if (unit.investigate.left <= 0) unit.investigate = null;
    else {
      if (unit.path.length === 0 && distanceBetween(unit, { position: unit.investigate }) > 1.5) {
        unit.path = findPath(grid, tileOf(unit.position), tileOf(unit.investigate));
      }
      if (unit.path.length > 0) {
        followPath(unit, deltaSeconds, 1);
        return;
      }
    }
  }
  walkPatrol(unit, deltaSeconds, grid);
}

/** Breaking glass draws the attention of enemy agents and guards within `radius` who have not seen the squad. */
export function investigateNoise(units, at, radius, seconds = 12) {
  for (const unit of units) {
    const role = unit.definition?.role;
    if (unit.side !== "opposition" || unit.passive || unit.disabled || unit.alertedBy || (role !== "guard" && role !== "enemy-agent")) {
      continue;
    }
    if (Math.hypot(unit.position.x - at.x, unit.position.y - at.y) <= radius) unit.investigate = { x: at.x, y: at.y, left: seconds };
  }
}

/**
 * Move everyone who is not on the squad. Civilians wander and run from anyone with a weapon out; police
 * patrol and deal with armed people; enemy agents and guards chase the squad; criminals wander until
 * they are attacked; persuaded units follow their owner. With a `grid` they path around obstacles;
 * `now` is the game clock (police and civilians need it to tell who has a weapon out). Returns
 * "spotted" events when an enemy first notices an operator, and "pickup" events when a follower
 * takes a weapon.
 */
export function advancePatrols(units, deltaSeconds, grid = null, now = null, drops = []) {
  const events = [];
  const byId = new Map(units.map((unit) => [unit.id, unit]));
  const armed = now === null ? [] : units.filter((unit) => armedOut(unit, now, byId));
  scriptUnits = units;
  scriptEvents = events;
  for (const unit of units) {
    if (unit.missionGiver) continue;
    // Someone riding in a vehicle can only be following a script (drive on, get out).
    if (unit.inVehicle && unit.script && !unit.disabled && unit.side !== "team") {
      advanceScript(unit, deltaSeconds, grid, units);
      continue;
    }
    if (unit.side === "team" || unit.playerUnit || unit.disabled || unit.inVehicle || isVehicle(unit) || unit.hitStun > 0) continue;
    if (unit.passive) {
      unit.alertedBy = null;
      unit.targetId = null;
      walkPatrol(unit, deltaSeconds, grid);
      continue;
    }
    if (unit.persuaded) {
      if (grid) advanceFollower(unit, byId, units, grid, deltaSeconds, now, events, drops);
      continue;
    }
    const hasRoute = (unit.patrol && unit.patrol.route.length > 0) || Boolean(unit.script);
    if (!hasRoute && !grid) continue;
    unit.reactLeft = Math.max(0, (unit.reactLeft ?? 0) - deltaSeconds);
    if (unit.side === "civilian") advanceCivilian(unit, armed, deltaSeconds, grid);
    else if (unit.side === "police") advancePolice(unit, units, armed, deltaSeconds, grid, events);
    else advanceHostile(unit, units, byId, deltaSeconds, grid, now, events);
  }
  return events;
}

function distanceBetween(left, right) {
  return Math.hypot(
    left.position.x - right.position.x,
    left.position.y - right.position.y,
  );
}

// Who an armed unit may open fire on by itself. Enemy agents and guards shoot the squad and anyone it has
// persuaded; a criminal only the person who attacked it; a persuaded follower shoots whoever is hostile
// to the squad. Police are handled by their own behaviour, which picks their target.
function isHostileTo(attacker, candidate) {
  if (candidate.disabled || candidate === attacker) return false;
  if (attacker.persuaded) {
    if (candidate.persuaded) return false;
    if (candidate.side === "opposition") return true;
    return (candidate.side === "criminal" && Boolean(candidate.hostileTo)) || (candidate.side === "police" && Boolean(candidate.alertedBy));
  }
  if (attacker.side === "criminal") return Boolean(attacker.hostileTo) && candidate.id === attacker.hostileTo;
  if (attacker.side === "opposition") {
    const onFoot = !candidate.inVehicle && (candidate.side === "team" || Boolean(candidate.persuaded));
    return onFoot || isSquadVehicle(candidate);
  }
  return false;
}

function automaticTarget(attacker, units, grid = null) {
  const stats = combatStats(attacker);
  return units
    .filter(
      (candidate) =>
        isHostileTo(attacker, candidate) &&
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
  return (!unit.playerUnit && unit.side !== "team") || Number.isInteger(unit.activeSlot);
}

// An operative's Eyes upgrade lengthens the reach of whatever they fire.
export function pickWeapon(unit, distance = null) {
  const pick = chooseWeapon(unit, distance);
  const reach = eyesRange(unit.upgrades) * perceptionReach(unit.drugs) * adrenalineAim(unit.drugs);
  if (Math.abs(reach - 1) < 1e-9 || !pick.item) return pick;
  return { item: pick.item, stats: { ...pick.stats, range: pick.stats.range * reach } };
}

/** The most health a unit can have: its base vitality plus any Chest upgrade. */
export function maxHealth(unit) {
  return unit.definition.stats.vitality + chestVitality(unit.upgrades);
}

function chooseWeapon(unit, distance) {
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
  if (unit.side === "team" || unit.playerUnit) {
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

  const context = { units, grid };
  events.push(...advanceBurning(units, deltaSeconds));
  for (const attacker of units) {
    if (attacker.disabled || attacker.inVehicle || isVehicle(attacker)) continue;
    attacker.cooldownRemaining = Math.max(
      0,
      attacker.cooldownRemaining - deltaSeconds,
    );
    if (attacker.hitStun > 0) {
      attacker.hitStun = Math.max(0, attacker.hitStun - deltaSeconds);
      continue;
    }
    if (attacker.passive) {
      attacker.targetId = null;
      continue;
    }

    // Who picks their own targets: enemies, criminals who were attacked, and armed followers (while their owner
    // has a weapon out). Police have their targets chosen by their behaviour.
    const owner = attacker.persuaded ? byId.get(attacker.persuadedBy) : null;
    if (attacker.persuaded && !(owner && !owner.disabled && gunOut(owner, now))) attacker.targetId = null;
    const hostile =
      (attacker.persuaded && Boolean(owner) && gunOut(owner, now) && combatStats(attacker).attack > 0) ||
      (!attacker.playerUnit &&
        !attacker.persuaded &&
        (attacker.side === "opposition" || (attacker.side === "criminal" && attacker.hostileTo)));
    if (hostile && attacker.targetId === null) {
      attacker.targetId = automaticTarget(attacker, units, grid)?.id ?? null;
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
    if ((attacker.reactLeft ?? 0) > 0) continue; // still reacting
    if (!hasLineOfSight(grid, attacker.position, target.position)) continue;
    if (stats.range <= 0 || distance > stats.range || attacker.cooldownRemaining > ARRIVAL_EPSILON) continue;
    // Firing spends a round; the weapon that fires is the one that loses it.
    if (weapon && weapon.charges !== null) weapon.charges -= 1;

    startCooldown(attacker, stats);
    // A shot that is off by more than the target's width misses and lands beside them.
    const error = (stats.pellets ?? 1) > 1 ? 0 : aimError(attacker, stats);
    if (distance * Math.abs(Math.tan(error)) > (isVehicle(target) ? VEHICLE_HIT_RADIUS : HIT_RADIUS)) {
      events.push({
        type: "shot",
        attackerId: attacker.id,
        end: rotateAbout(attacker.position, target.position, error),
        outOfRounds: weapon !== null && weapon.charges === 0,
        weapon: weapon ? weapon.definition.name : null,
        sound: weapon?.definition.sound ?? "pistol",
      });
      continue;
    }
    strike(attacker, target, weapon, stats, events, context, pelletsLanding(stats, distance));
  }

  return events;
}

// Hit reaction (FreeSynd's hit animation): a person who is hit flinches and can neither act nor walk for a moment, the
// longer the harder the hit. It is also what stops a persuasion landing in the middle of a hit.
export const HIT_STUN_MIN = 0.08;
export const HIT_STUN_MAX = 0.4;
export function hitStunFor(damage) {
  return Math.min(HIT_STUN_MAX, Math.max(HIT_STUN_MIN, damage / 60));
}

// A scatter weapon puts more of its pellets on a target the closer it is: all of them point blank, about
// two fifths at the edge of its reach. Other weapons land their one shot.
export function pelletsLanding(stats, distance) {
  if (!stats.pellets || stats.pellets <= 1) return 1;
  const share = 1 - 0.6 * Math.min(1, Math.max(0, distance) / stats.range);
  return Math.max(1, Math.round(stats.pellets * share));
}

export const BURN_TICK_SECONDS = 1;

/**
 * Burning: a unit set alight takes the flame's damage every second until it runs out or it is put out by
 * dying. Returns damage and disabled events.
 */
export function advanceBurning(units, deltaSeconds) {
  const events = [];
  for (const unit of units) {
    const fire = unit.burning;
    if (!fire) continue;
    if (unit.disabled || fire.left <= 0) {
      unit.burning = null;
      continue;
    }
    fire.left = Math.max(0, fire.left - deltaSeconds);
    fire.carry += fire.dps * deltaSeconds;
    const whole = Math.floor(fire.carry + 1e-9);
    if (whole <= 0) continue;
    fire.carry -= whole;
    unit.health = Math.max(0, unit.health - whole);
    unit.lastDamageType = "burn";
    events.push({ type: "burn", attackerId: fire.by, targetId: unit.id, amount: whole, remaining: unit.health });
    if (unit.health === 0) {
      unit.disabled = true;
      unit.path = [];
      unit.targetId = null;
      unit.burning = null;
      events.push({ type: "disabled", unitId: unit.id });
    }
  }
  return events;
}

// The recharge before a unit can fire again: the weapon's cooldown, scaled by the Arms upgrade and Intelligence.
function startCooldown(unit, stats) {
  unit.cooldownRemaining =
    stats.cooldown *
    armsCooldown(unit.upgrades) *
    intelligenceRecharge(unit.drugs);
}

// Apply a hit and report it; a unit reduced to zero health is disabled.
function strike(attacker, target, weapon, stats, events, context = null, hitCount = 1) {
  // A criminal who is attacked goes after whoever did it (a persuaded follower's owner, if it was a follower).
  if (target.side === "criminal" && (attacker.side === "team" || attacker.persuaded)) {
    target.hostileTo = attacker.persuaded ? attacker.persuadedBy : attacker.id;
  }
  const blocked = (target.shieldLeft ?? 0) > 0;
  const damage = stats.attack * hitCount;
  if (!blocked) {
    target.health = Math.max(0, target.health - damage);
    target.lastDamageType = stats.damageType ?? "bullet";
  }
  if (!blocked && target.health > 0 && !isVehicle(target)) target.hitStun = hitStunFor(damage);
  if (!blocked && stats.burn && target.health > 0) {
    target.burning = { left: stats.burn.seconds, dps: stats.burn.dps, by: attacker.id, carry: target.burning?.carry ?? 0 };
  }
  events.push({
    type: "damage",
    attackerId: attacker.id,
    targetId: target.id,
    amount: blocked ? 0 : damage,
    pellets: hitCount,
    damageType: stats.damageType ?? "bullet",
    blocked,
    remaining: target.health,
    outOfRounds: weapon !== null && weapon.charges === 0,
    weapon: weapon ? weapon.definition.name : null,
    sound: weapon?.definition.sound ?? "pistol",
  });
  if (target.health === 0) {
    target.disabled = true;
    target.path = [];
    target.targetId = null;
    events.push({ type: "disabled", unitId: target.id });
  } else if (context && isVehicle(target) && (attacker.side === "team" || attacker.persuaded)) {
    // Shoot at a car and its driver is thrown out (FreeSynd ejects the driver of a car the player shoots).
    const driver = ejectDriver(target, context.units, context.grid);
    if (driver) events.push({ type: "ejected", unitId: driver.id, vehicleId: target.id });
  }
}

export const HIT_RADIUS = 0.65;
export const RAY_STEP = 0.2;

// Accuracy (FreeSynd's formula). A shooter has an aim value: a base for the kind of person, plus the aim bonus of
// the upgrades fitted, plus 0.4 for every notch Perception is above (and minus for Adrenaline above) neutral. A
// weapon has an accuracy too; the shot may miss by up to AIM_CONE degrees times
// `accuracy x (1 - aim) + (1 - accuracy)`, a random share of it, so a better shooter and a better weapon miss less.
const BASE_AIM = Object.freeze({ operator: 0.5, "enemy-agent": 0.5, guard: 0.45, police: 0.4, civilian: 0.2, criminal: 0.2 });
export const AIM_CONE_DEGREES = 6;
export const WEAPON_ACCURACY_DEFAULT = 0.7;

export function aimValue(unit) {
  let aim = BASE_AIM[unit.definition?.role] ?? 0.4;
  aim += aimBonus(unit.upgrades);
  if (unit.drugs) aim += 0.4 * (drugMultiplier(unit.drugs, "perception") - drugMultiplier(unit.drugs, "adrenaline"));
  return Math.min(0.95, Math.max(0, aim));
}

/** The largest share of the cone a shot from this unit with this weapon may miss by (0 to 1). */
export function missFraction(unit, stats) {
  const accuracy = stats.accuracy ?? WEAPON_ACCURACY_DEFAULT;
  return accuracy * (1 - aimValue(unit)) + (1 - accuracy);
}

// How far off the aim this shot goes, in radians (positive or negative).
function aimError(unit, stats) {
  return (random() * 2 - 1) * missFraction(unit, stats) * ((AIM_CONE_DEGREES * Math.PI) / 180);
}

function rotateAbout(origin, point, angle) {
  const dx = point.x - origin.x;
  const dy = point.y - origin.y;
  return {
    x: origin.x + dx * Math.cos(angle) - dy * Math.sin(angle),
    y: origin.y + dx * Math.sin(angle) + dy * Math.cos(angle),
  };
}

/**
 * Trace a shot from the shooter toward `aim` (grid coordinates) for up to `range` tiles. It stops
 * at the first standing enemy within HIT_RADIUS of its path, or at the first tile that cannot be
 * walked on (a wall, a building, a closed gate). Returns the enemy hit (or null) and where the
 * shot ended.
 */
export function castShot(shooter, aim, units, grid, range, pierce = false) {
  const dx = aim.x - shooter.position.x;
  const dy = aim.y - shooter.position.y;
  const length = Math.hypot(dx, dy);
  if (length < 1e-6) return { target: null, hits: [], end: { ...shooter.position } };
  const direction = { x: dx / length, y: dy / length };
  const enemies = units.filter(
    (unit) => unit.side !== shooter.side && !unit.disabled && !unit.persuaded && !unit.inVehicle,
  );
  const hits = [];
  let last = { ...shooter.position };
  for (let travelled = RAY_STEP * 2; travelled <= range + 1e-9; travelled += RAY_STEP) {
    const point = {
      x: shooter.position.x + direction.x * travelled,
      y: shooter.position.y + direction.y * travelled,
    };
    const tile = grid[Math.round(point.y)]?.[Math.round(point.x)];
    if (!tile || !tile.walkable || (tile.door && !tile.door.open)) break;
    const struck = enemies.find(
      (enemy) =>
        !hits.includes(enemy) &&
        Math.hypot(enemy.position.x - point.x, enemy.position.y - point.y) <= (isVehicle(enemy) ? VEHICLE_HIT_RADIUS : HIT_RADIUS),
    );
    if (struck) {
      hits.push(struck);
      if (!pierce) return { target: struck, hits, end: { ...struck.position } };
    }
    last = point;
  }
  return { target: hits[0] ?? null, hits, end: pierce && hits.length > 0 ? { ...hits.at(-1).position } : last };
}

// A weapon with `pellets` fires them in an even fan of `spread` degrees around the aim; each enemy takes
// the damage once per pellet that reaches them. Other weapons fire one ray.
function castPellets(shooter, aim, units, grid, stats) {
  const pellets = stats.pellets ?? 1;
  if (pellets <= 1) {
    const single = castShot(shooter, aim, units, grid, stats.range, Boolean(stats.pierce));
    return { ...single, counts: new Map(single.hits.map((unit) => [unit, 1])) };
  }
  const dx = aim.x - shooter.position.x;
  const dy = aim.y - shooter.position.y;
  const base = Math.atan2(dy, dx);
  const half = ((stats.spread ?? 20) * Math.PI) / 360;
  const counts = new Map();
  let centre = null;
  for (let index = 0; index < pellets; index += 1) {
    const angle = base + (pellets === 1 ? 0 : (index / (pellets - 1) - 0.5) * 2 * half);
    const target = {
      x: shooter.position.x + Math.cos(angle) * stats.range,
      y: shooter.position.y + Math.sin(angle) * stats.range,
    };
    const ray = castShot(shooter, target, units, grid, stats.range, Boolean(stats.pierce));
    for (const hit of ray.hits) counts.set(hit, (counts.get(hit) ?? 0) + 1);
    if (index === Math.floor((pellets - 1) / 2)) centre = ray;
  }
  return { target: [...counts.keys()][0] ?? null, hits: [...counts.keys()], end: centre.end, counts };
}

/**
 * A shot fired by hand (right-click): the selected weapon, or the longest-ranged loaded one if none
 * is selected, fires in the direction of `aim`. It needs the weapon recharged and a round left, spends
 * the round and starts the recharge. Returns { fired, reason, events }; events use the same shapes as
 * automatic combat ("damage", "disabled") plus a "shot" event for a shot that hit nothing.
 */
export function fireManual(shooter, aim, units, grid, props = null) {
  if (shooter.disabled) return { fired: false, reason: "down", events: [] };
  if (shooter.cooldownRemaining > ARRIVAL_EPSILON) return { fired: false, reason: "recharging", events: [] };
  const { item: weapon, stats } = pickWeapon(shooter);
  if (stats.range <= 0) {
    const reason = pulseItems(shooter).length === 0 ? "no-weapon" : roundsLeft(shooter) === 0 ? "no-rounds" : "none-selected";
    return { fired: false, reason, events: [] };
  }
  const aimed = rotateAbout(shooter.position, aim, aimError(shooter, stats));
  const shot = castPellets(shooter, aimed, units, grid, stats);
  if (weapon && weapon.charges !== null) weapon.charges -= 1;
  startCooldown(shooter, stats);
  shooter.aimAt = { ...aim };
  const events = [];
  if (shot.hits.length > 0) {
    for (const target of shot.hits) strike(shooter, target, weapon, stats, events, { units, grid }, shot.counts.get(target) ?? 1);
  } else {
    events.push({
      type: "shot",
      attackerId: shooter.id,
      end: shot.end,
      outOfRounds: weapon !== null && weapon.charges === 0,
      weapon: weapon ? weapon.definition.name : null,
      sound: weapon?.definition.sound ?? "pistol",
    });
  }
  // Scenery along the line of fire takes the damage too (a tree ignores bullets; fire and beams do not).
  if (props && props.length > 0) {
    const reach = Math.hypot(shot.end.x - shooter.position.x, shot.end.y - shooter.position.y);
    const length = Math.hypot(aimed.x - shooter.position.x, aimed.y - shooter.position.y);
    if (length > 1e-6 && reach > 0) {
      const direction = { x: (aimed.x - shooter.position.x) / length, y: (aimed.y - shooter.position.y) / length };
      for (const prop of propsAlong(props, shooter.position, direction, reach)) {
        const change = damageProp(prop, stats.attack, stats.damageType ?? "bullet");
        if (change) events.push(change);
      }
    }
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
 * An explosion (or anything else sudden) at `source` sends civilians within CIVILIAN_SCOUT running away from it,
 * as far as they can get (up to 14 tiles). Returns how many started to flee. Guns do not need this: civilians
 * run from anyone with a weapon out (see advanceCivilian).
 */
export function startPanic(units, source, grid) {
  let fled = 0;
  for (const unit of units) {
    if (unit.side !== "civilian" || unit.disabled || unit.persuaded) continue;
    if (Math.hypot(unit.position.x - source.x, unit.position.y - source.y) > CIVILIAN_SCOUT * 1.5) continue;
    const panic = (unit.panic ??= { fleeing: false, scoutLeft: 0 });
    unit.path = [];
    if (runAwayFrom(unit, source, grid, [14, 9, 5])) {
      panic.fleeing = true;
      panic.scoutLeft = CIVILIAN_SCOUT_PERIOD;
      fled += 1;
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
export const GUARD_NEEDS_CIVILIANS = 3;

// What kind of person a unit is for persuading. Criminals and civilians are both "street people": either
// kind persuaded counts toward what guards and police need.
export function persuadeKind(unit) {
  if (unit.side === "civilian") return "civilian";
  if (unit.side === "criminal") return "criminal";
  if (unit.side === "police") return "police";
  if (unit.side === "opposition") return unit.definition?.role === "guard" ? "guard" : "opposition";
  return null;
}

export function newPersuasions() {
  return { civilian: 0, police: 0, guard: 0, opposition: 0 };
}

/**
 * Persuasion points (FreeSynd's persuasion total): everyone an operator wins over adds to a running total,
 * the tougher the person the more they add. Guards, police and enemy agents can be persuaded once the
 * total reaches what each needs; the Brain body upgrade (`upgrades.brain`, 0 to 3) lowers what is needed.
 * Civilians and criminals need nothing.
 */
export const PERSUADE_VALUE = Object.freeze({ civilian: 1, criminal: 1, guard: 3, police: 6, opposition: 12 });
export const PERSUADE_NEEDS = Object.freeze({ guard: GUARD_NEEDS_CIVILIANS, police: POLICE_NEEDS_CIVILIANS, opposition: 24 });
// What share of the base requirement is left with Brain upgrade tiers 0 to 3 (FreeSynd: 8, 4, 3, 2 for police).
export const BRAIN_NEEDS_SHARE = Object.freeze([1, 0.5, 0.375, 0.25]);

export function persuadePoints(agent) {
  const done = { ...newPersuasions(), ...(agent.persuasions ?? {}) };
  return Object.entries(done).reduce((sum, [kind, count]) => sum + count * (PERSUADE_VALUE[kind] ?? 0), 0);
}

export function persuadeNeeds(agent, kind) {
  const base = PERSUADE_NEEDS[kind] ?? 0;
  const tier = Math.min(3, Math.max(0, agent.upgrades?.brain ?? 0));
  return Math.max(0, Math.ceil(base * BRAIN_NEEDS_SHARE[tier] - 1e-9)) + 0;
}

/** Whether `agent` may persuade `target` now; otherwise what is still needed, if anything. */
export function persuadeCheck(agent, target) {
  const kind = persuadeKind(target);
  if (!kind || target.disabled || target.persuaded) return { ok: false, kind: null };
  if (target.hitStun > 0) return { ok: false, kind, needs: null }; // a person in the middle of being hit cannot be won over
  const needed = persuadeNeeds(agent, kind);
  const have = persuadePoints(agent);
  if (needed > have) {
    return { ok: false, kind, needs: `${needed - have} more persuasion points`, points: have, needed };
  }
  return { ok: true, kind };
}

// When an operator goes down, the people they persuaded follow another living operator, and take the
// persuasion count with them (FreeSynd hands a fallen agent's persuaded to the next agent).
function reassignFollowers(units, events) {
  for (const unit of units) {
    if (!unit.persuaded) continue;
    const owner = units.find((other) => other.id === unit.persuadedBy);
    if (owner && !owner.disabled) continue;
    const heir = units.find((other) => other.side === "team" && !other.disabled);
    if (!heir) continue;
    unit.persuadedBy = heir.id;
    events.push({ type: "reassigned", unitId: unit.id, agentId: heir.id });
  }
  for (const former of units) {
    if (former.side !== "team" || !former.disabled || !former.persuasions) continue;
    const heir = units.find((other) => other.side === "team" && !other.disabled);
    if (!heir) continue;
    heir.persuasions = { ...newPersuasions(), ...(heir.persuasions ?? {}) };
    for (const [kind, count] of Object.entries(former.persuasions)) heir.persuasions[kind] = (heir.persuasions[kind] ?? 0) + count;
    former.persuasions = newPersuasions();
  }
}

function persuasionItem(unit) {
  return (unit.equipment ?? []).find((item) => item.definition.action === "persuade" && item.charges !== 0) ?? null;
}

export function advancePersuasion(units, deltaSeconds, grid = null) {
  const events = [];
  reassignFollowers(units, events);
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
          Boolean(persuadeKind(other)) &&
          !other.disabled &&
          !other.persuaded &&
          !other.inVehicle &&
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
      target.panic = { fleeing: false, scoutLeft: 0 };
      target.hostileTo = null;
      target.police = null;
      if (item.charges !== null) item.charges -= 1;
      agent.persuadeCooldown = item.definition.effect.cooldown * intelligenceRecharge(agent.drugs);
      agent.persuasions = { ...newPersuasions(), ...(agent.persuasions ?? {}) };
      // Criminals count as civilians toward what guards and police need.
      const counted = check.kind === "criminal" ? "civilian" : check.kind;
      agent.persuasions[counted] += 1;
      events.push({
        type: "persuaded",
        agentId: agent.id,
        targetId: target.id,
        kind: check.kind,
        count: agent.persuasions[counted],
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

// A follower keeps close to its persuader, walking real streets to do it (FreeSynd's persuaded behaviour).
// When its owner has a weapon out and it has none, it goes and takes one from a fallen enemy nearby.
const FOLLOW_DISTANCE = 1.8;
const FOLLOW_SPEED_FACTOR = 1.5;

// A follower keeps its owner's pace (FreeSynd ties it to the owner's adrenaline): a quick owner drags a faster
// flock along, a loaded one a slower. Within 5 percent of normal they move at their usual follow speed.
export const FOLLOW_FAST = 1.5;
export const FOLLOW_SLOW = 0.6;
export function followPace(owner) {
  const pace = legsPace(owner.upgrades) * weightPace(owner) * adrenalineSpeed(owner.drugs);
  if (pace > 1.05) return FOLLOW_FAST;
  if (pace < 0.95) return FOLLOW_SLOW;
  return 1;
}
function advanceFollower(unit, byId, units, grid, deltaSeconds, now, events, drops) {
  const agent = byId.get(unit.persuadedBy);
  if (!agent || agent.disabled) {
    unit.path = [];
    return;
  }
  const wantsWeapon = gunOut(agent, now) && !pulseItems(unit).some(loaded);
  if (wantsWeapon) {
    unit.pickupCheck = (unit.pickupCheck ?? 0) - deltaSeconds;
    if (!unit.pickupTarget && unit.pickupCheck <= 0) {
      unit.pickupCheck = 1;
      const body = nearestOf(unit, drops.filter(lootableBody), FOLLOWER_WEAPON_SEARCH);
      unit.pickupTarget = body?.id ?? null;
    }
    const body = unit.pickupTarget ? drops.find((drop) => drop.id === unit.pickupTarget) : null;
    if (body && lootableBody(body)) {
      if (distanceBetween(unit, body) <= LOOT_RANGE) {
        const { taken } = lootBody(unit, body);
        unit.pickupTarget = null;
        if (taken.length > 0) events.push({ type: "pickup", unitId: unit.id, items: taken.map((item) => item.definition.name) });
      } else {
        const end = unit.path.at(-1);
        const goal = tileOf(body.position);
        if (!end || Math.abs(end.x - goal.x) + Math.abs(end.y - goal.y) > 1) unit.path = findPath(grid, tileOf(unit.position), goal);
        followPath(unit, deltaSeconds, FOLLOW_SPEED_FACTOR * followPace(agent));
        return;
      }
    } else {
      unit.pickupTarget = null;
    }
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
  followPath(unit, deltaSeconds, FOLLOW_SPEED_FACTOR * followPace(agent));
}

/** Shields: a raised shield stops every bullet aimed at its wearer until it runs out. */
export function advanceShields(units, deltaSeconds) {
  for (const unit of units) {
    if (unit.shieldLeft > 0) unit.shieldLeft = Math.max(0, unit.shieldLeft - deltaSeconds);
  }
}

export function shieldItem(unit) {
  return (unit.equipment ?? []).find((item) => item.definition.action === "shield" && item.charges !== 0) ?? null;
}

/** Raise the unit's shield for the item's duration, spending a use. Returns the item, or null. */
export function raiseShield(unit) {
  const item = shieldItem(unit);
  if (!item || unit.disabled || (unit.shieldLeft ?? 0) > 0) return null;
  unit.shieldLeft = item.definition.effect.duration;
  if (item.charges !== null) item.charges -= 1;
  return item;
}

/** Scanners: a switched-on scanner shows every enemy within its radius for its duration. */
export function scannerItem(unit) {
  return (unit.equipment ?? []).find((item) => item.definition.action === "scan" && item.charges !== 0) ?? null;
}

export function useScanner(unit) {
  const item = scannerItem(unit);
  if (!item || unit.disabled || (unit.scanLeft ?? 0) > 0) return null;
  unit.scanLeft = item.definition.effect.duration;
  unit.scanRadius = item.definition.effect.radius;
  if (item.charges !== null) item.charges -= 1;
  return item;
}

export function advanceScanners(units, deltaSeconds) {
  for (const unit of units) {
    if (unit.scanLeft > 0) unit.scanLeft = Math.max(0, unit.scanLeft - deltaSeconds);
  }
}

// The units shown by active scanners: anything not on the scanner's side and still up, within its radius.
export function scannedUnits(units) {
  const scanners = units.filter((unit) => unit.scanLeft > 0 && !unit.disabled);
  if (scanners.length === 0) return [];
  return units.filter(
    (unit) =>
      !unit.disabled &&
      unit.side !== "team" &&
      scanners.some(
        (scanner) => Math.hypot(scanner.position.x - unit.position.x, scanner.position.y - unit.position.y) <= scanner.scanRadius,
      ),
  );
}
