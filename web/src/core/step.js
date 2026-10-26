// SPDX-License-Identifier: GPL-2.0-or-later

// One tick of the world, and the things that happen as a result. This is the game's rules in motion: it moves people, runs the
// fights, vehicles, bombs, fires and persuasion, and settles objectives. It works on a `world` (the units, the grid, the
// objectives and the other things an operation is made of) and reports what happened through `hooks` (see hooks.js), so the same
// code runs in the browser, on a server and in a test. It never touches the screen, the speakers or the clock.
import { CIVILIAN_PENALTY, POLICE_PENALTY, SLOTS_PER_OPERATIVE } from "../campaign.js";
import { advanceBombs, plantBomb, shootBombs } from "../bombs.js";
import { recordKill, recordShot } from "../debrief.js";
import { advanceDrugs } from "../drugs.js";
import { zoneContains } from "../engine.js";
import { collectFallen, inLootReach, lootBody, lootableBody } from "../inventory.js";
import {
  advanceHold,
  missionComplete,
  resolveArrival,
  resolveDisabled,
  resolveExtraction,
  resolveUnitObjectives,
  syncGates,
} from "../mission.js";
import { advanceProps, damageProp, propsNear } from "../props.js";
import {
  advanceCombat,
  advancePatrols,
  advancePersuasion,
  advancePursuit,
  advanceRegeneration,
  advanceScanners,
  advanceShields,
  advanceTails,
  advanceUnits,
  investigateNoise,
  persuadePoints,
  startPanic,
} from "../simulation.js";
import { advanceVehicles } from "../vehicles.js";
import { windowShot, windowsInBlast } from "../windows.js";

const findUnit = (world, id) => world.units.find((unit) => unit.id === id);

// Throw a unit that was just hit back, away from whoever hit it (drawn only; the unit stays put).
export function knockBack(world, victim, shooter) {
  const dx = victim.position.x - shooter.position.x;
  const dy = victim.position.y - shooter.position.y;
  const x = dx - dy;
  const y = dx + dy;
  const length = Math.hypot(x, y) || 1;
  victim.hitAt = world.elapsed;
  victim.hitDirection = { x: x / length, y: y / length };
}

// A civilian or police officer has been killed: it goes on the record (FreeSynd charges nothing for it).
function harmBystander(world, hooks, cost, counter) {
  world.opStats[counter] += 1;
  if (cost > 0) hooks.penalise(cost, counter);
}

// Keep the record of who has been put out of action, and charge for bystanders.
export function countDisabled(world, hooks, down) {
  if (down.side === "vehicle") return;
  if (down.side === "opposition") world.opStats.enemiesDisabled += 1;
  else if (down.side === "civilian") harmBystander(world, hooks, CIVILIAN_PENALTY, "civiliansHarmed");
  else if (down.side === "police") harmBystander(world, hooks, POLICE_PENALTY, "policeHarmed");
  else world.opStats.operatorsDisabled += 1;
}

// Scenery that caught fire or broke: a puff of debris and a line in the status.
const PROP_NAMES = { tree: "A tree", streetlight: "A street light", bin: "A bin", billboard: "A billboard" };
export function announceProp(world, hooks, event) {
  const prop = world.props.find((item) => item.id === event.propId);
  if (!prop) return;
  hooks.effect("puff", { to: prop.position });
  if (event.state === "burning") hooks.message(`${PROP_NAMES[prop.kind]} catches fire.`);
  else hooks.sound("hit");
}

// A shot that ends against a building's visible wall breaks a window; the noise draws guards and enemy agents to look.
// `chance` (0 to 1) says which pane; it comes from the world's seeded stream so a replay breaks the same one.
export function breakWindowAt(world, hooks, from, to, chance) {
  for (const building of world.buildings ?? []) {
    const key = windowShot(building, from, { x: to.x + (to.x - from.x) * 0.02, y: to.y + (to.y - from.y) * 0.02 }, chance);
    if (key && !world.windowsBroken.has(key)) {
      world.windowsBroken.add(key);
      hooks.sound("glass");
      investigateNoise(world.units, to, 14);
      return;
    }
  }
}

