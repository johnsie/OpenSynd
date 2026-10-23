// SPDX-License-Identifier: GPL-2.0-or-later

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  MAX_TEAM,
  addItem,
  editObjective,
  exportMission,
  freeId,
  moveItem,
  pickPlacement,
  placements,
  removeItem,
  validateDraft,
} from "../src/editor-core.js";

const read = async (path) => JSON.parse(await readFile(new URL(`../content/${path}`, import.meta.url), "utf8"));

async function draft() {
  const mission = await read("missions/restore-relay.mission.json");
  const map = await read(mission.map);
  return { mission, map };
}

test("every shipped mission is a valid draft", async () => {
  const pack = await read("pack.json");
  for (const file of pack.missions) {
    const mission = await read(file);
    const map = await read(mission.map);
    assert.deepEqual(validateDraft(mission, map), [], file);
  }
});

test("placements lists everyone and can pick the nearest within reach", async () => {
  const { mission } = await draft();
  const all = placements(mission);
  assert.equal(all.length, mission.team.length + mission.opponents.length + mission.bystanders.length + mission.vehicles.length);
  const first = mission.team[0];
  assert.equal(pickPlacement(mission, { x: first.position.x + 0.3, y: first.position.y }).id, first.id);
  assert.equal(pickPlacement(mission, { x: 60.5, y: 60.5 }, 0.1), null);
});

test("moving, adding and removing return new missions and leave the old one alone", async () => {
  const { mission } = await draft();
  const before = JSON.stringify(mission);
  const moved = moveItem(mission, "opponents", "enemy-agent-one", { x: 30.4, y: 40.6 });
  assert.deepEqual(moved.opponents.find((item) => item.id === "enemy-agent-one").position, { x: 30, y: 41 });
  assert.equal(JSON.stringify(mission), before);
  assert.equal(moveItem(mission, "opponents", "ghost", { x: 1, y: 1 }), mission);

  const added = addItem(mission, "opponents", { kind: "units/guard.unit.json", stem: "guard", position: { x: 30, y: 40 } });
  const guard = added.opponents.at(-1);
  assert.equal(guard.id, "guard-5", "the next free number: guards 1 to 4 exist");
  assert.deepEqual(guard.equipment, []);
  const car = addItem(mission, "vehicles", {
    kind: "vehicles/city-car.vehicle.json",
    stem: "car",
    position: { x: 27, y: 60 },
    driver: "units/civilian-man.unit.json",
  });
  assert.equal(car.vehicles.at(-1).driver, "units/civilian-man.unit.json");
  assert.equal(addItem(mission, "nonsense", { kind: "x", stem: "x", position: { x: 1, y: 1 } }), mission);

  const removed = removeItem(added, "opponents", guard.id);
  assert.equal(removed.opponents.length, mission.opponents.length);
  assert.equal(removeItem(mission, "opponents", "ghost"), mission);
  assert.equal(freeId(added, "guard"), "guard-6");
});

test("a squad can hold no more than four", async () => {
  let { mission } = await draft();
  assert.equal(mission.team.length, MAX_TEAM);
  const recruit = { kind: "units/field-operator.unit.json", stem: "operator", position: { x: 3, y: 62 } };
  assert.equal(addItem(mission, "team", recruit), mission);
  mission = removeItem(mission, "team", "operator-four");
  assert.equal(addItem(mission, "team", recruit).team.length, 4);
});

