// SPDX-License-Identifier: GPL-2.0-or-later

import assert from "node:assert/strict";
import test from "node:test";

import {
  SAVE_FORMAT,
  SAVE_VERSION,
  createSaveSnapshot,
  parseSaveSnapshot,
  validateSaveSnapshot,
} from "../src/save.js";

const state = {
  mission: { id: "developer.restore-relay" },
  selectedId: "operator-one",
  cursor: { x: 2, y: 3 },
  units: [
    {
      id: "operator-one",
      position: { x: 1.25, y: 2 },
      path: [{ x: 2, y: 2 }],
      health: 88,
      cooldownRemaining: 0.25,
      targetId: "watcher-one",
      disabled: false,
    },
    {
      id: "watcher-one",
      position: { x: 4, y: 3 },
      path: [],
      health: 45,
      cooldownRemaining: 0,
      targetId: null,
      disabled: false,
    },
  ],
  objectives: [
    { id: "restore-west", complete: true },
    { id: "leave-yard", complete: false },
  ],
};

const context = {
  missionId: "developer.restore-relay",
  unitIds: ["operator-one", "watcher-one"],
  selectableUnitIds: ["operator-one"],
  objectiveIds: ["restore-west", "leave-yard"],
  bounds: { width: 8, height: 6 },
  isWalkable: (x, y) => !(x === 3 && y === 3),
  unitRules: {
    "operator-one": { side: "team", vitality: 100, cooldown: 0.75 },
    "watcher-one": { side: "opposition", vitality: 45, cooldown: 1.2 },
  },
  initialUnits: {
    "operator-one": { position: { x: 1, y: 2 } },
    "watcher-one": { position: { x: 4, y: 3 } },
  },
};

test("versioned save snapshots round-trip through readable JSON", () => {
  const createdAt = "2026-10-22T12:00:00.000Z";
  const snapshot = createSaveSnapshot(state, createdAt);
  const parsed = parseSaveSnapshot(JSON.stringify(snapshot), context);

  assert.equal(parsed.format, SAVE_FORMAT);
  assert.equal(parsed.formatVersion, SAVE_VERSION);
  assert.equal(parsed.createdAt, createdAt);
  assert.deepEqual(parsed.units, snapshot.units);
  assert.deepEqual(parsed.objectives, snapshot.objectives);
});

test("save validation rejects unsupported versions and mission IDs", () => {
  const snapshot = createSaveSnapshot(state, "2026-10-22T12:00:00.000Z");
  assert.throws(
    () => validateSaveSnapshot({ ...snapshot, formatVersion: 99 }, context),
    /unsupported format version/,
  );
  assert.throws(
    () => validateSaveSnapshot({ ...snapshot, missionId: "another.mission" }, context),
    /another mission/,
  );
});

test("save validation rejects unknown IDs and blocked route tiles", () => {
  const snapshot = createSaveSnapshot(state, "2026-10-22T12:00:00.000Z");
  const unknownUnit = structuredClone(snapshot);
  unknownUnit.units[0].id = "unregistered-unit";
  assert.throws(() => validateSaveSnapshot(unknownUnit, context), /missing operator-one/);

  const blockedPath = structuredClone(snapshot);
  blockedPath.units[0].path = [{ x: 3, y: 3 }];
  assert.throws(() => validateSaveSnapshot(blockedPath, context), /not walkable/);
});

test("save parser reports malformed JSON without exposing parser details", () => {
  assert.throws(() => parseSaveSnapshot("{not-json", context), /file is not valid JSON/);
});

test("save validation requires a normalized ISO timestamp", () => {
  const snapshot = createSaveSnapshot(state, "2026-10-22T12:00:00.000Z");
  assert.throws(
    () => validateSaveSnapshot({ ...snapshot, createdAt: "22 October 2026" }, context),
    /ISO date string/,
  );
});

