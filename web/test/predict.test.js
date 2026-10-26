// SPDX-License-Identifier: GPL-2.0-or-later

import assert from "node:assert/strict";
import test from "node:test";

import { createPredictor } from "../src/predict.js";
import { FIXED_STEP_SECONDS, advanceUnits } from "../src/simulation.js";
import { loadContent, makeWorld } from "../server/content.js";

const content = loadContent();
const world = makeWorld(content, "missions/restore-relay.mission.json", { seed: 1 });
const walker = () => {
  const unit = structuredClone(world.units.find((item) => item.side === "team" && !item.inVehicle));
  unit.disabled = false;
  unit.hitStun = 0;
  unit.position = { x: 10, y: 10 };
  unit.path = Array.from({ length: 30 }, (_, index) => ({ x: 11 + index, y: 10 }));
  return unit;
};
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

test("between the server's reports an agent is shown walking on by the game's own movement rules", () => {
  const unit = walker();
  const predictor = createPredictor();
  predictor.report(unit, 100);
  const expected = structuredClone(unit);
  advanceUnits([expected], 15 * FIXED_STEP_SECONDS);
  predictor.show([unit], [unit.id], 115, 0.033);
  assert.ok(distance(unit.position, expected.position) < 1e-9, "fifteen steps on from the report");
  assert.ok(unit.position.x > 10.5, "and it did move");
});

test("an agent is never run far ahead of the last report", () => {
  const unit = walker();
  const predictor = createPredictor();
  predictor.report(unit, 0);
  predictor.show([unit], [unit.id], 10_000, 0.033);
  const limit = structuredClone(walker());
  advanceUnits([limit], 0.6);
  assert.ok(distance(unit.position, limit.position) < 1e-9);
});

test("only the player's own agents are moved, and ones in vehicles or down are left as the server shows them", () => {
  const mine = walker();
  const other = { ...walker(), id: "other" };
  const down = { ...walker(), id: "down", disabled: true };
  const predictor = createPredictor();
  for (const unit of [mine, other, down]) predictor.report(unit, 0);
  predictor.show([mine, other, down], [mine.id, down.id], 30, 0.033);
  assert.ok(mine.position.x > 10);
  assert.equal(other.position.x, 10, "not theirs");
  assert.equal(down.position.x, 10, "down");
});

test("an order moves the agent on at once from where it is drawn, and a refused order is undone", () => {
  const unit = walker();
  const predictor = createPredictor();
  predictor.report(unit, 0);
  predictor.show([unit], [unit.id], 0, 0.033);
  unit.path = Array.from({ length: 20 }, (_, index) => ({ x: 10, y: 11 + index })); // the page's own copy carried out the order
  predictor.order(unit, 5, 7);
  predictor.show([unit], [unit.id], 20, 0.033);
  assert.ok(unit.position.y > 10.5, "heading the way it was ordered, with no news from the server");
  predictor.answered([7]); // the server answered without moving them (nothing reported)
  unit.position = { x: 10, y: 10 };
  unit.path = [];
  predictor.show([unit], [unit.id], 20, 10);
  assert.ok(unit.position.y < 10.5, "back to what the server last said");
});

test("a report pulls the picture back to the server smoothly, and a big difference at once", () => {
  const unit = walker();
  const predictor = createPredictor({ blendPerSecond: 10 });
  predictor.report(unit, 0);
  predictor.show([unit], [unit.id], 30, 0.033); // drawn a good way along
  const drawn = { ...unit.position };
  unit.position = { x: 10, y: 10 };
  unit.path = [];
  predictor.report(unit, 30); // the server says it is back at the start, standing
  predictor.show([unit], [unit.id], 30, 0.033);
  assert.ok(unit.position.x < drawn.x && unit.position.x > 10, "part of the way back in one frame");
  predictor.show([unit], [unit.id], 30, 5);
  assert.ok(Math.abs(unit.position.x - 10) < 0.01, "and there given time");
  predictor.report({ ...unit, position: { x: 60, y: 10 }, path: [] }, 31);
  predictor.show([unit], [unit.id], 31, 0.033);
  assert.equal(unit.position.x, 60, "a jump of more than a couple of tiles is not dragged");
});
