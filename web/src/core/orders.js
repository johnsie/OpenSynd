// SPDX-License-Identifier: GPL-2.0-or-later

// What the player's orders do to the world: walk, attack, follow, fire, take a weapon out, use an item, loot, interact, get in and
// out of vehicles. Each takes the world, the hooks (see hooks.js) and the operators the order is for, and reports through the
// hooks. The browser, a server and a test all give orders by calling applyCommand with a command record (see commands.js).
import { THROW_RANGE, plantBomb } from "../bombs.js";
import { findObjectiveAtPosition, findPath, formationTiles, isWalkable, zoneContains } from "../engine.js";
import {
  clearWeaponForAll,
  distanceBetween,
  dropItem,
  findLoot,
  freeSlots,
  inLootReach,
  lootableBody,
  nearestLootable,
  pickLooter,
  raiseWeapon,
  selectWeaponForAll,
  setPersuader,
} from "../inventory.js";
import { combatStats, fireManual, hasWeaponSelected, maxHealth, raiseShield, roundsLeft, useScanner } from "../simulation.js";
import { ENTER_RANGE, canEnter, driveTo, enterVehicle, isSquadVehicle, isTrain, isVehicle, leaveVehicle } from "../vehicles.js";
import { completeObjectivesAt, handleCombatEvents, lootNow, syncWorldGates } from "./step.js";

const findUnit = (world, id) => world.units.find((unit) => unit.id === id);

/** The operators an order is for: the named units that are on the squad's side, still able and where the world has them. */
export function operatorsOf(world, unitIds, owns = null) {
  return unitIds
    .map((id) => findUnit(world, id))
    .filter((unit) => unit && !unit.disabled && (owns ? owns(unit.id) : unit.side === "team"));
}

// ------------------------------------------------------------------------------------------------------------ walking

// Order one operator along a route; returns the number of steps, or 0 if there is none.
// With `queue` (Shift held) the new route is added after the one already under way, from where it ends.
// A plain order replaces everything, including actions queued after the route (`keepPending` is for the queue itself).
export function orderMove(world, hooks, unit, destination, queue = false, keepPending = false) {
  unit.targetId = null;
  unit.lootTargetId = null;
  unit.followId = null;
  unit.tailId = null;
  if (!keepPending) unit.pending = [];
  if (queue && unit.pending?.length > 0) {
    // Actions are waiting after the route: the walk joins the queue behind them.
    unit.pending.push({ type: "move", to: { ...destination } });
    hooks.queued("move");
    return 1;
  }
  const queued = queue && unit.path.length > 0;
  if (queued) hooks.queued("move");
  const last = queued ? unit.path.at(-1) : unit.position;
  const start = { x: Math.round(last.x), y: Math.round(last.y) };
  const path = findPath(world.grid, start, destination);
  if (path.length === 0) return 0;
  if (queued) {
    unit.path = [...unit.path, ...path];
    unit.waypoints = [...(unit.waypoints ?? []), { ...destination }];
    return path.length;
  }
  unit.waypoints = [{ ...destination }];
  unit.position = start;
  unit.path = path;
  if (world.options?.instantMoves) {
    // Reduced motion: the walk is over at once.
    for (const step of path) completeObjectivesAt(world, hooks, step);
    unit.position = { ...destination };
    unit.path = [];
  }
  return path.length;
}

// Spread a group over distinct tiles around the destination, nearest tile first.
export function groupDestinations(world, operators, destination) {
  const free = formationTiles(world.grid, destination, operators.length);
  const assignments = [];
  for (const unit of [...operators].sort((left, right) => (left.id < right.id ? -1 : 1))) {
    let best = 0;
    for (let index = 1; index < free.length; index += 1) {
      const distance = (tile) => Math.hypot(tile.x - unit.position.x, tile.y - unit.position.y);
      if (distance(free[index]) < distance(free[best])) best = index;
    }
    if (free.length > 0) assignments.push([unit, free.splice(best, 1)[0]]);
  }
  return assignments;
}

// An operator is busy while they still have somewhere to go or something to do.
export function isBusy(world, unit) {
  const car = unit.inVehicle ? findUnit(world, unit.inVehicle) : null;
  if (car) return car.path.length > 0 || (unit.pending?.length ?? 0) > 0;
  return unit.path.length > 0 || Boolean(unit.lootTargetId) || Boolean(unit.enterTargetId) || (unit.pending?.length ?? 0) > 0;
}

