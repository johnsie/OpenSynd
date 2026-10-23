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
WALL_COLOR = "#46505a"


def zone(zone_id, kind, x, y, width, height, prop=None):
    value = {"id": zone_id, "kind": kind, "position": {"x": x, "y": y}, "width": width, "height": height}
    if prop:
        value["prop"] = prop
    return value


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
        "gate_key": "developer.clearance-key",  # Safe Passage opens the gate with this key instead of the panel
        "entry": (2, 62),
        "zones": [
            zone("team-entry", "entry", 2, 62, 2, 2),
            zone("west-relay", "interaction", 27, 51, 2, 2, "relay"),
            zone("east-relay", "interaction", 99, 75, 2, 2, "relay"),
            zone("gate-panel", "interaction", 99, 99, 2, 2, "console"),
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
            zone("relay-one", "interaction", 25, 25, 2, 2, "relay"),
            zone("relay-two", "interaction", 47, 69, 2, 2, "relay"),
            zone("relay-three", "interaction", 69, 47, 2, 2, "relay"),
            zone("gate-panel", "interaction", 69, 25, 2, 2, "console"),
            zone("safe-exit", "exit", 88, 14, 4, 4),
        ],
        "watch_points": [(25, 12), (25, 22), (36, 25), (44, 25), (47, 56), (47, 66), (56, 47), (66, 47),
                         (69, 36), (69, 44), (69, 58), (69, 66), (58, 69), (50, 69), (75, 25), (79, 25),
                         (49, 68), (71, 46), (71, 27), (79, 18), (80, 13), (70, 30)],
    },
    {
        "id": "developer.freight-depot",
        "file": "freight-depot.map.json",
        "name": "Freight Depot",
        "size": 96,
        "seed": 909090,
        "period": 22,
        "block": 18,
        "first": 6,
        "blocks": 4,
        "open_columns": [],
        "channel": None,
        "compound": None,
        "fences": [],
        "gate": None,
        "entry": (2, 48),
        "zones": [
            zone("team-entry", "entry", 2, 48, 2, 2),
            zone("vault-server", "interaction", 69, 69, 2, 2, "server"),
            zone("uplink-hold", "hold", 46, 46, 4, 4, "beacon"),
            zone("safe-exit", "exit", 88, 46, 4, 4),
        ],
        "watch_points": [(25, 10), (25, 40), (25, 58), (25, 86), (47, 8), (47, 38), (40, 47),
                         (56, 47), (69, 8), (69, 38), (69, 52), (69, 62), (69, 78), (69, 90),
                         (91, 10), (91, 40), (91, 58), (91, 86), (12, 69), (40, 69), (30, 91),
                         (60, 91), (12, 25), (40, 25), (64, 69), (76, 69), (69, 62), (69, 76)],
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

    rail = layout.get("rail")
    if rail:
        # An elevated railway along the quiet top edge of the city, on a viaduct as high as the buildings. Nobody can step onto
        # it, and the streets pass underneath (it leaves a gap where each street column crosses).
        for number, (x, width) in enumerate(rail["segments"]):
            regions.append(region(f"rail-line-{number}", x, rail["y"], width, 1, "rail", False, rail["elevation"], "#3a3f44"))
        # Stations: a platform beside the track, one step higher than the rails (FreeSynd: "train stations are higher than
        # trains"), reached by a short stair; trains drop their passengers on it. The tiles in front of the platform that are not
        # the stair are scaffolding nobody can walk through.
        platform = "#3b464f"
        for number, station in enumerate(rail["stations"]):
            y = rail["y"] + 1
            step_high, step_low = rail["elevation"] - 2, rail["elevation"] - 5
            for x in range(station["from"], station["to"] + 1):
                regions.append(region(f"platform-{number}-{x}", x, y, 1, 1, "platform", True, rail["elevation"] + 1, platform))
                if x != station["stair"]:
                    regions.append(region(f"support-{number}-{x}", x, y + 1, 1, 1, "platform", False, step_high, platform))
            stair = station["stair"]
            regions.append(region(f"stair-{number}-high", stair, y + 1, 1, 1, "platform", True, step_high, platform))
            regions.append(region(f"stair-{number}-low", stair, y + 2, 1, 1, "platform", True, step_low, platform))

    props = random.Random(layout["seed"] + 1)
    doors = []  # alley mouths closed by a door instead of a fence (layouts with "doors": True)
    compound = layout["compound"]
    cx, cy, cw, ch = compound or (0, 0, 0, 0)
    keep_clear = (cx - 1, cy - 1, cw + 1, ch + 1) if compound else (-10, -10, 0, 0)
    for i in range(layout["blocks"]):
        if i in layout["open_columns"]:
            continue
        for j in range(layout["blocks"]):
            x, y = first + period * i, first + period * j
            if intersects((x, y, block, block), keep_clear):
                continue
            # Each block holds several separate buildings with two-tile alleys between them.
            inner = block - 2
            half = (inner - 2) // 2
            pattern = rng.choice(["quad", "pair-x", "pair-y", "three", "three", "quad"])
            ox, oy = x + 1, y + 1
            footprints = {
                "quad": [(0, 0, half, half), (half + 2, 0, half, half),
                         (0, half + 2, half, half), (half + 2, half + 2, half, half)],
                "pair-x": [(0, 0, half, inner), (half + 2, 0, half, inner)],
                "pair-y": [(0, 0, inner, half), (0, half + 2, inner, half)],
                "three": [(0, 0, inner, half), (0, half + 2, half, half), (half + 2, half + 2, half, half)],
            }[pattern]
            for index, (dx, dy, w, h) in enumerate(footprints):
                regions.append(region(f"block-{i}-{j}-{'abcd'[index]}", ox + dx, oy + dy, w, h,
                                      "utility-building", False, rng.randint(2, 5), rng.choice(BUILDING_COLORS)))

            # Low walls and fences along the pavement and across some alley mouths. They only ever
            # occupy the one-tile pavement or an alley's mouth, so the streets stay open.
            props_here = []
            for side in ("north", "south", "west", "east"):
                if props.random() < 0.5:
                    length = props.randint(4, 8)
                    start = props.randint(3, block - 3 - length)
                    kind = props.choice(["service-fence", "service-wall"])
                    rect = {"north": (x + start, y, length, 1), "south": (x + start, y + block - 1, length, 1),
                            "west": (x, y + start, 1, length), "east": (x + block - 1, y + start, 1, length)}[side]
                    props_here.append((f"{kind[8:]}-{i}-{j}-{side}", rect, kind))
            if pattern == "pair-x" and props.random() < 0.6:
                props_here.append((f"fence-{i}-{j}-alley", (ox + half, y, 2, 1), "service-fence"))
            for name, rect, kind in props_here:
                if any(intersects(rect, (z["position"]["x"] - 1, z["position"]["y"] - 1, z["width"] + 2, z["height"] + 2))
                       for z in layout["zones"]):
                    continue
                if any(rect[0] <= wx < rect[0] + rect[2] and rect[1] <= wy < rect[1] + rect[3]
                       for wx, wy in layout["watch_points"]):
                    continue
                if name.endswith("-alley") and layout.get("doors"):
                    doors.append({"id": name.replace("fence-", "door-"), "kind": "door", "position": {"x": rect[0], "y": rect[1]},
                                  "width": rect[2], "height": rect[3]})
                    continue
                regions.append(region(name, *rect, kind, False, 1 if kind == "service-fence" else 2,
                                      FENCE_COLOR if kind == "service-fence" else WALL_COLOR))

    for item in layout["zones"]:
        if item["kind"] == "interaction":
            regions.append(region(f"{item['id']}-base", item["position"]["x"], item["position"]["y"],
                                  item["width"], item["height"], "relay-pad", True, 1, "#8b6b32"))
    if compound:
        regions.append(region("compound-floor", cx + 1, cy + 1, cw - 1, ch - 1, "service-concrete", True, 0, "#2b3a36"))
    for name, x, y, w, h in layout["fences"]:
        regions.append(region(name, x, y, w, h, "service-fence", False, 1, FENCE_COLOR))

    gate = layout["gate"]
    objects = list(doors)
    if gate:
        gx, gy, gw, gh = gate
        objects.append({
            "id": "service-gate", "kind": "gate", "position": {"x": gx, "y": gy},
            "width": gw, "height": gh, "control": "gate-panel",
        })
        if layout.get("gate_key"):
            objects[-1]["key"] = layout["gate_key"]
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
        "objects": objects,
        "props": place_props(layout, regions),
    }


