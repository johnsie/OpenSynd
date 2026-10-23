// SPDX-License-Identifier: GPL-2.0-or-later

import assert from "node:assert/strict";
import test from "node:test";

import { drawGateTile } from "../src/structures.js";

// A canvas stand-in that records the heights of the bars drawn between the posts.
function recorder() {
  const bars = [];
  let last = null;
  const context = {
    setLineDash() {},
    beginPath() {},
    stroke() {},
    moveTo(x, y) {
      last = y;
    },
    lineTo(x, y) {
      if (y === last) bars.push(y);
    },
  };
  return { context, bars };
}
const project = (x, y, z) => ({ x, y: y - z });

test("a sliding door raises its bars toward the top as it opens, and shows none once open", () => {
  const heightsAt = (open) => {
    const { context, bars } = recorder();
    drawGateTile(context, project, { x: 0, y: 0, gateAlong: "x" }, 20, open, 0);
    return [...new Set(bars)].filter((y) => y < 0 && y > -25).sort((a, b) => a - b);
  };
  const shut = heightsAt(0);
  const half = heightsAt(0.5);
  assert.ok(shut.length >= 3, "shut: three bars");
  assert.ok(Math.min(...half) <= Math.min(...shut) + 1e-9, "half open: the bars have risen");
  assert.ok(Math.max(...half) < Math.max(...shut), "the lowest bar has moved up");
  assert.deepEqual(heightsAt(true), heightsAt(1), "true and 1 draw the same");
  assert.equal(heightsAt(false).length, shut.length, "false and 0 draw the same");
});
