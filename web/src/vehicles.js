// SPDX-License-Identifier: GPL-2.0-or-later

import { blastDamage } from "./bombs.js";
import { findPath, hasLineOfSight } from "./engine.js";

// Vehicles are units with the role "vehicle" (side "vehicle"), so they can be shot, caught in blasts, drawn in
// depth order and saved like anyone else. Mapped from FreeSynd's vehicle model: cars are driven along the roads
// by an AI driver, can carry passengers, blow up when destroyed (dropping their passengers and hurting everyone
// nearby), eject a driver who is shot at by the squad, and can be taken over and driven by the squad.
export const ROAD_SURFACES = new Set(["street", "signal-grate"]);
export const VEHICLE_HIT_RADIUS = 1.0;
export const ENTER_RANGE = 2.4;
export const WRECK_SECONDS = 12;

export function isVehicle(unit) {
  return unit?.definition?.role === "vehicle";
}

// The unit definition a vehicle placement gets: stats a unit understands, plus the vehicle's own data.
export function vehicleDefinition(vehicle) {
  return {
    id: vehicle.id,
    name: vehicle.name,
    role: "vehicle",
    kind: vehicle.kind,
    stats: {
      vitality: vehicle.stats.health,
      speed: vehicle.stats.speed,
      awareness: 0,
      attack: 0,
      range: 1,
      cooldown: 1,
    },
    appearance: { ...vehicle.appearance, shape: "circle", marker: "V" },
    vehicle,
  };
}

// The part of a vehicle unit that is not a normal unit's: its route, who is inside, and its wreck timer.
export function newVehicleState(driverId = null) {
  return {
    route: null,
    driverId,
    occupantIds: driverId ? [driverId] : [],
    controlledBy: null,
    exploded: false,
    wreckLeft: 0,
    heading: { x: 1, y: 0 },
  };
}

// Cars stay on the roads: a copy of the grid where only road tiles can be walked.
export function createRoadGrid(grid) {
  const roads = grid.map((row) =>
    row.map((tile) => (tile ? { ...tile, walkable: tile.walkable && !tile.gate && ROAD_SURFACES.has(tile.surface) } : tile)),
  );
  roads.crossings = findCrossings(grid);
  return roads;
}

const tileOf = (position) => ({ x: Math.round(position.x), y: Math.round(position.y) });

// ---- Traffic signals
// Where the full-length streets cross, a signal runs a 20 second cycle: east-west green for 8 seconds, all red for 2,
// north-south green for 8, all red for 2 (each crossing starts at its own point in the cycle). An AI-driven car stops
// short of a crossing whose light is red for its way and goes on when it turns green. Cars already in the crossing
// clear it, and a car the squad drives obeys nothing.
export const SIGNAL_CYCLE = 20;
export const STOP_DISTANCE = 2.2;

const runs = (flags) => {
  const found = [];
  let start = null;
  flags.forEach((flag, index) => {
    if (flag && start === null) start = index;
    if ((!flag || index === flags.length - 1) && start !== null) {
      const end = flag && index === flags.length - 1 ? index + 1 : index;
      found.push({ start, length: end - start });
      start = null;
    }
  });
  return found;
};

/** The crossings of a grid: rectangles where a full-height street column meets a full-width street row. */
export function findCrossings(grid) {
  if (!grid[0]) return [];
  const columns = runs(grid[0].map((tile) => Boolean(tile && String(tile.id ?? "").startsWith("street-column"))));
  const rows = runs(grid.map((row) => Boolean(row[0] && String(row[0].id ?? "").startsWith("street-row"))));
  const crossings = [];
  for (const row of rows) {
    for (const column of columns) {
      const id = `crossing-${column.start}-${row.start}`;
      crossings.push({ id, x: column.start, y: row.start, width: column.length, height: row.length });
    }
  }
  return crossings.map((crossing, index) => ({ ...crossing, offset: (index * 7) % SIGNAL_CYCLE }));
}

/** "ew" or "ns" while that way has green, "red" in the gaps. */
export function signalAt(crossing, time) {
  const phase = (((time + crossing.offset) % SIGNAL_CYCLE) + SIGNAL_CYCLE) % SIGNAL_CYCLE;
  if (phase < 8) return "ew";
  if (phase < 10) return "red";
  if (phase < 18) return "ns";
  return "red";
}

