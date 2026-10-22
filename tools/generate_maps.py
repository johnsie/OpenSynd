#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-2.0-or-later

"""Generate the developer-pack city maps and check that their objectives connect.

Each layout is a deterministic grid of city blocks with plaza intersections that
host relays and a gate panel, plus a fenced compound with a single gate. First
Light (Signal Yard) adds a runoff channel crossed by bridges. The script checks
that every objective is reachable from the entry, that every patrol point is on
reachable ground, and that the exit is sealed until the gate opens.
Run `python3 tools/generate_maps.py` to rewrite the canonical maps and the
self-contained copies under web/content.
"""

from __future__ import annotations

import json
import random
from collections import deque
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MAP_DIRECTORIES = [ROOT / "open-content/packs/developer/maps", ROOT / "web/content/maps"]
BUILDING_COLORS = ["#1d2227", "#20262c", "#1a1f24", "#232a30"]
FENCE_COLOR = "#3a4650"


def zone(zone_id, kind, x, y, width, height):
    return {"id": zone_id, "kind": kind, "position": {"x": x, "y": y}, "width": width, "height": height}


LAYOUTS = [
    {
        "id": "developer.signal-yard",
        "file": "signal-yard.map.json",
        "name": "Signal Yard",
        "size": 128,
        "seed": 128128,
        "period": 24,
        "block": 20,
        "first": 6,
        "blocks": 5,
        "open_columns": [2],  # block columns left empty for the channel and its plaza
        "channel": {"x": 60, "width": 8, "bridges": [26, 50, 74, 98]},
        "compound": (117, 95, 11, 33),
        "fences": [("fence-north", 117, 95, 11, 1), ("fence-west-upper", 117, 96, 1, 14),
                   ("fence-west-lower", 117, 112, 1, 16)],
        "gate": (117, 110, 1, 2),
        "entry": (2, 62),
        "zones": [
            zone("team-entry", "entry", 2, 62, 2, 2),
            zone("west-relay", "interaction", 27, 51, 2, 2),
            zone("east-relay", "interaction", 99, 75, 2, 2),
            zone("gate-panel", "interaction", 99, 99, 2, 2),
            zone("safe-exit", "exit", 122, 110, 4, 4),
        ],
        "watch_points": [(28, 34), (28, 46), (44, 52), (58, 52), (70, 56), (70, 70), (80, 75), (96, 75),
                         (100, 84), (100, 96), (104, 99), (114, 99), (98, 76), (104, 100)],
    },
    {
        "id": "developer.audit-yard",
        "file": "audit-yard.map.json",
        "name": "Audit Yard",
        "size": 96,
        "seed": 969696,
        "period": 22,
        "block": 18,
        "first": 6,
        "blocks": 4,
        "open_columns": [],
        "channel": None,
        "compound": (82, 0, 14, 34),
        "fences": [("fence-south", 82, 34, 14, 1), ("fence-west-upper", 82, 0, 1, 16),
                   ("fence-west-lower", 82, 18, 1, 16)],
        "gate": (82, 16, 1, 2),
        "entry": (2, 48),
        "zones": [
            zone("team-entry", "entry", 2, 48, 2, 2),
            zone("relay-one", "interaction", 25, 25, 2, 2),
            zone("relay-two", "interaction", 47, 69, 2, 2),
            zone("relay-three", "interaction", 69, 47, 2, 2),
            zone("gate-panel", "interaction", 69, 25, 2, 2),
            zone("safe-exit", "exit", 88, 14, 4, 4),
        ],
        "watch_points": [(25, 12), (25, 22), (36, 25), (44, 25), (47, 56), (47, 66), (56, 47), (66, 47),
                         (69, 36), (69, 44), (69, 58), (69, 66), (58, 69), (50, 69), (75, 25), (79, 25),
                         (49, 68), (71, 46), (71, 27), (79, 18), (80, 13), (70, 30)],
    },
]


def region(name, x, y, w, h, surface, walkable, elevation, color):
    return {
        "id": name, "x": x, "y": y, "width": w, "height": h,
        "surface": surface, "walkable": walkable, "elevation": elevation, "color": color,
    }


def intersects(a, b):
    return a[0] < b[0] + b[2] and b[0] < a[0] + a[2] and a[1] < b[1] + b[3] and b[1] < a[1] + a[3]


