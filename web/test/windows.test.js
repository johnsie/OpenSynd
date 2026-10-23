// SPDX-License-Identifier: GPL-2.0-or-later

import assert from "node:assert/strict";
import test from "node:test";

import { baysOf, hasWindows, outline, wallHit, windowKey, windowShot, windowsInBlast } from "../src/windows.js";

// A building covering tiles 10..17 across and 20..25 down, three storeys.
const block = { id: "b", x: 10, y: 20, width: 8, height: 6, elevation: 2 };

test("a building has a bay per two tiles on each of its two visible walls, and none if it is one storey", () => {
  assert.deepEqual(outline(block), { x0: 9.5, y0: 19.5, x1: 17.5, y1: 25.5 });
  assert.equal(baysOf(block, 0), 4);
  assert.equal(baysOf(block, 1), 3);
  assert.equal(hasWindows(block), true);
  assert.equal(hasWindows({ ...block, elevation: 0 }), false);
  assert.equal(baysOf({ ...block, width: 1, height: 1 }, 0), 1);
});

test("a shot coming up from the south hits the south wall at the bay it struck", () => {
  const hit = wallHit(block, { x: 11, y: 30 }, { x: 11, y: 22 });
  assert.equal(hit.wall, 0);
  assert.ok(Math.abs(hit.u - 1.5 / 8) < 1e-9);
  assert.equal(windowShot(block, { x: 11, y: 30 }, { x: 11, y: 22 }, 0).startsWith("b:0:1:0"), true, "the first bay, first floor");
  assert.equal(windowShot(block, { x: 16.9, y: 30 }, { x: 16.9, y: 22 }, 0.99), windowKey("b", 0, 2, 3), "the last bay, top floor");
});

test("a shot coming in from the east hits the east wall, counted from the south end", () => {
  const hit = wallHit(block, { x: 25, y: 25 }, { x: 15, y: 25 });
  assert.equal(hit.wall, 1);
  assert.ok(hit.u < 0.2, "near the south end of the wall");
  assert.equal(windowShot(block, { x: 25, y: 20 }, { x: 15, y: 20 }, 0).split(":")[1], "1");
});

test("shots through walls nobody can see, shots that miss, and ones that start inside break nothing", () => {
  assert.equal(wallHit(block, { x: 11, y: 10 }, { x: 11, y: 21 }), null, "from the north");
  assert.equal(wallHit(block, { x: 5, y: 22 }, { x: 12, y: 22 }), null, "from the west");
  assert.equal(wallHit(block, { x: 30, y: 30 }, { x: 40, y: 40 }), null, "nowhere near");
  assert.equal(wallHit(block, { x: 11, y: 30 }, { x: 11, y: 28 }), null, "stops short");
  assert.equal(wallHit(block, { x: 12, y: 22 }, { x: 12, y: 21 }), null, "from inside");
  assert.equal(windowShot({ ...block, elevation: 0 }, { x: 11, y: 30 }, { x: 11, y: 22 }, 0.5), null, "one storey: no windows");
});

test("a blast breaks every window on the visible walls within its radius", () => {
  const near = windowsInBlast(block, { x: 10, y: 25.5 }, 3);
  assert.ok(near.length > 0 && near.every((key) => key.startsWith("b:")));
  assert.ok(near.includes(windowKey("b", 0, 1, 0)) && near.includes(windowKey("b", 0, 2, 0)), "both floors of the nearest bay");
  assert.ok(!near.includes(windowKey("b", 0, 1, 3)), "the far bay stays whole");
  assert.deepEqual(windowsInBlast(block, { x: 40, y: 40 }, 3), []);
  assert.ok(windowsInBlast(block, { x: 13, y: 22 }, 30).length >= (4 + 3) * 2, "a huge blast gets them all");
});

test("breaking glass sends unalerted guards within earshot to look, and leaves the rest alone", async () => {
  const { investigateNoise } = await import("../src/simulation.js");
  const unit = (x, role, extra = {}) => ({ side: "opposition", definition: { role }, position: { x, y: 0 }, ...extra });
  const near = unit(5, "guard");
  const far = unit(40, "guard");
  const busy = unit(6, "guard", { alertedBy: "op" });
  const civilian = { side: "civilian", definition: { role: "civilian" }, position: { x: 5, y: 0 } };
  investigateNoise([near, far, busy, civilian], { x: 0, y: 0 }, 14);
  assert.equal(near.investigate.left, 12);
  assert.equal(far.investigate, undefined);
  assert.equal(busy.investigate, undefined);
  assert.equal(civilian.investigate, undefined);
});