// Orders queued after the current route (Shift+click): walk on, pick up gear, get into a vehicle, in the order given.
export function queueAction(world, hooks, unit, action, description) {
  unit.pending = [...(unit.pending ?? []), action];
  hooks.sound("move");
  hooks.message(`${unit.definition.name} will ${description} next (${unit.pending.length} queued, Esc clears).`);
  hooks.changed();
}

// Orders for operators who are in a vehicle drive it: it goes to the nearest road to the point clicked.
function driveOrder(world, hooks, operators, destination, queue) {
  const riders = operators.filter((unit) => unit.inVehicle);
  if (riders.length === 0) return false;
  // Any rider can give the order: the car the squad is steering goes, whoever sits where. (Everyone can ride together, so the
  // first one chosen is often a passenger.)
  const car = riders.map((unit) => findUnit(world, unit.inVehicle)).find((item) => item?.vehicle.controlledBy);
  if (!car) {
    hooks.message("Nobody is driving this vehicle. Leave it with V and take it again.");
    return true;
  }
  const driver = findUnit(world, car.vehicle.controlledBy);
  if (queue && isBusy(world, driver)) {
    queueAction(world, hooks, driver, { type: "drive", to: { ...destination } }, "drive on to the next point");
    return true;
  }
  driver.pending = [];
  if (!driveTo(car, destination, world.roadGrid)) {
    hooks.message("No road to drive there.");
    return true;
  }
  hooks.sound("move");
  hooks.message(`${car.definition.name} driving off.`);
  hooks.changed();
  return true;
}

/** Walk (or drive) the operators to a tile. Returns { moved: true } when an order was given. */
export function issueMove(world, hooks, operators, destination, queue = false) {
  if (driveOrder(world, hooks, operators, destination, queue)) return { moved: true };
  if (operators.length > 1) {
    const assignments = groupDestinations(world, operators, destination);
    const moving = assignments.filter(([unit, tile]) => orderMove(world, hooks, unit, tile, queue) > 0);
    if (moving.length === 0) {
      hooks.message("No safe route to that tile.");
      return { moved: false };
    }
    hooks.sound("move");
    hooks.message(`${moving.length} operators moving.`);
    hooks.changed();
    return { moved: true };
  }
  const unit = operators[0];
  if (!unit || (!unit.playerUnit && unit.side !== "team") || unit.disabled) return { moved: false };
  const start = { x: Math.round(unit.position.x), y: Math.round(unit.position.y) };
  const steps = orderMove(world, hooks, unit, destination, queue);
  if (steps === 0) {
    const there = start.x === destination.x && start.y === destination.y;
    hooks.message(there ? "Operator is already at that position." : "No safe route to that tile.");
    return { moved: false };
  }
  hooks.sound("move");
  hooks.message(world.options?.instantMoves ? `Route completed: ${steps} grid steps.` : `Route accepted: ${steps} grid steps.`);
  hooks.changed();
  return { moved: true };
}

// ------------------------------------------------------------------------------------------------------------ looting

function nearestDrop(world, position, within) {
  let best = null;
  for (const drop of world.drops) {
    const gap = Math.hypot(drop.position.x - position.x, drop.position.y - position.y);
    if (gap <= within && (!best || gap < best.gap)) best = { drop, gap };
  }
  return best?.drop ?? null;
}

// Send one operator to gear on the ground (lootNow once they are beside it).
function sendLoot(world, hooks, unit, body, keepPending = false) {
  if (inLootReach(unit, body)) {
    lootNow(world, hooks, unit, body);
    return;
  }
  const spot = { x: Math.round(body.position.x), y: Math.round(body.position.y) };
  if (orderMove(world, hooks, unit, spot, false, keepPending) === 0) {
    hooks.message("No safe route to that gear.");
    return;
  }
  unit.lootTargetId = body.id;
  hooks.sound("move");
  hooks.message(`${unit.definition.name} is walking over to pick up the ${body.definition.name}.`);
  hooks.changed();
}