/** Must this car stop for a signal? It must when it is just short of a crossing that is red for the way it is heading. */
export function stoppedBySignal(vehicle, crossings, time) {
  const heading = vehicle.vehicle.heading;
  if (!heading || !crossings || crossings.length === 0) return false;
  const eastWest = Math.abs(heading.x) >= Math.abs(heading.y);
  const { x, y } = vehicle.position;
  for (const crossing of crossings) {
    const green = signalAt(crossing, time);
    if (green === (eastWest ? "ew" : "ns")) continue;
    if (eastWest) {
      if (y < crossing.y - 0.5 || y > crossing.y + crossing.height - 0.5) continue;
      const gap = heading.x > 0 ? crossing.x - 0.5 - x : x - (crossing.x + crossing.width - 0.5);
      if (gap >= 0 && gap <= STOP_DISTANCE) return true;
    } else {
      if (x < crossing.x - 0.5 || x > crossing.x + crossing.width - 0.5) continue;
      const gap = heading.y > 0 ? crossing.y - 0.5 - y : y - (crossing.y + crossing.height - 0.5);
      if (gap >= 0 && gap <= STOP_DISTANCE) return true;
    }
  }
  return false;
}

// The nearest road tile to a point (looking out a few tiles), or null.
export function nearestRoadTile(roadGrid, position, reach = 6) {
  const origin = tileOf(position);
  let best = null;
  let bestDistance = Infinity;
  for (let dy = -reach; dy <= reach; dy += 1) {
    for (let dx = -reach; dx <= reach; dx += 1) {
      const tile = roadGrid[origin.y + dy]?.[origin.x + dx];
      if (!tile?.walkable) continue;
      const distance = Math.hypot(dx, dy);
      if (distance < bestDistance) {
        best = { x: origin.x + dx, y: origin.y + dy };
        bestDistance = distance;
      }
    }
  }
  return best;
}

function occupants(vehicle, units) {
  return vehicle.vehicle.occupantIds.map((id) => units.find((unit) => unit.id === id)).filter(Boolean);
}

// A walkable tile beside the vehicle where someone can step out (a pavement if there is one, else the road).
function spotBeside(vehicle, grid, taken) {
  const origin = tileOf(vehicle.position);
  const offsets = [];
  for (let reach = 1; reach <= 3; reach += 1) {
    const ring = [[reach, 0], [-reach, 0], [0, reach], [0, -reach], [reach, reach], [-reach, -reach], [reach, -reach], [-reach, reach]];
    for (const [dx, dy] of ring) {
      offsets.push({ x: origin.x + dx, y: origin.y + dy });
    }
  }
  const isTaken = (spot) => taken.some((other) => other.x === spot.x && other.y === spot.y);
  const free = offsets.filter((spot) => grid[spot.y]?.[spot.x]?.walkable && !isTaken(spot));
  // Never step out into a pocket the car cannot be reached from (a gap behind a fence or a wall): someone put there
  // would be stuck. A pavement is preferred to the road when both connect.
  const connected = (spot) => findPath(grid, spot, origin).length > 0;
  const onRoad = (spot) => grid[spot.y][spot.x].surface === "street";
  const ordered = [...free.filter((spot) => !onRoad(spot)), ...free.filter(onRoad)];
  return ordered.find(connected) ?? origin;
}

// Everyone inside steps out around the vehicle. Returns who got out.
export function ejectAll(vehicle, units, grid) {
  const taken = [];
  const out = occupants(vehicle, units);
  for (const unit of out) {
    const spot = spotBeside(vehicle, grid, taken);
    taken.push(spot);
    unit.position = { ...spot };
    unit.path = [];
    unit.inVehicle = null;
  }
  vehicle.vehicle.occupantIds = [];
  vehicle.vehicle.driverId = null;
  vehicle.vehicle.controlledBy = null;
  vehicle.path = [];
  return out;
}

/**
 * A vehicle's driver is thrown out because the squad shot at the car (or took it). Returns the driver, or null.
 * The driver reacts by fleeing from the vehicle if a civilian; police and the rest carry on as themselves.
 */
export function ejectDriver(vehicle, units, grid) {
  const state = vehicle.vehicle;
  const driver = state.driverId ? units.find((unit) => unit.id === state.driverId) : null;
  if (!driver || driver.persuaded || !driver.inVehicle) return null;
  const spot = spotBeside(vehicle, grid, []);
  driver.position = { ...spot };
  driver.path = [];
  driver.inVehicle = null;
  driver.fleeFrom = { x: vehicle.position.x, y: vehicle.position.y };
  state.occupantIds = state.occupantIds.filter((id) => id !== driver.id);
  state.driverId = null;
  vehicle.path = [];
  return driver;
}

// FreeSynd puts no limit on how many agents a vehicle carries (`addPassenger` never refuses), so the squad can all ride
// together whatever the vehicle's `seats`; seats are only a figure for vehicles driven by the city.
export function seatsLeft(vehicle) {
  return Math.max(0, vehicle.definition.vehicle.stats.seats - vehicle.vehicle.occupantIds.length);
}