// Effects, counters and messages for shots, from automatic combat and from shots fired by hand.
export function handleCombatEvents(world, hooks, combatEvents, chance) {
  for (const event of combatEvents) {
    if (event.type === "damage" || event.type === "shot") {
      const shooter = findUnit(world, event.attackerId);
      hooks.effect("muzzle", { unitId: event.attackerId });
      if (shooter?.side === "team") {
        recordShot(world.debrief, shooter.id, event.type === "damage");
        const victim = event.type === "damage" ? findUnit(world, event.targetId) : null;
        if (victim && event.remaining === 0 && victim.side !== "team") {
          recordKill(world.debrief, shooter.id, victim.definition.role);
        }
      }
      // A bomb on the ground goes off when a shot passes it.
      if (shooter && world.bombs.length > 0) {
        const struck = event.type === "damage" ? findUnit(world, event.targetId) : null;
        const to = struck?.position ?? event.end;
        if (to && shootBombs(world.bombs, shooter.position, to) > 0) {
          hooks.message("A shot hit a charge on the ground: it is about to go off.");
        }
      }
      if (shooter && event.type === "shot" && event.end) breakWindowAt(world, hooks, shooter.position, event.end, chance());
      // Each weapon sounds like itself; fire further from the view is quieter.
      if (shooter) hooks.sound("shot", { weapon: event.sound, at: shooter.position, friendly: shooter.side === "team" });
      if (event.type === "damage" && event.blocked) {
        // The shield took it: sparks off the field, no knockback.
        const victim = findUnit(world, event.targetId);
        hooks.sound("shield-hit");
        hooks.effect("puff", { to: victim.position });
      } else if (event.type === "damage") {
        const victim = findUnit(world, event.targetId);
        hooks.sound("hit");
        hooks.effect("impact", { unitId: event.targetId });
        if (shooter && victim) knockBack(world, victim, shooter);
      } else {
        hooks.effect("puff", { to: event.end });
      }
      if (shooter) shooter.firedAt = world.elapsed;
      if (event.outOfRounds && shooter?.side === "team") {
        hooks.message(`${shooter.definition.name}: ${event.weapon} is out of rounds.`);
        hooks.sound("alert");
      }
    } else if (event.type === "prop") {
      announceProp(world, hooks, event);
    } else if (event.type === "burn") {
      hooks.effect("flame", { unitId: event.targetId });
    } else if (event.type === "disabled") {
      countDisabled(world, hooks, findUnit(world, event.unitId));
    } else if (event.type === "ejected") {
      const out = findUnit(world, event.unitId);
      const car = findUnit(world, event.vehicleId);
      hooks.message(`${out.definition.name} is thrown out of the ${car.definition.name}.`);
    }
  }
  const latest = combatEvents.at(-1);
  if (latest.type === "burn") return;
  if (latest.type === "disabled") {
    hooks.sound("disabled");
    const unit = findUnit(world, latest.unitId);
    if (unit.side === "civilian" || unit.side === "police") {
      hooks.message(`${unit.definition.name} killed. The city notices.`);
    } else {
      hooks.message(
        unit.side === "opposition"
          ? `${unit.definition.name} disabled. Route is clearer.`
          : `${unit.definition.name} disabled. Select another operator.`,
      );
    }
    hooks.selectionChanged();
  } else if (latest.type === "damage") {
    const target = findUnit(world, latest.targetId);
    hooks.message(`${target.definition.name} integrity: ${latest.remaining}.`);
  }
}

/** Open and close the map's gates and doors as the objectives and the people near them say; a door that moves is heard. */
export function syncWorldGates(world, hooks) {
  const doors = (world.map.objects ?? []).filter((object) => object.kind === "door");
  const wasOpen = doors.map((door) => world.grid[door.position.y]?.[door.position.x]?.door?.open);
  syncGates(world.grid, world.map, world.objectives, world.units ?? []);
  doors.forEach((door, index) => {
    const now = world.grid[door.position.y]?.[door.position.x]?.door?.open;
    if (wasOpen[index] === undefined || now === wasOpen[index]) return;
    hooks.sound("door", { at: door.position });
  });
}