// Send the operator with the fewest items to a body; they loot it on arrival, and the rest move up beside them.
export function goLootBody(world, hooks, operators, body, queue = false) {
  if (operators.length === 0) return;
  // The one with the fewest items collects it, not just whoever is closest.
  const nearest = pickLooter(operators, body) ?? operators[0];
  if (queue && isBusy(world, nearest)) {
    queueAction(world, hooks, nearest, { type: "loot", id: body.id }, `pick up the ${body.definition.name}`);
    return;
  }
  sendLoot(world, hooks, nearest, body);
  const others = operators.filter((unit) => unit !== nearest && !unit.disabled && !unit.inVehicle);
  if (others.length > 0 && !inLootReach(nearest, body)) {
    const spot = { x: Math.round(body.position.x), y: Math.round(body.position.y) };
    for (const [unit, tile] of groupDestinations(world, others, spot)) orderMove(world, hooks, unit, tile);
  }
}

/** F: pick up what is within reach, otherwise send the nearest operator to the closest body that still carries gear. */
export function lootAction(world, hooks, operators) {
  // Everything within reach goes in at once, as far as there are free slots.
  let found = findLoot(operators, world.drops);
  if (found) {
    if (freeSlots(found.operator) === 0) lootNow(world, hooks, found.operator, found.body); // says why nothing was taken
    while (found && freeSlots(found.operator) > 0) {
      lootNow(world, hooks, found.operator, found.body);
      found = findLoot(operators, world.drops);
    }
    return;
  }
  let target = null;
  for (const unit of operators) {
    const candidate = nearestLootable(unit, world.drops);
    if (candidate && (!target || distanceBetween(unit, candidate) < distanceBetween(target.unit, target.body))) {
      target = { unit, body: candidate };
    }
  }
  if (target) goLootBody(world, hooks, operators, target.body);
  else hooks.message("There is nothing to pick up. Gear lies where an armed person falls.");
}

// A queued drop: the first thing the operative carries that matches what was chosen, if they still have it.
function dropQueued(world, hooks, unit, step) {
  const slot = unit.equipment.findIndex((item) => item.definition.id === step.item);
  if (slot === -1) hooks.message(`${unit.definition.name}: no ${step.name} left to drop, skipped.`);
  else dropFromSlot(world, hooks, unit, slot);
}

/** Right-click a slot: the item leaves it and lies on the ground beside the operative, where it can be picked up again. */
export function dropFromSlot(world, hooks, unit, slot, queue = false) {
  const name = unit.equipment[slot]?.definition.name;
  if (queue && name && isBusy(world, unit)) {
    queueAction(world, hooks, unit, { type: "drop", item: unit.equipment[slot].definition.id, name }, `drop the ${name}`);
    return;
  }
  if (world.armedBomb?.unitId === unit.id) world.armedBomb = null;
  const drop = dropItem(unit, slot, world.drops, world.grid);
  if (!drop) return;
  hooks.sound("select");
  hooks.message(`${unit.definition.name} dropped the ${name}. Press F or click it to pick it up.`);
  hooks.changed();
}

// ------------------------------------------------------------------------------------------------------------ vehicles

// The vehicle the squad could use right now: the one they are in (to leave), or the nearest one an operator is next to (to enter).
export function vehicleCandidate(world, operators) {
  const riding = operators.find((unit) => unit.inVehicle);
  if (riding) return { vehicle: findUnit(world, riding.inVehicle), leaving: true };
  let best = null;
  for (const unit of world.units) {
    if (!isVehicle(unit)) continue;
    for (const operator of operators) {
      if (!canEnter(operator, unit)) continue;
      const distance = Math.hypot(operator.position.x - unit.position.x, operator.position.y - unit.position.y);
      if (!best || distance < best.distance) best = { vehicle: unit, leaving: false, distance };
    }
  }
  return best;
}

// Where to stand to board a train: the walkable tile (the platform) nearest one of its carriages.
function platformTile(world, from, train) {
  let best = null;
  for (const part of train.vehicle.train.body) {
    for (let dy = -3; dy <= 3; dy += 1) {
      for (let dx = -3; dx <= 3; dx += 1) {
        const x = Math.round(part.x) + dx;
        const y = Math.round(part.y) + dy;
        if (!world.grid[y]?.[x]?.walkable) continue;
        const cost = Math.hypot(x - part.x, y - part.y) + Math.hypot(x - from.position.x, y - from.position.y) * 0.05;
        if (!best || cost < best.cost) best = { x, y, cost };
      }
    }
  }
  return best ? { x: best.x, y: best.y } : { x: Math.round(train.position.x), y: Math.round(train.position.y) };
}

