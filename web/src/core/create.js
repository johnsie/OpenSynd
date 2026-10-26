// SPDX-License-Identifier: GPL-2.0-or-later

// Building an operation's world from content: the map, the people, the vehicles, the objectives. The result is a plain object the
// rest of the core works on (see step.js and apply.js); it needs no browser, so a server or a test can make one the same way the
// page does. Everything chancy in it is seeded, so the same content, squad and seed always start the same operation.
import { SLOTS_PER_OPERATIVE, enemyArmament, enemyUpgrades, isItemAvailable, loadoutFor, upgradesOf } from "../campaign.js";
import { buildingsFromMap } from "../buildings.js";
import { newDebriefCounts } from "../debrief.js";
import { newDrugs } from "../drugs.js";
import { buildPatrolRoute, createTileGrid } from "../engine.js";
import { syncGates } from "../mission.js";
import { newStats } from "../opstats.js";
import { newProp } from "../props.js";
import { createStreams } from "../simulation.js";
import { chestVitality } from "../upgrades.js";
import { createRoadGrid, newVehicleState, startTrain, vehicleDefinition } from "../vehicles.js";

// Which side of the fight a unit definition's role puts it on.
export const SIDE_BY_ROLE = Object.freeze({
  operator: "team",
  "enemy-agent": "opposition",
  guard: "opposition",
  civilian: "civilian",
  criminal: "criminal",
  police: "police",
});

/** What a person starts with: their placement's own gear, and for an operator the loadout the campaign has chosen. */
export function startingEquipment(campaign, enemyArms, placement, definition, byPath, byId) {
  const defaults = placement.equipment.map((path) => byPath.get(path));
  const issued = enemyArms?.get(placement.id);
  if (issued && definition.role === "enemy-agent") defaults.push(issued);
  if (definition.role !== "operator") return defaults;
  const ids = loadoutFor(campaign, placement.id, defaults.map((item) => item.id));
  return ids
    .map((id) => byId.get(id))
    .filter((item) => item && isItemAvailable(campaign, item))
    .slice(0, SLOTS_PER_OPERATIVE);
}

/**
 * Make the world for one operation.
 *   mission, map    the content (the map already carrying any zones the mission adds)
 *   content         { units, vehicles, equipment }: Maps from content path to definition, as read from the pack
 *   campaign        the squad's side of things: loadouts, upgrades, what has been researched
 *   seed            starts the world's own streams of chance
 *   options         { instantMoves } and the like; { harmless } takes the attack from everyone not on the squad (training)
 */
export function createWorld({ mission, map, content, campaign, seed = 1, options = {} }) {
  const catalog = [...content.equipment.values()];
  const definitionsById = new Map(catalog.map((definition) => [definition.id, definition]));
  const grid = createTileGrid(map);
  const world = {
    mission,
    map,
    grid,
    roadGrid: null,
    buildings: buildingsFromMap(map),
    windowsBroken: new Set(),
    targeted: {},
    bombs: [],
    drops: [],
    armedBomb: null,
    props: (map.props ?? []).map(newProp),
    objectives: mission.objectives.map((objective) => ({ ...objective, complete: false, sequence: Boolean(mission.sequence) })),
    units: [],
    outcome: "active",
    elapsed: 0,
    missionSeconds: 0,
    steps: 0,
    opStats: newStats(mission.opponents.length),
    debrief: newDebriefCounts(),
    holdFire: null,
    options: { ...options },
    streams: createStreams(seed),
    enemyArms: options.harmless
      ? new Map()
      : enemyArmament(
          mission.opponents
            .filter((placement) => content.units.get(placement.unit)?.role === "enemy-agent")
            .map((placement) => placement.id),
          campaign,
          catalog,
        ),
  };
  const buildUnit = (placement, definition) => ({
    ...placement,
    definition,
    side: SIDE_BY_ROLE[definition.role] ?? "opposition",
    position: { ...placement.position },
    initialPosition: { ...placement.position },
    alertedBy: null,
    walkPhase: 0,
    script: placement.script
      ? { steps: placement.script, index: 0, waitLeft: null, loop: Boolean(placement.scriptLoop), done: false }
      : null,
    patrol: placement.patrol ? { route: buildPatrolRoute(grid, placement.position, placement.patrol), index: 0 } : null,
    path: [],
    upgrades:
      definition.role === "operator"
        ? upgradesOf(campaign, placement.id)
        : definition.role === "enemy-agent"
          ? enemyUpgrades(campaign)
          : null,
    drugs: definition.role === "operator" ? newDrugs() : null,
    looted: [],
    activeSlot: null,
    initialEquipment: [],
    equipment: startingEquipment(campaign, world.enemyArms, placement, definition, content.equipment, definitionsById).map((item) => ({
      definition: item,
      charges: item.charges,
    })),
    // What this kind of person carries besides what is in their hands (a policeman's sidearm): it drops when they fall.
    sidearm: (definition.carries ?? [])
      .map((path) => content.equipment.get(path))
      .filter(Boolean)
      .map((item) => ({ definition: item, charges: item.charges })),
    health:
      definition.stats.vitality +
      (definition.role === "operator"
        ? chestVitality(upgradesOf(campaign, placement.id))
        : definition.role === "enemy-agent"
          ? chestVitality(enemyUpgrades(campaign))
          : 0),
    cooldownRemaining: 0,
    targetId: null,
    disabled: false,
  });
  world.units = [...mission.team, ...mission.opponents, ...(mission.bystanders ?? [])].map((placement) =>
    buildUnit(placement, content.units.get(placement.unit)),
  );
  if (options.harmless) {
    // Training enemies cannot hurt anyone: their own attack is taken away as well as any weapon they were issued.
    for (const unit of world.units.filter((item) => item.side !== "team" && item.definition.stats.attack > 0)) {
      unit.definition = { ...unit.definition, stats: { ...unit.definition.stats, attack: 0 } };
    }
  }
  // Vehicles are units too (side "vehicle"), with an AI driver who is a unit riding inside.
  world.roadGrid = createRoadGrid(grid);
  for (const placement of mission.vehicles ?? []) {
    const definition = vehicleDefinition(content.vehicles.get(placement.vehicle));
    const driverDefinition = placement.driver ? content.units.get(placement.driver) : null;
    const driverId = driverDefinition ? `${placement.id}-driver` : null;
    const vehicle = buildUnit({ id: placement.id, position: placement.position, equipment: [] }, definition);
    vehicle.side = "vehicle";
    vehicle.patrol = null;
    vehicle.vehicle = newVehicleState(driverId);
    if (placement.stops) {
      startTrain(vehicle, placement.stops, definition.carriages || 4);
      // The railway is a viaduct: the train runs at the height of the track under its first stop.
      vehicle.vehicle.train.elevation = grid[placement.stops[0].y]?.[placement.stops[0].x]?.elevation ?? 0;
    }
    if (placement.patrol) {
      vehicle.vehicle.route = { route: buildPatrolRoute(world.roadGrid, placement.position, placement.patrol), index: 0 };
    }
    world.units.push(vehicle);
    if (driverDefinition) {
      const driver = buildUnit({ id: driverId, position: placement.position, equipment: [] }, driverDefinition);
      driver.inVehicle = placement.id;
      driver.patrol = null;
      world.units.push(driver);
    }
  }
  // Each operative's number matches their place in the squad.
  world.units.filter((unit) => unit.side === "team").forEach((unit, index) => {
    unit.number = index + 1;
  });
  for (const unit of world.units) unit.initialEquipment = unit.equipment.map((item) => ({ ...item }));
  syncGates(world.grid, world.map, world.objectives, world.units);
  return world;
}
