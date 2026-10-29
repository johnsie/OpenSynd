// SPDX-License-Identifier: GPL-2.0-or-later

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { ICON_NAMES, hasIcon, iconMarkup } from "../src/icons.js";

test("every named icon draws an SVG on the 32 x 32 grid", () => {
  assert.deepEqual([...ICON_NAMES].sort(), [
    "beam", "bomb", "cloak", "coil", "flame", "heavy-pulse", "key", "longshot", "medkit",
    "persuader", "pulse", "rotary", "scanner", "scatter", "shield", "smg", "syringe",
  ]);
  for (const name of ICON_NAMES) {
    const markup = iconMarkup(name, 40);
    assert.match(markup, /^<svg [^>]*viewBox="0 0 32 32"/);
    assert.match(markup, /width="40" height="40"/);
    assert.match(markup, /aria-hidden="true"/);
  }
  assert.equal(hasIcon("pulse"), true);
  assert.equal(hasIcon("nonsense"), false);
});

test("an unknown icon falls back to a plain box and markup never carries script", () => {
  assert.match(iconMarkup("nonsense"), /<rect/);
  for (const name of [...ICON_NAMES, "nonsense"]) {
    assert.doesNotMatch(iconMarkup(name), /<script|onload|onerror/i);
  }
});

test("every item in the pack names an icon that exists", async () => {
  const pack = JSON.parse(await readFile(new URL("../content/pack.json", import.meta.url), "utf8"));
  assert.ok(pack.equipment.length >= 5);
  for (const path of pack.equipment) {
    const item = JSON.parse(await readFile(new URL(`../content/${path}`, import.meta.url), "utf8"));
    assert.equal(hasIcon(item.icon), true, `${path} needs a known icon`);
    assert.ok(Number.isInteger(item.price) && item.price >= 0, `${path} needs a price`);
  }
});