function sendEnter(world, hooks, nearest, vehicle, keepPending = false) {
  const gap = Math.hypot(nearest.position.x - vehicle.position.x, nearest.position.y - vehicle.position.y);
  if (!isTrain(vehicle) && gap <= ENTER_RANGE && !canEnter(nearest, vehicle)) {
    hooks.message(`No room in the ${vehicle.definition.name}.`);
    return;
  }
  const goal = isTrain(vehicle)
    ? platformTile(world, nearest, vehicle)
    : { x: Math.round(vehicle.position.x), y: Math.round(vehicle.position.y) };
  const steps = orderMove(world, hooks, nearest, goal, false, keepPending);
  nearest.enterTargetId = vehicle.id;
  if (steps === 0 && !canEnter(nearest, vehicle)) {
    nearest.enterTargetId = null;
    hooks.message("No safe route to that vehicle.");
    return;
  }
  hooks.sound("move");
  hooks.message(`${nearest.definition.name} is heading for the ${vehicle.definition.name}.`);
  hooks.changed();
}

/** Left-click a vehicle: everyone selected heads for it and gets in (FreeSynd: a click on a car boards it). */
export function goEnterVehicle(world, hooks, operators, vehicle, queue = false) {
  const squad = operators.filter((unit) => !unit.inVehicle);
  if (squad.length === 0) {
    hooks.message("Select an operator first, then click the vehicle to get in.");
    return;
  }
  for (const unit of squad) {
    if (queue && isBusy(world, unit)) {
      queueAction(world, hooks, unit, { type: "enter", id: vehicle.id }, `get into the ${vehicle.definition.name}`);
    } else {
      sendEnter(world, hooks, unit, vehicle);
    }
  }
  if (squad.length > 1) hooks.message(`${squad.length} operators are heading for the ${vehicle.definition.name}.`);
}

/** Operators who were sent to a vehicle get in once they are close enough. */
export function boardWaitingOperators(world, hooks) {
  for (const operator of world.units) {
    if (!operator.enterTargetId || operator.inVehicle || operator.disabled) continue;
    const vehicle = findUnit(world, operator.enterTargetId);
    if (!vehicle || vehicle.disabled) {
      operator.enterTargetId = null;
      continue;
    }
    if (!canEnter(operator, vehicle)) {
      if (operator.path.length === 0) operator.enterTargetId = null;
      continue;
    }
    operator.enterTargetId = null;
    const { entered, thrownOut } = enterVehicle(vehicle, [operator], world.units, world.grid);
    if (entered.length > 0) {
      hooks.message(
        `${operator.definition.name} got into the ${vehicle.definition.name}` +
          (thrownOut ? `; ${thrownOut.definition.name} was thrown out.` : ". Click a road to drive, V to get out."),
      );
      hooks.sound("move");
      hooks.changed();
    }
  }
}

/** V: take the vehicle that is within reach, or leave the one the squad is in. */
export function toggleVehicle(world, hooks, operators, queue = false) {
  const candidate = vehicleCandidate(world, operators);
  if (!candidate) {
    hooks.message("No vehicle within reach. Walk up to one and press V.");
    return;
  }
  const { vehicle, leaving } = candidate;
  if (leaving && isTrain(vehicle) && !(vehicle.vehicle.train?.waiting > 0)) {
    hooks.message("The train drops its passengers at the next station.");
    return;
  }
  if (leaving && queue) {
    const driver = findUnit(world, vehicle.vehicle.controlledBy) ?? operators.find((unit) => unit.inVehicle);
    if (driver && isBusy(world, driver)) {
      queueAction(world, hooks, driver, { type: "leave" }, `get out of the ${vehicle.definition.name}`);
      return;
    }
  }
  if (leaving) {
    const out = leaveVehicle(vehicle, world.units, world.grid);
    hooks.message(`${out.length} left the ${vehicle.definition.name}.`);
    hooks.sound("select");
  } else {
    const { entered, thrownOut } = enterVehicle(vehicle, operators, world.units, world.grid);
    if (entered.length === 0) {
      hooks.message(`No room in the ${vehicle.definition.name}.`);
      return;
    }
    // Operators who were further off walk over and get in too.
    for (const unit of operators) if (!unit.inVehicle && !unit.disabled) sendEnter(world, hooks, unit, vehicle);
    hooks.message(
      `${entered.length} got into the ${vehicle.definition.name}` +
        (thrownOut ? `; ${thrownOut.definition.name} was thrown out.` : ". Click a road to drive, V to get out."),
    );
    hooks.sound("move");
  }
  hooks.changed();
}