/** Gear dropped by the fallen is gathered up; what was destroyed with its owner is reported. */
export function collectFallenGear(world, hooks) {
  const events = collectFallen(world.units, world.drops, world.grid);
  for (const event of events) {
    const who = findUnit(world, event.unitId);
    if (event.type === "destroyed" && who?.side === "opposition") hooks.message(`${who.definition.name}'s gear was destroyed with them.`);
  }
  if (world.drops.some((drop) => !lootableBody(drop))) world.drops = world.drops.filter(lootableBody);
  if (events.some((event) => event.type === "dropped")) hooks.changed();
}

/** An operator takes what they can from a fallen body. */
export function lootNow(world, hooks, operator, body) {
  const { taken, left } = lootBody(operator, body);
  operator.lootTargetId = null;
  world.drops = world.drops.filter(lootableBody);
  if (taken.length === 0) {
    hooks.message(`${operator.definition.name} has no free slots (${SLOTS_PER_OPERATIVE} items maximum), so cannot pick anything up.`);
    return;
  }
  world.opStats.itemsLooted += taken.length;
  hooks.looted(operator, taken);
  const names = taken.map((item) => item.definition.name).join(", ");
  hooks.message(
    `${operator.definition.name} picked up ${names}.` + (left > 0 ? ` ${left} item${left > 1 ? "s" : ""} left behind: no free slots.` : ""),
  );
  hooks.sound("objective");
  hooks.effect("restore", { unitId: operator.id });
  hooks.changed();
}

/** Someone has reached a place: any objective that was waiting for it is done. Returns whether anything changed. */
export function completeObjectivesAt(world, hooks, position) {
  let changed = false;
  for (const event of resolveArrival(world.objectives, world.map.zones, position, world.units)) {
    if (event.type === "waiting") {
      hooks.message(`Extraction needs everyone: ${event.outside} operative${event.outside > 1 ? "s" : ""} still to reach the zone.`);
      continue;
    }
    if (event.type === "blocked") {
      hooks.message("Extraction is available after all other commitments are fulfilled.");
      continue;
    }
    const { objective } = event;
    world.opStats.objectivesCompleted += 1;
    syncWorldGates(world, hooks);
    changed = true;
    hooks.sound("objective");
    const zone = world.map.zones.find((item) => item.id === objective.targetZone);
    const restoredBy = world.units.find((unit) => unit.side === "team" && zoneContains(zone, unit.position));
    if (restoredBy) hooks.effect("restore", { unitId: restoredBy.id });
    hooks.message(
      objective.type === "extract" && missionComplete(world.objectives)
        ? "Operation complete. Every commitment is fulfilled."
        : `${objective.description} Commitment fulfilled.`,
    );
  }
  return changed;
}

// Tell the player when they start and stop holding a position (progress building or draining).
export function announceHolds(world, hooks) {
  world.holdWas ??= {};
  for (const objective of world.objectives) {
    if (objective.type !== "hold" || objective.complete) continue;
    const before = world.holdWas[objective.id] ?? 0;
    const now = objective.progress ?? 0;
    if (now > before + 1e-9 && before === 0) {
      hooks.message(`Holding the position: stay inside the marked square for ${objective.holdSeconds} seconds.`);
    } else if (now < before - 1e-9 && before >= objective.holdSeconds * 0.1 && !world.holdWarned?.[objective.id]) {
      hooks.message("Nobody is inside the marked square: the hold is slipping away. Get back in.");
      (world.holdWarned ??= {})[objective.id] = true;
    } else if (now > before + 1e-9 && world.holdWarned?.[objective.id]) {
      world.holdWarned[objective.id] = false;
    }
    world.holdWas[objective.id] = now;
  }
}

const PERSUADED_KINDS = { civilian: "civilians", criminal: "criminals", guard: "guards", police: "police", opposition: "enemy agents" };

/**
 * One fixed step of the operation. `chance()` gives a number from 0 to 1 from the world's own seeded stream (for which window a
 * shot breaks), so the same world and the same orders always play out the same way.
 */