def place_props(layout: dict, regions: list[dict]) -> list[dict]:
    """Trees, street lights and bins along the pavement beside the streets. They never block anything."""
    size = layout["size"]
    rng = random.Random(layout["seed"] + 7)
    surface: dict[tuple[int, int], tuple[str, bool]] = {}
    for r in regions:
        for y in range(r["y"], r["y"] + r["height"]):
            for x in range(r["x"], r["x"] + r["width"]):
                surface[(x, y)] = (r["surface"], r["walkable"])
    near = ((1, 0), (-1, 0), (0, 1), (0, -1))
    reserved = set()
    for z in layout["zones"]:
        for y in range(z["position"]["y"] - 2, z["position"]["y"] + z["height"] + 2):
            for x in range(z["position"]["x"] - 2, z["position"]["x"] + z["width"] + 2):
                reserved.add((x, y))
    for point in layout["watch_points"]:
        for dy in range(-1, 2):
            for dx in range(-1, 2):
                reserved.add((point[0] + dx, point[1] + dy))
    found = []
    taken: list[tuple[int, int]] = []
    counts = {"tree": 0, "streetlight": 0, "bin": 0}
    for (x, y), (name, walkable) in sorted(surface.items()):
        if name != "service-concrete" or not walkable or (x, y) in reserved or not (0 < x < size - 1 and 0 < y < size - 1):
            continue
        beside_street = any(surface.get((x + dx, y + dy), ("", False))[0] == "street" for dx, dy in near)
        beside_building = any(surface.get((x + dx, y + dy), ("", False))[0] == "utility-building" for dx, dy in near)
        roll = rng.random()
        kind = None
        if beside_street and roll < 0.035:
            kind = "tree"
        elif beside_street and roll < 0.065:
            kind = "streetlight"
        elif beside_street and beside_building and roll < 0.085:
            kind = "bin"
        if kind is None or any(abs(x - tx) + abs(y - ty) < 4 for tx, ty in taken):
            continue
        taken.append((x, y))
        counts[kind] += 1
        found.append({"id": f"{kind}-{counts[kind]}", "kind": kind, "position": {"x": x, "y": y}})
    return found


def walkable_grid(map_value: dict, layout: dict, gate_open: bool) -> list[list[bool]]:
    size = layout["size"]
    grid = [[False] * size for _ in range(size)]
    for r in map_value["regions"]:
        for y in range(r["y"], r["y"] + r["height"]):
            for x in range(r["x"], r["x"] + r["width"]):
                grid[y][x] = r["walkable"]
    if layout["gate"]:
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
        if item["kind"] == "exit" and layout["gate"]:
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
