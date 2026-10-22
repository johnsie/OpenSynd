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