export function advanceWorld(world, deltaSeconds, hooks, chance = () => 0.5) {
  world.missionSeconds += deltaSeconds;
  let changed = false;
  for (const event of advancePursuit(world.units, world.grid)) {
    if (event.reason === "none-selected") {
      hooks.message(`${findUnit(world, event.unitId).definition.name} has no weapon selected and stops the pursuit.`);
      changed = true;
    } else if (event.reason === "no-rounds") {
      hooks.message(`${findUnit(world, event.unitId).definition.name} is out of rounds and stops the pursuit.`);
      hooks.sound("alert");
      changed = true;
    }
  }
  for (const event of advanceTails(world.units, world.grid)) {
    const unit = findUnit(world, event.unitId);
    hooks.message(`${unit.definition.name} stops following: ${event.reason === "disabled" ? "they are down" : "they are gone"}.`);
    changed = true;
  }
  const arrivals = advanceUnits(world.units, deltaSeconds);
  advanceRegeneration(world.units, deltaSeconds);
  collectFallenGear(world, hooks);
  for (const unit of world.units) {
    if (!unit.lootTargetId || unit.path.length > 0) continue;
    const body = world.drops.find((item) => item.id === unit.lootTargetId);
    unit.lootTargetId = null;
    if (body && lootableBody(body) && inLootReach(unit, body)) {
      lootNow(world, hooks, unit, body);
      changed = true;
    }
  }
  for (const arrival of arrivals) {
    changed = true;
    changed = completeObjectivesAt(world, hooks, arrival.position) || changed;
  }
  for (const event of advancePatrols(world.units, deltaSeconds, world.grid, world.elapsed, world.drops)) {
    const watcher = findUnit(world, event.unitId);
    if (event.type === "pickup") {
      hooks.message(`${watcher.definition.name} takes ${event.items.join(" and ")} from the fallen.`);
      hooks.sound("select");
      changed = true;
      continue;
    }
    if (event.type === "say") {
      hooks.message(`${watcher.definition.name}: “${event.text}”`);
      hooks.sound("select");
      changed = true;
      continue;
    }
    if (event.type === "plant-bomb") {
      const charge = watcher.equipment.find((item) => item.definition.action === "time-bomb" && item.charges !== 0);
      if (charge && plantBomb(watcher, charge, world.bombs)) {
        const fuse = charge.definition.effect.fuse;
        hooks.message(`${watcher.definition.name} plants a ${charge.definition.name}! Get clear: ${fuse} seconds.`);
        hooks.sound("tick");
        changed = true;
      }
      continue;
    }
    if (event.type === "warning") {
      hooks.message(`${watcher.definition.name}: "Put down your weapon!" Holster it, or they open fire in two seconds.`);
      hooks.sound("police-warning");
      // The portrait of whoever is being warned flashes red for the two seconds before the police shoot.
      world.targeted[event.targetId] = world.elapsed + 2;
      changed = true;
      continue;
    }
    const spotted = findUnit(world, event.targetId);
    hooks.message(`${watcher.definition.name} spotted ${spotted.definition.name}! It is closing in.`);
    hooks.sound("alert");
    world.opStats.spotted += 1;
    changed = true;
  }
  advanceShields(world.units, deltaSeconds);
  advanceScanners(world.units, deltaSeconds);
  advanceDrugs(world.units, deltaSeconds);
  for (const bomb of world.bombs) {
    const second = Math.ceil(bomb.left);
    if (bomb.tickedAt !== second) {
      bomb.tickedAt = second;
      hooks.sound("tick");
    }
  }
  const vehicleEvents = advanceVehicles(world.units, deltaSeconds, world.roadGrid, world.grid, world.missionSeconds);
  for (const event of vehicleEvents.filter((item) => item.type === "train-drop")) {
    const names = event.unitIds.map((id) => findUnit(world, id)?.definition.name ?? id);
    hooks.message(`${names.join(", ")} got off the train at the platform.`);
    changed = true;
  }
  // A train sounds its horn as it pulls into a station and as it leaves.
  for (const event of vehicleEvents.filter((item) => item.type === "train-stops" || item.type === "train-leaves")) {
    hooks.sound("train-horn", { at: event.at });
  }
  for (const hit of vehicleEvents.filter((event) => event.type === "runover")) {
    const victim = findUnit(world, hit.unitId);
    const car = findUnit(world, hit.vehicleId);
    hooks.effect("impact", { unitId: hit.unitId });
    hooks.sound("hit");
    knockBack(world, victim, car);
    if (hit.disabled) {
      // The city does not bill the squad for a stranger's bad driving: only the squad's own car counts against it.
      const bystander = victim.side === "civilian" || victim.side === "police";
      if (!bystander || car.vehicle.controlledBy) countDisabled(world, hooks, victim);
      hooks.selectionChanged();
      changed = true;
    }
  }
  const blasts = [
    ...vehicleEvents.filter((event) => event.type === "blast"),
    ...advanceBombs(world.bombs, world.units, deltaSeconds, world.grid),
  ];
  for (const blast of blasts) {
    for (const prop of propsNear(world.props, blast.at, blast.radius)) {
      const change = damageProp(prop, 40, "explosion");
      if (change) announceProp(world, hooks, change);
    }
    hooks.effect("blast", { at: blast.at, radius: blast.radius });
    hooks.sound("blast");
    let glassBroken = 0;
    for (const building of world.buildings ?? []) {
      for (const key of windowsInBlast(building, blast.at, blast.radius + 2)) {
        if (!world.windowsBroken.has(key)) glassBroken += 1;
        world.windowsBroken.add(key);
      }
    }
    if (glassBroken > 0) hooks.sound("glass");
    startPanic(world.units, blast.at, world.grid);
    for (const hit of blast.hits) {
      const victim = findUnit(world, hit.unitId);
      hooks.effect("impact", { unitId: hit.unitId });
      knockBack(world, victim, { position: blast.at });
      if (hit.disabled) countDisabled(world, hooks, victim);
    }
    const harmed = blast.hits.filter((hit) => hit.disabled).length;
    const source = blast.source ? findUnit(world, blast.source) : null;
    hooks.message(
      `${source ? `The ${source.definition.name} explodes` : "The Delay Charge goes off"}: ` +
        `${blast.hits.length} caught in the blast` +
        (harmed > 0 ? `, ${harmed} down.` : "."),
    );
    hooks.selectionChanged();
    changed = true;
  }
  for (const event of advancePersuasion(world.units, deltaSeconds, world.grid)) {
    const agent = findUnit(world, event.agentId);
    const target = findUnit(world, event.targetId);
    if (event.type === "persuaded") {
      hooks.effect("persuade", { unitId: event.targetId });
      hooks.sound("persuade");
      const counted = event.kind === "criminal" ? "civilians" : PERSUADED_KINDS[event.kind];
      hooks.message(
        `${target.definition.name} now follows ${agent.definition.name} ` +
          `(${event.count} ${counted} persuaded, ${persuadePoints(agent)} points).` +
          (event.outOfCharges ? " The Persuader is spent." : ""),
      );
    } else if (event.type === "refused") {
      hooks.message(`${agent.definition.name} cannot persuade ${target.definition.name} yet: ${event.needs} needed.`);
    } else if (event.type === "reassigned") {
      hooks.message(`${findUnit(world, event.unitId).definition.name} now follows ${agent.definition.name}.`);
    }
    changed = true;
  }
  const fires = advanceProps(world.props, world.units, deltaSeconds);
  for (const change of fires.events) announceProp(world, hooks, change);
  for (const id of fires.ignited) {
    const unit = findUnit(world, id);
    if (unit) hooks.message(`${unit.definition.name} catches fire from the flames nearby.`);
  }
  const combatEvents = advanceCombat(world.units, deltaSeconds, world.grid, world.elapsed);
  if (combatEvents.length > 0) {
    changed = true;
    handleCombatEvents(world, hooks, combatEvents, chance);
  }
  for (const event of [
    ...resolveDisabled(world.objectives, world.units),
    ...resolveUnitObjectives(world.objectives, world.map.zones, world.units),
    ...advanceHold(world.objectives, world.map.zones, world.units, deltaSeconds),
    ...resolveExtraction(world.objectives, world.map.zones, world.units),
  ]) {
    world.opStats.objectivesCompleted += 1;
    syncWorldGates(world, hooks);
    hooks.sound("objective");
    hooks.message(`${event.objective.description} Commitment fulfilled.`);
    changed = true;
  }
  announceHolds(world, hooks);
  if (changed) hooks.changed();
}
