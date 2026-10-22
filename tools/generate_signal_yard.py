#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-2.0-or-later

"""Generate the 128 x 128 Signal Yard map and check that its objectives connect.

The layout is deterministic: a grid of city blocks, a runoff channel crossed by
four bridges, three plaza intersections that host the relays and the gate
panel, and a fenced compound in the south-east with a single gate.
Run `python3 tools/generate_signal_yard.py` to rewrite the canonical map and
the self-contained copy under web/content.
"""

from __future__ import annotations

import json
import random
from collections import deque
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUTS = [
    ROOT / "open-content/packs/developer/maps/signal-yard.map.json",
    ROOT / "web/content/maps/signal-yard.map.json",
]

SIZE = 128
PERIOD = 24
BLOCK = 20
FIRST = 6
CHANNEL = (60, 8)  # x, width
BRIDGE_ROWS = [26, 50, 74, 98]
COMPOUND = (117, 95, 11, 33)  # x, y, width, height
GATE = {"x": 117, "y": 110, "width": 1, "height": 2}
BUILDING_COLORS = ["#1d2227", "#20262c", "#1a1f24", "#232a30"]

ZONES = [
    {"id": "team-entry", "kind": "entry", "position": {"x": 2, "y": 62}, "width": 2, "height": 2},
    {"id": "west-relay", "kind": "interaction", "position": {"x": 27, "y": 51}, "width": 2, "height": 2},
    {"id": "east-relay", "kind": "interaction", "position": {"x": 99, "y": 75}, "width": 2, "height": 2},
    {"id": "gate-panel", "kind": "interaction", "position": {"x": 99, "y": 99}, "width": 2, "height": 2},
    {"id": "safe-exit", "kind": "exit", "position": {"x": 122, "y": 110}, "width": 4, "height": 4},
]
# Patrol starts and far waypoints used by the First Light mission; all must be reachable.
WATCHERS = [(28, 34), (28, 46), (44, 52), (58, 52), (70, 56), (70, 70), (80, 75), (96, 75),
            (100, 84), (100, 96), (104, 99), (114, 99)]


def region(name, x, y, w, h, surface, walkable, elevation, color):
    return {
        "id": name, "x": x, "y": y, "width": w, "height": h,
        "surface": surface, "walkable": walkable, "elevation": elevation, "color": color,
    }


def intersects(a, b):
    return a[0] < b[0] + b[2] and b[0] < a[0] + a[2] and a[1] < b[1] + b[3] and b[1] < a[1] + a[3]


