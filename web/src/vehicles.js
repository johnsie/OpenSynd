// SPDX-License-Identifier: GPL-2.0-or-later

import { blastDamage } from "./bombs.js";
import { findPath, hasLineOfSight } from "./engine.js";

// Vehicles are units with the role "vehicle" (side "vehicle"), so they can be shot, caught in blasts, drawn in
// depth order and saved like anyone else. Mapped from FreeSynd's vehicle model: cars are driven along the roads
// by an AI driver, can carry passengers, blow up when destroyed (dropping their passengers and hurting everyone
// nearby), eject a driver who is shot at by the squad, and can be taken over and driven by the squad.
export const ROAD_SURFACES = new Set(["street", "signal-grate", "rail"]);
export const VEHICLE_HIT_RADIUS = 1.0;
export const ENTER_RANGE = 2.4;
export const WRECK_SECONDS = 12;

export function isVehicle(unit) {
  return unit?.definition?.role === "vehicle";
}

export function isTrain(unit) {
  return isVehicle(unit) && unit.definition.kind === "train";
}

// The unit definition a vehicle placement gets: stats a unit understands, plus the vehicle's own data.
export function vehicleDefinition(vehicle) {
  return {
    id: vehicle.id,
    name: vehicle.name,
    role: "vehicle",
    kind: vehicle.kind,
    carriages: vehicle.carriages ?? 0,
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
    continueDriving: false,
    train: null,
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
  // A train can be boarded only while it stands at a station, from the platform beside any of its carriages.
  if (isTrain(vehicle)) {
    const train = vehicle.vehicle.train;
    if (!train || train.waiting <= 0 || operator.disabled || operator.inVehicle) return false;
    return train.body.some((part) => Math.hypot(operator.position.x - part.x, operator.position.y - part.y) <= ENTER_RANGE);
  }
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
  if (isTrain(vehicle)) return boardTrain(vehicle, operators, units);
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

/** Everyone inside steps out and the car is left where it stands. Returns who got out. (A train lets its riders out on the platform.) */
export function leaveVehicle(vehicle, units, grid) {
  if (isTrain(vehicle)) return vehicle.vehicle.train?.waiting > 0 ? dropTrainPassengers(vehicle, units, grid) : [];
  return ejectAll(vehicle, units, grid);
}

const roadHeading = (heading) => Math.abs(heading.x) >= Math.abs(heading.y)
  ? { x: Math.sign(heading.x || 1), y: 0 }
  : { x: 0, y: Math.sign(heading.y || 1) };

// The road ahead to its end. This is also where a car may turn round; it never reverses in the middle of a road.
function roadAhead(vehicle, roadGrid, heading = roadHeading(vehicle.vehicle.heading)) {
  const path = [];
  let at = tileOf(vehicle.position);
  while (roadGrid[at.y + heading.y]?.[at.x + heading.x]?.walkable) {
    at = { x: at.x + heading.x, y: at.y + heading.y };
    path.push(at);
  }
  return path;
}

// If the shortest route begins by turning or reversing, carry on to the end of this road before taking that route.
function routeWithoutMidRoadTurn(vehicle, goal, roadGrid) {
  const start = tileOf(vehicle.position);
  const direct = findPath(roadGrid, start, goal);
  if (direct.length === 0) return [];
  const heading = roadHeading(vehicle.vehicle.heading);
  const first = direct[0];
  const beginsStraight = (first.x - start.x) * heading.x + (first.y - start.y) * heading.y > 0;
  if (beginsStraight) return direct;
  const onward = roadAhead(vehicle, roadGrid, heading);
  if (onward.length === 0) return direct; // already at the road end: turning here is allowed
  const afterTurn = findPath(roadGrid, onward.at(-1), goal);
  return afterTurn.length > 0 || onward.at(-1).x === goal.x && onward.at(-1).y === goal.y
    ? [...onward, ...afterTurn]
    : [];
}

/**
 * Order a controlled vehicle to a point: it drives to the nearest road tile. A turn starts at the end of the road, never beneath
 * the car. If the point cannot be reached, its present route is kept and it carries on along the road instead of stopping.
 */
export function driveTo(vehicle, point, roadGrid) {
  const goal = nearestRoadTile(roadGrid, point, 12);
  const centrePath = goal ? routeWithoutMidRoadTurn(vehicle, goal, roadGrid) : [];
  const path = keepLeft(centrePath, roadGrid, tileOf(vehicle.position));
  if (path.length > 0) {
    vehicle.path = path;
    vehicle.vehicle.continueDriving = false;
    return true;
  }
  vehicle.vehicle.continueDriving = true;
  if (vehicle.path.length === 0) {
    vehicle.path = keepLeft(roadAhead(vehicle, roadGrid), roadGrid, tileOf(vehicle.position));
    if (vehicle.path.length === 0) {
      const heading = roadHeading(vehicle.vehicle.heading);
      vehicle.path = keepLeft(roadAhead(vehicle, roadGrid, { x: -heading.x, y: -heading.y }), roadGrid, tileOf(vehicle.position));
    }
  }
  return vehicle.path.length > 0;
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
/**
 * Keep to the left lane: the way a car goes decides which side of the street it
 * uses, one tile to the left of the line it is following whenever that is road too. Cars passing in opposite directions on a
 * wide street are in different lanes, so they never drive through each other. Returns a new path.
 */
export function keepLeft(path, roadGrid, from = null) {
  const lane = [];
  let before = from;
  for (let index = 0; index < path.length; index += 1) {
    const node = path[index];
    const heading = before
      ? { x: Math.sign(node.x - before.x), y: Math.sign(node.y - before.y) }
      : path[index + 1]
        ? { x: Math.sign(path[index + 1].x - node.x), y: Math.sign(path[index + 1].y - node.y) }
        : { x: 0, y: 0 };
    const side = { x: heading.y, y: -heading.x };
    const shifted = { x: node.x + side.x, y: node.y + side.y };
    const usable = (side.x !== 0 || side.y !== 0) && roadGrid[shifted.y]?.[shifted.x]?.walkable;
    lane.push(usable ? shifted : { x: node.x, y: node.y });
    before = node;
  }
  return lane;
}

// Kept as an import-compatible alias for extensions; traffic itself is left-hand.
export const keepRight = keepLeft;

function driveRoute(vehicle, seconds, roadGrid) {
  const state = vehicle.vehicle;
  if (!state.route || state.route.route.length === 0) return;
  if (vehicle.path.length === 0) {
    // The route is the street's centre line. The lane is that line moved one tile to the left of the way it is going, worked out
    // from the line itself (the tile this leg starts from, remembered as `from`), never from where the car happens to be: a car
    // already in its lane would otherwise be moved over again and weave from side to side down a straight street.
    const { route } = state.route;
    const at = state.route.index % route.length;
    const from = state.route.from ?? tileOf(vehicle.position);
    vehicle.path = keepLeft(findPath(roadGrid, from, route[at]), roadGrid, from);
    state.route.from = route[at];
    state.route.index = (at + 1) % route.length;
  }
  moveAlongPath(vehicle, seconds, vehicle.definition.stats.speed);
}

// Traffic does not drive through itself: an AI-driven car waits when a person on foot or another vehicle is close ahead of it, unless that
// one has to wait for it. Parked cars are ignored. Wrecks that are still burning and cars the squad drives always have
// the right of way; between two ordinary cars the one with the lower id goes first, so no queue can lock up.
export const FOLLOW_GAP = 1.9;
export const PEDESTRIAN_GAP = 1.8;
export const PEDESTRIAN_WIDTH = 0.85;
export const LANE_WIDTH = 0.8;
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
  // A train always has the right of way: cars wait for any of its carriages close ahead in their lane.
  const train = units.some((other) => {
    if (!isTrain(other) || !other.vehicle.train) return false;
    return other.vehicle.train.body.some((part) => {
      const dx = part.x - vehicle.position.x;
      const dy = part.y - vehicle.position.y;
      const ahead = dx * heading.x + dy * heading.y;
      const aside = Math.abs(dx * heading.y - dy * heading.x);
      return ahead > 0 && ahead <= FOLLOW_GAP + 0.6 && aside <= 1.2;
    });
  });
  if (train) return true;
  return units.some((other) => {
    if (other === vehicle || !isVehicle(other) || isTrain(other)) return false;
    if (other.disabled && !(other.vehicle.wreckLeft > 0)) return false;
    // Parked cars (nobody at the wheel) are driven around rather than queued behind.
    if (!other.disabled && !other.vehicle.driverId && !other.vehicle.controlledBy) return false;
    const dx = other.position.x - vehicle.position.x;
    const dy = other.position.y - vehicle.position.y;
    const distance = Math.hypot(dx, dy);
    if (distance === 0 || distance > FOLLOW_GAP) return false;
    if ((dx * heading.x + dy * heading.y) / distance < 0.75) return false;
    // A car in the next lane is not in the way.
    if (Math.abs(dx * heading.y - dy * heading.x) > LANE_WIDTH) return false;
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

function runOver(vehicle, units, seconds, moving) {
  const events = [];
  if (!moving || !vehicle.vehicle.controlledBy) return events;
  for (const unit of units) {
    if (unit === vehicle || isVehicle(unit) || unit.disabled || unit.inVehicle) continue;
    unit.runOverLeft = Math.max(0, (unit.runOverLeft ?? 0) - seconds);
    if (unit.runOverLeft > 0) continue;
    if (Math.hypot(unit.position.x - vehicle.position.x, unit.position.y - vehicle.position.y) > RUNOVER_RADIUS) continue;
    const amount = Math.max(unit.health, runOverDamage(vehicle.definition.stats.speed));
    unit.runOverLeft = RUNOVER_COOLDOWN;
    unit.health = Math.max(0, unit.health - amount);
    unit.hitStun = 0.4;
    unit.lastDamageType = "collision";
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

// ---- Trains
// A train runs on rails between its stations (the head stops on each stop in turn, waits there, and goes on; at the end of the
// line it turns round: the carriages become the front, in the same places). It is not driven by anyone and nothing stops it.
// A train is five pieces (an engine and four carriages) on a track one tile wide, as in FreeSynd; but our people and cars are drawn
// larger against the tile than FreeSynd's, so each piece is as long as one of our cars rather than one raw tile.
export const TRAIN_SPACING = 2.3;
export const TRAIN_STOP_SECONDS = 6;

/** Set a train up on its line: the engine on the first stop and the carriages standing in a row behind it. */
export function startTrain(vehicle, stops, carriages) {
  const first = stops[0];
  const next = stops[1] ?? first;
  const length = Math.hypot(next.x - first.x, next.y - first.y) || 1;
  const heading = { x: (next.x - first.x) / length, y: (next.y - first.y) / length };
  const body = [{ x: first.x, y: first.y }];
  for (let index = 1; index <= carriages; index += 1) {
    body.push({ x: first.x - heading.x * TRAIN_SPACING * index, y: first.y - heading.y * TRAIN_SPACING * index });
  }
  vehicle.position = { ...body[0] };
  vehicle.vehicle.heading = heading;
  vehicle.vehicle.train = {
    stops: stops.map((stop) => ({ x: stop.x, y: stop.y, wait: stop.wait ?? TRAIN_STOP_SECONDS })),
    index: stops.length > 1 ? 1 : 0,
    direction: 1,
    waiting: 0,
    body,
    arrivals: 0,
  };
}

/** Passengers get on a train waiting at a station: the operators near it, and anyone persuaded who follows them. Nobody drives it. */
function boardTrain(vehicle, operators, units) {
  const train = vehicle.vehicle;
  const entered = [];
  const board = (unit) => {
    if (unit.inVehicle || unit.disabled) return;
    unit.inVehicle = vehicle.id;
    unit.path = [];
    unit.position = { ...vehicle.position };
    train.occupantIds.push(unit.id);
    entered.push(unit);
  };
  for (const operator of operators) if (canEnter(operator, vehicle)) board(operator);
  for (const unit of units) {
    const owned = unit.persuaded && entered.some((member) => member.id === unit.persuadedBy);
    if (owned && canEnter(unit, vehicle)) board(unit);
  }
  return { entered, thrownOut: null };
}

/**
 * The train is at a station: everyone riding steps out onto the nearest walkable ground around its middle carriage (the
 * platform; FreeSynd drops them at the middle of the train and has them walk to the station). Returns who got out.
 */
export function dropTrainPassengers(vehicle, units, grid) {
  const train = vehicle.vehicle.train;
  if (!train) return [];
  const middle = train.body[Math.floor(train.body.length / 2)];
  const spots = [];
  for (let dy = -5; dy <= 5; dy += 1) {
    for (let dx = -6; dx <= 6; dx += 1) {
      const x = Math.round(middle.x) + dx;
      const y = Math.round(middle.y) + dy;
      const tile = grid?.[y]?.[x];
      // A platform is where passengers belong; any other walkable ground only if there is none.
      if (tile?.walkable) spots.push({ x, y, gap: Math.hypot(x - middle.x, y - middle.y) + (tile.surface === "platform" ? 0 : 20) });
    }
  }
  spots.sort((a, b) => a.gap - b.gap);
  const out = [];
  const state = vehicle.vehicle;
  for (const id of [...state.occupantIds]) {
    const unit = units.find((item) => item.id === id);
    state.occupantIds = state.occupantIds.filter((other) => other !== id);
    if (!unit || unit.inVehicle !== vehicle.id) continue;
    const spot = spots.shift() ?? { x: Math.round(middle.x), y: Math.round(middle.y) };
    unit.inVehicle = null;
    unit.position = { x: spot.x, y: spot.y };
    unit.path = [];
    out.push(unit);
  }
  return out;
}

/** Where the carriages are, engine first: [{ x, y, heading }]. */
export function trainCars(vehicle) {
  const train = vehicle.vehicle.train;
  if (!train) return [{ ...vehicle.position, heading: vehicle.vehicle.heading }];
  return train.body.map((point, index) => {
    const front = index === 0 ? null : train.body[index - 1];
    const heading = front
      ? { x: front.x - point.x, y: front.y - point.y }
      : vehicle.vehicle.heading;
    const length = Math.hypot(heading.x, heading.y) || 1;
    return { x: point.x, y: point.y, heading: { x: heading.x / length, y: heading.y / length } };
  });
}

/** After a saved game puts the engine back, stand the carriages in a row behind it again. */
export function settleTrain(vehicle) {
  const train = vehicle.vehicle.train;
  if (!train) return;
  const heading = vehicle.vehicle.heading;
  train.body.forEach((point, index) => {
    point.x = vehicle.position.x - heading.x * TRAIN_SPACING * index;
    point.y = vehicle.position.y - heading.y * TRAIN_SPACING * index;
  });
}

function advanceTrain(vehicle, seconds) {
  const train = vehicle.vehicle.train;
  if (!train) return null;
  let event = null;
  if (train.waiting > 0) {
    train.waiting = Math.max(0, train.waiting - seconds);
    if (train.waiting > 0) return null;
    event = { type: "train-leaves", vehicleId: vehicle.id, at: { ...vehicle.position } };
  }
  const target = train.stops[train.index];
  const head = train.body[0];
  const dx = target.x - head.x;
  const dy = target.y - head.y;
  const distance = Math.hypot(dx, dy);
  const step = vehicle.definition.stats.speed * seconds;
  if (distance > 1e-6) vehicle.vehicle.heading = { x: dx / distance, y: dy / distance };
  const arrived = distance <= step + 1e-6;
  if (arrived) {
    head.x = target.x;
    head.y = target.y;
  } else {
    head.x += (dx / distance) * step;
    head.y += (dy / distance) * step;
  }
  // Each carriage follows the one in front, keeping its distance.
  for (let index = 1; index < train.body.length; index += 1) {
    const front = train.body[index - 1];
    const car = train.body[index];
    const gap = Math.hypot(front.x - car.x, front.y - car.y);
    if (gap > TRAIN_SPACING) {
      const pull = (gap - TRAIN_SPACING) / gap;
      car.x += (front.x - car.x) * pull;
      car.y += (front.y - car.y) * pull;
    }
  }
  if (arrived) {
    train.waiting = target.wait;
    train.arrivals += 1;
    event = { type: "train-stops", vehicleId: vehicle.id, at: { x: head.x, y: head.y } };
    // At the end of the line the train turns round: the last carriage becomes the engine, the others in the places they stood.
    const last = train.index + train.direction;
    if (last < 0 || last >= train.stops.length) {
      train.direction = -train.direction;
      train.body.reverse();
      vehicle.vehicle.heading = { x: -vehicle.vehicle.heading.x, y: -vehicle.vehicle.heading.y };
    }
    train.index = Math.min(train.stops.length - 1, Math.max(0, train.index + train.direction));
  }
  vehicle.position = { x: train.body[0].x, y: train.body[0].y };
  return event;
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
    if (isTrain(vehicle)) {
      const event = advanceTrain(vehicle, seconds);
      if (event) {
        events.push(event);
        if (event.type === "train-stops") {
          const out = dropTrainPassengers(vehicle, units, grid);
          if (out.length > 0) events.push({ type: "train-drop", vehicleId: vehicle.id, unitIds: out.map((unit) => unit.id) });
        }
      }
      // The riders travel with the train.
      for (const id of state.occupantIds) {
        const rider = units.find((other) => other.id === id);
        if (rider) rider.position = { ...vehicle.position };
      }
      continue;
    }
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
    const beforeMove = { ...vehicle.position };
    if (state.controlledBy) {
      if (state.continueDriving && vehicle.path.length === 0) {
        vehicle.path = keepLeft(roadAhead(vehicle, roadGrid), roadGrid, tileOf(vehicle.position));
        if (vehicle.path.length === 0) {
          const heading = roadHeading(state.heading);
          vehicle.path = keepLeft(roadAhead(vehicle, roadGrid, { x: -heading.x, y: -heading.y }), roadGrid, tileOf(vehicle.position));
        }
      }
      moveAlongPath(vehicle, seconds, vehicle.definition.stats.speed);
    }
    else if (driver && !driver.disabled && !blockedAhead(vehicle, units) && !stoppedBySignal(vehicle, roadGrid.crossings, time)) {
      driveRoute(vehicle, seconds, roadGrid);
    }
    for (const id of state.occupantIds) {
      const unit = units.find((other) => other.id === id);
      if (unit) unit.position = { ...vehicle.position };
    }
    const moving = Math.hypot(vehicle.position.x - beforeMove.x, vehicle.position.y - beforeMove.y) > 1e-6;
    events.push(...runOver(vehicle, units, seconds, moving));
  }
  return events;
}

/** A vehicle the squad is driving (what enemies shoot at when the operators are inside). */
export function isSquadVehicle(unit) {
  return isVehicle(unit) && !unit.disabled && Boolean(unit.vehicle.controlledBy);
}