// When an operator has finished what they were doing, start the next queued order; one that can no longer be done (the body is
// gone, the vehicle is wrecked, no route) is skipped with a message.
export function runPendingOrders(world, hooks) {
  for (const unit of world.units) {
    if ((!unit.playerUnit && unit.side !== "team") || unit.disabled || !unit.pending?.length) continue;
    const name = unit.definition.name;
    if (unit.inVehicle) {
      // A driver waits for the car to stop, then drives on or gets out.
      const car = findUnit(world, unit.inVehicle);
      if (!car || car.path.length > 0) continue;
      const step = unit.pending.shift();
      if (step.type === "drive") {
        if (!driveTo(car, step.to, world.roadGrid)) hooks.message(`${name}: no road to the next point, skipped.`);
      } else if (step.type === "leave") {
        const out = leaveVehicle(car, world.units, world.grid);
        hooks.message(`${out.length} left the ${car.definition.name}.`);
      } else if (step.type === "drop") dropQueued(world, hooks, unit, step);
      continue;
    }
    if (unit.path.length > 0 || unit.lootTargetId || unit.enterTargetId) continue;
    const next = unit.pending.shift();
    if (next.type === "drop") dropQueued(world, hooks, unit, next);
    else if (next.type === "move") {
      if (orderMove(world, hooks, unit, next.to, false, true) === 0) hooks.message(`${name}: no route to the next point, skipped.`);
    } else if (next.type === "loot") {
      const body = world.drops.find((item) => item.id === next.id);
      if (body && lootableBody(body)) sendLoot(world, hooks, unit, body, true);
      else hooks.message(`${name}: nothing left to pick up, skipped.`);
    } else if (next.type === "follow") {
      const target = findUnit(world, next.id);
      if (target && !target.disabled) {
        unit.tailId = target.id;
        hooks.message(`${name} follows ${target.definition.name}.`);
      } else hooks.message(`${name}: nobody left to follow, skipped.`);
    } else if (next.type === "enter") {
      const vehicle = findUnit(world, next.id);
      if (vehicle && !vehicle.disabled) sendEnter(world, hooks, unit, vehicle, true);
      else hooks.message(`${name}: the vehicle is gone, skipped.`);
    }
  }
}

// ------------------------------------------------------------------------------------------------------------ fighting

// Anyone the squad could fire on: watchers, civilians and police, but not people it has persuaded.
export function isAttackable(unit) {
  if (isVehicle(unit)) return !isSquadVehicle(unit);
  return ["opposition", "civilian", "police", "criminal"].includes(unit.side) && !unit.persuaded;
}

/** Clicking a watcher sends the armed operators after it: each closes in until it is in range, then stands and shoots. */
export function issueAttack(world, hooks, operators, targetId, queue = false) {
  const target = findUnit(world, targetId);
  const rivalCompany = target?.playerUnit && operators.some((unit) => unit.playerUnit && unit.warSide !== target.warSide);
  if (!target || (!isAttackable(target) && !rivalCompany)) return;
  if (target.disabled) {
    const gear = nearestDrop(world, target.position, 3);
    if (gear) goLootBody(world, hooks, operators, gear, queue);
    else hooks.message(`${target.definition.name} is already down and has nothing left to loot.`);
    return;
  }
  if (operators.length === 0) return;
  const carrying = (unit) => unit.equipment.some((item) => item.definition.action === "disable-pulse");
  const armed = operators.filter((unit) => carrying(unit) && roundsLeft(unit) !== 0 && hasWeaponSelected(unit));
  if (armed.length === 0) {
    hooks.message(
      operators.some((unit) => carrying(unit) && roundsLeft(unit) !== 0)
        ? "No weapon selected. Click a weapon in the operator's inventory, then give the order."
        : operators.some(carrying)
          ? "Out of rounds. Swap to another weapon or loot one."
          : "No selected operator has a weapon equipped.",
    );
    return;
  }
  for (const unit of armed) {
    unit.followId = target.id;
    unit.lootTargetId = null;
  }
  const inRange = armed.filter((unit) => distanceBetween(unit, target) <= combatStats(unit, distanceBetween(unit, target)).range);
  const who = armed.length > 1 ? `${armed.length} operators` : armed[0].definition.name;
  const verb = inRange.length === armed.length ? "engaging" : "closing in on";
  hooks.message(`${who} ${verb} ${target.definition.name}.`);
  hooks.sound("move");
  hooks.changed();
}