/** Whether an operator is close enough to a working vehicle to get in. */
export function canEnter(operator, vehicle) {
  if (!isVehicle(vehicle) || vehicle.disabled || operator.disabled || operator.inVehicle) return false;
  return Math.hypot(operator.position.x - vehicle.position.x, operator.position.y - vehicle.position.y) <= ENTER_RANGE;
}

/**
 * The squad takes a vehicle. The first operator in drives; any AI driver is thrown out (and reacts), the other
 * operators and anyone persuaded who is near get in as passengers (there is no seat limit). Returns who got in
 * and who was thrown out.
 */
export function enterVehicle(vehicle, operators, units, grid) {
  const state = vehicle.vehicle;
  const thrownOut = state.controlledBy ? null : ejectDriver(vehicle, units, grid);
  const driver = operators.find((operator) => canEnter(operator, vehicle)) ?? null;
  if (!driver) return { entered: [], thrownOut };
  const entered = [];
  const board = (unit) => {
    if (unit.inVehicle || unit.disabled) return;
    unit.inVehicle = vehicle.id;
    unit.path = [];
    unit.position = { ...vehicle.position };
    state.occupantIds.push(unit.id);
    entered.push(unit);
  };
  board(driver);
  // The first agent in drives; those who get in after them ride.
  if (!state.controlledBy) {
    state.driverId = driver.id;
    state.controlledBy = driver.id;
  }
  const near = (unit) => Math.hypot(unit.position.x - vehicle.position.x, unit.position.y - vehicle.position.y) <= ENTER_RANGE * 2.5;
  for (const other of operators) if (other !== driver && near(other)) board(other);
  for (const unit of units) {
    const owned = unit.persuaded && entered.some((member) => member.id === unit.persuadedBy);
    if (owned && near(unit)) board(unit);
  }
  vehicle.path = [];
  return { entered, thrownOut };
}

/** Everyone inside steps out and the car is left where it stands. Returns who got out. */
export function leaveVehicle(vehicle, units, grid) {
  return ejectAll(vehicle, units, grid);
}

/** Order a controlled vehicle to a point: it drives to the nearest road tile. Returns whether it has a route. */
export function driveTo(vehicle, point, roadGrid) {
  const goal = nearestRoadTile(roadGrid, point);
  if (!goal) return false;
  const path = findPath(roadGrid, tileOf(vehicle.position), goal);
  vehicle.path = path;
  return path.length > 0;
}

function moveAlongPath(vehicle, seconds, speed) {
  let remaining = seconds * speed;
  while (remaining > 0 && vehicle.path.length > 0) {
    const target = vehicle.path[0];
    const dx = target.x - vehicle.position.x;
    const dy = target.y - vehicle.position.y;
    const distance = Math.hypot(dx, dy);
    if (distance > 0.001) vehicle.vehicle.heading = { x: dx / distance, y: dy / distance };
    if (distance <= remaining + 1e-6) {
      vehicle.position = { x: target.x, y: target.y };
      vehicle.path.shift();
      remaining -= distance;
    } else {
      vehicle.position = { x: vehicle.position.x + (dx / distance) * remaining, y: vehicle.position.y + (dy / distance) * remaining };
      remaining = 0;
    }
  }
}

// The AI driver follows the route: on to the next waypoint along the roads, forever.
function driveRoute(vehicle, seconds, roadGrid) {
  const state = vehicle.vehicle;
  if (!state.route || state.route.route.length === 0) return;
  if (vehicle.path.length === 0) {
    const waypoint = state.route.route[state.route.index % state.route.route.length];
    vehicle.path = findPath(roadGrid, tileOf(vehicle.position), waypoint);
    state.route.index = (state.route.index + 1) % state.route.route.length;
  }
  moveAlongPath(vehicle, seconds, vehicle.definition.stats.speed);
}

// Traffic does not drive through itself: an AI-driven car waits when a person on foot or another vehicle is close ahead of it, unless that
// one has to wait for it. Parked cars are ignored. Wrecks that are still burning and cars the squad drives always have
// the right of way; between two ordinary cars the one with the lower id goes first, so no queue can lock up.
export const FOLLOW_GAP = 1.9;
export const PEDESTRIAN_GAP = 1.8;
export const PEDESTRIAN_WIDTH = 0.85;
export function blockedAhead(vehicle, units) {
  const heading = vehicle.vehicle.heading;
  if (!heading) return false;
  // The city's cars never run anyone down: they wait for people on foot to get out of the way.
  const person = units.some((other) => {
    if (other === vehicle || isVehicle(other) || other.disabled || other.inVehicle) return false;
    const dx = other.position.x - vehicle.position.x;
    const dy = other.position.y - vehicle.position.y;
    const ahead = dx * heading.x + dy * heading.y;
    const aside = Math.abs(dx * heading.y - dy * heading.x);
    return ahead > 0 && ahead <= PEDESTRIAN_GAP && aside <= PEDESTRIAN_WIDTH;
  });
  if (person) return true;
  return units.some((other) => {
    if (other === vehicle || !isVehicle(other)) return false;
    if (other.disabled && !(other.vehicle.wreckLeft > 0)) return false;
    // Parked cars (nobody at the wheel) are driven around rather than queued behind.
    if (!other.disabled && !other.vehicle.driverId && !other.vehicle.controlledBy) return false;
    const dx = other.position.x - vehicle.position.x;
    const dy = other.position.y - vehicle.position.y;
    const distance = Math.hypot(dx, dy);
    if (distance === 0 || distance > FOLLOW_GAP) return false;
    if ((dx * heading.x + dy * heading.y) / distance < 0.75) return false;
    return other.disabled || Boolean(other.vehicle.controlledBy) || other.id < vehicle.id;
  });
}

