// SPDX-License-Identifier: GPL-2.0-or-later

// Time passing in an operation: the fixed step the whole game runs on. Everything that happens between two orders happens here.
import { useStreams } from "../simulation.js";
import { advanceWorld } from "./step.js";
import { boardWaitingOperators, fireByHand, operatorsOf, runPendingOrders } from "./orders.js";
import { syncWorldGates } from "./step.js";

export const FIXED_STEPS_PER_TICK = 6; // queued orders and vehicle boarding are looked at every sixth step: a fifth of a second

/**
 * One fixed step of the operation: a held weapon fires, the world moves on (see advanceWorld), and a few times a second queued
 * orders move along, operators who were sent to a vehicle get in and gates and doors follow the people near them.
 */
export function stepWorld(world, deltaSeconds, hooks, chance = () => world.streams.world()) {
  useStreams(world.streams); // this world's own streams of chance are the ones in use while it is being stepped
  world.elapsed += deltaSeconds;
  if (world.holdFire?.at && world.outcome === "active") {
    fireByHand(world, hooks, operatorsOf(world, world.holdFire.unitIds), world.holdFire.at, true, chance);
  }
  advanceWorld(world, deltaSeconds, hooks, chance);
  world.steps = (world.steps ?? 0) + 1;
  if (world.steps % FIXED_STEPS_PER_TICK === 0) {
    boardWaitingOperators(world, hooks);
    runPendingOrders(world, hooks);
    if (world.map.objects?.some((gate) => gate.key || gate.kind === "door")) syncWorldGates(world, hooks);
  }
}
