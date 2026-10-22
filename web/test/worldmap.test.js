// SPDX-License-Identifier: GPL-2.0-or-later

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  LANDMASSES,
  MAP_HEIGHT,
  MAP_WIDTH,
  pointInPolygon,
  regionCard,
  regionCentre,
  regionShape,
  regionStates,
} from "../src/worldmap.js";

const entries = [
  { id: "a", name: "First", objectives: 4, watchers: 8, region: { name: "Alpha", x: 20, y: 40 } },
  { id: "b", name: "Second", objectives: 4, watchers: 14, region: { name: "Beta", x: 50, y: 30 } },
  { id: "c", name: "Third", objectives: 4, watchers: 14 },
];

test("regions are locked until the one before is completed", () => {
  assert.deepEqual(
    regionStates(entries, { completed: [] }, 0).map((region) => region.state),
    ["available", "locked", "locked"],
  );
  assert.deepEqual(
    regionStates(entries, { completed: ["a"] }, 1).map((region) => [region.state, region.selected]),
    [["completed", false], ["available", true], ["locked", false]],
  );
});

test("a region's card says what it is, its state and what is needed", () => {
  const locked = regionCard(entries[1], 1, "locked", entries);
  assert.equal(locked.title, "Operation 02 · Second");
  assert.equal(locked.place, "Beta");
  assert.equal(locked.label, "LOCKED");
  assert.match(locked.detail, /Complete First to unlock/);
  const open = regionCard(entries[0], 0, "available", entries);
  assert.equal(open.detail, "4 objectives · 8 watchers");
  assert.equal(regionCard(entries[2], 2, "completed", entries).place, "Third", "falls back to the mission name");
});

test("regions sit where the mission says, or spread along the map when it does not say", () => {
  assert.deepEqual(regionCentre(entries[0], 0, 3), { x: 200, y: 200 });
  assert.deepEqual(regionCentre(entries[2], 2, 3), { x: 750, y: MAP_HEIGHT / 2 });
});

test("a region's outline is repeatable, distinct per mission and stays near its centre", () => {
  const centre = { x: 300, y: 200 };
  assert.deepEqual(regionShape("a", centre), regionShape("a", centre));
  assert.notDeepEqual(regionShape("a", centre), regionShape("b", centre));
  for (const [x, y] of regionShape("a", centre)) assert.ok(Math.hypot(x - 300, y - 200) <= 60);
});

test("every shipped mission is placed on land, apart from the others, inside the map", async () => {
  const root = new URL("../content/", import.meta.url);
  const pack = JSON.parse(await readFile(new URL("pack.json", root), "utf8"));
  const centres = [];
  for (const file of pack.missions) {
    const mission = JSON.parse(await readFile(new URL(file, root), "utf8"));
    assert.ok(mission.region, `${file} needs a region`);
    const centre = regionCentre(mission, 0, pack.missions.length);
    assert.ok(centre.x > 0 && centre.x < MAP_WIDTH && centre.y > 0 && centre.y < MAP_HEIGHT);
    assert.ok(LANDMASSES.some((land) => pointInPolygon(centre, land.points)), `${mission.name} should be on land`);
    for (const other of centres) assert.ok(Math.hypot(centre.x - other.x, centre.y - other.y) > 150, "regions must not crowd");
    centres.push(centre);
  }
});
