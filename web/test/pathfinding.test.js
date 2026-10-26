// SPDX-License-Identifier: GPL-2.0-or-later

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { createTileGrid, findPath, isWalkable } from "../src/engine.js";

// The search as it was written before it was sped up (string keys and a Map): the new one must find the very same paths.
function referencePath(grid, start, destination) {
  const startKey = `${start.x},${start.y}`;
  const destinationKey = `${destination.x},${destination.y}`;
  if (!isWalkable(grid, destination.x, destination.y)) return [];
  if (startKey === destinationKey) return [];
  const frontier = [{ x: start.x, y: start.y }];
  const previous = new Map([[startKey, null]]);
  const directions = [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 0, y: -1 }];
  for (let index = 0; index < frontier.length; index += 1) {
    const current = frontier[index];
    if (`${current.x},${current.y}` === destinationKey) break;
    for (const direction of directions) {
      const next = { x: current.x + direction.x, y: current.y + direction.y };
      const key = `${next.x},${next.y}`;
      if (!isWalkable(grid, next.x, next.y) || previous.has(key)) continue;
      previous.set(key, current);
      frontier.push(next);
    }
  }
  if (!previous.has(destinationKey)) return [];
  const path = [];
  let cursor = destination;
  while (`${cursor.x},${cursor.y}` !== startKey) {
    path.push({ x: cursor.x, y: cursor.y });
    cursor = previous.get(`${cursor.x},${cursor.y}`);
  }
  return path.reverse();
}

const root = new URL("../content/", import.meta.url);
const grid = createTileGrid(JSON.parse(readFileSync(new URL("maps/signal-yard.map.json", root), "utf8")));

test("the faster search finds exactly the paths the old one did", () => {
  let seed = 12345;
  const random = (limit) => {
    seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
    return seed % limit;
  };
  let found = 0;
  for (let trial = 0; trial < 400; trial += 1) {
    const start = { x: random(grid[0].length), y: random(grid.length) };
    const end = { x: random(grid[0].length), y: random(grid.length) };
    const expected = referencePath(grid, start, end);
    assert.deepEqual(findPath(grid, start, end), expected, `from ${start.x},${start.y} to ${end.x},${end.y}`);
    if (expected.length > 0) found += 1;
  }
  assert.ok(found > 40, "enough of the trials were real routes");
});

test("odd starts behave as they always did: off the edge, between tiles, onto itself, onto a wall", () => {
  const open = { x: 40, y: 20 };
  assert.deepEqual(findPath(grid, { x: 3.5, y: 2 }, open), referencePath(grid, { x: 3.5, y: 2 }, open));
  assert.deepEqual(findPath(grid, { x: -1, y: 62 }, { x: 5, y: 62 }), referencePath(grid, { x: -1, y: 62 }, { x: 5, y: 62 }));
  assert.deepEqual(findPath(grid, open, open), []);
  const wall = grid.flat().find((tile) => tile && !tile.walkable);
  assert.deepEqual(findPath(grid, open, { x: wall.x, y: wall.y }), []);
});
