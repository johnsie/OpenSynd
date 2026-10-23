// SPDX-License-Identifier: GPL-2.0-or-later

import { applyGates, findObjectiveAtPosition, zoneContains } from "./engine.js";

// A gate is open once the objective at its control zone is complete, or while an operator carrying its key
// (`key` is an equipment id, such as a clearance key) stands within the key's reach of it.
// A door is not controlled by an objective: it stands open while a living person (or vehicle) is beside it, and, if it is
// locked (`key`), only while someone carrying the key is.
export const DOOR_REACH = 1.6;

function doorOpen(gate, units) {
  return units.some((unit) => {
    if (unit.disabled || unit.inVehicle) return false;
    if (gate.key && !(unit.equipment ?? []).some((entry) => entry.definition.id === gate.key)) return false;
    const nearestX = Math.max(gate.position.x, Math.min(unit.position.x, gate.position.x + gate.width - 1));
    const nearestY = Math.max(gate.position.y, Math.min(unit.position.y, gate.position.y + gate.height - 1));
    return Math.hypot(unit.position.x - nearestX, unit.position.y - nearestY) <= DOOR_REACH;
  });
}

export function gateOpen(objectives, gate, units = []) {
  if (gate.kind === "door") return doorOpen(gate, units);
  if (objectives.some((item) => item.targetZone === gate.control && item.complete)) return true;
  if (!gate.key) return false;
  return units.some((unit) => {
    if (unit.side !== "team" || unit.disabled) return false;
    const item = (unit.equipment ?? []).find((entry) => entry.definition.id === gate.key);
    if (!item) return false;
    const reach = item.definition.effect.range ?? 2.5;
    const nearestX = Math.max(gate.position.x, Math.min(unit.position.x, gate.position.x + gate.width - 1));
    const nearestY = Math.max(gate.position.y, Math.min(unit.position.y, gate.position.y + gate.height - 1));
    return Math.hypot(unit.position.x - nearestX, unit.position.y - nearestY) <= reach;
  });
}

export function syncGates(grid, map, objectives, units = []) {
  applyGates(grid, map.objects ?? [], (gate) => gateOpen(objectives, gate, units));
}

export function missionComplete(objectives) {
  return objectives.filter((item) => item.required).every((item) => item.complete);
}

// In a sequential operation (`sequence: true` in the mission) the required objectives are done in order:
// only the first one still open can progress, and the briefing points at it. Otherwise any of them can be done
// in any order.
export function currentObjective(objectives) {
  return objectives.find((item) => item.required && !item.complete) ?? null;
}

function canProgress(objectives, objective) {
  return !objective.sequence || !objective.required || currentObjective(objectives) === objective;
}

// Why the operation is lost even though operators stand: a named person to protect has fallen, or a target that
// had to be stopped got away. Returns a sentence, or null.
export function failureReason(objectives, units) {
  const find = (id) => units.find((unit) => unit.id === id);
  for (const objective of objectives) {
    if (objective.complete || !objective.required) continue;
    if (objective.type === "protect") {
      const lost = (objective.targets ?? []).map(find).find((unit) => unit?.disabled);
      if (lost) return `${lost.definition.name} was lost. ${objective.description}`;
    }
    if (objective.type === "disable") {
      const gone = (objective.targets ?? []).map(find).find((unit) => unit?.escaped);
      if (gone) return `${gone.definition.name} got away. ${objective.description}`;
    }
  }
  return null;
}

// "success" once every required objective is complete, "failure" when no operator can act any more or an
// objective can no longer be met, otherwise "active".
export function missionOutcome(objectives, units) {
  if (missionComplete(objectives)) return "success";
  if (failureReason(objectives, units)) return "failure";
  const operatorsRemain = units.some((unit) => unit.side === "team" && !unit.disabled);
  return operatorsRemain ? "active" : "failure";
}

// These objectives finish some other way than a unit walking into their zone.
const ZONE_NEVER_ARRIVES = new Set([
  "interact", "disable", "hold", "persuade", "eliminate", "destroy-vehicle", "use-vehicle", "take-item", "evacuate", "protect",
]);

