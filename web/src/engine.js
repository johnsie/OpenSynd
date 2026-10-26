// SPDX-License-Identifier: GPL-2.0-or-later

export function createTileGrid(map) {
  const { width, height } = map.dimensions;
  const grid = Array.from({ length: height }, () => Array(width).fill(null));
  for (const region of map.regions) {
    for (let y = region.y; y < region.y + region.height; y += 1) {
      for (let x = region.x; x < region.x + region.width; x += 1) {
        grid[y][x] = { ...region, x, y, regionX: region.x, regionY: region.y };
      }
    }
  }
  return grid;
}

// A gate blocks its tiles until `isOpen(gate)` is true. The terrain's own
// walkability is kept in `baseWalkable` so saves can be checked without gates.
const preparedGrids = new WeakSet();
export function applyGates(grid, gates, isOpen) {
  // Remember each tile's own walkability the first time a grid is seen (this runs every few frames: not worth repeating over the
  // whole map). A tile put into the grid later is recorded when a gate reaches it.
  if (!preparedGrids.has(grid)) {
    preparedGrids.add(grid);
    for (const row of grid) {
      for (const tile of row) if (tile) tile.baseWalkable ??= tile.walkable;
    }
  }
  for (const gate of gates) {
    const open = isOpen(gate);
    for (let y = gate.position.y; y < gate.position.y + gate.height; y += 1) {
      for (let x = gate.position.x; x < gate.position.x + gate.width; x += 1) {
        const tile = grid[y]?.[x];
        if (!tile) continue;
        tile.baseWalkable ??= tile.walkable;
        tile.gate = gate.id;
        if (gate.kind === "door") {
          // A door can always be walked into (routes plan through it); it only blocks sight and shots while closed.
          tile.door = { open };
          tile.walkable = tile.baseWalkable;
        } else {
          tile.walkable = tile.baseWalkable && open;
        }
      }
    }
  }
}

export function isTerrainWalkable(grid, x, y) {
  const tile = grid[y]?.[x];
  return Boolean(tile && (tile.baseWalkable ?? tile.walkable));
}

export function isWalkable(grid, x, y) {
  return Boolean(grid[y]?.[x]?.walkable);
}

// Breadth-first search on four-way steps. Tiles are numbered row by row so the search can use plain arrays (the string keys it
// used to build for every tile made it the slowest thing in the game and in the tests). The order of the search, and so the
// path found, is unchanged.
const STEP_X = [1, 0, -1, 0];
const STEP_Y = [0, 1, 0, -1];
const UNSEEN = -1;
const FROM_START = -2;

export function findPath(grid, start, destination) {
  if (!isWalkable(grid, destination.x, destination.y)) return [];
  if (start.x === destination.x && start.y === destination.y) return [];
  const height = grid.length;
  let width = 0;
  for (const row of grid) if (row.length > width) width = row.length;
  const inside = Number.isInteger(start.x) && Number.isInteger(start.y) && start.x >= 0 && start.y >= 0;
  if (!inside || start.x >= width || start.y >= height) return findPathFromOutside(grid, start, destination);

  const parent = new Int32Array(width * height).fill(UNSEEN);
  const queue = new Int32Array(width * height);
  const first = start.y * width + start.x;
  const goal = destination.y * width + destination.x;
  parent[first] = FROM_START;
  queue[0] = first;
  let head = 0;
  let tail = 1;
  while (head < tail) {
    const current = queue[head];
    head += 1;
    if (current === goal) break;
    const x = current % width;
    const y = (current - x) / width;
    for (let direction = 0; direction < 4; direction += 1) {
      const nextX = x + STEP_X[direction];
      const nextY = y + STEP_Y[direction];
      if (nextX < 0 || nextY < 0 || nextX >= width || nextY >= height) continue;
      const next = nextY * width + nextX;
      if (parent[next] !== UNSEEN || !grid[nextY][nextX]?.walkable) continue;
      parent[next] = current;
      queue[tail] = next;
      tail += 1;
    }
  }
  if (parent[goal] === UNSEEN) return [];
  const path = [];
  for (let cursor = goal; cursor !== first; cursor = parent[cursor]) {
    const x = cursor % width;
    path.push({ x, y: (cursor - x) / width });
  }
  return path.reverse();
}

