// SPDX-License-Identifier: GPL-2.0-or-later

export const SAVE_FORMAT = "opensynd-save";
export const SAVE_VERSION = 7;
export const LOCAL_SAVE_KEY = "opensynd.save.v7";
export const LEGACY_LOCAL_SAVE_KEYS = [
  "opensynd.save.v6",
  "opensynd.save.v5",
  "opensynd.save.v4",
  "opensynd.save.v3",
  "opensynd.save.v2",
  "opensynd.save.v1",
];

import { BARS, defaultLevels, isValidLevel, isValidMeter, maxCooldownMultiplier } from "./stats.js";

function fail(message) {
  throw new Error(`Invalid OpenSynd save: ${message}`);
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validatePoint(point, bounds, label, allowFraction = false) {
  if (!isObject(point)) fail(`${label} must be a coordinate`);
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    fail(`${label} contains a non-finite coordinate`);
  }
  if (!allowFraction && (!Number.isInteger(point.x) || !Number.isInteger(point.y))) {
    fail(`${label} must use whole grid coordinates`);
  }
  if (point.x < 0 || point.y < 0 || point.x >= bounds.width || point.y >= bounds.height) {
    fail(`${label} is outside the map`);
  }
  return { x: point.x, y: point.y };
}

function requireExactIds(records, expectedIds, label) {
  if (!Array.isArray(records) || records.length !== expectedIds.length) {
    fail(`${label} list does not match this mission`);
  }
  const actualIds = records.map((record) => record?.id);
  if (new Set(actualIds).size !== actualIds.length) fail(`${label} IDs must be unique`);
  for (const id of expectedIds) {
    if (!actualIds.includes(id)) fail(`${label} is missing ${id}`);
  }
}

export function createSaveSnapshot(state, createdAt = new Date().toISOString()) {
  return {
    format: SAVE_FORMAT,
    formatVersion: SAVE_VERSION,
    createdAt,
    missionId: state.mission.id,
    selectedId: state.selectedId,
    cursor: { ...state.cursor },
    units: state.units.map((unit) => ({
      id: unit.id,
      position: { ...unit.position },
      path: unit.path.map((point) => ({ ...point })),
      health: unit.health,
      cooldownRemaining: unit.cooldownRemaining,
      targetId: unit.targetId,
      disabled: unit.disabled,
      patrolIndex: unit.patrol?.index ?? 0,
      levels: { ...(unit.levels ?? defaultLevels()) },
      stamina: unit.stamina ?? 1,
      focus: unit.focus ?? 1,
    })),
    objectives: state.objectives.map((objective) => ({
      id: objective.id,
      complete: objective.complete,
    })),
  };
}

export function validateSaveSnapshot(value, context) {
  if (!isObject(value)) fail("root must be an object");
  if (value.format !== SAVE_FORMAT) fail("unrecognized format");
  if (value.formatVersion !== SAVE_VERSION) {
    fail(`unsupported format version ${String(value.formatVersion)}`);
  }
  if (value.missionId !== context.missionId) fail("save belongs to another mission");
  const createdAt = typeof value.createdAt === "string" ? new Date(value.createdAt) : null;
  if (
    createdAt === null ||
    Number.isNaN(createdAt.valueOf()) ||
    createdAt.toISOString() !== value.createdAt
  ) {
    fail("createdAt must be an ISO date string");
  }

  requireExactIds(value.units, context.unitIds, "unit");
  requireExactIds(value.objectives, context.objectiveIds, "objective");

  const units = value.units.map((unit) => {
    if (!isObject(unit)) fail("unit entry must be an object");
    if (!Array.isArray(unit.path)) fail(`path for ${unit.id} must be an array`);
    const position = validatePoint(unit.position, context.bounds, `${unit.id} position`, true);
    const path = unit.path.map((point, index) => {
      const validated = validatePoint(point, context.bounds, `${unit.id} path ${index}`);
      if (context.isWalkable && !context.isWalkable(validated.x, validated.y)) {
        fail(`${unit.id} path ${index} is not walkable`);
      }
      return validated;
    });
    const rule = context.unitRules[unit.id];
    if (!Number.isInteger(unit.health) || unit.health < 0 || unit.health > rule.vitality) {
      fail(`${unit.id} health is outside its vitality range`);
    }
    if (
      !Number.isFinite(unit.cooldownRemaining) ||
      unit.cooldownRemaining < 0 ||
      unit.cooldownRemaining > rule.cooldown * maxCooldownMultiplier()
    ) {
      fail(`${unit.id} cooldown is invalid`);
    }
    if (typeof unit.disabled !== "boolean" || unit.disabled !== (unit.health === 0)) {
      fail(`${unit.id} disabled state does not match its health`);
    }
    if (unit.targetId !== null) {
      const targetRule = context.unitRules[unit.targetId];
      if (!targetRule || targetRule.side === rule.side) {
        fail(`${unit.id} has an invalid combat target`);
      }
    }
    if (unit.disabled && (path.length > 0 || unit.targetId !== null)) {
      fail(`${unit.id} cannot have orders while disabled`);
    }
    if (!isObject(unit.levels) || !BARS.every((bar) => isValidLevel(unit.levels[bar]))) {
      fail(`${unit.id} training levels are invalid`);
    }
    if (!isValidMeter(unit.stamina)) fail(`${unit.id} stamina is invalid`);
    if (!isValidMeter(unit.focus)) fail(`${unit.id} focus is invalid`);
    const patrolLength = context.patrolLengths?.[unit.id] ?? 0;
    if (
      !Number.isInteger(unit.patrolIndex) ||
      unit.patrolIndex < 0 ||
      unit.patrolIndex >= Math.max(1, patrolLength)
    ) {
      fail(`${unit.id} patrol position is invalid`);
    }
    return {
      id: unit.id,
      position,
      path,
      health: unit.health,
      cooldownRemaining: unit.cooldownRemaining,
      targetId: unit.targetId,
      disabled: unit.disabled,
      patrolIndex: unit.patrolIndex,
      levels: { speed: unit.levels.speed, brain: unit.levels.brain },
      stamina: unit.stamina,
      focus: unit.focus,
    };
  });

  const objectives = value.objectives.map((objective) => {
    if (!isObject(objective) || typeof objective.complete !== "boolean") {
      fail("objective completion must be boolean");
    }
    return { id: objective.id, complete: objective.complete };
  });

  if (
    value.selectedId !== null &&
    !context.selectableUnitIds.includes(value.selectedId)
  ) {
    fail("selectedId is not a selectable operator");
  }
  if (value.selectedId !== null && units.find((unit) => unit.id === value.selectedId).disabled) {
    fail("selectedId cannot refer to a disabled operator");
  }

  return {
    format: SAVE_FORMAT,
    formatVersion: SAVE_VERSION,
    createdAt: createdAt.toISOString(),
    missionId: value.missionId,
    selectedId: value.selectedId,
    cursor: validatePoint(value.cursor, context.bounds, "cursor"),
    units,
    objectives,
  };
}

