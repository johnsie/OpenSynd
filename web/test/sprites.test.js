// SPDX-License-Identifier: GPL-2.0-or-later

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const manifest = JSON.parse(readFileSync(new URL("../public/assets/sprites/sprites.json", import.meta.url)));

test("civilian sheets include the ceremonial attention pose", () => {
  const civilians = Object.entries(manifest.sheets).filter(([name]) => name.startsWith("civilian-"));
  assert.equal(civilians.length, 8);
  for (const [name, sheet] of civilians) {
    const attention = sheet.animations.find((animation) => animation.name === "attention");
    assert.ok(attention, `${name} has an attention animation`);
    assert.equal(attention.frames, 1);
    assert.equal(attention.seconds, 0.01);
  }
});

test("the civilian cast includes five distinct female looks", () => {
  const women = Object.keys(manifest.sheets).filter((name) => name.startsWith("civilian-woman-"));
  assert.deepEqual(women.sort(), [
    "civilian-woman-1",
    "civilian-woman-2",
    "civilian-woman-3",
    "civilian-woman-4",
    "civilian-woman-5",
  ]);
});
