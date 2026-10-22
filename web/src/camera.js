// SPDX-License-Identifier: GPL-2.0-or-later

import { gridToScreen, screenToGrid } from "./engine.js";

export const MIN_ZOOM = 0.3;
export const MAX_ZOOM = 1.5;

export function createCamera(position, zoom = 0.8) {
  return { x: position.x, y: position.y, zoom, target: { x: position.x, y: position.y } };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

// Keeps the camera over the map; `target` is the point it eases toward.
export function clampCamera(camera, map) {
  const { width, height } = map.dimensions;
  camera.x = clamp(camera.x, 0, width - 1);
  camera.y = clamp(camera.y, 0, height - 1);
  camera.target.x = clamp(camera.target.x, 0, width - 1);
  camera.target.y = clamp(camera.target.y, 0, height - 1);
}

// Screen mapping for the current camera: the camera's grid position sits at the
// middle of the canvas.
export function viewportFor(camera, map, size) {
  const cellSize = {
    width: map.cellSize.width * camera.zoom,
    height: map.cellSize.height * camera.zoom,
  };
  const origin = {
    x: size.width / 2 - ((camera.x - camera.y) * cellSize.width) / 2,
    y: size.height / 2 - ((camera.x + camera.y) * cellSize.height) / 2,
  };
  return { cellSize, origin, width: size.width, height: size.height };
}

// Grid rectangle that may be on screen, padded so tall buildings still draw.
export function visibleBounds(viewport, map, padding = 6) {
  const corners = [
    { x: 0, y: 0 },
    { x: viewport.width, y: 0 },
    { x: 0, y: viewport.height },
    { x: viewport.width, y: viewport.height },
  ].map((corner) => screenToGrid(corner, viewport.cellSize, viewport.origin));
  const { width, height } = map.dimensions;
  return {
    minX: clamp(Math.min(...corners.map((c) => c.x)) - padding, 0, width - 1),
    maxX: clamp(Math.max(...corners.map((c) => c.x)) + padding, 0, width - 1),
    minY: clamp(Math.min(...corners.map((c) => c.y)) - padding, 0, height - 1),
    maxY: clamp(Math.max(...corners.map((c) => c.y)) + padding, 0, height - 1),
  };
}

// Visit tiles in back-to-front order (by x + y) inside the bounds.
export function forEachVisibleTile(grid, bounds, visit) {
  for (let sum = bounds.minX + bounds.minY; sum <= bounds.maxX + bounds.maxY; sum += 1) {
    const from = Math.max(bounds.minX, sum - bounds.maxY);
    const to = Math.min(bounds.maxX, sum - bounds.minY);
    for (let x = from; x <= to; x += 1) {
      const tile = grid[sum - x]?.[x];
      if (tile) visit(tile);
    }
  }
}

// Drag the map: moving the pointer right/down pulls the world with it.
export function panByScreen(camera, deltaX, deltaY, viewport, map) {
  const diagonalX = deltaX / (viewport.cellSize.width / 2);
  const diagonalY = deltaY / (viewport.cellSize.height / 2);
  camera.x -= (diagonalX + diagonalY) / 2;
  camera.y -= (diagonalY - diagonalX) / 2;
  camera.target.x = camera.x;
  camera.target.y = camera.y;
  clampCamera(camera, map);
}

export function zoomCamera(camera, factor) {
  camera.zoom = clamp(camera.zoom * factor, MIN_ZOOM, MAX_ZOOM);
}

// Ease toward the target; reduced motion jumps straight there.
export function followTarget(camera, deltaSeconds, reducedMotion) {
  if (reducedMotion) {
    camera.x = camera.target.x;
    camera.y = camera.target.y;
    return;
  }
  const blend = 1 - Math.exp(-deltaSeconds * 8);
  camera.x += (camera.target.x - camera.x) * blend;
  camera.y += (camera.target.y - camera.y) * blend;
}

export function centreOn(camera, position) {
  camera.target.x = position.x;
  camera.target.y = position.y;
}

// True when a grid position projects outside the middle of the canvas.
export function nearEdge(position, viewport, marginRatio = 0.18) {
  const point = gridToScreen(position, viewport.cellSize, viewport.origin);
  return (
    point.x < viewport.width * marginRatio ||
    point.x > viewport.width * (1 - marginRatio) ||
    point.y < viewport.height * marginRatio ||
    point.y > viewport.height * (1 - marginRatio)
  );
}

// Minimap: the same 2:1 diamond as the main view, one pixel per tile.
export function miniProject(position, map) {
  return { x: position.x - position.y + map.dimensions.height, y: (position.x + position.y) / 2 };
}

export function miniUnproject(point, map) {
  const diagonal = point.x - map.dimensions.height;
  return { x: (diagonal + 2 * point.y) / 2, y: (2 * point.y - diagonal) / 2 };
}

export function miniSize(map) {
  return { width: map.dimensions.width + map.dimensions.height, height: (map.dimensions.width + map.dimensions.height) / 2 };
}
