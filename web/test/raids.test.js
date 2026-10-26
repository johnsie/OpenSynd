// SPDX-License-Identifier: GPL-2.0-or-later

import assert from "node:assert/strict";
import test from "node:test";

import { applyGates, createTileGrid, findPath } from "../src/engine.js";
import {
  HOUR_MS,
  MAX_DEFENCE,
  MAX_INCOME_HOURS,
  RAID_COST,
  accrued,
  canRaid,
  incomePerHour,
  raidMission,
  rivalDefence,
  seasonOf,
  upgradeCost,
} from "../server/raids.js";
import { loadContent, operationFrom } from "../server/content.js";

const content = loadContent();

test("seasons are calendar months", () => {
  assert.equal(seasonOf(Date.UTC(2026, 9, 31, 23)), seasonOf(Date.UTC(2026, 9, 1)));
  assert.equal(seasonOf(Date.UTC(2026, 10, 1)), seasonOf(Date.UTC(2026, 9, 1)) + 1);
  assert.equal(seasonOf(Date.UTC(2027, 0, 1)), seasonOf(Date.UTC(2026, 11, 1)) + 1);
});

test("income is by population, builds up while away, and stops after three days", () => {
  const a = { population: 4_000_000 };
  const b = { population: 1_000_000 };
  assert.equal(incomePerHour(a), 160);
  assert.equal(incomePerHour({ population: 10_000 }), 1, "never nothing");
  assert.equal(accrued([a, b], 0, 2 * HOUR_MS), 400);
  assert.equal(accrued([a], 0, 0), 0);
  assert.equal(accrued([], 0, HOUR_MS * 10), 0);
  assert.equal(accrued([a], 0, 1000 * HOUR_MS), 160 * MAX_INCOME_HOURS, "three days' worth at most");
  assert.equal(accrued([a], 5 * HOUR_MS, HOUR_MS), 0, "a clock that went backwards pays nothing");
});

test("defences cost more at every level, and a rival company's depends on how big the place is", () => {
  const costs = [1, 2, 3, 4, 5].map(upgradeCost);
  assert.deepEqual(costs, [500, 1000, 1500, 2000, 2500]);
  assert.equal(MAX_DEFENCE, 5);
  assert.equal(rivalDefence({ population: 1_000_000 }), 1);
  assert.equal(rivalDefence({ population: 20_000_000 }), 3);
  assert.ok(rivalDefence({ population: 9_000_000 }) >= rivalDefence({ population: 3_000_000 }));
});

const base = { raiderId: 1, holderId: null, holderCount: 0, yours: 0, shieldUntil: 0, now: 1000, funds: 1000 };

test("a raid is allowed on a rival company's territory or a player's, within the rules", () => {
  assert.deepEqual(canRaid(base), { ok: true });
  assert.deepEqual(canRaid({ ...base, holderId: 2, holderCount: 3, yours: 4 }), { ok: true }, "a similar player");
  assert.match(canRaid({ ...base, holderId: 1 }).reason, /yours/);
  assert.match(canRaid({ ...base, shieldUntil: 5000 }).reason, /shielded/);
  assert.deepEqual(canRaid({ ...base, shieldUntil: 1000 }), { ok: true }, "the shield has run out");
  assert.match(canRaid({ ...base, holderId: 2, holderCount: 1, yours: 5 }).reason, /far less/);
  assert.deepEqual(canRaid({ ...base, holderId: 2, holderCount: 3, yours: 6 }), { ok: true }, "half is fine");
  assert.match(canRaid({ ...base, funds: RAID_COST - 1 }).reason, new RegExp(String(RAID_COST)));
  assert.deepEqual(canRaid({ ...base, yours: 9 }), { ok: true }, "a rival company can always be raided");
});

test("a raid is the territory's defence operation with fewer agents at lower levels, and every one of the 50 can be played", () => {
  const counts = [];
  for (const entry of content.territories) {
    const agentsAt = (level) =>
      raidMission(content, entry, level).opponents.filter((placement) => placement.unit.includes("enemy-agent"));
    const low = agentsAt(1);
    const high = agentsAt(MAX_DEFENCE);
    counts.push([low.length, high.length]);
    assert.ok(low.length >= 3 && low.length <= high.length, `${entry.name}: ${low.length} then ${high.length}`);
    const mission = raidMission(content, entry, 3);
    assert.equal(mission.variant, "raid");
    assert.notDeepEqual(raidMission(content, entry, 3), raidMission(content, entry, 4), "the level shows");
    assert.deepEqual(raidMission(content, entry, 3), mission, "built the same way every time");
    const hold = mission.objectives.find((objective) => objective.type === "hold");
    assert.equal(hold.holdSeconds, 30 + 8 * 3);
    // It can be played: the position and the landing area can be reached with every gate shut, and the raiders are marching to it.
    const { map } = operationFrom(content, mission);
    const grid = createTileGrid(map);
    applyGates(grid, map.objects ?? [], () => false);
    const start = mission.team[0].position;
    const spot = map.zones.find((zone) => zone.id === hold.targetZone).position;
    const reachable = (start.x === spot.x && start.y === spot.y) || findPath(grid, start, spot).length > 0;
    assert.ok(reachable, `${entry.name}: the position is reachable`);
    assert.ok(mission.opponents.some((placement) => placement.patrol?.length === 2), `${entry.name}: agents march on it`);
  }
  assert.ok(counts.some(([low, high]) => high > low), "defence levels make a difference");
});