// Zone-entry objectives (everything except "interact", "disable" and "hold") resolve when a unit
// arrives. Extraction waits until every other required objective is complete.
// Returns events in order; completed objectives are marked in place.
export function resolveArrival(objectives, zones, position) {
  const events = [];
  for (const objective of objectives) {
    if (objective.complete || ZONE_NEVER_ARRIVES.has(objective.type) || !canProgress(objectives, objective)) continue;
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
  if (!objective || !canProgress(objectives, objective)) return null;
  objective.complete = true;
  return objective;
}

// A "disable" objective completes once every placement it names has been disabled.
export function resolveDisabled(objectives, units) {
  const events = [];
  for (const objective of objectives) {
    if (objective.type !== "disable" || objective.complete || !canProgress(objectives, objective)) continue;
    const done = objective.targets.every((id) => {
      const unit = units.find((candidate) => candidate.id === id);
      return !unit || (unit.disabled && !unit.escaped);
    });
    if (!done) continue;
    objective.complete = true;
    events.push({ type: "complete", objective });
  }
  return events;
}

// The units an objective is about: the named placements, or everyone in a group ("opposition" or a unit role).
function objectiveUnits(objective, units) {
  if (objective.targets) return objective.targets.map((id) => units.find((unit) => unit.id === id)).filter(Boolean);
  if (objective.group) {
    return units.filter((unit) => unit.side === objective.group || unit.definition.role === objective.group);
  }
  return [];
}

const inZone = (zones, objective, unit) => {
  const zone = zones.find((item) => item.id === objective.targetZone);
  return Boolean(zone) && zoneContains(zone, unit.position);
};

// Objectives about what happens to particular people, vehicles and items:
//   persuade         every named target (or `count` of them) follows the squad
//   eliminate        everyone in a group is down or has been won over
//   destroy-vehicle  every named vehicle is wrecked
//   use-vehicle      an operator is riding in a named vehicle
//   take-item        an operator carries the item (`item` is an equipment id)
//   evacuate         `count` persuaded followers (or the named ones) stand in the zone
//   protect          every named person is alive in the zone (an escort); losing one fails the operation
export function resolveUnitObjectives(objectives, zones, units) {
  const events = [];
  const team = units.filter((unit) => unit.side === "team" && !unit.disabled);
  for (const objective of objectives) {
    if (objective.complete || !canProgress(objectives, objective)) continue;
    let done = false;
    switch (objective.type) {
      case "persuade": {
        const targets = objectiveUnits(objective, units);
        const won = targets.filter((unit) => unit.persuaded && !unit.disabled).length;
        done = targets.length > 0 && won >= (objective.count ?? targets.length);
        break;
      }
      case "eliminate": {
        const group = objectiveUnits(objective, units);
        done = group.length > 0 && group.every((unit) => unit.disabled || unit.persuaded);
        break;
      }
      case "destroy-vehicle": {
        const targets = objectiveUnits(objective, units);
        done = targets.length > 0 && targets.every((unit) => unit.disabled);
        break;
      }
      case "use-vehicle":
        done = (objective.targets ?? []).some((id) => team.some((unit) => unit.inVehicle === id));
        break;
      case "take-item":
        done = team.some((unit) => (unit.equipment ?? []).some((item) => item.definition.id === objective.item));
        break;
      case "evacuate": {
        const followers = objective.targets
          ? objectiveUnits(objective, units)
          : units.filter((unit) => unit.persuaded && !unit.disabled);
        const arrived = followers.filter((unit) => !unit.disabled && inZone(zones, objective, unit)).length;
        done = arrived >= (objective.count ?? Math.max(1, followers.length)) && arrived > 0;
        break;
      }
      case "protect": {
        const targets = objectiveUnits(objective, units);
        done = targets.length > 0 && targets.every((unit) => !unit.disabled && inZone(zones, objective, unit));
        break;
      }
      default:
        continue;
    }
    if (!done) continue;
    objective.complete = true;
    events.push({ type: "complete", objective });
  }
  return events;
}

// Where the briefing should point for an objective: its zone, or the people and vehicles it names. Positions are
// grid coordinates; used by the minimap marker.
export function objectiveFocus(objective, zones, units) {
  if (!objective) return [];
  if (objective.targets && objective.type !== "evacuate" && objective.type !== "protect") {
    const live = objectiveUnits(objective, units).filter((unit) => !unit.disabled && !unit.inVehicle);
    if (live.length > 0 || objective.type === "persuade") return live.map((unit) => ({ ...unit.position }));
  }
  const zone = zones.find((item) => item.id === objective.targetZone);
  return zone ? [{ x: zone.position.x + zone.width / 2, y: zone.position.y + zone.height / 2 }] : [];
}

// A "hold" objective counts seconds while any able operator stands in its zone. Leaving the zone
// lets the progress drain at twice the rate it built, so a brief step out costs little but
// abandoning the zone loses it. Returns completion events.
export function advanceHold(objectives, zones, units, deltaSeconds) {
  const events = [];
  for (const objective of objectives) {
    if (objective.type !== "hold" || objective.complete || !canProgress(objectives, objective)) continue;
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
