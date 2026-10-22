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

test("version 4 saves migrate with every unit at the default training levels", () => {
  const snapshot = createSaveSnapshot(state, "2026-10-22T12:00:00.000Z");
  const older = {
    ...snapshot,
    formatVersion: 4,
    units: snapshot.units.map(({ levels, ...unit }) => unit),
  };
  const parsed = parseSaveSnapshot(JSON.stringify(older), context);
  assert.equal(parsed.formatVersion, SAVE_VERSION);
  assert.ok(parsed.units.every((unit) => unit.levels.speed === 3 && unit.levels.brain === 3));
});

test("training levels round-trip and invalid levels are rejected", () => {
  const trained = {
    ...state,
    units: state.units.map((unit, index) => (index === 0 ? { ...unit, levels: { speed: 5, brain: 2 } } : unit)),
  };
  const snapshot = createSaveSnapshot(trained, "2026-10-22T12:00:00.000Z");
  const parsed = parseSaveSnapshot(JSON.stringify(snapshot), context);
  assert.deepEqual(parsed.units[0].levels, { speed: 5, brain: 2 });

  const withLevels = (levels) => ({
    ...snapshot,
    units: snapshot.units.map((unit, index) => (index === 0 ? { ...unit, levels } : unit)),
  });
  assert.throws(() => validateSaveSnapshot(withLevels({ speed: 6, brain: 3 }), context), /training levels/);
  assert.throws(() => validateSaveSnapshot(withLevels({ speed: 3 }), context), /training levels/);
  assert.throws(() => validateSaveSnapshot(withLevels(null), context), /training levels/);
});

test("version 5 saves migrate with every unit fully rested", () => {
  const snapshot = createSaveSnapshot(state, "2026-10-22T12:00:00.000Z");
  const older = {
    ...snapshot,
    formatVersion: 5,
    units: snapshot.units.map(({ stamina, ...unit }) => unit),
  };
  const parsed = parseSaveSnapshot(JSON.stringify(older), context);
  assert.equal(parsed.formatVersion, SAVE_VERSION);
  assert.ok(parsed.units.every((unit) => unit.stamina === 1));
});

test("stamina round-trips and out-of-range values are rejected", () => {
  const tired = {
    ...state,
    units: state.units.map((unit, index) => (index === 0 ? { ...unit, stamina: 0.25 } : unit)),
  };
  const snapshot = createSaveSnapshot(tired, "2026-10-22T12:00:00.000Z");
  assert.equal(parseSaveSnapshot(JSON.stringify(snapshot), context).units[0].stamina, 0.25);

  const withStamina = (stamina) => ({
    ...snapshot,
    units: snapshot.units.map((unit, index) => (index === 0 ? { ...unit, stamina } : unit)),
  });
  assert.throws(() => validateSaveSnapshot(withStamina(1.5), context), /stamina/);
  assert.throws(() => validateSaveSnapshot(withStamina(-0.1), context), /stamina/);
  assert.throws(() => validateSaveSnapshot(withStamina("full"), context), /stamina/);
});

test("version 6 saves migrate with every unit mentally fresh", () => {
  const snapshot = createSaveSnapshot(state, "2026-10-22T12:00:00.000Z");
  const older = {
    ...snapshot,
    formatVersion: 6,
    units: snapshot.units.map(({ focus, ...unit }) => unit),
  };
  const parsed = parseSaveSnapshot(JSON.stringify(older), context);
  assert.equal(parsed.formatVersion, SAVE_VERSION);
  assert.ok(parsed.units.every((unit) => unit.focus === 1));
});

test("focus round-trips and out-of-range values are rejected", () => {
  const strained = {
    ...state,
    units: state.units.map((unit, index) => (index === 0 ? { ...unit, focus: 0.4 } : unit)),
  };
  const snapshot = createSaveSnapshot(strained, "2026-10-22T12:00:00.000Z");
  assert.equal(parseSaveSnapshot(JSON.stringify(snapshot), context).units[0].focus, 0.4);

  const withFocus = (focus) => ({
    ...snapshot,
    units: snapshot.units.map((unit, index) => (index === 0 ? { ...unit, focus } : unit)),
  });
  assert.throws(() => validateSaveSnapshot(withFocus(2), context), /focus/);
  assert.throws(() => validateSaveSnapshot(withFocus(null), context), /focus/);
});