// Anyone who can be followed: civilians and the people the squad has persuaded.
export function isFollowable(unit) {
  if (isVehicle(unit) || unit.disabled) return false;
  return unit.persuaded || unit.side === "civilian";
}

/** Left-click on someone: the operatives, not in a vehicle, walk after them and stay beside them (no shooting). */
export function issueFollow(world, hooks, operators, targetId, queue = false) {
  const target = findUnit(world, targetId);
  const squad = operators.filter((unit) => !unit.inVehicle);
  if (!target || squad.length === 0) return;
  // With Shift held, whoever is busy follows after finishing what they are doing.
  const waiting = queue ? squad.filter((unit) => isBusy(world, unit)) : [];
  for (const unit of waiting) queueAction(world, hooks, unit, { type: "follow", id: target.id }, `follow ${target.definition.name}`);
  if (waiting.length === squad.length) return;
  for (const unit of squad.filter((item) => !waiting.includes(item))) {
    unit.targetId = null;
    unit.followId = null;
    unit.lootTargetId = null;
    unit.enterTargetId = null;
    unit.pending = [];
    unit.path = [];
    unit.tailId = target.id;
  }
  const who = squad.length > 1 ? `${squad.length} operators` : squad[0].definition.name;
  hooks.message(`${who} following ${target.definition.name}.`);
  hooks.sound("move");
  hooks.changed();
}

/** Right-click: fire the weapon in the hand of each operator toward a point (`held` when it is the button being held down). */
export function fireByHand(world, hooks, operators, aim, held = false, chance = () => 0.5) {
  if (operators.length === 0) {
    if (!held) hooks.message("Select an operator first, then right-click to fire.");
    return;
  }
  const events = [];
  const reasons = new Set();
  for (const unit of operators) {
    const result = fireManual(unit, aim, world.units, world.grid, world.props);
    if (result.fired) events.push(...result.events);
    else reasons.add(result.reason);
  }
  if (events.length > 0) {
    handleCombatEvents(world, hooks, events, chance);
    hooks.changed();
    return;
  }
  if (held) return;
  if (reasons.has("recharging")) hooks.message("Weapon recharging.");
  else if (reasons.has("no-rounds")) hooks.message("Out of rounds. Select another weapon or loot one.");
  else if (reasons.has("none-selected")) hooks.message("No weapon selected. Click a weapon in the operator's inventory first.");
  else if (reasons.has("no-weapon")) hooks.message("No weapon equipped.");
}

// ------------------------------------------------------------------------------------------------------------ items

/** Use a field repair kit on an operator. */
export function useRepairOn(world, hooks, unit, kit) {
  if (!unit || unit.disabled || !kit || kit.charges === 0) {
    hooks.message("No field repair kit is available.");
    return;
  }
  const maximum = maxHealth(unit);
  if (unit.health >= maximum) {
    hooks.message("Operator integrity is already full.");
    return;
  }
  // FreeSynd's medikit restores the user to full health; a kit may instead restore a fixed amount.
  const wanted = kit.definition.effect.restoreFull ? maximum : kit.definition.effect.restoreVitality;
  const restored = Math.min(wanted, maximum - unit.health);
  unit.health += restored;
  if (kit.charges !== null) kit.charges -= 1;
  hooks.message(`${kit.definition.name} restored ${restored} integrity.`);
  hooks.sound("repair");
  hooks.effect("repair", { unitId: unit.id });
  hooks.changed();
}

