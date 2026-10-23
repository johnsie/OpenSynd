// SPDX-License-Identifier: GPL-2.0-or-later

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { ISLANDS, project } from "../src/atlas.js";
import {
  LANDMASSES,
  MAP_HEIGHT,
  MAP_WIDTH,
  pointInPolygon,
  regionCard,
  regionCentre,
  regionShape,
  regionStates,
  territoryCard,
  zoomView,
  panView,
  clampView,
  fullView,
  MIN_VIEW_WIDTH,
} from "../src/worldmap.js";

const entries = [
  { id: "a", name: "First", objectives: 4, enemies: 8, region: { name: "Alpha", lon: -90, lat: 40 } },
  { id: "b", name: "Second", objectives: 4, enemies: 14, region: { name: "Beta", lon: 0, lat: 0 } },
  { id: "c", name: "Third", objectives: 4, enemies: 14 },
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
  assert.equal(open.detail, "4 objectives · 8 enemy agents");
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
    const outlines = [...LANDMASSES.map((land) => land.points), ...ISLANDS];
    assert.ok(outlines.some((outline) => pointInPolygon(lonLat, outline)), `${mission.name} should be on land`);
    for (const other of centres) assert.ok(Math.hypot(centre.x - other.x, centre.y - other.y) > 27, "regions must not crowd");
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

test("the world has 50 territories, each on land and clear of the others, and the missions sit in theirs", async () => {
  const root = new URL("../content/", import.meta.url);
  const pack = JSON.parse(await readFile(new URL("pack.json", root), "utf8"));
  const { territories } = JSON.parse(await readFile(new URL(pack.territories, root), "utf8"));
  assert.equal(territories.length, 50);
  assert.equal(new Set(territories.map((territory) => territory.id)).size, 50, "unique ids");
  assert.equal(new Set(territories.map((territory) => territory.name)).size, 50, "unique names");
  const points = territories.map((territory) => regionCentre({ region: territory }, 0, 1));
  const outlines = [...LANDMASSES.map((land) => land.points), ...ISLANDS];
  territories.forEach((territory, index) => {
    assert.ok(outlines.some((outline) => pointInPolygon([territory.lon, territory.lat], outline)), `${territory.name} is on land`);
    for (let other = index + 1; other < territories.length; other += 1) {
      const gap = Math.hypot(points[index].x - points[other].x, points[index].y - points[other].y);
      assert.ok(gap > 27, `${territory.name} and ${territories[other].name} must not crowd (${gap.toFixed(1)})`);
    }
  });
  const owned = new Set();
  for (const file of pack.missions) {
    const mission = JSON.parse(await readFile(new URL(file, root), "utf8"));
    const territory = territories.find((item) => item.mission === file);
    assert.ok(territory, `${file} belongs to a territory`);
    assert.ok(!owned.has(territory.id), "one mission per territory");
    owned.add(territory.id);
    assert.deepEqual([mission.region.name, mission.region.lon, mission.region.lat], [territory.name, territory.lon, territory.lat]);
  }
});

test("a territory with no operation yet says so on hover", () => {
  const card = territoryCard({ name: "Iberia", population: 3_400_000, owner: "Vesper Holdings" });
  assert.equal(card.label, "NO OPERATION YET");
  assert.match(card.detail, /3\.4 million people · held by Vesper Holdings/);
});

test("the world map zooms around a point, stays inside the atlas, and pans", () => {
  const whole = fullView();
  assert.deepEqual(zoomView(whole, 0.5), whole, "cannot zoom out past the whole map");
  const closer = zoomView(whole, 2, { x: 500, y: 200 });
  assert.equal(closer.width, MAP_WIDTH / 2);
  assert.ok(Math.abs(closer.height - MAP_HEIGHT / 2) < 1e-9);
  // The point under the pointer stays under it.
  const focus = { x: 300, y: 100 };
  const aimed = zoomView(whole, 4, focus);
  assert.ok(Math.abs((focus.x - aimed.x) / aimed.width - (focus.x - whole.x) / whole.width) < 1e-9 || aimed.x === 0);
  // Never closer than eight times, and corners are clamped.
  assert.equal(zoomView(whole, 100).width, MIN_VIEW_WIDTH);
  const corner = zoomView(whole, 8, { x: 0, y: 0 });
  assert.deepEqual([corner.x, corner.y], [0, 0]);
  const far = zoomView(whole, 8, { x: MAP_WIDTH, y: MAP_HEIGHT });
  assert.ok(Math.abs(far.x + far.width - MAP_WIDTH) < 1e-9 && Math.abs(far.y + far.height - MAP_HEIGHT) < 1e-9);
  // Panning moves it and cannot leave the atlas.
  const panned = panView(closer, 50, 20);
  assert.ok(panned.x > closer.x || closer.x + closer.width >= MAP_WIDTH);
  assert.deepEqual(panView(closer, -9999, -9999).x, 0);
  assert.equal(clampView({ x: -5, y: -5, width: 5000, height: 10 }).width, MAP_WIDTH);
});
