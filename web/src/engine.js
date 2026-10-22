// SPDX-License-Identifier: GPL-2.0-or-later

export function createTileGrid(map) {
  const { width, height } = map.dimensions;
  const grid = Array.from({ length: height }, () => Array(width).fill(null));
  for (const region of map.regions) {
    for (let y = region.y; y < region.y + region.height; y += 1) {
      for (let x = region.x; x < region.x + region.width; x += 1) {
        grid[y][x] = { ...region, x, y };
      }
    }
  }
  return grid;
}

// A gate blocks its tiles until `isOpen(gate)` is true. The terrain's own
// walkability is kept in `baseWalkable` so saves can be checked without gates.
export function applyGates(grid, gates, isOpen) {
  for (const tile of grid.flat()) {
    if (tile) tile.baseWalkable ??= tile.walkable;
  }
  for (const gate of gates) {
    const open = isOpen(gate);
    for (let y = gate.position.y; y < gate.position.y + gate.height; y += 1) {
      for (let x = gate.position.x; x < gate.position.x + gate.width; x += 1) {
        const tile = grid[y]?.[x];
        if (!tile) continue;
        tile.gate = gate.id;
        tile.walkable = tile.baseWalkable && open;
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

export function findPath(grid, start, destination) {
  const startKey = `${start.x},${start.y}`;
  const destinationKey = `${destination.x},${destination.y}`;
  if (!isWalkable(grid, destination.x, destination.y)) return [];
  if (startKey === destinationKey) return [];

  const frontier = [{ x: start.x, y: start.y }];
  const previous = new Map([[startKey, null]]);
  const directions = [
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: -1, y: 0 },
    { x: 0, y: -1 },
  ];

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