def build(layout: dict) -> dict:
    size = layout["size"]
    period, block, first = layout["period"], layout["block"], layout["first"]
    rng = random.Random(layout["seed"])
    regions = [region("ground", 0, 0, size, size, "service-concrete", True, 0, "#293138")]
    # Cosmetic street surfaces along the gaps between blocks.
    for index in range(layout["blocks"]):
        regions.append(region(f"street-column-{index}", first + block + period * index, 0, 4, size,
                              "street", True, 0, "#2d363d"))
        regions.append(region(f"street-row-{index}", 0, first + block + period * index, size, 4,
                              "street", True, 0, "#2d363d"))
    channel = layout["channel"]
    if channel:
        regions.append(region("water-channel", channel["x"], 0, channel["width"], size,
                              "runoff-channel", False, 0, "#12313d"))
        for row in channel["bridges"]:
            regions.append(region(f"bridge-{row}", channel["x"], row, channel["width"], 4,
                                  "signal-grate", True, 1, "#59717a"))

    cx, cy, cw, ch = layout["compound"]
    keep_clear = (cx - 1, cy - 1, cw + 1, ch + 1)
    for i in range(layout["blocks"]):
        if i in layout["open_columns"]:
            continue
        for j in range(layout["blocks"]):
            x, y = first + period * i, first + period * j
            if intersects((x, y, block, block), keep_clear):
                continue
            color = rng.choice(BUILDING_COLORS)
            elevation = rng.randint(2, 5)
            inner = block - 2
            if rng.random() < 0.4:
                # Two towers with an alley between them.
                half = (block - 4) // 2
                regions.append(region(f"block-{i}-{j}-a", x + 1, y + 1, half, inner, "utility-building",
                                      False, elevation, color))
                regions.append(region(f"block-{i}-{j}-b", x + block - 1 - half, y + 1, half, inner,
                                      "utility-building", False, rng.randint(2, 5), color))
            else:
                regions.append(region(f"block-{i}-{j}", x + 1, y + 1, inner, inner, "utility-building",
                                      False, elevation, color))

    for item in layout["zones"]:
        if item["kind"] == "interaction":
            regions.append(region(f"{item['id']}-base", item["position"]["x"], item["position"]["y"],
                                  item["width"], item["height"], "relay-pad", True, 1, "#8b6b32"))
    regions.append(region("compound-floor", cx + 1, cy + 1, cw - 1, ch - 1, "service-concrete", True, 0, "#2b3a36"))
    for name, x, y, w, h in layout["fences"]:
        regions.append(region(name, x, y, w, h, "service-fence", False, 1, FENCE_COLOR))

    gx, gy, gw, gh = layout["gate"]
    return {
        "formatVersion": 1,
        "id": layout["id"],
        "name": layout["name"],
        "license": "CC0-1.0",
        "projection": "isometric-diamond",
        "dimensions": {"width": size, "height": size},
        "cellSize": {"width": 80, "height": 40},
        "regions": regions,
        "zones": layout["zones"],
        "objects": [{
            "id": "service-gate", "kind": "gate", "position": {"x": gx, "y": gy},
            "width": gw, "height": gh, "control": "gate-panel",
        }],
    }


def walkable_grid(map_value: dict, layout: dict, gate_open: bool) -> list[list[bool]]:
    size = layout["size"]
    grid = [[False] * size for _ in range(size)]
    for r in map_value["regions"]:
        for y in range(r["y"], r["y"] + r["height"]):
            for x in range(r["x"], r["x"] + r["width"]):
                grid[y][x] = r["walkable"]
    gx, gy, gw, gh = layout["gate"]
    for y in range(gy, gy + gh):
        for x in range(gx, gx + gw):
            grid[y][x] = gate_open
    return grid


def reachable(grid, start):
    size = len(grid)
    seen = {start}
    queue = deque([start])
    while queue:
        x, y = queue.popleft()
        for dx, dy in ((1, 0), (0, 1), (-1, 0), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < size and 0 <= ny < size and grid[ny][nx] and (nx, ny) not in seen:
                seen.add((nx, ny))
                queue.append((nx, ny))
    return seen


def verify(map_value: dict, layout: dict) -> None:
    closed = walkable_grid(map_value, layout, False)
    opened = walkable_grid(map_value, layout, True)
    before = reachable(closed, layout["entry"])
    after = reachable(opened, layout["entry"])
    for item in layout["zones"]:
        point = (item["position"]["x"], item["position"]["y"])
        if item["kind"] == "exit":
            assert point not in before, f"{layout['name']}: the exit must be sealed until the gate opens"
            assert point in after, f"{layout['name']}: the exit must be reachable once the gate opens"
        else:
            assert point in before, f"{layout['name']}: {item['id']} must be reachable from the start"
    for x, y in layout["watch_points"]:
        assert (x, y) in before, f"{layout['name']}: patrol point {x},{y} is not on reachable ground"
    size = layout["size"]
    print(f"{layout['name']}: {len(before)} tiles reachable closed, {len(after)} open of {size * size}")


def main() -> None:
    for layout in LAYOUTS:
        map_value = build(layout)
        verify(map_value, layout)
        text = json.dumps(map_value, indent=1) + "\n"
        for directory in MAP_DIRECTORIES:
            (directory / layout["file"]).write_text(text, encoding="utf-8")
        print(f"wrote {len(map_value['regions'])} regions to {layout['file']}")


if __name__ == "__main__":
    main()
