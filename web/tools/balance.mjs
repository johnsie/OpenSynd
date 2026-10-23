// SPDX-License-Identifier: GPL-2.0-or-later

// Plays every mission headlessly with a simple squad bot and reports how hard it is.
// Usage: node tools/balance.mjs [runs-per-mission]   (default 60)
// The bot uses the real game rules (patrols, chasing, combat, rounds, fatigue), with its
// tactics varied by a seeded generator, so results are repeatable.

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { ACHIEVEMENTS, newStats, newlyEarned } from "../src/achievements.js";
import { buildPatrolRoute, createTileGrid, findPath, formationTiles, zoneContains } from "../src/engine.js";
import { collectFallen, findLoot, lootBody, nearestLootable } from "../src/inventory.js";
import { advanceHold, missionOutcome, resolveArrival, resolveDisabled, resolveInteraction, syncGates } from "../src/mission.js";
import {
  FIXED_STEP_SECONDS,
  advanceCombat,
  advancePatrols,
  advanceUnits,
  combatStats,
  hasLineOfSight,
  roundsLeft,
  seedSimulation,
} from "../src/simulation.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "content");
const read = async (path) => JSON.parse(await readFile(`${root}/${path}`, "utf8"));

function generator(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function loadWorld(file) {
  const pack = await read("pack.json");
  const mission = await read(file);
  const map = await read(mission.map);
  const units = {};
  for (const path of pack.units) units[path] = await read(path);
  const items = {};
  for (const path of pack.equipment) items[path] = await read(path);
  return { mission, map, units, items };
}

function makeUnits(world, tactics) {
  const { mission, map, units: defs, items } = world;
  const grid = createTileGrid(map);
  const units = [...mission.team, ...mission.opponents].map((placement) => {
    const definition = defs[placement.unit];
    const team = definition.role === "operator";
    const unit = {
      id: placement.id,
      side: team ? "team" : "opposition",
      definition,
      position: { ...placement.position },
      path: [],
      equipment: placement.equipment.map((path) => ({ definition: items[path], charges: items[path].charges })),
      looted: [],
      activeSlot: null,
      alertedBy: null,
      health: definition.stats.vitality,
      cooldownRemaining: 0,
      targetId: null,
      disabled: false,
      patrol: null,
    };
    if (placement.patrol) {
      unit.patrol = { route: buildPatrolRoute(grid, placement.position, placement.patrol), index: 0 };
    }
    return unit;
  });
  return { grid, units };
}

const dist = (a, b) => Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y);
const tileOf = (p) => ({ x: Math.round(p.x), y: Math.round(p.y) });