test("validation reports the problems a creator would hit", async () => {
  const { mission, map } = await draft();
  const off = moveItem(mission, "opponents", "enemy-agent-one", { x: 500, y: 5 });
  assert.match(validateDraft(off, map).join(" "), /enemy-agent-one is outside the map/);
  const wall = moveItem(mission, "opponents", "enemy-agent-one", { x: 10, y: 10 });
  assert.match(validateDraft(wall, map).join(" "), /enemy-agent-one stands on ground nobody can stand on/);
  const twin = addItem(mission, "opponents", { kind: "units/guard.unit.json", stem: "enemy-agent", position: { x: 30, y: 40 } });
  twin.opponents.at(-1).id = "enemy-agent-one";
  assert.match(validateDraft(twin, map).join(" "), /share the id enemy-agent-one/);
  assert.match(validateDraft({ ...mission, team: [] }, map).join(" "), /at least one operator/);
  const badZone = {
    ...mission,
    objectives: [{ ...mission.objectives[0], targetZone: "nowhere" }, ...mission.objectives.slice(1)],
  };
  assert.match(validateDraft(badZone, map).join(" "), /points at a zone that is not on the map/);
  const badTarget = { ...mission, objectives: [{ id: "x", type: "disable", required: true, description: "d", targets: ["ghost"] }] };
  assert.match(validateDraft(badTarget, map).join(" "), /names ghost, who is not in the mission/);
  const optional = { ...mission, objectives: mission.objectives.map((objective) => ({ ...objective, required: false })) };
  assert.match(validateDraft(optional, map).join(" "), /At least one objective must be required/);
});

test("objectives can be reworded and made optional, and a mission exports as JSON", async () => {
  const { mission } = await draft();
  const edited = editObjective(mission, mission.objectives[0].id, { description: "Do the thing", required: false });
  assert.equal(edited.objectives[0].description, "Do the thing");
  assert.equal(edited.objectives[0].required, false);
  assert.equal(editObjective(mission, "ghost", { description: "x" }), mission);
  const blank = editObjective(mission, mission.objectives[0].id, { description: "" });
  assert.equal(blank.objectives[0].description, mission.objectives[0].description, "an empty text is ignored");
  const text = exportMission(edited);
  assert.ok(text.endsWith("}\n"));
  assert.deepEqual(JSON.parse(text), edited);
});

import { addPatrolPoint, clearPatrol, parseScript, setScript } from "../src/editor-core.js";

test("route points are added after the placement's own and can be cleared", async () => {
  const { mission } = await draft();
  const before = JSON.stringify(mission);
  const guard = mission.opponents.find((unit) => unit.id.startsWith("guard"));
  const start = (guard.patrol ?? []).length;
  const longer = addPatrolPoint(mission, "opponents", guard.id, { x: 30.4, y: 40.6 });
  assert.equal(longer.opponents.find((unit) => unit.id === guard.id).patrol.length, start + 1);
  assert.deepEqual(longer.opponents.find((unit) => unit.id === guard.id).patrol.at(-1), { x: 30, y: 41 });
  assert.equal(JSON.stringify(mission), before, "the old mission is untouched");
  assert.equal(addPatrolPoint(mission, "opponents", "nobody", { x: 1, y: 1 }), mission);
  const cleared = clearPatrol(longer, "opponents", guard.id);
  assert.equal(cleared.opponents.find((unit) => unit.id === guard.id).patrol, undefined);
  assert.equal(clearPatrol(cleared, "opponents", guard.id), cleared, "nothing to clear");
});

test("a typed script is checked and explained, and sets or removes a unit's script", async () => {
  const good = '[{"type":"walk","to":{"x":3,"y":4}},{"type":"wait","seconds":5},{"type":"say","text":"Hello."},' +
    '{"type":"trigger","at":{"x":1,"y":2},"radius":4},{"type":"escape","to":{"x":9,"y":9}}]';
  assert.equal(parseScript(good).steps.length, 5);
  const driving = '[{"type":"enter","vehicle":"city-car-1"},{"type":"drive","to":{"x":5,"y":6}},{"type":"leave"}]';
  assert.equal(parseScript(driving).steps.length, 3);
  assert.match(parseScript('[{"type":"enter"}]').error, /vehicle/);
  assert.match(parseScript('[{"type":"drive"}]').error, /needs "to"/);
  assert.match(parseScript('[{"type":"leave","to":{"x":1,"y":1}}]').error, /does not use/);
  assert.deepEqual(parseScript("  ").steps, []);
  assert.match(parseScript("[{").error, /not valid JSON/);
  assert.match(parseScript("{}").error, /list of steps/);
  assert.match(parseScript('[{"type":"dance"}]').error, /Step 1 needs a type/);
  assert.match(parseScript('[{"type":"walk"}]').error, /needs "to"/);
  assert.match(parseScript('[{"type":"wait","seconds":0}]').error, /seconds/);
  assert.match(parseScript('[{"type":"trigger","at":{"x":1,"y":2},"radius":99}]').error, /radius/);
  assert.match(parseScript('[{"type":"say","text":""}]').error, /text/);
  assert.match(parseScript('[{"type":"wait","seconds":3,"to":{"x":1,"y":1}}]').error, /does not use/);

  const { mission } = await draft();
  const person = mission.bystanders[0];
  const scripted = setScript(mission, "bystanders", person.id, parseScript(good).steps);
  assert.equal(scripted.bystanders[0].script.length, 5);
  assert.equal(setScript(scripted, "bystanders", person.id, []).bystanders[0].script, undefined);
  assert.equal(setScript(mission, "vehicles", mission.vehicles[0]?.id ?? "x", parseScript(good).steps), mission, "vehicles take no script");
});

