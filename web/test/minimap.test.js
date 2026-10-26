// SPDX-License-Identifier: GPL-2.0-or-later

import assert from "node:assert/strict";
import test from "node:test";

import { BIG_DOT, TINY_DOT, markerFor } from "../src/minimap.js";

const unit = (role, side, extra = {}) => ({ side, definition: { role }, ...extra });

test("civilians are tiny white dots", () => {
  assert.deepEqual(markerFor(unit("civilian", "civilian")), { shape: "dot", radius: TINY_DOT, fill: "#ffffff" });
  assert.ok(TINY_DOT < BIG_DOT);
});

test("police are larger blue dots and enemy agents larger red dots of the same size", () => {
  const police = markerFor(unit("police", "police"));
  const agent = markerFor(unit("enemy-agent", "opposition"));
  assert.equal(police.shape, "dot");
  assert.equal(police.fill, "#4aa3ff");
  assert.equal(agent.fill, "#ff3b30");
  assert.equal(police.radius, BIG_DOT);
  assert.equal(agent.radius, police.radius);
});

test("guards are the larger white dots with a black circle in the middle", () => {
  const guard = markerFor(unit("guard", "opposition"));
  assert.deepEqual(guard, { shape: "dot", radius: BIG_DOT, fill: "#ffffff", centre: "#000000" });
  assert.equal(markerFor(unit("guard", "opposition")).radius, markerFor(unit("police", "police")).radius);
});

test("the squad, followers, criminals and vehicles keep their squares", () => {
  assert.deepEqual(markerFor(unit("operator", "team")), { shape: "square", size: 3, fill: "#42d6d0" });
  assert.deepEqual(markerFor(unit("civilian", "civilian", { persuaded: true })), { shape: "square", size: 3, fill: "#79d59b" });
  assert.deepEqual(markerFor(unit("criminal", "criminal")), { shape: "square", size: 3, fill: "#ff9a4a" });
  assert.deepEqual(markerFor(unit("vehicle", "vehicle"), true), { shape: "square", size: 5, fill: "#b0bcc6" });
});
