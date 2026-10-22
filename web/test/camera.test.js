// SPDX-License-Identifier: GPL-2.0-or-later

import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_ZOOM,
  MIN_ZOOM,
  centreOn,
  clampCamera,
  createCamera,
  edgePanDirection,
  followTarget,
  forEachVisibleTile,
  miniProject,
  miniUnproject,
  nearEdge,
  panByKeys,
  panByScreen,
  viewportFor,
  visibleBounds,
  zoomCamera,
} from "../src/camera.js";
import { createTileGrid, gridToScreen, screenToGrid } from "../src/engine.js";

const map = {
  dimensions: { width: 128, height: 128 },
  cellSize: { width: 80, height: 40 },
  regions: [{ id: "g", x: 0, y: 0, width: 128, height: 128, walkable: true, elevation: 0 }],
};
const size = { width: 1000, height: 600 };

test("the camera position is drawn at the centre of the canvas", () => {
  const camera = createCamera({ x: 60, y: 40 }, 0.8);
  const viewport = viewportFor(camera, map, size);
  const point = gridToScreen({ x: 60, y: 40 }, viewport.cellSize, viewport.origin);
  assert.deepEqual(point, { x: 500, y: 300 });
  assert.deepEqual(screenToGrid(point, viewport.cellSize, viewport.origin), { x: 60, y: 40 });
});

test("visible tiles are a small, back-to-front subset of a large map", () => {
  const camera = createCamera({ x: 64, y: 64 }, 0.8);
  const viewport = viewportFor(camera, map, size);
  const bounds = visibleBounds(viewport, map);
  const visited = [];
  forEachVisibleTile(createTileGrid(map), bounds, (tile) => visited.push(tile));

  assert.ok(visited.length > 200 && visited.length < 128 * 128 / 2);
  assert.equal(new Set(visited.map((tile) => `${tile.x},${tile.y}`)).size, visited.length);
  for (let index = 1; index < visited.length; index += 1) {
    assert.ok(visited[index].x + visited[index].y >= visited[index - 1].x + visited[index - 1].y);
  }
  assert.ok(visited.some((tile) => tile.x === 64 && tile.y === 64));
});

test("zoom is clamped and the camera stays over the map", () => {
  const camera = createCamera({ x: 5, y: 5 });
  zoomCamera(camera, 100);
  assert.equal(camera.zoom, MAX_ZOOM);
  zoomCamera(camera, 0.0001);
  assert.equal(camera.zoom, MIN_ZOOM);
  camera.x = -20;
  camera.target.y = 999;
  clampCamera(camera, map);
  assert.deepEqual([camera.x, camera.target.y], [0, 127]);
});

test("dragging moves the map with the pointer", () => {
  const camera = createCamera({ x: 64, y: 64 });
  const viewport = viewportFor(camera, map, size);
  const before = gridToScreen({ x: 70, y: 64 }, viewport.cellSize, viewport.origin);
  panByScreen(camera, 80, 0, viewport, map);
  const after = gridToScreen({ x: 70, y: 64 }, viewportFor(camera, map, size).cellSize, viewportFor(camera, map, size).origin);
  assert.ok(Math.abs(after.x - before.x - 80) < 1e-9);
  assert.ok(Math.abs(after.y - before.y) < 1e-9);
});

test("the camera eases toward its target and jumps under reduced motion", () => {
  const camera = createCamera({ x: 10, y: 10 });
  centreOn(camera, { x: 50, y: 30 });
  followTarget(camera, 0.1, false);
  assert.ok(camera.x > 10 && camera.x < 50);
  followTarget(camera, 0.1, true);
  assert.deepEqual([camera.x, camera.y], [50, 30]);
});

test("edge detection and minimap projection round-trip", () => {
  const camera = createCamera({ x: 64, y: 64 });
  const viewport = viewportFor(camera, map, size);
  assert.equal(nearEdge({ x: 64, y: 64 }, viewport), false);
  assert.equal(nearEdge({ x: 100, y: 64 }, viewport), true);
  for (const position of [{ x: 0, y: 0 }, { x: 127, y: 3 }, { x: 40, y: 90 }]) {
    assert.deepEqual(miniUnproject(miniProject(position, map), map), position);
  }
});

test("keyboard panning moves the view in the pressed direction at a steady pace", () => {
  const camera = createCamera({ x: 64, y: 64 });
  const viewport = viewportFor(camera, map, size);
  const probe = { x: 64, y: 64 };
  const screenOf = () => {
    const current = viewportFor(camera, map, size);
    return gridToScreen(probe, current.cellSize, current.origin);
  };
  const start = screenOf();
  panByKeys(camera, { x: 1, y: 0 }, 0.5, viewport, map);
  const right = screenOf();
  assert.ok(Math.abs(right.x - start.x + 450) < 1e-6, "view moves right: the world slides left");
  assert.ok(Math.abs(right.y - start.y) < 1e-6);

  panByKeys(camera, { x: 0, y: -1 }, 0.5, viewport, map);
  assert.ok(screenOf().y > right.y, "view moves up: the world slides down");

  const before = { x: camera.x, y: camera.y };
  panByKeys(camera, { x: 0, y: 0 }, 1, viewport, map);
  assert.deepEqual({ x: camera.x, y: camera.y }, before);

  // Diagonals are not faster than straight lines.
  const a = createCamera({ x: 64, y: 64 });
  const b = createCamera({ x: 64, y: 64 });
  panByKeys(a, { x: 1, y: 0 }, 1, viewport, map);
  panByKeys(b, { x: 1, y: 1 }, 1, viewport, map);
  const travelled = (c) => {
    const v = viewportFor(createCamera({ x: 64, y: 64 }), map, size);
    const p = gridToScreen({ x: c.x, y: c.y }, v.cellSize, v.origin);
    return Math.hypot(p.x - 500, p.y - 300);
  };
  assert.ok(Math.abs(travelled(a) - travelled(b)) < 1e-6);
});

test("edge scrolling is idle in the middle and ramps up toward each border", () => {
  const box = { width: 1000, height: 600 };
  assert.deepEqual(edgePanDirection({ x: 500, y: 300 }, box), { x: 0, y: 0 });
  assert.deepEqual(edgePanDirection({ x: 0, y: 300 }, box), { x: -1, y: 0 });
  assert.deepEqual(edgePanDirection({ x: 1000, y: 600 }, box), { x: 1, y: 1 });
  const near = edgePanDirection({ x: 980, y: 300 }, box);
  const touching = edgePanDirection({ x: 999, y: 300 }, box);
  assert.ok(near.x > 0 && near.x < touching.x && touching.x <= 1);
  assert.deepEqual(edgePanDirection({ x: 36, y: 300 }, box), { x: 0, y: 0 });
});