function playOnce(world, tactics) {
  const { mission, map } = world;
  const { grid, units } = makeUnits(world, tactics);
  const objectives = mission.objectives.map((objective) => ({ ...objective, complete: false }));
  syncGates(grid, map, objectives);
  const stats = newStats(mission.opponents.length);
  const earned = [];
  let seconds = 0;
  let nextThink = 0;
  const drops = [];
  const team = units.filter((unit) => unit.side === "team");
  const watchers = units.filter((unit) => unit.side === "opposition");
  const zoneOf = (objective) => map.zones.find((zone) => zone.id === objective.targetZone);

  const send = (unit, tile) => {
    const path = findPath(grid, tileOf(unit.position), tile);
    if (path.length > 0) {
      unit.path = path;
      unit.targetId = null;
    }
  };
  const moveSquad = (centre) => {
    const active = team.filter((unit) => !unit.disabled);
    const tiles = formationTiles(grid, centre, active.length);
    const free = [...tiles];
    for (const unit of active) {
      let best = 0;
      for (let i = 1; i < free.length; i += 1) {
        if (Math.hypot(free[i].x - unit.position.x, free[i].y - unit.position.y) <
            Math.hypot(free[best].x - unit.position.x, free[best].y - unit.position.y)) best = i;
      }
      if (free.length > 0) send(unit, free.splice(best, 1)[0]);
    }
  };

  const think = () => {
    const active = team.filter((unit) => !unit.disabled);
    const live = watchers.filter((unit) => !unit.disabled);
    const close = live.filter((w) => active.some((o) => dist(o, w) <= tactics.engageRange));

    // Upkeep: the bot keeps its best loaded weapon selected (a player has to choose one to fire), then
    // repairs.
    for (const unit of active) {
      let best = -1;
      unit.equipment.forEach((item, slot) => {
        if (item.definition.action !== "disable-pulse" || item.charges === 0) return;
        if (best === -1 || item.definition.effect.range > unit.equipment[best].definition.effect.range) best = slot;
      });
      unit.activeSlot = best === -1 ? null : best;
      const kit = unit.equipment.find((item) => item.definition.action === "restore-vitality" && item.charges !== 0);
      if (kit && unit.health < 50) {
        unit.health = Math.min(unit.definition.stats.vitality, unit.health + kit.definition.effect.restoreVitality);
        kit.charges -= 1;
      }
    }

    if (close.length > 0) {
      for (const unit of active) {
        const target = close.reduce((best, w) => (dist(unit, w) < dist(unit, best) ? w : best));
        if (roundsLeft(unit) === 0) continue;
        if (dist(unit, target) <= combatStats(unit, dist(unit, target)).range) {
          unit.path = [];
          unit.targetId = target.id;
        } else if (unit.path.length === 0) {
          send(unit, tileOf(target.position));
        }
      }
      return;
    }

    // Looting what has fallen, if this squad bothers to.
    if (tactics.loot) {
      const found = findLoot(active, drops);
      if (found) lootBody(found.operator, found.body);
      else {
        const body = active.length ? nearestLootable(active[0], drops) : null;
        if (body && dist(active[0], body) < 10 && active[0].path.length === 0) send(active[0], tileOf(body.position));
      }
    }

    const next = objectives.find((objective) => !objective.complete);
    if (!next) return;
    if (next.type === "disable") {
      // Go after the named targets: close in until every operator has a clear line and is in range.
      const target = live.find((unit) => next.targets.includes(unit.id));
      if (!target) return;
      for (const unit of active) {
        if (roundsLeft(unit) === 0) continue;
        const inRange = dist(unit, target) <= combatStats(unit, dist(unit, target)).range;
        if (inRange && hasLineOfSight(grid, unit.position, target.position)) {
          unit.path = [];
          unit.targetId = target.id;
        } else if (unit.path.length === 0) {
          send(unit, tileOf(target.position));
        }
      }
      return;
    }
    const zone = zoneOf(next);
    const centre = { x: zone.position.x, y: zone.position.y };
    const inZone = (unit) => zoneContains(zone, tileOf(unit.position));
    if (next.type === "hold") {
      // Stand in the zone until the clock runs out.
      if (active.every((unit) => unit.path.length === 0) && !active.some(inZone)) moveSquad(centre);
      return;
    }
    if (next.type === "interact") {
      const there = active.find((unit) => unit.path.length === 0 && inZone(unit));
      if (there && resolveInteraction(objectives, map.zones, tileOf(there.position))) {
        stats.objectivesCompleted += 1;
        syncGates(grid, map, objectives);
        return;
      }
      // Send the operator nearest the zone onto it; the rest follow to tiles around it.
      if (active.every((unit) => unit.path.length === 0)) {
        const lead = active.reduce((best, unit) => (dist(unit, { position: centre }) < dist(best, { position: centre }) ? unit : best));
        send(lead, centre);
        for (const unit of active) if (unit !== lead) send(unit, centre);
      }
      return;
    }
    // Extraction: everyone heads for the exit zone.
    if (active.every((unit) => unit.path.length === 0) && !active.some(inZone)) moveSquad(centre);
  };

  const limit = 20 * 60;
  let outcome = "active";
  while (seconds < limit && outcome === "active") {
    if (seconds >= nextThink) {
      think();
      nextThink = seconds + 0.25;
    }
    for (const arrival of advanceUnits(units, FIXED_STEP_SECONDS)) {
      for (const event of resolveArrival(objectives, map.zones, arrival.position)) {
        if (event.type === "complete") stats.objectivesCompleted += 1;
      }
      syncGates(grid, map, objectives);
    }
    for (const event of [...resolveDisabled(objectives, units), ...advanceHold(objectives, map.zones, units, FIXED_STEP_SECONDS)]) {
      if (event.type === "complete") stats.objectivesCompleted += 1;
      syncGates(grid, map, objectives);
    }
    collectFallen(units, drops, grid);
    for (const event of advancePatrols(units, FIXED_STEP_SECONDS, grid, null, drops)) {
      if (event.type === "spotted") stats.spotted += 1;
    }
    for (const event of advanceCombat(units, FIXED_STEP_SECONDS, grid)) {
      if (event.type === "disabled") {
        const down = units.find((unit) => unit.id === event.unitId);
        if (down.side === "opposition") stats.enemiesDisabled += 1;
        else stats.operatorsDisabled += 1;
      }
    }
    seconds += FIXED_STEP_SECONDS;
    stats.seconds = seconds;
    outcome = missionOutcome(objectives, units);
  }
  if (outcome === "active") {
    outcome = "timeout";
    if (process.env.BALANCE_DEBUG) {
      console.log("TIMEOUT", JSON.stringify({
        done: objectives.map((o) => `${o.id}:${o.complete}`),
        squad: team.map((u) => ({
          at: tileOf(u.position),
          path: u.path.length,
          hp: u.health,
          off: u.disabled,
          rounds: roundsLeft(u),
          tgt: u.targetId,
        })),
        watchers: watchers.filter((w) => !w.disabled).map((w) => ({ at: tileOf(w.position), rounds: roundsLeft(w), alert: w.alertedBy })),
        tactics,
      }));
    }
  }
  stats.outcome = outcome === "timeout" ? "failure" : outcome;
  for (const achievement of newlyEarned(stats, earned)) earned.push(achievement.id);
  const funds = Math.floor(seconds * 0.1) + earned.reduce((sum, id) => sum + ACHIEVEMENTS.find((a) => a.id === id).reward, 0);
  return { outcome, seconds, operatorsLost: stats.operatorsDisabled, watchersDown: stats.enemiesDisabled, spotted: stats.spotted, funds };
}