def build() -> dict:
    rng = random.Random(128128)
    regions = [region("ground", 0, 0, SIZE, SIZE, "service-concrete", True, 0, "#293138")]
    # Cosmetic street surfaces along the gaps between blocks.
    for index in range(5):
        regions.append(region(f"street-column-{index}", FIRST + BLOCK + PERIOD * index, 0, 4, SIZE,
                              "street", True, 0, "#2d363d"))
        regions.append(region(f"street-row-{index}", 0, FIRST + BLOCK + PERIOD * index, SIZE, 4,
                              "street", True, 0, "#2d363d"))
    regions.append(region("water-channel", CHANNEL[0], 0, CHANNEL[1], SIZE, "runoff-channel", False, 0, "#12313d"))
    for row in BRIDGE_ROWS:
        regions.append(region(f"bridge-{row}", CHANNEL[0], row, CHANNEL[1], 4, "signal-grate", True, 1, "#59717a"))

    keep_clear = [COMPOUND[0] - 1, COMPOUND[1] - 1, COMPOUND[2] + 1, COMPOUND[3] + 1]
    for i in range(5):
        if i == 2:
            continue  # the channel and its plaza run through this column
        for j in range(5):
            x, y = FIRST + PERIOD * i, FIRST + PERIOD * j
            if intersects((x, y, BLOCK, BLOCK), keep_clear):
                continue
            color = rng.choice(BUILDING_COLORS)
            elevation = rng.randint(2, 5)
            if rng.random() < 0.4:
                # Two towers with an alley between them.
                regions.append(region(f"block-{i}-{j}-a", x + 1, y + 1, 8, 18, "utility-building", False, elevation, color))
                regions.append(region(f"block-{i}-{j}-b", x + 11, y + 1, 8, 18, "utility-building", False,
                                      rng.randint(2, 5), color))
            else:
                regions.append(region(f"block-{i}-{j}", x + 1, y + 1, 18, 18, "utility-building", False, elevation, color))

    for zone in ZONES:
        if zone["kind"] == "interaction":
            regions.append(region(f"{zone['id']}-base", zone["position"]["x"], zone["position"]["y"],
                                  zone["width"], zone["height"], "relay-pad", True, 1, "#8b6b32"))
    cx, cy, cw, ch = COMPOUND
    regions.append(region("compound-floor", cx + 1, cy + 1, cw - 1, ch - 1, "service-concrete", True, 0, "#2b3a36"))
    regions.append(region("fence-north", cx, cy, cw, 1, "service-fence", False, 1, "#3a4650"))
    regions.append(region("fence-west-upper", cx, cy + 1, 1, GATE["y"] - cy - 1, "service-fence", False, 1, "#3a4650"))
    regions.append(region("fence-west-lower", cx, GATE["y"] + GATE["height"], 1,
                          cy + ch - GATE["y"] - GATE["height"], "service-fence", False, 1, "#3a4650"))

    return {
        "formatVersion": 1,
        "id": "developer.signal-yard",
        "name": "Signal Yard",
        "license": "CC0-1.0",
        "projection": "isometric-diamond",
        "dimensions": {"width": SIZE, "height": SIZE},
        "cellSize": {"width": 80, "height": 40},
        "regions": regions,
        "zones": ZONES,
        "objects": [{
            "id": "service-gate", "kind": "gate", "position": {"x": GATE["x"], "y": GATE["y"]},
            "width": GATE["width"], "height": GATE["height"], "control": "gate-panel",
        }],
    }


def walkable_grid(map_value: dict, gate_open: bool) -> list[list[bool]]:
    grid = [[False] * SIZE for _ in range(SIZE)]
    for r in map_value["regions"]:
        for y in range(r["y"], r["y"] + r["height"]):
            for x in range(r["x"], r["x"] + r["width"]):
                grid[y][x] = r["walkable"]
    if gate_open:
        for y in range(GATE["y"], GATE["y"] + GATE["height"]):
            for x in range(GATE["x"], GATE["x"] + GATE["width"]):
                grid[y][x] = True
    else:
        for y in range(GATE["y"], GATE["y"] + GATE["height"]):
            for x in range(GATE["x"], GATE["x"] + GATE["width"]):
                grid[y][x] = False
    return grid


def reachable(grid, start):
    seen = {start}
    queue = deque([start])
    while queue:
        x, y = queue.popleft()
        for dx, dy in ((1, 0), (0, 1), (-1, 0), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < SIZE and 0 <= ny < SIZE and grid[ny][nx] and (nx, ny) not in seen:
                seen.add((nx, ny))
                queue.append((nx, ny))
    return seen


def verify(map_value: dict) -> None:
    closed = walkable_grid(map_value, False)
    opened = walkable_grid(map_value, True)
    start = (2, 62)
    before = reachable(closed, start)
    after = reachable(opened, start)
    for zone in ZONES:
        point = (zone["position"]["x"], zone["position"]["y"])
        assert closed[point[1]][point[0]] or zone["id"] == "safe-exit", zone["id"]
        if zone["id"] == "safe-exit":
            assert point not in before, "exit must be sealed until the gate opens"
            assert point in after, "exit must be reachable once the gate opens"
        else:
            assert point in before, f"{zone['id']} must be reachable from the start"
    for x, y in WATCHERS:
        assert (x, y) in before, f"watcher at {x},{y} is not on reachable ground"
    print(f"reachable tiles: {len(before)} closed, {len(after)} open of {SIZE * SIZE}")


def main() -> None:
    map_value = build()
    verify(map_value)
    text = json.dumps(map_value, indent=1) + "\n"
    for output in OUTPUTS:
        output.write_text(text, encoding="utf-8")
    print(f"wrote {len(map_value['regions'])} regions to {len(OUTPUTS)} files")


if __name__ == "__main__":
    main()