test("version 1 saves migrate to healthy combat state", () => {
  const snapshot = createSaveSnapshot(state, "2026-10-22T12:00:00.000Z");
  snapshot.formatVersion = 1;
  snapshot.units = snapshot.units.map(({ id, position, path }) => ({ id, position, path }));

  const migrated = parseSaveSnapshot(JSON.stringify(snapshot), context);
  assert.equal(migrated.formatVersion, SAVE_VERSION);
  assert.equal(migrated.units[0].health, 100);
  assert.equal(migrated.units[1].health, 45);
  assert.ok(migrated.units.every((unit) => unit.targetId === null && !unit.disabled));
});

test("version 2 saves add newly introduced mission units", () => {
  const snapshot = createSaveSnapshot(state, "2026-10-22T12:00:00.000Z");
  snapshot.formatVersion = 2;
  const expandedContext = {
    ...context,
    unitIds: [...context.unitIds, "operator-two"],
    selectableUnitIds: [...context.selectableUnitIds, "operator-two"],
    unitRules: {
      ...context.unitRules,
      "operator-two": { side: "team", vitality: 100, cooldown: 0.75 },
    },
    initialUnits: {
      ...context.initialUnits,
      "operator-two": { position: { x: 2, y: 2 } },
    },
  };

  const migrated = parseSaveSnapshot(JSON.stringify(snapshot), expandedContext);
  assert.equal(migrated.formatVersion, SAVE_VERSION);
  assert.deepEqual(
    migrated.units.find((unit) => unit.id === "operator-two").position,
    { x: 2, y: 2 },
  );
});

test("disabled units cannot retain orders or selection", () => {
  const snapshot = createSaveSnapshot(state, "2026-10-22T12:00:00.000Z");
  snapshot.units[0] = {
    ...snapshot.units[0],
    health: 0,
    disabled: true,
    targetId: null,
    path: [],
  };
  assert.throws(() => validateSaveSnapshot(snapshot, context), /selectedId cannot refer/);

  snapshot.selectedId = null;
  snapshot.units[0].path = [{ x: 2, y: 2 }];
  assert.throws(() => validateSaveSnapshot(snapshot, context), /cannot have orders/);
});

test("saves written before a mission gained an objective load with it incomplete", () => {
  const snapshot = createSaveSnapshot(state, "2026-10-22T12:00:00.000Z");
  const older = { ...snapshot, objectives: snapshot.objectives.slice(0, 1) };
  const parsed = parseSaveSnapshot(JSON.stringify(older), context);
  assert.deepEqual(parsed.objectives.map((objective) => objective.id), context.objectiveIds);
  assert.equal(parsed.objectives[1].complete, false);
});

test("version 3 saves migrate with every unit at the start of its patrol", () => {
  const snapshot = createSaveSnapshot(state, "2026-10-22T12:00:00.000Z");
  const older = {
    ...snapshot,
    formatVersion: 3,
    units: snapshot.units.map(({ patrolIndex, ...unit }) => unit),
  };
  const parsed = parseSaveSnapshot(JSON.stringify(older), context);
  assert.equal(parsed.formatVersion, SAVE_VERSION);
  assert.ok(parsed.units.every((unit) => unit.patrolIndex === 0));
});

test("save validation rejects patrol positions outside the route", () => {
  const snapshot = createSaveSnapshot(state, "2026-10-22T12:00:00.000Z");
  const patrolling = { ...context, patrolLengths: { [snapshot.units[0].id]: 4 } };
  const withIndex = (patrolIndex) => ({
    ...snapshot,
    units: snapshot.units.map((unit, index) => (index === 0 ? { ...unit, patrolIndex } : unit)),
  });
  assert.doesNotThrow(() => validateSaveSnapshot(withIndex(3), patrolling));
  assert.throws(() => validateSaveSnapshot(withIndex(4), patrolling), /patrol position/);
  assert.throws(() => validateSaveSnapshot(withIndex(1), context), /patrol position/);
  assert.throws(() => validateSaveSnapshot(withIndex(-1), patrolling), /patrol position/);
});