function summarise(results) {
  const wins = results.filter((r) => r.outcome === "success");
  const mean = (list, key) => (list.length ? list.reduce((s, r) => s + r[key], 0) / list.length : 0);
  return {
    winRate: Math.round((wins.length / results.length) * 100),
    timeouts: results.filter((r) => r.outcome === "timeout").length,
    minutes: (mean(wins, "seconds") / 60).toFixed(1),
    lost: mean(results, "operatorsLost").toFixed(1),
    killed: mean(results, "watchersDown").toFixed(1),
    spotted: mean(results, "spotted").toFixed(1),
    funds: Math.round(mean(wins, "funds")),
  };
}

const runs = Number(process.argv[2] ?? 60);
const pack = await read("pack.json");
const policies = {
  rush: (r) => ({ engageRange: 2.5 + r() * 2, loot: false }),
  steady: (r) => ({ engageRange: 5 + r() * 4, loot: r() < 0.5 }),
  careful: (r) => ({ engageRange: 8 + r() * 3, loot: true }),
};
// The bot only knows the original objective types; operations built on the newer ones are balanced by hand.
const SUPPORTED = new Set(["reach-zone", "interact", "disable", "hold", "extract"]);
// Optional second argument: only operations whose file name contains it (the campaign has 50).
const only = process.argv[3] ?? "";
for (const file of pack.missions) {
  if (only && !file.includes(only)) continue;
  const world = await loadWorld(file);
  if (!world.mission.objectives.every((objective) => SUPPORTED.has(objective.type))) {
    console.log(`\n${world.mission.name}: skipped (uses objective types the bot cannot play)`);
    continue;
  }
  console.log(`\n${world.mission.name}  (${world.mission.opponents.length} enemies, ${runs} runs per policy)`);
  console.log("policy    win%  timeouts  min   lost  killed  spotted  funds");
  for (const [name, make] of Object.entries(policies)) {
    const random = generator(name.length * 1009 + file.length);
    const results = [];
    for (let run = 0; run < runs; run += 1) {
      seedSimulation(run + 1);
      results.push(playOnce(world, make(random)));
    }
    const s = summarise(results);
    const cells = [
      name.padEnd(9),
      `${String(s.winRate).padStart(3)}%`,
      String(s.timeouts).padStart(8),
      s.minutes.padStart(4),
      s.lost.padStart(4),
      s.killed.padStart(6),
      s.spotted.padStart(7),
      String(s.funds).padStart(5),
    ];
    console.log(cells.join("  "));
  }
}
