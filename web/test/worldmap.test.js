// SPDX-License-Identifier: GPL-2.0-or-later

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { project } from "../src/atlas.js";
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
  { id: "a", name: "First", objectives: 4, watchers: 8, region: { name: "Alpha", lon: -90, lat: 40 } },
  { id: "b", name: "Second", objectives: 4, watchers: 14, region: { name: "Beta", lon: 0, lat: 0 } },
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
  assert.deepEqual(regionCentre(entries[0], 0, 3), { x: 250, y: ((84 - 40) / 142) * MAP_HEIGHT * (142 / 142) });
  assert.deepEqual(regionCentre(entries[1], 1, 3), { x: 500, y: (84 / 142) * MAP_HEIGHT });
  assert.deepEqual(regionCentre(entries[2], 2, 3), { x: 750, y: MAP_HEIGHT / 2 });
});

test("a region's outline is repeatable, distinct per mission and stays near its centre", () => {
  const centre = { x: 300, y: 200 };
  assert.deepEqual(regionShape("a", centre), regionShape("a", centre));
  assert.notDeepEqual(regionShape("a", centre), regionShape("b", centre));
  for (const [x, y] of regionShape("a", centre)) assert.ok(Math.hypot(x - 300, y - 200) <= 30);
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
    const lonLat = [mission.region.lon, mission.region.lat];
    assert.ok(LANDMASSES.some((land) => pointInPolygon(lonLat, land.points)), `${mission.name} should be on land`);
    for (const other of centres) assert.ok(Math.hypot(centre.x - other.x, centre.y - other.y) > 60, "regions must not crowd");
    centres.push(centre);
  }
});

test("the atlas outlines are closed, in range, and the map has the proportions of the Earth", () => {
  assert.ok(Math.abs(MAP_WIDTH / MAP_HEIGHT - 360 / 142) < 0.02);
  for (const land of LANDMASSES) {
    assert.ok(land.points.length >= 12, `${land.id} has an outline`);
    for (const [lon, lat] of land.points) assert.ok(lon >= -180 && lon <= 180 && lat >= -90 && lat <= 90, land.id);
  }
  assert.deepEqual(project([-180, 84]), [0, 0]);
  assert.deepEqual(project([180, -58]), [MAP_WIDTH, MAP_HEIGHT]);
});