test("version 7 saves migrate with each unit's starting items", () => {
  const snapshot = createSaveSnapshot(state, "2026-10-22T12:00:00.000Z");
  const older = {
    ...snapshot,
    formatVersion: 7,
    units: snapshot.units.map(({ equipment, looted, ...unit }) => unit),
  };
  const withItems = {
    ...context,
    initialEquipment: { [snapshot.units[0].id]: [{ id: "pulse", charges: null }, { id: "kit", charges: 1 }] },
  };
  const parsed = parseSaveSnapshot(JSON.stringify(older), withItems);
  assert.equal(parsed.formatVersion, SAVE_VERSION);
  assert.deepEqual(parsed.units[0].equipment, [{ id: "pulse", charges: null }, { id: "kit", charges: 1 }]);
  assert.deepEqual(parsed.units[0].looted, []);
  assert.deepEqual(parsed.units[1].equipment, []);
});

test("items and loot round-trip and invalid inventories are rejected", () => {
  const item = (id, charges = null) => ({ definition: { id }, charges });
  const armed = {
    ...state,
    units: state.units.map((unit, index) =>
      index === 0 ? { ...unit, equipment: [item("pulse"), item("stim", 1)], looted: ["stim"] } : unit,
    ),
  };
  const known = { ...context, itemIds: ["pulse", "stim", "kit"] };
  const snapshot = createSaveSnapshot(armed, "2026-10-22T12:00:00.000Z");
  const parsed = parseSaveSnapshot(JSON.stringify(snapshot), known);
  assert.deepEqual(parsed.units[0].equipment, [{ id: "pulse", charges: null }, { id: "stim", charges: 1 }]);
  assert.deepEqual(parsed.units[0].looted, ["stim"]);

  const withEquipment = (equipment, looted = []) => ({
    ...snapshot,
    units: snapshot.units.map((unit, index) => (index === 0 ? { ...unit, equipment, looted } : unit)),
  });
  const nine = Array.from({ length: 9 }, () => ({ id: "kit", charges: 1 }));
  assert.throws(() => validateSaveSnapshot(withEquipment(nine), known), /too many items/);
  assert.throws(() => validateSaveSnapshot(withEquipment([{ id: "nonsense", charges: null }]), known), /invalid item/);
  assert.throws(() => validateSaveSnapshot(withEquipment([{ id: "kit", charges: -1 }]), known), /invalid item/);
  assert.throws(() => validateSaveSnapshot(withEquipment([{ id: "kit", charges: "one" }]), known), /invalid item/);
  assert.throws(() => validateSaveSnapshot(withEquipment([], ["ghost"]), known), /loot record/);
  assert.throws(() => validateSaveSnapshot(withEquipment("none"), known), /too many items/);
});

test("a save from before the street was populated loads, with the new bystanders standing at their start", () => {
  const snapshot = createSaveSnapshot(state, "2026-10-22T12:00:00.000Z");
  const richer = {
    ...context,
    unitIds: [...context.unitIds, "civilian-1"],
    unitRules: { ...context.unitRules, "civilian-1": { side: "civilian", vitality: 40, cooldown: 1 } },
    initialUnits: { ...context.initialUnits, "civilian-1": { position: { x: 5, y: 4 } } },
    patrolLengths: { "civilian-1": 2 },
  };
  const parsed = parseSaveSnapshot(JSON.stringify(snapshot), richer);
  const added = parsed.units.find((unit) => unit.id === "civilian-1");
  assert.deepEqual(added.position, { x: 5, y: 4 });
  assert.equal(added.health, 40);
  assert.equal(added.disabled, false);
  assert.equal(parsed.units.length, 3);
});
