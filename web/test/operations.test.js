// SPDX-License-Identifier: GPL-2.0-or-later

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { VARIANT_LABELS, operationPath, territoryAlert, variantFor } from "../src/operations.js";

const held = { status: "finished", threat: null };

test("the operation played follows the territory's state", () => {
  assert.equal(variantFor(held), null);
  assert.equal(variantFor({ status: "open", threat: null }), null);
  assert.equal(variantFor({ status: "rebel", threat: null }), "uprising");
  assert.equal(variantFor({ status: "finished", threat: { until: 9 } }), "defence");
  assert.equal(variantFor({ status: "rebel", threat: { until: 9 } }), "uprising", "a revolt comes first");
  assert.equal(variantFor(undefined), null);
  assert.deepEqual(Object.keys(VARIANT_LABELS), ["uprising", "defence"]);
});

test("the alert says what is wrong and, for a takeover, how long there is", () => {
  assert.equal(territoryAlert(held, 5), null);
  const revolt = territoryAlert({ status: "rebel", threat: null }, 5);
  assert.equal(revolt.kind, "revolt");
  assert.match(revolt.detail, /uprising/);
  const takeover = territoryAlert({ status: "finished", threat: { until: 12 } }, 9, "Corvid Combine");
  assert.equal(takeover.kind, "takeover");
  assert.match(takeover.detail, /Corvid Combine is moving to take it over: 3 days left/);
  assert.match(territoryAlert({ status: "finished", threat: { until: 10 } }, 9).detail, /1 day left/);
  assert.match(territoryAlert({ status: "finished", threat: { until: 3 } }, 9).detail, /0 days left/);
});

test("the path of an operation comes from the territory list", () => {
  const entry = {
    mission: "missions/a.mission.json",
    uprising: "missions/a-uprising.mission.json",
    defence: "missions/a-defence.mission.json",
  };
  assert.equal(operationPath(entry, null), entry.mission);
  assert.equal(operationPath(entry, "uprising"), entry.uprising);
  assert.equal(operationPath(entry, "defence"), entry.defence);
  assert.equal(operationPath({}, "defence"), null);
});

// The content really has the three operations for every territory, and they hang together.
const root = new URL("../content/", import.meta.url);
const read = (path) => JSON.parse(readFileSync(new URL(path, root), "utf8"));

test("every territory in the content has a main operation, an uprising and a defence, each for that territory", () => {
  const { territories } = read("territories.json");
  const pack = read("pack.json");
  assert.equal(territories.length, 50);
  assert.equal(pack.variants.length, 100);
  for (const entry of territories) {
    const main = read(entry.mission);
    for (const kind of ["uprising", "defence"]) {
      assert.ok(pack.variants.includes(entry[kind]), `${entry.id} lists its ${kind}`);
      const mission = read(entry[kind]);
      assert.equal(mission.variant, kind);
      assert.equal(mission.territory, main.id, `${entry[kind]} is for ${main.id}`);
      assert.equal(mission.id, `${main.id}-${kind}`);
      assert.deepEqual(mission.region, main.region);
      assert.equal(mission.map, main.map, "the same ground as the main operation");
      assert.deepEqual(mission.team, main.team);
      assert.ok(!mission.unlocks, "it opens nothing");
    }
  }
});

test("all 100 uprisings and defences can be played: the ground is reachable with the gates shut and the targets exist", async () => {
  const { applyGates, createTileGrid, findPath } = await import("../src/engine.js");
  const pack = read("pack.json");
  const maps = new Map();
  let holds = 0;
  let uprisings = 0;
  for (const path of pack.variants) {
    const mission = read(path);
    if (!maps.has(mission.map)) maps.set(mission.map, { map: read(mission.map), grid: null });
    const entry = maps.get(mission.map);
    if (!entry.grid) {
      entry.grid = createTileGrid(entry.map);
      applyGates(entry.grid, entry.map.objects ?? [], () => false); // every gate shut
    }
    const { grid } = entry;
    const map = { ...entry.map, zones: [...entry.map.zones, ...(mission.zones ?? [])] };
    const start = mission.team[0].position;
    const zone = (id) => map.zones.find((item) => item.id === id);
    const reach = (point, what) => {
      const same = point.x === start.x && point.y === start.y;
      assert.ok(same || findPath(grid, start, point).length > 0, `${path}: ${what} at ${point.x},${point.y} cannot be reached`);
    };
    const [first, last] = mission.objectives;
    assert.equal(last.type, "extract", `${path}: leaves by falling back`);
    const area = zone(last.targetZone);
    assert.deepEqual([area.kind, area.width, area.height], ["exit", 4, 4], `${path}: a 4 by 4 landing area the whole squad fits in`);
    for (let y = area.position.y; y < area.position.y + 4; y += 1) {
      for (let x = area.position.x; x < area.position.x + 4; x += 1) assert.ok(grid[y][x].walkable, `${path}: open ground at ${x},${y}`);
    }
    reach(area.position, "the landing area");
    if (mission.variant === "uprising") {
      uprisings += 1;
      assert.equal(first.type, "eliminate");
      assert.ok(first.targets.length >= 3 && first.targets.length <= 6, `${path}: a handful of ringleaders`);
      const ids = new Set(mission.opponents.map((opponent) => opponent.id));
      for (const target of first.targets) assert.ok(ids.has(target), `${path}: ringleader ${target} is a placed enemy`);
    } else {
      holds += 1;
      assert.equal(first.type, "hold");
      assert.ok(first.holdSeconds >= 35 && first.holdSeconds <= 75);
      const spot = zone(first.targetZone).position;
      reach(spot, "the position to hold");
      const converging = mission.opponents.filter((opponent) => opponent.patrol?.length === 2 && opponent.unit.includes("enemy-agent"));
      assert.ok(converging.length > 0, `${path}: the rival's agents converge`);
      for (const agent of converging) {
        const target = agent.patrol[1];
        assert.ok(findPath(grid, agent.position, target).length > 0 || (agent.position.x === target.x && agent.position.y === target.y),
          `${path}: ${agent.id} can walk to the position`);
      }
    }
  }
  assert.deepEqual([uprisings, holds], [50, 50]);
});
