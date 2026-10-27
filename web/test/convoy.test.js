// SPDX-License-Identifier: GPL-2.0-or-later

import assert from "node:assert/strict";
import test from "node:test";

import { silentHooks } from "../src/core/hooks.js";
import { stepWorld } from "../src/core/world.js";
import { FIXED_STEP_SECONDS } from "../src/simulation.js";
import { ejectDriver } from "../src/vehicles.js";
import { loadContent, makeWorld } from "../server/content.js";

const content = loadContent();
const mission = "missions/northern-ireland.mission.json";
const seconds = (count) => Math.round(count / FIXED_STEP_SECONDS);
const advance = (world, count) => {
  const hooks = silentHooks();
  for (let step = 0; step < seconds(count) && world.outcome === "active"; step += 1) {
    stepWorld(world, FIXED_STEP_SECONDS, hooks);
  }
};

test("the Northern Ireland squad deploys in the escort and the procession holds formation", () => {
  const world = makeWorld(content, mission, { options: { decidesOutcome: true, harmless: true } });
  assert.equal(world.map.dimensions.width * world.map.dimensions.height, 2 * 128 * 96, "the city covers twice the old area");
  assert.equal(world.mission.opponents.length, 6, "the procession faces six enemy agents");
  assert.equal(world.mission.bystanders.filter((unit) => unit.id.startsWith("civilian-")).length, 72, "the original crowd is quadrupled");
  const squad = world.units.filter((unit) => unit.side === "team");
  assert.deepEqual(squad.map((unit) => unit.inVehicle), Array(4).fill("convoy-armoured-escort"));
  const dignitary = world.units.find((unit) => unit.id === "dignitary");
  assert.equal(dignitary.inVehicle, "dignitary-armoured-car");

  const order = [
    "convoy-police-lead",
    "convoy-armoured-escort",
    "dignitary-armoured-car",
    "convoy-ambulance",
    "convoy-police-rear",
  ];
  assert.ok(order.every((id) => world.units.find((unit) => unit.id === id).vehicle.cruiseSpeed === 5));
  advance(world, 20);
  const convoy = order.map((id) => world.units.find((unit) => unit.id === id));
  for (let index = 1; index < convoy.length; index += 1) {
    const ahead = convoy[index - 1].position;
    const behind = convoy[index].position;
    const gap = Math.hypot(ahead.x - behind.x, ahead.y - behind.y);
    assert.ok(gap >= 3 && gap <= 7, `${convoy[index - 1].id} and ${convoy[index].id} remain ${gap} tiles apart`);
  }
  assert.equal(dignitary.inVehicle, "dignitary-armoured-car", "Mara remains aboard on the first pass by reception");
  assert.equal(world.objectives[0].complete, false);
});

test("Mara completes a full circuit before walking through reception", () => {
  const world = makeWorld(content, mission, { options: { decidesOutcome: true, harmless: true } });
  for (const unit of world.units.filter((candidate) => candidate.side === "opposition")) unit.disabled = true;
  advance(world, 130);
  const dignitary = world.units.find((unit) => unit.id === "dignitary");
  assert.equal(world.outcome, "success");
  assert.ok(world.elapsed > 95 && world.elapsed < 115, `the expanded procession finished after ${world.elapsed} seconds`);
  assert.equal(dignitary.inVehicle, null);
  assert.ok(dignitary.position.x >= 92 && dignitary.position.x < 95);
  assert.equal(world.objectives[0].complete, true);
});

test("the stolen car blocks the convoy until its assassin driver is forced out", () => {
  const world = makeWorld(content, mission, { options: { decidesOutcome: true, harmless: true } });
  for (const unit of world.units.filter((candidate) => candidate.side === "opposition" && candidate.id !== "assassin-roadblock")) {
    unit.disabled = true;
  }
  advance(world, 35);
  const assassin = world.units.find((unit) => unit.id === "assassin-roadblock");
  const blockade = world.units.find((unit) => unit.id === "blockade-stolen-car");
  const lead = world.units.find((unit) => unit.id === "convoy-police-lead");
  assert.equal(assassin.inVehicle, blockade.id);
  assert.equal(blockade.vehicle.driverId, assassin.id);
  assert.ok(Math.hypot(lead.position.x - blockade.position.x, lead.position.y - blockade.position.y) < 3);
  const stoppedAt = { ...lead.position };

  assert.equal(ejectDriver(blockade, world.units, world.grid), assassin);
  advance(world, 6);
  assert.ok(Math.hypot(lead.position.x - stoppedAt.x, lead.position.y - stoppedAt.y) > 4, "the lead car moves once the blockade is empty");
});

test("the assassins recognise and attack Mara's armoured car", () => {
  const world = makeWorld(content, mission, { seed: 1, options: { decidesOutcome: true } });
  const car = world.units.find((unit) => unit.id === "dignitary-armoured-car");
  const dignitary = world.units.find((unit) => unit.id === "dignitary");
  advance(world, 30);
  assert.ok(car.health < car.definition.stats.vitality, "the priority target draws fire while Mara is aboard");
  assert.equal(dignitary.health, dignitary.definition.stats.vitality, "the armoured car shields its passenger");
});