// Throw a charge to a spot on the ground, within range and on walkable ground.
function throwBomb(world, hooks, unit, entry, target) {
  const tile = { x: Math.round(target.x), y: Math.round(target.y) };
  if (Math.hypot(tile.x - unit.position.x, tile.y - unit.position.y) > THROW_RANGE) {
    hooks.message(`Too far: a charge can be thrown ${THROW_RANGE} tiles.`);
    return { failed: true };
  }
  if (!isWalkable(world.grid, tile.x, tile.y)) {
    hooks.message("It cannot land there.");
    return { failed: true };
  }
  plantBomb(unit, entry, world.bombs, tile);
  hooks.sound("tick");
  hooks.message(
    `${unit.definition.name} throws a ${entry.definition.name}: ${entry.definition.effect.fuse} seconds. ` +
      `Keep everyone ${entry.definition.effect.radius} tiles from it.`,
  );
  hooks.changed();
  return { thrown: true };
}

/**
 * Press an item square: weapons are taken out (press again to put away), consumables are used, worn gear explains itself.
 * `operators` are everyone the order is for and `unit` the one whose square was pressed. For a time bomb `options.at` throws it to a
 * tile and `options.plant` drops it underfoot; with neither, the result says `arm: true` (the player's next click chooses where).
 */
export function useItem(world, hooks, operators, unit, slot, options = {}) {
  const entry = unit.equipment[slot];
  if (!entry || unit.disabled) return {};
  const definition = entry.definition;
  // An item with nothing left in it is dead weight: pressing it puts it down, freeing the slot.
  if (entry.charges === 0) {
    dropFromSlot(world, hooks, unit, slot);
    return {};
  }
  const group = operators.length > 1 && operators.some((member) => member.id === unit.id);
  if (definition.action === "disable-pulse") {
    // With several operatives selected (and this one among them), the choice applies to all of them: each takes up their own
    // copy of the same weapon, or puts it away together.
    if (group) {
      if (unit.activeSlot === slot) {
        clearWeaponForAll(operators);
        hooks.message(`${operators.length} operators: weapons put away. Select one to fire.`);
      } else {
        const { selected, substituted, missing } = selectWeaponForAll(operators, definition.id);
        raiseWeapon(unit, slot); // the operative clicked keeps the exact copy they clicked
        hooks.message(
          `${selected.length + substituted.length} operators: ${definition.name} selected.` +
            (substituted.length > 0 ? ` ${substituted.length} took the most similar weapon they carry.` : "") +
            (missing.length > 0 ? ` ${missing.length} have nothing loaded.` : ""),
        );
      }
    } else {
      if (unit.activeSlot === slot) unit.activeSlot = null;
      else raiseWeapon(unit, slot);
      hooks.message(
        unit.activeSlot === slot
          ? `${unit.definition.name}: ${definition.name} selected. It will be the only weapon that fires.`
          : `${unit.definition.name}: weapon put away. Select one to fire.`,
      );
    }
    hooks.sound("select");
    hooks.changed();
    return {};
  }
  if (definition.action === "time-bomb") {
    if (options.at) return throwBomb(world, hooks, unit, entry, options.at);
    if (!options.plant) {
      hooks.sound("select");
      hooks.message(
        `${unit.definition.name}: click the ground within ${THROW_RANGE} tiles to throw the ${definition.name}, ` +
          "click its slot again to drop it here, Esc to cancel.",
      );
      return { arm: true };
    }
    plantBomb(unit, entry, world.bombs);
    hooks.sound("tick");
    hooks.message(
      `${unit.definition.name} plants a ${definition.name}: ${definition.effect.fuse} seconds. ` +
        `Get everyone out of ${definition.effect.radius} tiles.`,
    );
    hooks.changed();
    return { planted: true };
  }
  if (definition.action === "shield") {
    if (!raiseShield(unit)) {
      hooks.message(entry.charges === 0 ? "That shield is spent." : `${unit.definition.name} already has a shield up.`);
      return {};
    }
    hooks.sound("shield-up");
    hooks.message(`${unit.definition.name}: ${definition.name} up for ${definition.effect.duration} seconds.`);
    hooks.changed();
    return {};
  }
  if (definition.action === "scan") {
    if (!useScanner(unit)) {
      hooks.message(entry.charges === 0 ? "That scanner is spent." : `${unit.definition.name} is already scanning.`);
      return {};
    }
    hooks.sound("scan");
    hooks.message(
      `${unit.definition.name}: ${definition.name} on for ${definition.effect.duration} seconds. Everyone nearby shows on the map.`,
    );
    hooks.changed();
    return {};
  }
  if (definition.action === "persuade") {
    // Like weapons, with several operators selected the switch applies to all of them that carry one.
    const turnOn = !unit.persuading;
    const carriers = setPersuader(group ? operators : [unit], turnOn);
    const who = carriers.length > 1 ? `${carriers.length} operators` : unit.definition.name;
    hooks.message(
      turnOn
        ? `${who}: ${definition.name} on, weapon put away (it is one or the other). Stand near people to win them over.`
        : `${who}: ${definition.name} off.`,
    );
    hooks.sound("select");
    hooks.changed();
    return {};
  }
  if (definition.action === "restore-vitality") {
    useRepairOn(world, hooks, unit, entry);
    return {};
  }
  hooks.message(`${definition.name} is worn: ${definition.description}`);
  return {};
}

