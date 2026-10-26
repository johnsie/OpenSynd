#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-2.0-or-later

"""Build the campaign's missions: one map and one main mission for each territory without a hand-made operation.

The world is 50 territories (open-content/packs/developer/territories.json). The first six have hand-made missions.
For every other territory this script writes a city map (the same block generator as tools/generate_maps.py, with a
seed from the territory's name and the zones placed automatically on ground the team can reach) and a mission of one
of several shapes (relay run, vault job, uplink, audit, blackout), harder the further the territory is from the start:
more enemies, guards and heavier weapons. It also lays out the unlock graph: each territory is opened by its nearest
neighbours that are closer to the start.

Everything is deterministic: running it again rewrites the same files. Afterwards copy the pack to the site with
`rm -rf web/content && cp -r open-content/packs/developer/. web/content/`.
"""

from __future__ import annotations

import hashlib
import json
import math
import random
import sys
from collections import Counter, deque
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import generate_maps as maps  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
PACK = ROOT / "open-content/packs/developer"
# Hand-made operations each have a map of their own. Safe Passage, Loose Ends and Foyle Crossing used to share the first three maps; their
# territories now get generated districts, and the old missions live on as test fixtures (web/test/fixtures/missions) for the rules they
# exercise.
HANDMADE = {
    "missions/restore-relay.mission.json", "missions/quiet-hours.mission.json", "missions/dead-drop.mission.json",
}
HANDMADE_MAPS = ["maps/signal-yard.map.json", "maps/audit-yard.map.json", "maps/freight-depot.map.json"]
# Maps for operations outside the 50 (the tutorial's Training Yard, from tools/generate_tutorial.py): kept in the pack as they are.
EXTRA_MAPS = ["maps/training-yard.map.json"]
START = "developer.northern-europe"
MAP_WIDTH, MAP_HEIGHT = 1000, 395  # the atlas projection in web/src/atlas.js


def slug_of(territory: dict) -> str:
    return territory["id"].split(".", 1)[1]


def seed_of(text: str) -> int:
    return int(hashlib.sha256(text.encode()).hexdigest()[:8], 16)


def project(territory: dict) -> tuple[float, float]:
    return ((territory["lon"] + 180) / 360 * MAP_WIDTH, (84 - territory["lat"]) / 142 * MAP_HEIGHT)


# ----------------------------------------------------------------------------------------------------- the graph

def build_graph(territories: list[dict]) -> tuple[dict[str, int], dict[str, list[str]]]:
    """Depth from the start and, for each territory, the (up to two) closer neighbours that unlock it."""
    points = {t["id"]: project(t) for t in territories}
    ids = [t["id"] for t in territories]

    def gap(a: str, b: str) -> float:
        return math.hypot(points[a][0] - points[b][0], points[a][1] - points[b][1])

    neighbours: dict[str, set[str]] = {i: set() for i in ids}
    for i in ids:
        for other in sorted((o for o in ids if o != i), key=lambda o: (gap(i, o), o))[:4]:
            neighbours[i].add(other)
            neighbours[other].add(i)
    # Join any separate islands of territories to the rest by their closest pair.
    while True:
        seen = {START}
        queue = deque([START])
        while queue:
            for other in sorted(neighbours[queue.popleft()]):
                if other not in seen:
                    seen.add(other)
                    queue.append(other)
        if len(seen) == len(ids):
            break
        a, b = min(((x, y) for x in seen for y in ids if y not in seen), key=lambda pair: (gap(*pair), pair))
        neighbours[a].add(b)
        neighbours[b].add(a)
    depth = {START: 0}
    queue = deque([START])
    while queue:
        current = queue.popleft()
        for other in sorted(neighbours[current], key=lambda o: (gap(current, o), o)):
            if other not in depth:
                depth[other] = depth[current] + 1
                queue.append(other)
    parents: dict[str, list[str]] = {}
    for i in ids:
        if i == START:
            continue
        closer = [o for o in neighbours[i] if depth[o] < depth[i]]
        parents[i] = sorted(closer, key=lambda o: (gap(i, o), o))[:2]
    return depth, parents


# ------------------------------------------------------------------------------------------------------ the maps

def surfaces(map_value: dict) -> tuple[list[list[str]], list[list[bool]]]:
    size = map_value["dimensions"]["width"]
    rows = map_value["dimensions"]["height"]
    surface = [[""] * size for _ in range(rows)]
    walkable = [[False] * size for _ in range(rows)]
    for r in map_value["regions"]:
        for y in range(r["y"], r["y"] + r["height"]):
            for x in range(r["x"], r["x"] + r["width"]):
                surface[y][x] = r["surface"]
                walkable[y][x] = r["walkable"]
    return surface, walkable


RAIL_HEIGHT = 8  # tile elevation of the viaduct: about as high as the buildings


