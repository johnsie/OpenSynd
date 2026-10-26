// SPDX-License-Identifier: GPL-2.0-or-later

// The game's content (a pack of JSON files) read from disk for a process with no browser: the server, the tests and tools. It
// gives the game core what the page gets from `fetch`: the unit, vehicle and equipment definitions, and any operation by its path.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { emptyCampaign } from "../src/campaign.js";
import { createWorld } from "../src/core/create.js";

export const CONTENT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "content");

/** Read the pack at `root`: its definitions as Maps from content path, and a `read(path)` for anything else in it. */
export function loadContent(root = CONTENT_ROOT) {
  const read = (path) => JSON.parse(readFileSync(join(root, path), "utf8"));
  const pack = read("pack.json");
  const definitions = (paths = []) => new Map(paths.map((path) => [path, read(path)]));
  return {
    root,
    pack,
    read,
    units: definitions(pack.units),
    vehicles: definitions(pack.vehicles),
    equipment: definitions(pack.equipment),
    territories: pack.territories ? read(pack.territories).territories : [],
  };
}

/** The map of a mission given as data, carrying any zones the mission adds. */
export function operationFrom(content, mission) {
  const base = content.read(mission.map);
  const map = mission.zones?.length ? { ...base, zones: [...base.zones, ...mission.zones] } : base;
  return { mission, map };
}

/** An operation's mission and its map, by the mission's path in the pack. */
export const loadOperation = (content, missionPath) => operationFrom(content, content.read(missionPath));

/** Make the world for an operation by its path, for a squad described by `campaign` (the starting squad if none is given). */
export function makeWorld(content, missionOrPath, { campaign = emptyCampaign(), seed = 1, options = {} } = {}) {
  const { mission, map } =
    typeof missionOrPath === "string" ? loadOperation(content, missionOrPath) : operationFrom(content, missionOrPath);
  return createWorld({ mission, map, content, campaign, seed, options });
}
