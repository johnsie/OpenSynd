// SPDX-License-Identifier: GPL-2.0-or-later

import { applyGates, findObjectiveAtPosition, zoneContains } from "./engine.js";

// A gate is open once the objective at its control zone is complete.
export function gateOpen(objectives, gate) {
  return objectives.some((item) => item.targetZone === gate.control && item.complete);
}

export function syncGates(grid, map, objectives) {
  applyGates(grid, map.objects ?? [], (gate) => gateOpen(objectives, gate));
}

export function missionComplete(objectives) {
  return objectives.filter((item) => item.required).every((item) => item.complete);
}

// "success" once every required objective is complete, "failure" when no
// operator can act any more, otherwise "active".
export function missionOutcome(objectives, units) {
  if (missionComplete(objectives)) return "success";
  const operatorsRemain = units.some((unit) => unit.side === "team" && !unit.disabled);
  return operatorsRemain ? "active" : "failure";
}

// These objectives finish some other way than a unit walking into their zone.
const ZONE_NEVER_ARRIVES = new Set(["interact", "disable", "hold"]);

// Zone-entry objectives (everything except "interact", "disable" and "hold") resolve when a unit
// arrives. Extraction waits until every other required objective is complete.
// Returns events in order; completed objectives are marked in place.
export function resolveArrival(objectives, zones, position) {
  const events = [];
  for (const objective of objectives) {
    if (objective.complete || ZONE_NEVER_ARRIVES.has(objective.type)) continue;
    const zone = zones.find((item) => item.id === objective.targetZone);
    if (!zone || !zoneContains(zone, position)) continue;
    if (objective.type === "extract") {
      const pending = objectives.some(
        (item) => item.required && item.type !== "extract" && !item.complete,
      );
      if (pending) {
        events.push({ type: "blocked", objective });
        continue;
      }
    }
    objective.complete = true;
    events.push({ type: "complete", objective });
  }
  return events;
}

// A deliberate interaction completes the "interact" objective at the position.
export function resolveInteraction(objectives, zones, position) {
  const objective = findObjectiveAtPosition(objectives, zones, position, "interact");
  if (objective) objective.complete = true;
  return objective;
}

// A "disable" objective completes once every placement it names has been disabled.
export function resolveDisabled(objectives, units) {
  const events = [];
  for (const objective of objectives) {
    if (objective.type !== "disable" || objective.complete) continue;
    const done = objective.targets.every((id) => units.find((unit) => unit.id === id)?.disabled ?? true);
    if (!done) continue;
    objective.complete = true;
    events.push({ type: "complete", objective });
  }
  return events;
}

// A "hold" objective counts seconds while any able operator stands in its zone. Leaving the zone
// lets the progress drain at twice the rate it built, so a brief step out costs little but
// abandoning the zone loses it. Returns completion events.
export function advanceHold(objectives, zones, units, deltaSeconds) {
  const events = [];
  for (const objective of objectives) {
    if (objective.type !== "hold" || objective.complete) continue;
    const zone = zones.find((item) => item.id === objective.targetZone);
    if (!zone) continue;
    const held = units.some((unit) => unit.side === "team" && !unit.disabled && zoneContains(zone, unit.position));
    const progress = objective.progress ?? 0;
    objective.progress = held
      ? Math.min(objective.holdSeconds, progress + deltaSeconds)
      : Math.max(0, progress - deltaSeconds * 2);
    if (objective.progress >= objective.holdSeconds) {
      objective.complete = true;
      events.push({ type: "complete", objective });
    }
  }
  return events;
}

// Whether a unit is a named target of an objective that is still open (drawn with a marker).
export function isOpenTarget(objectives, unitId) {
  return objectives.some((item) => item.type === "disable" && !item.complete && item.targets.includes(unitId));
}
