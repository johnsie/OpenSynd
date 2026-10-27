// SPDX-License-Identifier: GPL-2.0-or-later

// The one way in which anything gives the world an order. A command (see commands.js) is checked, then carried out through the
// order functions in orders.js. The browser calls this for the player's clicks and key presses; a server calls it for each command
// a player sends it; a replay calls it with the commands it recorded.
import { validateCommand } from "../commands.js";
import { useStreams } from "../simulation.js";
import {
  dropFromSlot,
  goEnterVehicle,
  issueAttack,
  issueFollow,
  issueMove,
  lootAction,
  fireByHand,
  operatorsOf,
  performInteraction,
  toggleVehicle,
  useItem,
  goLootBody,
} from "./orders.js";

const findUnit = (world, id) => world.units.find((unit) => unit.id === id);

/**
 * Carry out one command. `context.owns(unitId)` says whether whoever sent it controls that unit (a server passes one; a browser
 * playing alone does not), and `context.chance()` is the world's seeded stream. Returns { ok: true, ...what happened } or
 * { ok: false, error }.
 */
export function applyCommand(world, hooks, command, context = {}) {
  const exists = (id) => Boolean(findUnit(world, id)) || world.drops.some((drop) => drop.id === id);
  const check = validateCommand(command, { size: world.map.dimensions, owns: context.owns, exists });
  if (!check.ok) return check;
  useStreams(world.streams);
  const chance = context.chance ?? (() => world.streams.world());
  const operators = operatorsOf(world, command.unitIds, context.owns);
  const queue = Boolean(command.queue);
  switch (command.type) {
    case "move":
      return { ok: true, ...issueMove(world, hooks, operators, command.to, queue) };
    case "attack":
      issueAttack(world, hooks, operators, command.targetId, queue);
      return { ok: true };
    case "follow":
      issueFollow(world, hooks, operators, command.targetId, queue);
      return { ok: true };
    case "fire":
      fireByHand(world, hooks, operators, command.at, Boolean(command.held), chance);
      return { ok: true };
    case "holdFire":
      // The weapon keeps firing at the point, a shot as it recharges, until told to stop (see stepWorld).
      world.holdFire = command.on ? { unitIds: [...command.unitIds], at: command.at ?? world.holdFire?.at ?? null } : null;
      return { ok: true };
    case "useItem": {
      const unit = findUnit(world, command.by);
      if (!unit || !operators.includes(unit)) return { ok: false, error: "that agent cannot act" };
      return { ok: true, ...useItem(world, hooks, operators, unit, command.slot, { at: command.at, plant: command.plant }) };
    }
    case "dropItem": {
      const unit = findUnit(world, command.by);
      if (!unit || !operators.includes(unit)) return { ok: false, error: "that agent cannot act" };
      dropFromSlot(world, hooks, unit, command.slot, queue);
      return { ok: true };
    }
    case "board": {
      const vehicle = findUnit(world, command.vehicleId);
      if (!vehicle) return { ok: false, error: "no such vehicle" };
      goEnterVehicle(world, hooks, operators, vehicle, queue);
      return { ok: true };
    }
    case "vehicle":
      toggleVehicle(world, hooks, operators, queue);
      return { ok: true };
    case "loot":
      if (command.bodyId) {
        const body = world.drops.find((drop) => drop.id === command.bodyId);
        if (!body) return { ok: false, error: "nothing there to pick up" };
        goLootBody(world, hooks, operators, body, queue);
      } else {
        lootAction(world, hooks, operators);
      }
      return { ok: true };
    case "interact":
      performInteraction(world, hooks, operators);
      return { ok: true };
    case "clearQueue":
      for (const unit of operators) unit.pending = [];
      hooks.message("Queued orders cleared.");
      return { ok: true };
    default:
      return { ok: false, error: "unknown command" };
  }
}
