// SPDX-License-Identifier: GPL-2.0-or-later

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { COMMAND_TYPES, MAX_COMMAND_UNITS, commands, validateCommand } from "../src/commands.js";
import { seedSimulation, worldChance } from "../src/simulation.js";

const size = { width: 20, height: 20 };

test("every builder makes a command that validates, and nothing else does", () => {
  const made = [
    commands.move(["a"], { x: 3, y: 4 }, true),
    commands.attack(["a", "b"], "enemy-1"),
    commands.follow(["a"], "civ-2"),
    commands.fire(["a"], { x: 3.5, y: 4.25 }, true),
    commands.holdFire(["a"], true, { x: 1, y: 2 }),
    commands.holdFire(["a"], false),
    commands.selectItem(["a"], "pulse"),
    commands.useItem(["a"], "medikit"),
    commands.board(["a"], "car-1"),
    commands.leave(["a"]),
    commands.loot(["a"], "body-1"),
    commands.interact(["a"]),
  ];
  assert.deepEqual([...new Set(made.map((command) => command.type))].sort(), [...COMMAND_TYPES].sort(), "every type is built");
  for (const command of made) assert.deepEqual(validateCommand(command, { size }), { ok: true }, command.type);
  assert.deepEqual(JSON.parse(JSON.stringify(made)), made, "commands are plain data that survive the wire");
});

test("builders copy positions so a command never aliases game state", () => {
  const to = { x: 1, y: 1 };
  const command = commands.move(["a"], to);
  to.x = 9;
  assert.equal(command.to.x, 1);
});

test("malformed or out-of-range commands are refused with a reason", () => {
  const bad = (command, error, context = { size }) => assert.deepEqual(validateCommand(command, context), { ok: false, error });
  bad(null, "not a command");
  bad([], "not a command");
  bad({ type: "teleport", unitIds: ["a"] }, "unknown command");
  bad({ type: "move", to: { x: 1, y: 1 } }, "no agents named");
  bad({ type: "move", unitIds: [], to: { x: 1, y: 1 } }, "no agents named");
  const crowd = Array.from({ length: MAX_COMMAND_UNITS + 1 }, (_, index) => `u${index}`);
  bad({ type: "move", unitIds: crowd, to: { x: 1, y: 1 } }, "no agents named");
  bad({ type: "move", unitIds: ["a", "a"], to: { x: 1, y: 1 } }, "bad agent list");
  bad({ type: "move", unitIds: [7], to: { x: 1, y: 1 } }, "bad agent list");
  bad({ type: "move", unitIds: ["a"] }, "missing to");
  bad({ type: "move", unitIds: ["a"], to: { x: 1.5, y: 1 } }, "bad to");
  bad({ type: "move", unitIds: ["a"], to: { x: -1, y: 1 } }, "bad to");
  bad({ type: "move", unitIds: ["a"], to: { x: 20, y: 1 } }, "bad to");
  bad({ type: "fire", unitIds: ["a"], at: { x: NaN, y: 1 } }, "bad at");
  bad({ type: "move", unitIds: ["a"], to: { x: 1, y: 1 }, speed: 99 }, "unexpected field speed");
  bad({ type: "attack", unitIds: ["a"], targetId: "" }, "bad targetId");
  bad({ type: "move", unitIds: ["a"], to: { x: 1, y: 1 }, queue: "yes" }, "bad queue");
});

test("the server's context decides who may command whom and what exists", () => {
  const context = { size, owns: (id) => id === "mine", exists: (id) => id === "enemy-1" };
  assert.deepEqual(validateCommand(commands.attack(["mine"], "enemy-1"), context), { ok: true });
  assert.deepEqual(validateCommand(commands.attack(["theirs"], "enemy-1"), context), { ok: false, error: "not your agent" });
  assert.deepEqual(validateCommand(commands.attack(["mine"], "ghost"), context), { ok: false, error: "unknown targetId" });
});

test("the seeded world stream repeats and does not disturb the shot stream", () => {
  seedSimulation(7);
  const first = [worldChance(), worldChance(), worldChance()];
  seedSimulation(7);
  assert.deepEqual([worldChance(), worldChance(), worldChance()], first);
  seedSimulation(8);
  assert.notDeepEqual([worldChance(), worldChance(), worldChance()], first);
  seedSimulation(1);
});

// The rules modules must run in Node with no browser and no unseeded chance, because the server runs them.
test("rules modules use no browser APIs, wall clocks or Math.random", () => {
  const banned =
    /\b(document|window|localStorage|sessionStorage|navigator|requestAnimationFrame)\b|Math\.random|Date\.now|performance\.now/;
  const rules = [
    "engine", "simulation", "mission", "inventory", "vehicles", "props", "drugs", "upgrades", "campaign", "bombs", "buildings",
    "random", "progress", "strategy", "death", "opstats", "debrief", "commands",
  ];
  for (const name of rules) {
    const code = readFileSync(new URL(`../src/${name}.js`, import.meta.url), "utf8")
      .split("\n")
      .filter((line) => !/^\s*(\/\/|\/\*|\*)/.test(line))
      .join("\n");
    assert.doesNotMatch(code, banned, `${name}.js must stay free of browser and unseeded-chance code`);
  }
});