// A vehicle driven by the squad hurts anyone on foot it runs into (FreeSynd: the city's own cars never run anyone
// down): damage grows with its speed, and a person hit is thrown aside and flinches. Nobody is hit twice in under a second.
export const RUNOVER_RADIUS = 0.9;
export const RUNOVER_COOLDOWN = 1;
export function runOverDamage(speed) {
  return Math.round(speed * 5);
}

function runOver(vehicle, units, seconds) {
  const events = [];
  if (vehicle.path.length === 0 || !vehicle.vehicle.controlledBy) return events;
  const amount = runOverDamage(vehicle.definition.stats.speed);
  for (const unit of units) {
    if (unit === vehicle || isVehicle(unit) || unit.disabled || unit.inVehicle) continue;
    unit.runOverLeft = Math.max(0, (unit.runOverLeft ?? 0) - seconds);
    if (unit.runOverLeft > 0) continue;
    if (Math.hypot(unit.position.x - vehicle.position.x, unit.position.y - vehicle.position.y) > RUNOVER_RADIUS) continue;
    unit.runOverLeft = RUNOVER_COOLDOWN;
    unit.health = Math.max(0, unit.health - amount);
    unit.hitStun = 0.4;
    const down = unit.health === 0;
    if (down) {
      unit.disabled = true;
      unit.path = [];
      unit.targetId = null;
    }
    events.push({ type: "runover", vehicleId: vehicle.id, unitId: unit.id, amount, remaining: unit.health, disabled: down });
  }
  return events;
}

/**
 * Move every vehicle: driven ones along the player's orders or their AI route, occupants carried with them.
 * A vehicle that has just been destroyed drops its occupants and explodes, hurting everyone near it (and setting
 * off other vehicles). Returns "blast" events listing who was hurt, in the same shape as a time bomb's.
 */
export function advanceVehicles(units, seconds, roadGrid, grid, time = 0) {
  const events = [];
  for (const vehicle of units) {
    if (!isVehicle(vehicle)) continue;
    const state = vehicle.vehicle;
    if (vehicle.disabled) {
      if (!state.exploded) {
        state.exploded = true;
        state.wreckLeft = WRECK_SECONDS;
        const out = ejectAll(vehicle, units, grid);
        const { blastRadius, blastDamage: damage } = vehicle.definition.vehicle.stats;
        const hits = [];
        for (const unit of units) {
          if (unit === vehicle || unit.disabled || unit.inVehicle) continue;
          const distance = Math.hypot(unit.position.x - vehicle.position.x, unit.position.y - vehicle.position.y);
          const amount = blastDamage(damage, distance, blastRadius);
          if (amount === 0 || !hasLineOfSight(grid, vehicle.position, unit.position)) continue;
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
        events.push({
          type: "blast",
          at: { ...vehicle.position },
          radius: blastRadius,
          plantedBy: null,
          source: vehicle.id,
          hits,
          ejected: out.map((unit) => unit.id),
        });
      } else {
        state.wreckLeft = Math.max(0, state.wreckLeft - seconds);
      }
      continue;
    }
    const driver = state.driverId ? units.find((unit) => unit.id === state.driverId) : null;
    if (state.controlledBy) moveAlongPath(vehicle, seconds, vehicle.definition.stats.speed);
    else if (driver && !driver.disabled && !blockedAhead(vehicle, units) && !stoppedBySignal(vehicle, roadGrid.crossings, time)) {
      driveRoute(vehicle, seconds, roadGrid);
    }
    for (const id of state.occupantIds) {
      const unit = units.find((other) => other.id === id);
      if (unit) unit.position = { ...vehicle.position };
    }
    events.push(...runOver(vehicle, units, seconds));
  }
  return events;
}

/** A vehicle the squad is driving (what enemies shoot at when the operators are inside). */
export function isSquadVehicle(unit) {
  return isVehicle(unit) && !unit.disabled && Boolean(unit.vehicle.controlledBy);
}
