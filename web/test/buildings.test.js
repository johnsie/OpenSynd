// SPDX-License-Identifier: GPL-2.0-or-later

import assert from "node:assert/strict";
import test from "node:test";

import {
  buildingStyle,
  buildingsFromMap,
  drawOrder,
  hashString,
  inFront,
  seededRandom,
} from "../src/buildings.js";

const map = {
  regions: [
    { id: "ground", x: 0, y: 0, width: 10, height: 10, surface: "service-concrete", walkable: true, elevation: 0, color: "#111111" },
    { id: "block-a", x: 2, y: 2, width: 3, height: 3, surface: "utility-building", walkable: false, elevation: 3, color: "#202020" },
    { id: "fence", x: 8, y: 0, width: 1, height: 5, surface: "service-fence", walkable: false, elevation: 1, color: "#303030" },
    { id: "block-b", x: 6, y: 6, width: 2, height: 2, surface: "utility-building", walkable: false, elevation: 5, color: "#404040" },
  ],
};

test("only non-walkable building regions become buildings", () => {
  const buildings = buildingsFromMap(map);
  assert.deepEqual(buildings.map((building) => building.id), ["block-a", "block-b"]);
  assert.deepEqual(buildings[0], { id: "block-a", x: 2, y: 2, width: 3, height: 3, elevation: 3, color: "#202020" });
});

test("a unit east or south of a building is in front of it; north or west is behind", () => {
  const building = { x: 2, y: 2, width: 3, height: 3 };
  assert.equal(inFront({ x: 5, y: 3 }, building), true, "east of the footprint");
  assert.equal(inFront({ x: 3, y: 5 }, building), true, "south of the footprint");
  assert.equal(inFront({ x: 6, y: 6 }, building), true);
  assert.equal(inFront({ x: 1, y: 3 }, building), false, "west of it: behind");
  assert.equal(inFront({ x: 3, y: 1 }, building), false, "north of it: behind");
  assert.equal(inFront({ x: 0, y: 0 }, building), false);
});

test("units are drawn before the buildings that hide them and after the ones they stand in front of", () => {
  const near = { id: "near", x: 6, y: 6, width: 2, height: 2 };
  const far = { id: "far", x: 1, y: 1, width: 2, height: 2 };
  const behindBoth = { id: "u1", position: { x: 0, y: 0 } };
  const betweenThem = { id: "u2", position: { x: 4, y: 4 } };
  const inFrontOfAll = { id: "u3", position: { x: 9, y: 9 } };
  const order = drawOrder([near, far], [inFrontOfAll, betweenThem, behindBoth]);
  const names = order.map((entry) => entry.item.id);
  assert.deepEqual(names, ["u1", "far", "u2", "near", "u3"]);
  assert.equal(order[0].behind, far, "the unit knows which building hides it");
});

test("the draw order is repeatable and keeps every item once", () => {
  const buildings = buildingsFromMap(map);
  const units = [
    { id: "a", position: { x: 1, y: 7 } },
    { id: "b", position: { x: 5, y: 1 } },
    { id: "c", position: { x: 9, y: 9 } },
  ];
  const first = drawOrder(buildings, units).map((entry) => entry.item.id);
  assert.deepEqual(first, drawOrder(buildings, units).map((entry) => entry.item.id));
  assert.deepEqual([...first].sort(), ["a", "b", "block-a", "block-b", "c"]);
});

test("a building's look is fixed by its id and varies between buildings", () => {
  const first = buildingStyle({ id: "block-3-2", elevation: 4, width: 8, height: 8 });
  assert.deepEqual(first, buildingStyle({ id: "block-3-2", elevation: 4, width: 8, height: 8 }));
  assert.equal(first.tiers, 2, "tall and wide: a stepped upper tier");
  assert.equal(buildingStyle({ id: "x", elevation: 2, width: 8, height: 8 }).tiers, 1);
  assert.equal(buildingStyle({ id: "x", elevation: 5, width: 3, height: 8 }).tiers, 1, "too narrow to step back");

  const looks = new Set(
    ["a", "b", "c", "d", "e", "f", "g", "h"].map(
      (id) => `${buildingStyle({ id, elevation: 3, width: 8, height: 8 }).trim}:${hashString(id)}`,
    ),
  );
  assert.ok(looks.size >= 6);
  for (const id of ["a", "b", "c"]) {
    const style = buildingStyle({ id, elevation: 3, width: 8, height: 8 });
    assert.ok(style.lit >= 0.28 && style.lit <= 0.58);
    assert.ok(style.units >= 1 && style.units <= 3);
  }
});

test("the seeded stream repeats and stays in range", () => {
  const first = seededRandom(7);
  const second = seededRandom(7);
  for (let index = 0; index < 50; index += 1) {
    const value = first();
    assert.equal(value, second());
    assert.ok(value >= 0 && value < 1);
  }
  assert.notEqual(seededRandom(7)(), seededRandom(8)());
});
