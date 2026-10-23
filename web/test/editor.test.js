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
