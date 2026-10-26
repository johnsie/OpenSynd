// SPDX-License-Identifier: GPL-2.0-or-later

export const SAVE_FORMAT = "opensynd-save";
export const SAVE_VERSION = 10;
export const LOCAL_SAVE_KEY = "opensynd.save.v10";
export const LEGACY_LOCAL_SAVE_KEYS = [
  "opensynd.save.v9",
  "opensynd.save.v8",
  "opensynd.save.v7",
  "opensynd.save.v6",
  "opensynd.save.v5",
  "opensynd.save.v4",
  "opensynd.save.v3",
  "opensynd.save.v2",
  "opensynd.save.v1",
];

import { MAX_DRUG_RECHARGE, sanitizeDrugs } from "./drugs.js";

// Mirrors SLOTS_PER_OPERATIVE in campaign.js: no unit may carry more than eight items.
const MAX_ITEMS = 8;

function fail(message) {
  throw new Error(`Invalid NeuroReign save: ${message}`);
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
    drops: (state.drops ?? []).map((drop) => ({
      id: drop.id,
      itemId: drop.equipment[0].definition.id,
      charges: drop.equipment[0].charges,
      x: drop.position.x,
      y: drop.position.y,
    })),
    units: state.units.map((unit) => ({
      id: unit.id,
      position: { ...unit.position },
      path: unit.path.map((point) => ({ ...point })),
      health: unit.health,
      cooldownRemaining: unit.cooldownRemaining,
      targetId: unit.targetId,
      disabled: unit.disabled,
      patrolIndex: unit.patrol?.index ?? 0,
      equipment: (unit.equipment ?? []).map((item) => ({ id: item.definition.id, charges: item.charges })),
      looted: [...(unit.looted ?? [])],
      drugs: unit.drugs ? structuredClone(unit.drugs) : null,
      escaped: Boolean(unit.escaped),
      scriptIndex: unit.script?.index ?? 0,
      scriptDone: Boolean(unit.script?.done),
      persuadedBy: unit.persuadedBy ?? null,
      persuasions: { civilian: 0, police: 0, guard: 0, opposition: 0, ...(unit.persuasions ?? {}) },
    })),
    objectives: state.objectives.map((objective) => ({
      id: objective.id,
      complete: objective.complete,
    })),
  };
}

