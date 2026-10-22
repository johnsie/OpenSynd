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

// Zone-entry objectives (everything except "interact") resolve when a unit
// arrives. Extraction waits until every other required objective is complete.
// Returns events in order; completed objectives are marked in place.
export function resolveArrival(objectives, zones, position) {
  const events = [];
  for (const objective of objectives) {
    if (objective.complete || objective.type === "interact") continue;
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