// A start that is not a tile of the grid (off the edge, or between tiles) is rare; it takes the plain search.
function findPathFromOutside(grid, start, destination) {
  const startKey = `${start.x},${start.y}`;
  const destinationKey = `${destination.x},${destination.y}`;
  const frontier = [{ x: start.x, y: start.y }];
  const previous = new Map([[startKey, null]]);
  for (let index = 0; index < frontier.length; index += 1) {
    const current = frontier[index];
    if (`${current.x},${current.y}` === destinationKey) break;
    for (let direction = 0; direction < 4; direction += 1) {
      const next = { x: current.x + STEP_X[direction], y: current.y + STEP_Y[direction] };
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

export function gridToScreen(position, cellSize, origin, elevation = 0) {
  return {
    x: origin.x + (position.x - position.y) * (cellSize.width / 2),
    y:
      origin.y +
      (position.x + position.y) * (cellSize.height / 2) -
      elevation * (cellSize.height * 0.28),
  };
}

export function screenToGrid(position, cellSize, origin) {
  const diagonalX = (position.x - origin.x) / (cellSize.width / 2);
  const diagonalY = (position.y - origin.y) / (cellSize.height / 2);
  return {
    x: Math.floor((diagonalX + diagonalY) / 2 + 0.5),
    y: Math.floor((diagonalY - diagonalX) / 2 + 0.5),
  };
}

// The exact (fractional) grid position under a screen point, for aiming. screenToGrid rounds to a tile.
export function screenToGridExact(position, cellSize, origin) {
  const diagonalX = (position.x - origin.x) / (cellSize.width / 2);
  const diagonalY = (position.y - origin.y) / (cellSize.height / 2);
  return { x: (diagonalX + diagonalY) / 2, y: (diagonalY - diagonalX) / 2 };
}

export function zoneContains(zone, position) {
  return (
    position.x >= zone.position.x &&
    position.y >= zone.position.y &&
    position.x < zone.position.x + zone.width &&
    position.y < zone.position.y + zone.height
  );
}

export function findObjectiveAtPosition(objectives, zones, position, type) {
  return objectives.find((objective) => {
    if (objective.complete || objective.type !== type) return false;
    const zone = zones.find((candidate) => candidate.id === objective.targetZone);
    return zone ? zoneContains(zone, position) : false;
  }) ?? null;
}

// Nearest walkable tiles to `centre`, in breadth-first order, so a group can
// move to distinct tiles around one destination. The centre comes first.
export function formationTiles(grid, centre, count) {
  if (!isWalkable(grid, centre.x, centre.y) || count < 1) return [];
  const directions = [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 0, y: -1 }];
  const seen = new Set([`${centre.x},${centre.y}`]);
  const tiles = [{ x: centre.x, y: centre.y }];
  for (let index = 0; index < tiles.length && tiles.length < count; index += 1) {
    for (const direction of directions) {
      const next = { x: tiles[index].x + direction.x, y: tiles[index].y + direction.y };
      const key = `${next.x},${next.y}`;
      if (seen.has(key) || !isWalkable(grid, next.x, next.y)) continue;
      seen.add(key);
      tiles.push(next);
      if (tiles.length === count) break;
    }
  }
  return tiles;
}

// Tiles a patrol walks, in order: from the start through each waypoint and back
// to the start. Returns [] if any leg has no route, so a bad patrol is inert.
export function buildPatrolRoute(grid, start, waypoints) {
  const route = [];
  let from = start;
  for (const next of [...waypoints, start]) {
    const leg = findPath(grid, from, next);
    if (leg.length === 0 && (from.x !== next.x || from.y !== next.y)) return [];
    route.push(...leg);
    from = next;
  }
  return route;
}

// ---- Sight

const SEE_THROUGH_SURFACES = new Set(["service-fence", "runoff-channel"]);
export const SIGHT_STEP = 0.25;

const tileAt = (position) => ({ x: Math.round(position.x), y: Math.round(position.y) });

function blocksSight(tile) {
  if (!tile) return true;
  if (tile.door) return !tile.door.open;
  if (tile.walkable || tile.gate) return false;
  return !SEE_THROUGH_SURFACES.has(tile.surface);
}

/** Can one position see another with nothing solid between them? Without a grid, always. */
export function hasLineOfSight(grid, from, to) {
  if (!grid) return true;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  const startTile = tileAt(from);
  const endTile = tileAt(to);
  for (let travelled = SIGHT_STEP; travelled < length; travelled += SIGHT_STEP) {
    const point = { x: from.x + (dx / length) * travelled, y: from.y + (dy / length) * travelled };
    const tile = tileAt(point);
    if ((tile.x === startTile.x && tile.y === startTile.y) || (tile.x === endTile.x && tile.y === endTile.y)) continue;
    if (blocksSight(grid[tile.y]?.[tile.x])) return false;
  }
  return true;
}