export function parseSaveSnapshot(text, context) {
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    fail("file is not valid JSON");
  }
  return validateSaveSnapshot(migrateSaveSnapshot(value, context), context);
}

export function migrateSaveSnapshot(value, context) {
  if (!isObject(value) || value.format !== SAVE_FORMAT || !Array.isArray(value.units)) {
    return value;
  }
  let migrated = value;
  if (migrated.formatVersion === 1) {
    migrated = {
      ...migrated,
      formatVersion: 2,
      units: migrated.units.map((unit) => {
      const rule = context.unitRules[unit?.id];
      return {
        ...unit,
        health: rule?.vitality,
        cooldownRemaining: 0,
        targetId: null,
        disabled: false,
      };
      }),
    };
  }
  if (migrated.formatVersion === 2) {
    const existingIds = new Set(migrated.units.map((unit) => unit?.id));
    const addedUnits = context.unitIds
      .filter((id) => !existingIds.has(id))
      .map((id) => {
        const rule = context.unitRules[id];
        const initial = context.initialUnits[id];
        return {
          id,
          position: { ...initial.position },
          path: [],
          health: rule.vitality,
          cooldownRemaining: 0,
          targetId: null,
          disabled: false,
        };
      });
    migrated = {
      ...migrated,
      formatVersion: 3,
      units: [...migrated.units, ...addedUnits],
    };
  }
  if (migrated.formatVersion === 3) {
    // Version 4 tracks each patrolling unit's place along its route.
    migrated = {
      ...migrated,
      formatVersion: 4,
      units: migrated.units.map((unit) => ({ ...unit, patrolIndex: 0 })),
    };
  }
  if (migrated.formatVersion === 4) {
    // Version 5 stores each unit's speed and brain training levels.
    migrated = {
      ...migrated,
      formatVersion: 5,
      units: migrated.units.map((unit) => ({ ...unit, levels: defaultLevels() })),
    };
  }
  if (migrated.formatVersion === 5) {
    // Version 6 stores each unit's stamina; older saves start everyone fresh.
    migrated = {
      ...migrated,
      formatVersion: 6,
      units: migrated.units.map((unit) => ({ ...unit, stamina: 1 })),
    };
  }
  if (migrated.formatVersion === 6) {
    // Version 7 stores each unit's focus (mental fatigue); older saves start everyone sharp.
    migrated = {
      ...migrated,
      formatVersion: SAVE_VERSION,
      units: migrated.units.map((unit) => ({ ...unit, focus: 1 })),
    };
  }
  // Missions may gain objectives after a save was written; they start incomplete.
  if (Array.isArray(migrated.objectives) && Array.isArray(context.objectiveIds)) {
    const known = new Set(migrated.objectives.map((objective) => objective?.id));
    const added = context.objectiveIds
      .filter((id) => !known.has(id))
      .map((id) => ({ id, complete: false }));
    if (added.length > 0) {
      migrated = { ...migrated, objectives: [...migrated.objectives, ...added] };
    }
  }
  return migrated;
}