def rail_for(size: int, period: int, block: int, first: int, blocks: int, compound, street_columns=None) -> dict:
    """The railway: segments of an elevated line along row 2, leaving a gap at each street column (which passes underneath)."""
    end = (compound[0] - 3) if compound else size - 2
    columns = [(first + block + period * index, first + block + period * index + 4) for index in range(blocks)]
    if street_columns:
        columns = [(x, x + 4) for x in street_columns]
    segments = []
    start = 1
    for low, high in columns + [(end + 1, end + 1)]:
        if low - start >= 4:
            segments.append((start, min(low, end + 1) - start))
        start = high
    segments = [(x, w) for x, w in segments if x + w <= end + 1]
    # Three stations: near the west end, in the middle stretch and near the east end. A platform covers the stretch the train's
    # middle carriage stands on (whichever way it arrives) within its segment, with a stair in the middle of it.
    def station_at(stop_x: int) -> dict:
        x0, width = next((x, w) for x, w in segments if x <= stop_x < x + w)
        low, high = max(x0, stop_x - 8), min(x0 + width - 1, stop_x + 8)
        return {"from": low, "to": high, "stair": (low + high) // 2}
    stops = rail_stops(segments)
    return {"y": 2, "elevation": RAIL_HEIGHT, "segments": segments, "stops": stops, "stations": [station_at(x) for x in stops]}


def rail_stops(segments: list[tuple[int, int]]) -> list[int]:
    """Where the train's engine stops: in the first segment, on the middle one, and near the far end."""
    middle = segments[len(segments) // 2]
    return [segments[0][0] + 11, middle[0] + middle[1] // 2, segments[-1][0] + segments[-1][1] - 2]


# The style of each territory's district (see map_styles.py), chosen by what the place is like: coasts get harbours, deserts get sand,
# the far north gets snow, and so on. A style is not a theme park: the mission, the enemies and the objectives are the same kinds as
# everywhere, but the ground you fight over is different. Territories not listed keep the downtown grid.
STYLE_OF = {
    "northern-europe": "oldtown", "eastern-north-america": "highrise", "southern-brazil": "river", "southeast-asia": "harbour",
    "eastern-mediterranean": "oldtown", "alaska": "tundra", "pacific-coast": "harbour", "southwest-desert": "desert",
    "gulf-coast": "harbour", "great-plains": "outskirts", "central-america": "jungle", "colombian-highlands": "park",
    "amazon-basin": "jungle", "northeast-brazil": "harbour", "andean-peru": "oldtown", "altiplano": "desert",
    "chilean-coast": "harbour", "patagonia": "outskirts", "iberia": "oldtown", "scandinavia": "park", "eastern-europe": "industrial",
    "balkans": "river", "russian-plain": "park", "caucasus": "oldtown", "ural-region": "industrial", "western-siberia": "tundra",
    "eastern-siberia": "tundra", "iranian-plateau": "desert", "arabian-peninsula": "desert", "maghreb": "oldtown",
    "gulf-of-guinea": "harbour", "congo-basin": "jungle", "horn-of-africa": "desert", "east-african-rift": "river",
    "southern-africa": "outskirts", "kazakh-steppe": "outskirts", "indus-valley": "river", "deccan": "highrise",
    "ganges-delta": "river", "mongolia": "desert", "southern-china": "highrise", "manchuria": "industrial",
    "japan": "highrise", "sumatra": "jungle", "borneo": "jungle", "western-australia": "outskirts", "central-australia": "desert",
    "eastern-australia": "harbour", "madagascar": "jungle", "northern-ireland": "park",
}
RAIL_STYLES = {"downtown", "industrial", "highrise"}  # districts with the elevated freight line along the north edge
STREET_COLUMNS = {"industrial": (30, 28), "highrise": (28, 26)}  # first column, then the spacing


def outline_for(rng: random.Random, size: int, height: int, has_rail: bool) -> list[tuple[int, int, int, int]]:
    """Rectangles cut out of the map so it is not a plain rectangle: a stepped diagonal corner (or two) on the west side, or a bay
    taken out of the top or bottom edge. They stay clear of the entry, the exit yard and the compound; a map with the railway along
    its north edge keeps its north side whole."""
    kind = rng.choice(["none", "none", "sw", "nw", "both", "bay-top", "bay-bottom", "bays"])
    holes: list[tuple[int, int, int, int]] = []
    cut = rng.randint(20, 36)

    def corner(top: bool) -> None:
        for step in range(0, cut, 2):
            y = step if top else height - step - 2
            holes.append((0, y, cut - step, 2))

    if kind in ("sw", "both"):
        corner(False)
    if kind in ("nw", "both") and not has_rail:
        corner(True)
    width, depth = rng.randint(24, 44), rng.randint(8, 14)
    x = rng.randint(int(size * 0.28), int(size * 0.55))
    if kind in ("bay-top", "bays") and not has_rail:
        holes.append((x, 0, width, depth))
    if kind in ("bay-bottom", "bays"):
        holes.append((size - x - width, height - depth, width, depth))
    return holes


def layout_for(territory: dict, tier: int, attempt: int = 0) -> dict:
    """The parameters of a city for this territory: bigger and more fenced further along the campaign."""
    rng = random.Random(seed_of(territory["id"]) + attempt)
    size = [128, 128, 144, 160, 176][min(tier - 1, 4)]  # a district takes a couple of minutes to cross, more further along
    style = STYLE_OF.get(slug_of(territory), "downtown")
    # Wider than tall for most styles (the squad crosses from west to east): between three quarters and all of the width, and the
    # crop keeps the avenue and the entry together. A harbour keeps its sea, so it is cropped from the top.
    height = size if style == "downtown" else max(96, int(size * rng.choice([1.0, 0.9, 0.82, 0.74, 0.74])) // 8 * 8)
    crop_y0 = (size - height) if style == "harbour" else (size - height) // 2
    period, block = 24, 20
    first = 6
    blocks = (size - 2 - 4 - first - block) // period + 1
    compound = None
    fences = []
    gate = None
    if rng.random() < 0.65:
        cw, ch = 14, 34
        cx = size - cw
        cy = rng.choice([0, (height - ch) // 2, height - ch])
        compound = (cx, cy, cw, ch)
        gate = (cx, cy + 16, 1, 2)
        if cy > 0:
            fences.append(("fence-north", cx, cy, cw, 1))
        if cy + ch < height:
            fences.append(("fence-south", cx, cy + ch, cw, 1))
        fences.append(("fence-west-upper", cx, cy, 1, 16))
        fences.append(("fence-west-lower", cx, cy + 18, 1, ch - 18))
    channel = None
    if size >= 112 and rng.random() < 0.5:
        channel = {"x": size // 2 - 4, "width": 8, "bridges": [first + 20 + 24 * k for k in range(blocks - 1)]}
    columns = []
    if style in STREET_COLUMNS:
        first_column, spacing = STREET_COLUMNS[style]
        columns = list(range(first_column, size - 24, spacing))
    return {
        "style": style,
        "street_columns": columns,
        "id": f"developer.{slug_of(territory)}-district",
        "file": f"{slug_of(territory)}.map.json",
        "name": f"{territory['name']} District",
        "size": size,
        "height": height,
        "crop_y0": crop_y0,
        "outline": outline_for(rng, size, height, style in RAIL_STYLES),
        "seed": seed_of(territory["id"] + ":map") + attempt,
        "period": period,
        "block": block,
        "first": first,
        "blocks": blocks,
        "open_columns": [],
        "channel": channel,
        "compound": compound,
        "fences": fences,
        "gate": gate,
        "rail": rail_for(size, period, block, first, blocks, compound, columns or None) if style in RAIL_STYLES else None,
        "doors": tier >= 2,  # alley mouths closed by doors that open for anyone who walks up to them
        "entry": (2, size // 2 - crop_y0),
        "zones": [],
        "watch_points": [],
    }


def place_zones(layout: dict, map_value: dict, rng: random.Random) -> list[dict]:
    """Choose the entry, relays, console, server, uplink and exit on ground reachable from the start."""
    size = layout["size"]
    height = layout.get("height", size)
    _, walkable = surfaces(map_value)
    if layout["gate"]:
        gx, gy, gw, gh = layout["gate"]
        for y in range(gy, gy + gh):
            for x in range(gx, gx + gw):
                walkable[y][x] = False
    entry = layout["entry"]
    reach = maps.reachable(walkable, entry)
    compound = layout["compound"]

    def inside_compound(x: int, y: int) -> bool:
        return bool(compound) and compound[0] - 1 <= x < compound[0] + compound[2] and compound[1] - 1 <= y < compound[1] + compound[3]

    def area_ok(x: int, y: int, side: int) -> bool:
        return all((x + dx, y + dy) in reach and not inside_compound(x + dx, y + dy)
                   for dx in range(side) for dy in range(side))

    chosen: list[tuple[int, int]] = [entry]
    zones = [maps.zone("team-entry", "entry", entry[0], entry[1], 2, 2)]

    def pick(side: int, gap: int, minimum_entry: int = 20) -> tuple[int, int]:
        gap = round(gap * size / 128)
        minimum_entry = round(minimum_entry * size / 128)
        candidates = [(x, y) for x in range(3, size - 6) for y in range(3, height - 6) if area_ok(x, y, side)]
        rng.shuffle(candidates)
        for x, y in candidates:
            if math.hypot(x - entry[0], y - entry[1]) < minimum_entry:
                continue
            if all(math.hypot(x - cx, y - cy) >= gap for cx, cy in chosen):
                chosen.append((x, y))
                return x, y
        raise RuntimeError(f"{layout['name']}: no room for a {side}x{side} zone")

    for name in ["relay-one", "relay-two", "relay-three"]:
        x, y = pick(2, 22)
        zones.append(maps.zone(name, "interaction", x, y, 2, 2, "relay"))
    x, y = pick(2, 18)
    zones.append(maps.zone("gate-panel", "interaction", x, y, 2, 2, "console"))
    x, y = pick(2, 20)
    zones.append(maps.zone("vault-server", "interaction", x, y, 2, 2, "server"))
    x, y = pick(4, 20)
    zones.append(maps.zone("uplink-hold", "hold", x, y, 4, 4, "beacon"))
    if layout["gate"]:
        cx, cy, _, _ = compound
        zones.append(maps.zone("safe-exit", "exit", cx + 6, cy + 14, 4, 4))
    else:
        candidates = [(x, y) for x in range(size - 16, size - 6) for y in range(3, height - 6) if area_ok(x, y, 4)]
        x, y = max(candidates, key=lambda point: (point[0], -abs(point[1] - entry[1]), point))
        zones.append(maps.zone("safe-exit", "exit", x, y, 4, 4))
    return zones


def make_map(territory: dict, tier: int) -> tuple[dict, dict]:
    """The territory's district. A style's random layout can wall something off (the exit behind water, a zone with no room), so a
    layout that fails its checks is thrown away and the style is laid out again with the next seed."""
    last = None
    for attempt in range(40):
        layout = layout_for(territory, tier, attempt)
        rng = random.Random(seed_of(territory["id"] + ":zones") + attempt)
        try:
            layout["zones"] = place_zones(layout, maps.build(layout), rng)
            map_value = maps.build(layout)
            maps.verify(map_value, layout)
            return layout, map_value
        except (AssertionError, RuntimeError) as error:
            last = error
    raise RuntimeError(f"{territory['name']}: no district layout passed its checks ({last})")


# --------------------------------------------------------------------------------------------------- the missions

RECIPES = [
    {"key": "relay-run", "noun": "Relay Run", "relays": 3, "gate": True, "server": False, "warden": False, "hold": False},
    {"key": "vault-job", "noun": "Vault Job", "relays": 0, "gate": True, "server": True, "warden": True, "hold": False},
    {"key": "uplink", "noun": "Uplink", "relays": 2, "gate": False, "server": False, "warden": False, "hold": True},
    {"key": "audit", "noun": "Audit", "relays": 2, "gate": True, "server": True, "warden": False, "hold": False},
    {"key": "blackout", "noun": "Blackout", "relays": 3, "gate": False, "server": False, "warden": True, "hold": True},
]
# Two further shapes, each given to about a fifth of the generated operations: clear the district of enemy agents, or win a
# defector over with the Persuader and bring them out alive.
PURGE = {"key": "purge", "noun": "Purge", "relays": 0, "gate": False, "server": False, "warden": False, "hold": False,
         "purge": True, "defector": False}
DEFECTION = {"key": "defection", "noun": "Defection", "relays": 0, "gate": False, "server": False, "warden": False,
             "hold": False, "purge": False, "defector": True}


def special_shapes(generated: list[dict]) -> dict[str, dict]:
    """Which generated operations are a purge and which a defection: every fifth in alphabetical order for each, so the two are
    spread evenly (about nine of each across the campaign) whatever the dice would say."""
    shapes = {}
    for index, territory in enumerate(sorted(generated, key=lambda item: item["id"])):
        if index % 5 == 1:
            shapes[territory["id"]] = PURGE
        elif index % 5 == 3:
            shapes[territory["id"]] = DEFECTION
    return shapes


def recipe_for(territory: dict, special: dict[str, dict]) -> dict:
    """The shape of a territory's operation: a purge, a defection, or one of the five ordinary shapes."""
    return special.get(territory["id"]) or RECIPES[seed_of(territory["id"] + ":recipe") % len(RECIPES)]


PLACES = ["freight sidings", "harbour yard", "records annex", "switching yard", "market lanes", "pump station",
          "tram depot", "bonded warehouses", "signal tower", "water works", "customs hall", "container park"]
RELAY_WORDS = ["north-west", "southern", "eastern", "central", "western", "river"]
NUMBERS = ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve",
           "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty"]


def straight_patrol(rng: random.Random, reach: set[tuple[int, int]], start: tuple[int, int], low: int, high: int):
    """The far end of a straight, open run from `start` (None if there is no room)."""
    directions = [(1, 0), (-1, 0), (0, 1), (0, -1)]
    rng.shuffle(directions)
    for dx, dy in directions:
        length = rng.randint(low, high)
        end = None
        for step in range(1, length + 1):
            if (start[0] + dx * step, start[1] + dy * step) not in reach:
                break
            end = (start[0] + dx * step, start[1] + dy * step)
        if end and abs(end[0] - start[0]) + abs(end[1] - start[1]) >= low // 2:
            return end
    return None


def with_patrol(rng: random.Random, reach: set[tuple[int, int]], placement: dict, low: int, high: int) -> dict:
    start = (placement["position"]["x"], placement["position"]["y"])
    end = straight_patrol(rng, reach, start, low, high)
    if end:
        placement["patrol"] = [{"x": start[0], "y": start[1]}, {"x": end[0], "y": end[1]}]
    return placement


Run = tuple[tuple[int, int], tuple[int, int]]


def road_runs(surface: list[list[str]], reach: set[tuple[int, int]], size: int, rows: int | None = None) -> list[Run]:
    """Straight stretches of open road at least 14 tiles long (east-west)."""
    runs = []
    for y in range(rows if rows is not None else size):
        x = 0
        while x < size:
            if (x, y) in reach and surface[y][x] == "street":
                start = x
                while x < size and (x, y) in reach and surface[y][x] == "street":
                    x += 1
                if x - start >= 14:
                    runs.append(((start + 2, y), (x - 3, y)))
            else:
                x += 1
    return runs


def make_mission(territory: dict, tier: int, layout: dict, map_value: dict, map_path: str, unlocks: list[str],
                 recipe: dict) -> dict:
    rng = random.Random(seed_of(territory["id"] + ":mission"))
    surface, walkable = surfaces(map_value)
    size = layout["size"]
    if layout["gate"]:
        gx, gy, gw, gh = layout["gate"]
        for y in range(gy, gy + gh):
            for x in range(gx, gx + gw):
                walkable[y][x] = False
    entry = layout["entry"]
    reach = maps.reachable(walkable, entry)
    zone_by_id = {z["id"]: z for z in layout["zones"]}
    reserved = set()
    for z in layout["zones"]:
        for y in range(z["position"]["y"] - 2, z["position"]["y"] + z["height"] + 2):
            for x in range(z["position"]["x"] - 2, z["position"]["x"] + z["width"] + 2):
                reserved.add((x, y))
    pool = sorted(p for p in reach if p not in reserved and math.hypot(p[0] - entry[0], p[1] - entry[1]) > 12
                  and surface[p[1]][p[0]] != "rail")
    street = sorted(p for p in pool if surface[p[1]][p[0]] == "street")
    rng.shuffle(pool)
    rng.shuffle(street)
    taken: set[tuple[int, int]] = set()

    def spot(source: list[tuple[int, int]]) -> tuple[int, int]:
        for point in source:
            if all(abs(point[0] - t[0]) + abs(point[1] - t[1]) > 3 for t in taken):
                taken.add(point)
                return point
        raise RuntimeError("no room to place everyone")

    relay_names = ["relay-one", "relay-two", "relay-three"][:recipe["relays"]]

    # ---- objectives
    objectives = []
    for name, word in zip(relay_names, rng.sample(RELAY_WORDS, len(relay_names))):
        objectives.append({"id": f"restore-{name[6:]}", "type": "interact", "targetZone": name, "required": True,
                           "description": f"Reconnect the {word} relay."})
    if recipe["server"]:
        objectives.append({"id": "download-records", "type": "interact", "targetZone": "vault-server", "required": True,
                           "description": "Download the records from the vault server."})
    if recipe["warden"]:
        objectives.append({"id": "disable-warden", "type": "disable", "targets": ["warden"], "required": True,
                           "description": "Disable the site warden."})
    if recipe["hold"]:
        seconds = 20 + 4 * tier
        objectives.append({"id": "hold-uplink", "type": "hold", "targetZone": "uplink-hold", "holdSeconds": seconds,
                           "required": True, "description": f"Hold the uplink for {seconds} seconds."})
    agents = [5, 7, 9, 12, 16][tier - 1]
    if recipe.get("purge"):
        targets = [f"enemy-agent-{NUMBERS[number]}" for number in range(agents)]
        objectives.append({"id": "purge-agents", "type": "eliminate", "targets": targets, "required": True,
                           "description": f"Put down every enemy agent in the district ({agents})."})
    if recipe.get("defector"):
        objectives.append({"id": "win-defector", "type": "persuade", "targets": ["defector"], "required": True,
                           "description": "Win the defector over with the Persuader: they must follow you."})
        objectives.append({"id": "escort-defector", "type": "protect", "targets": ["defector"], "targetZone": "safe-exit",
                           "required": True, "description": "Bring the defector to the exit alive."})
    if layout["gate"]:
        objectives.append({"id": "open-gate", "type": "interact", "targetZone": "gate-panel", "required": True,
                           "description": "Unlock the service gate."})
    objectives.append({"id": "leave-district", "type": "extract", "targetZone": "safe-exit", "required": True,
                       "description": "Take the team out through the exit."})

    # ---- people
    team = [
        {"id": name, "unit": "units/field-operator.unit.json", "position": {"x": entry[0] + dx, "y": entry[1] + dy},
         "equipment": ["equipment/civic-pulse-emitter.equipment.json", "equipment/field-repair-kit.equipment.json"]
         + (["equipment/persuader.equipment.json"] if recipe.get("defector") and name == "operator-one" else [])}
        for name, (dx, dy) in zip(["operator-one", "operator-two", "operator-three", "operator-four"],
                                  [(0, 0), (1, 0), (0, 1), (1, 1)])
    ]
    guards = [2, 3, 4, 5, 6][tier - 1]
    heavy_share = [0.0, 0.15, 0.3, 0.4, 0.5][tier - 1]
    opponents = []
    anchors = [(zone_by_id[name]["position"]["x"], zone_by_id[name]["position"]["y"]) for name in relay_names]
    for number in range(agents):
        equipment = ["equipment/scatter-emitter.equipment.json"] if rng.random() < heavy_share else []
        if rng.random() < 0.15:
            equipment = equipment + ["equipment/field-repair-kit.equipment.json"]
        source = street if number % 2 else pool
        if number % 2 == 0 and anchors:
            anchor = anchors[number // 2 % len(anchors)]
            source = [p for p in pool if math.hypot(p[0] - anchor[0], p[1] - anchor[1]) < 9] or pool
        # From the third tier, every fourth agent carries a time bomb and plants it when the squad is close.
        if tier >= 3 and number % 4 == 3:
            equipment = equipment + ["equipment/delay-charge.equipment.json"]
        position = spot(source)
        opponents.append(with_patrol(rng, reach, {
            "id": f"enemy-agent-{NUMBERS[number]}", "unit": "units/enemy-agent.unit.json",
            "position": {"x": position[0], "y": position[1]}, "equipment": equipment}, 6, 8))
    # Guards stand guard. Each has a post: beside a door, the compound gate or the way out, and the rest along the streets; the relays and
    # the vault are left to the enemy agents and the warden, so a guard's post never sits on top of what the squad has to reach. Only about
    # one in four paces a short beat; the rest stay where they are until something happens, which is what a guard does.
    posts = [(z["position"]["x"] + z["width"] // 2, z["position"]["y"] + z["height"] // 2) for z in layout["zones"]
             if z["id"] in ("safe-exit", "uplink-hold")]
    posts += [(o["position"]["x"], o["position"]["y"]) for o in map_value.get("objects", []) if o["kind"] in ("door", "gate")]
    rng.shuffle(posts)
    for number in range(guards):
        post = posts[number] if number < len(posts) else None
        near = [p for p in pool if post and 2 <= math.hypot(p[0] - post[0], p[1] - post[1]) <= 6]
        position = spot(near or street or pool)
        guard = {"id": f"guard-{number + 1}", "unit": "units/guard.unit.json",
                 "position": {"x": position[0], "y": position[1]}, "equipment": []}
        opponents.append(with_patrol(rng, reach, guard, 3, 5) if number % 4 == 3 else guard)
    if recipe["warden"] or recipe["server"]:
        # The warden keeps a post of their own, well away from the vault server and every other objective, on open ground
        # rather than in the middle of a street (nobody posts a warden at a crossing).
        marks = [(z["position"]["x"], z["position"]["y"]) for z in layout["zones"]]
        post = []
        for distance in (20, 14, 9, 0):
            post = [p for p in pool
                    if surface[p[1]][p[0]] != "street" and all(math.hypot(p[0] - m[0], p[1] - m[1]) >= distance for m in marks)]
            if post:
                break
        position = spot(post or pool)
        opponents.append(with_patrol(rng, reach, {
            "id": "warden", "unit": "units/site-warden.unit.json", "position": {"x": position[0], "y": position[1]},
            "equipment": ["equipment/scatter-emitter.equipment.json"]}, 4, 6))

    bystanders = []
    if recipe.get("defector"):
        # The defector waits at a safe house deep in the district, with two guards standing close by.
        far = [p for p in pool if math.hypot(p[0] - entry[0], p[1] - entry[1]) > 36] or pool
        house = spot(far)
        bystanders.append({"id": "defector", "unit": "units/civilian-man.unit.json",
                           "position": {"x": house[0], "y": house[1]}, "equipment": []})
        near = [p for p in pool if 3 <= math.hypot(p[0] - house[0], p[1] - house[1]) <= 8]
        for number in range(2):
            position = spot(near or pool)
            opponents.append({"id": f"minder-{number + 1}", "unit": "units/guard.unit.json",
                              "position": {"x": position[0], "y": position[1]}, "equipment": []})
    kinds = ["units/civilian-woman.unit.json", "units/civilian-man.unit.json"]
    for number in range(10):
        position = spot(street or pool)
        bystanders.append(with_patrol(rng, reach, {
            "id": f"civilian-{number + 1}", "unit": kinds[number % 2],
            "position": {"x": position[0], "y": position[1]}, "equipment": []}, 6, 14))
    for number in range(3):
        position = spot(street or pool)
        bystanders.append(with_patrol(rng, reach, {
            "id": f"police-{number + 1}", "unit": "units/city-police.unit.json",
            "position": {"x": position[0], "y": position[1]}, "equipment": []}, 6, 12))
    for number in range(3):
        position = spot(pool)
        bystanders.append(with_patrol(rng, reach, {
            "id": f"criminal-{number + 1}", "unit": "units/criminal.unit.json",
            "position": {"x": position[0], "y": position[1]}, "equipment": []}, 6, 12))

    runs = road_runs(surface, reach, size, layout.get("height", size))
    rng.shuffle(runs)
    car_kinds = ["vehicles/city-car.vehicle.json"] * 4 + ["vehicles/patrol-car.vehicle.json"]
    if tier >= 3:
        car_kinds.append("vehicles/armored-car.vehicle.json")
    drivers = ["units/civilian-man.unit.json", "units/civilian-woman.unit.json"]
    vehicles = []
    for number, (run, kind) in enumerate(zip(runs, car_kinds)):
        (x0, y0), (x1, y1) = run
        vehicles.append({"id": f"city-car-{number + 1}", "vehicle": kind, "position": {"x": x0, "y": y0},
                         "driver": drivers[number % 2], "patrol": [{"x": x0, "y": y0}, {"x": x1, "y": y1}]})

    # A freight train shuttles along the viaduct between its three stations, waiting at each.
    rail = layout["rail"]
    if rail:
        first_x, station_x, last_x = rail["stops"]
        vehicles.append({
            "id": "freight-train-1", "vehicle": "vehicles/freight-train.vehicle.json", "position": {"x": first_x, "y": rail["y"]},
            "stops": [{"x": first_x, "y": rail["y"], "wait": 0}, {"x": station_x, "y": rail["y"], "wait": 8},
                      {"x": last_x, "y": rail["y"], "wait": 6}],
        })

    place = rng.choice(PLACES)
    name = f"{territory['name']} {recipe['noun']}"
    return {
        "formatVersion": 1,
        "id": f"developer.op-{slug_of(territory)}",
        "name": name,
        "license": "CC0-1.0",
        "title": f"{territory['name']} is ours",
        "briefing": (f"{territory['owner']} holds {territory['name']} through its {place}. " + describe(recipe, layout)
                     + f" Expect {agents} enemy agents and {guards} guards on the streets."),
        "story": (f"{name}: {territory['owner']} runs {territory['name']} from its {place}, and the district only notices "
                  f"when the lights go out. Your team has one night to {summarise(recipe)}."),
        "debrief": {
            "success": f"{territory['name']} wakes up with the {place} in other hands. Your team is back in the dark before morning.",
            "failure": f"The team is down in {territory['name']} before the work was done. Regroup and try a different approach.",
        },
        "map": map_path,
        "team": team,
        "opponents": opponents,
        "objectives": objectives,
        "bystanders": bystanders,
        "region": {"name": territory["name"], "lon": territory["lon"], "lat": territory["lat"],
                   "population": territory["population"]},
        "vehicles": vehicles,
        "unlocks": unlocks,
        "intel": [
            f"Patrol survey: {agents} agents and {guards} guards cover the district; they move in pairs along the streets.",
            "Full survey: " + ("the warden keeps the only key to the vault, so find him early." if recipe["warden"]
                               else "the defector waits at a safe house deep in the district with two minders; a Persuader is in the kit."
                               if recipe.get("defector")
                               else "every enemy agent counts: the guards and police do not, but they will join the fight."
                               if recipe.get("purge")
                               else "the relay plazas are watched most closely; take the quieter ones first."),
        ],
    }


def describe(recipe: dict, layout: dict) -> str:
    parts = []
    if recipe.get("purge"):
        parts.append("put down every enemy agent in the district")
    if recipe.get("defector"):
        parts.append("win the defector over with a Persuader and bring them out alive")
    if recipe["relays"]:
        parts.append(f"reconnect {recipe['relays']} relays")
    if recipe["server"]:
        parts.append("download the records from the vault server")
    if recipe["warden"]:
        parts.append("take down the site warden")
    if recipe["hold"]:
        parts.append("hold the uplink while it broadcasts")
    if layout["gate"]:
        parts.append("unlock the service gate")
    parts.append("then leave by the exit")
    text = ", ".join(parts)
    return text[0].upper() + text[1:] + "."


def summarise(recipe: dict) -> str:
    verbs = []
    if recipe.get("purge"):
        verbs.append("clear out every enemy agent")
    if recipe.get("defector"):
        verbs.append("bring the defector out alive")
    if recipe["relays"]:
        verbs.append("reconnect the relays")
    if recipe["server"]:
        verbs.append("download the records")
    if recipe["warden"]:
        verbs.append("silence the warden")
    if recipe["hold"]:
        verbs.append("hold the uplink")
    verbs.append("walk out the exit")
    return ", ".join(verbs[:-1]) + " and " + verbs[-1]


# ------------------------------------------------------------------------------------------------------ the table

def write_campaign_table(territories: list[dict], depth: dict[str, int], parents: dict[str, list[str]],
                         tier_of: dict[str, int]) -> None:
    """docs/design/CAMPAIGN.md: every territory with its mission, difficulty tier, enemies and what opens it."""
    names = {t["id"]: t["name"] for t in territories}
    rows = []
    for t in sorted(territories, key=lambda item: (depth[item["id"]], item["id"])):
        mission = json.loads((PACK / t["mission"]).read_text(encoding="utf-8"))
        kinds = Counter(placement["unit"].split("/")[-1].split(".")[0] for placement in mission["opponents"])
        enemies = ", ".join(f"{count} {kind.replace('-', ' ')}" for kind, count in sorted(kinds.items(), key=lambda p: (-p[1], p[0])))
        objectives = ", ".join(sorted({o["type"] for o in mission["objectives"]}))
        opened_by = ", ".join(names[p] for p in parents.get(t["id"], [])) or "start"
        dims = json.loads((PACK / mission["map"]).read_text(encoding="utf-8"))["dimensions"]
        size, tall = dims["width"], dims["height"]
        hand = "hand-made" if t["mission"] in HANDMADE else "generated"
        rows.append(f"| {len(rows) + 1} | {t['name']} | {mission['name']} ({hand}) | {tier_of[t['id']]} | {enemies} | "
                    f"{objectives} | {size}x{tall} | {opened_by} |")
    text = "\n".join([
        "<!-- SPDX-License-Identifier: GPL-2.0-or-later -->",
        "<!-- Generated by tools/generate_campaign.py: edit the generator, not this file. -->",
        "",
        "# The campaign at a glance",
        "",
        "50 territories, one main mission each (ROADMAP F45). The order is the order the map opens: a territory is opened by",
        "winning one of the neighbours listed in the last column. Tier 1 is the easy opening, tier 5 the final stretch (more",
        "enemies, heavier weapons, bigger maps). The balance bot (`node web/tools/balance.mjs 20 <name>`) plays any of them.",
        "",
        "Every territory has three operations, all on the same map: the **main** one (below) to take it; an **uprising**, played when",
        "it falls into revolt (put down the ringleaders); and a **defence**, played when a rival company moves to take it over",
        "(hold a position while the rival's agents converge, before a deadline of a few game days). The last two are made from the",
        "main one by `tools/generate_variants.py`; `BALANCE_VARIANTS=1 node web/tools/balance.mjs 20 defence` plays them.",
        "",
        "| # | Territory | Mission | Tier | Enemies | Objective types | Map | Opened by |",
        "|---|-----------|---------|------|---------|-----------------|-----|-----------|",
        *rows,
        "",
    ])
    (ROOT / "docs/design/CAMPAIGN.md").write_text(text, encoding="utf-8")


# ------------------------------------------------------------------------------------------------------ the driver

def main() -> None:
    territories_path = PACK / "territories.json"
    world = json.loads(territories_path.read_text(encoding="utf-8"))
    territories = world["territories"]
    depth, parents = build_graph(territories)
    handmade = [t for t in territories if t.get("mission") in HANDMADE]
    generated = sorted((t for t in territories if t.get("mission") not in HANDMADE), key=lambda t: (depth[t["id"]], t["id"]))
    ranked = sorted(territories, key=lambda t: (depth[t["id"]], t["id"]))
    tier_of = {t["id"]: 1 + min(4, ranked.index(t) // 10) for t in territories}

    mission_id = {t["id"]: json.loads((PACK / t["mission"]).read_text(encoding="utf-8"))["id"] for t in handmade}
    for t in generated:
        mission_id[t["id"]] = f"developer.op-{slug_of(t)}"
    # Unlock edges: owner -> children, for every territory.
    children: dict[str, list[str]] = {t["id"]: [] for t in territories}
    for child, owners in parents.items():
        for owner in owners:
            if mission_id[child] not in children[owner]:
                children[owner].append(mission_id[child])
    generated_ids = {mission_id[t["id"]] for t in generated}

    for t in handmade:
        path = PACK / t["mission"]
        mission = json.loads(path.read_text(encoding="utf-8"))
        kept = [u for u in mission.get("unlocks", []) if u not in generated_ids and u in set(mission_id.values())]
        mission["unlocks"] = kept + [c for c in sorted(children[t["id"]]) if c not in kept]
        path.write_text(json.dumps(mission, indent=2) + "\n", encoding="utf-8")

    pack = json.loads((PACK / "pack.json").read_text(encoding="utf-8"))
    pack_maps = list(HANDMADE_MAPS)
    pack_missions = [m for m in pack["missions"] if m in HANDMADE]
    special = special_shapes(generated)
    for t in generated:
        tier = tier_of[t["id"]]
        layout, map_value = make_map(t, tier)
        map_path = f"maps/{layout['file']}"
        (PACK / map_path).write_text(json.dumps(map_value, indent=1) + "\n", encoding="utf-8")
        recipe = recipe_for(t, special)
        mission = make_mission(t, tier, layout, map_value, map_path, sorted(children[t["id"]]), recipe)
        mission_path = f"missions/{slug_of(t)}.mission.json"
        (PACK / mission_path).write_text(json.dumps(mission, indent=2) + "\n", encoding="utf-8")
        t["mission"] = mission_path
        pack_maps.append(map_path)
        pack_missions.append(mission_path)
        print(f"{t['name']}: tier {tier}, depth {depth[t['id']]}, {recipe['key']}, {layout['size']}x{layout.get('height', layout['size'])}")

    territories_path.write_text(json.dumps(world, indent=2) + "\n", encoding="utf-8")
    write_campaign_table(world["territories"], depth, parents, tier_of)
    pack["maps"] = pack_maps + EXTRA_MAPS
    pack["missions"] = pack_missions
    (PACK / "pack.json").write_text(json.dumps(pack, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