// Gear lying on the ground (optional: older saves have none): each is one known item at a point on the map.
function validateDrops(value, context) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 200) fail("drops must be a short list");
  const seen = new Set();
  return value.map((drop) => {
    if (!isObject(drop) || typeof drop.id !== "string" || drop.id.length === 0 || drop.id.length > 120 || seen.has(drop.id)) {
      fail("a dropped item is invalid");
    }
    seen.add(drop.id);
    const validCharges = drop.charges === null || (Number.isInteger(drop.charges) && drop.charges >= 0 && drop.charges <= 99);
    const known = typeof drop.itemId === "string" && (!context.itemIds || context.itemIds.includes(drop.itemId));
    const inside = Number.isFinite(drop.x) && Number.isFinite(drop.y) && drop.x >= 0 && drop.y >= 0 &&
      drop.x < context.bounds.width && drop.y < context.bounds.height;
    if (!known || !validCharges || !inside) fail(`dropped item ${drop.id} is invalid`);
    return { id: drop.id, itemId: drop.itemId, charges: drop.charges, x: drop.x, y: drop.y };
  });
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
      unit.cooldownRemaining > rule.cooldown * MAX_DRUG_RECHARGE
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
    const known = (id) => typeof id === "string" && (!context.itemIds || context.itemIds.includes(id));
    if (!Array.isArray(unit.equipment) || unit.equipment.length > MAX_ITEMS) {
      fail(`${unit.id} carries too many items`);
    }
    for (const item of unit.equipment) {
      const validCharges = item?.charges === null || (Number.isInteger(item?.charges) && item.charges >= 0 && item.charges <= 99);
      if (!isObject(item) || !known(item.id) || !validCharges) fail(`${unit.id} carries an invalid item`);
    }
    if (!Array.isArray(unit.looted) || unit.looted.length > MAX_ITEMS || !unit.looted.every(known)) {
      fail(`${unit.id} has an invalid loot record`);
    }
    if (unit.persuadedBy !== null && (!context.selectableUnitIds.includes(unit.persuadedBy) || unit.persuadedBy === unit.id)) {
      fail(`${unit.id} is persuaded by someone who cannot persuade`);
    }
    const counts = unit.persuasions;
    const validCount = (value) => Number.isInteger(value) && value >= 0 && value <= 999;
    if (!isObject(counts) || !["civilian", "police", "guard", "opposition"].every((kind) => validCount(counts[kind]))) {
      fail(`${unit.id} persuasion counts are invalid`);
    }
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
      equipment: unit.equipment.map((item) => ({ id: item.id, charges: item.charges })),
      looted: [...unit.looted],
      drugs: unit.drugs ? sanitizeDrugs(unit.drugs) : null,
      escaped: unit.escaped === true,
      scriptIndex: Number.isInteger(unit.scriptIndex) && unit.scriptIndex >= 0 ? unit.scriptIndex : 0,
      scriptDone: unit.scriptDone === true,
      persuadedBy: unit.persuadedBy,
      persuasions: {
        civilian: counts.civilian,
        police: counts.police,
        guard: counts.guard,
        opposition: counts.opposition,
      },
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
    drops: validateDrops(value.drops, context),
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
    // Version 5 stored each unit's training levels (since dropped: pace and aim come from upgrades and drugs).
    migrated = {
      ...migrated,
      formatVersion: 5,
    };
  }
  if (migrated.formatVersion === 5) {
    // Version 6 stored each unit's stamina (since dropped).
    migrated = {
      ...migrated,
      formatVersion: 6,
    };
  }
  if (migrated.formatVersion === 6) {
    // Version 7 stored each unit's focus (since dropped).
    migrated = {
      ...migrated,
      formatVersion: 7,
    };
  }
  if (migrated.formatVersion === 7) {
    // Version 8 stores each unit's items (with charges) and what it has looted; older
    // saves restore the mission's starting items.
    migrated = {
      ...migrated,
      formatVersion: 8,
      units: migrated.units.map((unit) => ({
        ...unit,
        equipment: (context.initialEquipment?.[unit?.id] ?? []).map((item) => ({ ...item })),
        looted: [],
      })),
    };
  }
  if (migrated.formatVersion === 8) {
    // Version 9 stores who has been persuaded to follow whom, and each operator's persuasion counts.
    migrated = {
      ...migrated,
      formatVersion: 9,
      units: migrated.units.map((unit) => ({
        ...unit,
        persuadedBy: null,
        persuasions: { civilian: 0, police: 0, opposition: 0 },
      })),
    };
  }
  if (migrated.formatVersion === 9) {
    // Version 10 adds the count of guards persuaded (guards are a kind of their own).
    migrated = {
      ...migrated,
      formatVersion: SAVE_VERSION,
      units: migrated.units.map((unit) => ({
        ...unit,
        persuasions: { guard: 0, ...(unit.persuasions ?? {}) },
      })),
    };
  }
  // Missions may gain units after a save was written (street life, say); they start as in the
  // mission, standing at their first position and unhurt.
  if (migrated.formatVersion === SAVE_VERSION && Array.isArray(migrated.units) && Array.isArray(context.unitIds)) {
    const have = new Set(migrated.units.map((unit) => unit?.id));
    const added = context.unitIds
      .filter((id) => !have.has(id))
      .map((id) => ({
        id,
        position: { ...context.initialUnits[id].position },
        path: [],
        health: context.unitRules[id].vitality,
        cooldownRemaining: 0,
        targetId: null,
        disabled: false,
        patrolIndex: 0,
        equipment: (context.initialEquipment?.[id] ?? []).map((item) => ({ ...item })),
        looted: [],
        persuadedBy: null,
        persuasions: { civilian: 0, police: 0, guard: 0, opposition: 0 },
      }));
    if (added.length > 0) migrated = { ...migrated, units: [...migrated.units, ...added] };
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
