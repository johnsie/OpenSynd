// SPDX-License-Identifier: GPL-2.0-or-later

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createTileGrid, findPath } from "../src/engine.js";

const read = async (path) => JSON.parse(await readFile(new URL(`../content/${path}`, import.meta.url), "utf8"));

const pack = await read("pack.json");
const missions = [];
for (const path of pack.missions) missions.push({ path, ...(await read(path)) });

test("every one of the 50 operations has a map of its own, and no two maps are the same", async () => {
  assert.equal(missions.length, 50);
  const maps = missions.map((mission) => mission.map);
  assert.equal(new Set(maps).size, 50, "no two operations share a map file");
  const bodies = new Set();
  for (const path of new Set(maps)) {
    const { id, name, ...rest } = await read(path);
    bodies.add(JSON.stringify(rest));
  }
  assert.equal(bodies.size, 50, "and no two map files hold the same layout");
});

test("districts are a decent size, are not all square, and not all rectangles", async () => {
  let notSquare = 0;
  let notRectangle = 0;
  for (const mission of missions) {
    const map = await read(mission.map);
    const { width, height } = map.dimensions;
    assert.ok(width >= 96 && height >= 96, `${mission.name}: ${width}x${height} is a decent size`);
    if (width !== height) notSquare += 1;
    if (createTileGrid(map).some((row) => row.some((tile) => tile === null))) notRectangle += 1;
  }
  assert.ok(notSquare >= 20, `plenty of maps are not square (${notSquare})`);
  assert.ok(notRectangle >= 10, `plenty of maps have cut corners or bays (${notRectangle})`);
});

test("in every district the squad can walk from the entry to every zone it needs once the gate is open", async () => {
  for (const mission of missions) {
    const map = await read(mission.map);
    const grid = createTileGrid(map);
    const entry = mission.team[0].position;
    // The gate (if any) is shut at the start; the map's own check proves the way is open once it is, so open it for the walk.
    for (const object of map.objects ?? []) {
      if (object.kind !== "gate") continue;
      for (let y = object.position.y; y < object.position.y + object.height; y += 1) {
        for (let x = object.position.x; x < object.position.x + object.width; x += 1) grid[y][x] = { ...grid[y][x], walkable: true };
      }
    }
    for (const zone of map.zones.filter((item) => item.kind !== "entry")) {
      const target = { x: zone.position.x, y: zone.position.y };
      assert.ok(findPath(grid, entry, target).length > 0, `${mission.name}: the way to ${zone.id} is open`);
    }
  }
});

test("guards mostly stand guard: few of them have a patrol route", () => {
  let guards = 0;
  let pacing = 0;
  for (const mission of missions) {
    for (const placement of mission.opponents) {
      if (!placement.unit.includes("guard")) continue;
      guards += 1;
      if (placement.patrol) pacing += 1;
    }
  }
  assert.ok(guards > 100, `${guards} guards in the campaign`);
  assert.ok(pacing / guards < 0.4, `${pacing} of ${guards} guards pace a beat`);
});
