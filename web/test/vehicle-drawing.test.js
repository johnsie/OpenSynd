// SPDX-License-Identifier: GPL-2.0-or-later

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { drawScenery, drawSignal, drawVehicle } from "../src/structures.js";
import { newProp } from "../src/props.js";
import { newVehicleState, vehicleDefinition } from "../src/vehicles.js";

// A drawing context that accepts every call and counts the ones that paint.
function stubContext() {
  const calls = { fill: 0, stroke: 0, fillRect: 0 };
  const context = new Proxy(
    {},
    {
      get(_, name) {
        if (name in calls) return () => (calls[name] += 1);
        return () => ({ addColorStop() {} });
      },
      set() {
        return true;
      },
    },
  );
  return { context, calls };
}

const project = (x, y, z = 0) => ({ x: (x - y) * 40, y: (x + y) * 20 - z });
const read = async (path) => JSON.parse(await readFile(new URL(`../content/${path}`, import.meta.url), "utf8"));

test("every shipped vehicle kind draws, standing, driven and wrecked, along either axis", async () => {
  const pack = await read("pack.json");
  assert.ok(pack.vehicles.length >= 6);
  for (const path of pack.vehicles) {
    const definition = vehicleDefinition(await read(path));
    for (const heading of [{ x: 1, y: 0 }, { x: 0, y: -1 }]) {
      for (const disabled of [false, true]) {
        const { context, calls } = stubContext();
        const vehicle = {
          id: "v",
          position: { x: 10, y: 10 },
          disabled,
          definition,
          vehicle: { ...newVehicleState("d"), heading },
        };
        drawVehicle(context, project, vehicle, 40, 1234, { controlled: !disabled });
        assert.ok(calls.fill > 5, `${definition.name} paints something`);
      }
    }
  }
});

test("every kind of scenery draws in each state, and a signal in both colours", () => {
  for (const kind of ["tree", "streetlight", "bin", "billboard", "wreck"]) {
    for (const state of ["standing", "burning", "destroyed"]) {
      const { context, calls } = stubContext();
      const facing = state === "burning" ? "north-south" : "east-west";
      const prop = { ...newProp({ id: "p", kind, facing, position: { x: 5, y: 5 } }), state };
      drawScenery(context, project, prop, 40, 900);
      assert.ok(calls.fill + calls.stroke + calls.fillRect > 0, `${kind} ${state} paints something`);
    }
  }
  for (const green of [true, false]) {
    const { context, calls } = stubContext();
    drawSignal(context, project, { x: 4, y: 4 }, 40, green);
    assert.ok(calls.fill > 0);
  }
});