test("painting a map: rectangles are laid over the ground, clamped to the map, and can be taken off again", async () => {
  const { PAINTS, newMap, paintRegion, paintedAt, removeRegion, validateMap, exportMap } = await import("../src/editor-core.js");
  const map = newMap("developer.test-yard", "Test Yard", 40);
  assert.deepEqual(map.dimensions, { width: 40, height: 40 });
  assert.deepEqual(validateMap(map), [], "a new map is valid");
  const painted = paintRegion(map, { x: 10, y: 10 }, { x: 5, y: 12 }, "building");
  assert.equal(painted.regions.at(-1).id, "painted-1");
  const rect = painted.regions.at(-1);
  assert.deepEqual([rect.x, rect.y, rect.width, rect.height], [5, 10, 6, 3]);
  assert.equal(painted.regions.at(-1).walkable, false);
  assert.equal(map.regions.length, 1, "the map it was given is not changed");
  assert.equal(paintRegion(painted, { x: 100, y: 100 }, { x: 120, y: 120 }, "street"), painted, "off the map: nothing happens");
  assert.equal(paintRegion(painted, { x: 1, y: 1 }, { x: 2, y: 2 }, "lava"), painted, "unknown kind: nothing happens");
  const clipped = paintRegion(painted, { x: 35, y: 35 }, { x: 60, y: 60 }, "street");
  assert.deepEqual([clipped.regions.at(-1).width, clipped.regions.at(-1).height], [5, 5], "clamped to the map");
  assert.equal(paintedAt(clipped, { x: 6, y: 11 }).id, "painted-1");
  assert.equal(paintedAt(clipped, { x: 0, y: 0 }), null, "the base ground is not a painted region");
  const gone = removeRegion(clipped, "painted-1");
  assert.equal(gone.regions.some((region) => region.id === "painted-1"), false);
  assert.ok(Object.keys(PAINTS).length >= 6);
  assert.match(exportMap(painted), /"painted-1"/);
});

test("a map check catches regions off the map, zones on blocked ground and zones the squad cannot reach", async () => {
  const { newMap, paintRegion, validateMap } = await import("../src/editor-core.js");
  const map = newMap("developer.test-yard", "Test Yard", 40);
  // A wall of buildings from top to bottom cuts the entry off from the exit.
  const cut = paintRegion(map, { x: 20, y: 0 }, { x: 21, y: 39 }, "building");
  assert.deepEqual(validateMap(cut), ["The squad cannot walk from the entry to zone safe-exit."]);
  // A bridge across it opens the way again.
  assert.deepEqual(validateMap(paintRegion(cut, { x: 20, y: 18 }, { x: 21, y: 20 }, "bridge")), []);
  // The exit on a building.
  const blocked = paintRegion(map, { x: 34, y: 18 }, { x: 36, y: 22 }, "building");
  assert.match(validateMap(blocked)[0], /safe-exit starts on ground nobody can stand on/);
  const broken = { ...map, regions: [...map.regions, { ...map.regions[0], id: "off", x: 30, width: 30 }, { ...map.regions[0] }] };
  const text = validateMap(broken).join(" ");
  assert.match(text, /reaches off the map/);
  assert.match(text, /share the id ground/);
  assert.match(validateMap({ ...map, dimensions: { width: 2, height: 2 } })[0], /between 8 and 256/);
  assert.match(validateMap({ ...map, zones: [] })[0], /needs an entry zone/);
});