// ------------------------------------------------------------------------------------------------------------ interacting

/** The operator who can interact right now (standing on a relay, panel or server) and what with. */
export function interactionCandidate(world, operators) {
  for (const unit of operators) {
    if (!unit || unit.disabled || unit.path.length > 0) continue;
    const spot = { x: Math.round(unit.position.x), y: Math.round(unit.position.y) };
    const objective = findObjectiveAtPosition(world.objectives, world.map.zones, spot, "interact");
    if (objective) return { unit, objective };
    const warPoint = world.war?.points?.find((point) => zoneContains(point, spot));
    if (warPoint) return { unit, warPoint };
  }
  let nearest = null;
  for (const unit of operators) {
    if (!unit || unit.disabled || unit.path.length > 0) continue;
    for (const giver of world.units.filter((candidate) => candidate.missionGiver && !candidate.disabled)) {
      const distance = Math.hypot(unit.position.x - giver.position.x, unit.position.y - giver.position.y);
      if (distance <= ENTER_RANGE && (!nearest || distance < nearest.distance)) nearest = { unit, giver, distance };
    }
  }
  if (nearest) return { unit: nearest.unit, giver: nearest.giver };
  return null;
}

/** E: use the relay, panel or server the operator is standing on. */
export function performInteraction(world, hooks, operators) {
  const candidate = interactionCandidate(world, operators);
  if (!candidate) {
    hooks.message("Nothing to use is within reach.");
    return;
  }
  const { unit, objective } = candidate;
  if (candidate.warPoint) {
    const point = candidate.warPoint;
    if (point.owner === unit.warSide) {
      hooks.message(`${point.name} is secured by your coalition.`);
    } else if (point.claiming === unit.warSide) {
      const left = Math.max(1, Math.ceil(world.war.captureSeconds - point.progress));
      hooks.message(`${point.name}: uplink active. Hold the relay for ${left} more seconds.`);
    } else {
      hooks.message(`${point.name}: hold this relay for ${world.war.captureSeconds} seconds to capture it.`);
    }
    hooks.sound("objective");
    hooks.effect("restore", { unitId: unit.id });
    hooks.changed();
    return;
  }
  if (candidate.giver) {
    const details = candidate.giver.missionGiver;
    const contract = world.war?.contracts?.find((item) => item.contractId === details.contractId);
    const assignment = contract?.assignments?.[unit.warSide];
    if (!assignment) {
      hooks.message(`${details.name} has no work for this operative.`);
      return;
    }
    if (assignment.status === "available") {
      assignment.status = "active";
      world.war.revision = (world.war.revision ?? 0) + 1;
      hooks.sound("objective");
      hooks.effect("restore", { unitId: candidate.giver.id });
      hooks.message(`${details.name}: ${details.title}. Reward: ${details.reward} coalition points.`);
      hooks.changed();
    } else if (assignment.status === "active") {
      hooks.message(`${details.name}: the contract is still active—take and hold the marked relay.`);
    } else {
      const left = Math.max(1, Math.ceil((assignment.availableAt - world.elapsed)));
      hooks.message(`${details.name}: return in ${left} seconds for another contract.`);
    }
    return;
  }
  objective.complete = true;
  world.opStats.objectivesCompleted += 1;
  syncWorldGates(world, hooks);
  hooks.sound("objective");
  hooks.effect("restore", { unitId: unit.id });
  hooks.message(`${objective.description} Commitment fulfilled.`);
  hooks.changed();
}
