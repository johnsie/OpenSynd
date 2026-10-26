#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-2.0-or-later
"""District styles for the generated maps.

Every territory's district is built in one of these styles, so the campaign does not play on fifty copies of one street grid. A style
paints the ground and its features (water, lawns, sand, snow, plazas, docks), lays a main avenue from the squad's entry on the west
edge to the exit yard on the east edge, and scatters buildings, walls and fences between them. It returns plain map regions, the same
kind the downtown grid in generate_maps.py produces, plus a few hints for placing scenery.

Rules every style keeps, because the mission generator and the checks in generate_maps.verify rely on them:
  * the entry (2, size // 2) and the strip around it are open ground, and so is a yard on the east edge for the exit;
  * a four-tile avenue (surface "street") runs the width of the map, so patrols, cars and the squad have a clear way across;
  * buildings keep at least two tiles from one another and from the map edge, so every alley and street stays passable;
  * water and walls are crossed only where a bridge or a gap has been left.
"""
from __future__ import annotations

import random

# ---------------------------------------------------------------------------------------------------------------- the palettes
# Ground surfaces beyond the plain pavement. Each is walkable; the game paints a pattern for it (web/src/textures.js).
PALETTES = {
    "outskirts": {"ground": ("scrub", "#6f5a2c"), "buildings": ["#3a3a36", "#44423a", "#34362f", "#403c33"], "wall": "#5a5648",
                  "water": "#1f4a55", "stone": "#7b7567"},
    "downtown": {"ground": ("service-concrete", "#293138"), "buildings": ["#1d2227", "#20262c", "#1a1f24", "#232a30"], "wall": "#46505a"},
    "harbour": {"ground": ("service-concrete", "#293138"), "buildings": ["#2a2f33", "#33292a", "#252d33", "#30302a"], "wall": "#4a545c",
                "water": "#143848", "dock": "#5b4a38", "containers": ["#7a3328", "#2f5873", "#3d6b45", "#8a6a2c", "#5a4a73", "#6e6e66"]},
    "oldtown": {"ground": ("plaza", "#6b5c4a"), "buildings": ["#7a3f2e", "#6b3a2c", "#84483a", "#5e362b", "#73402f"], "wall": "#6a5848",
                "water": "#1d4350", "stone": "#8a8478", "garden": "#6b5a2a"},
    "industrial": {"ground": ("gravel", "#3d4044"), "buildings": ["#2c3136", "#262b30", "#30363b", "#34322e"], "wall": "#50565c",
                   "tanks": ["#5a5f63", "#4c5256", "#60625a"]},
    "park": {"ground": ("lawn", "#2d4a34"), "buildings": ["#34403c", "#3a463f", "#2f3a37", "#40443a"], "wall": "#586058",
             "water": "#1c4a55", "path": "#6c6a5c", "stone": "#8a8478", "garden": "#6b5a2a"},
    "river": {"ground": ("plaza", "#454a4d"), "buildings": ["#2b3034", "#30363a", "#272c30", "#363a38"], "wall": "#505a60",
              "water": "#18404f", "dock": "#4f4a40"},
    "desert": {"ground": ("sand", "#8a7550"), "buildings": ["#7a6648", "#6d5c42", "#85704c", "#76623f"], "wall": "#8f7c58",
               "water": "#1f5260", "wadi": "#6e5d3f", "stone": "#9a8a62"},
    "highrise": {"ground": ("plaza", "#2f3a42"), "buildings": ["#1b2026", "#22282f", "#181d22", "#20262d"], "wall": "#4a545e",
                 "water": "#14384a", "stone": "#6a7480"},
    "tundra": {"ground": ("snow", "#9aa6ad"), "buildings": ["#3b4247", "#464d51", "#32393e", "#4b4f4c"], "wall": "#7a858b",
               "water": "#3f6672", "containers": ["#7a3328", "#2f5873", "#6e6e66"]},
    "jungle": {"ground": ("mud", "#3a4a2c"), "buildings": ["#3c3a2a", "#45402e", "#35362a", "#4a432f"], "wall": "#5b5a46",
               "water": "#22402f", "dock": "#4a3f2c", "stone": "#7a7a66"},
}


def merge_rectangles(tiles: set) -> list[tuple[int, int, int, int]]:
    """Cover a set of (x, y) tiles with few rectangles: each row's runs, joined to the identical run in the row above."""
    rows: dict[int, list[tuple[int, int]]] = {}
    for y in sorted({t[1] for t in tiles}):
        xs = sorted(t[0] for t in tiles if t[1] == y)
        runs, start = [], xs[0]
        for previous, current in zip(xs, xs[1:] + [None]):
            if current != previous + 1:
                runs.append((start, previous - start + 1))
                start = current
        rows[y] = runs
    open_runs: dict[tuple[int, int], list[int]] = {}  # (x, width) -> [first row, last row]
    done: list[tuple[int, int, int, int]] = []
    for y in sorted(rows):
        current = set(rows[y])
        for key in list(open_runs):
            if key not in current or open_runs[key][1] != y - 1:
                first, last = open_runs.pop(key)
                done.append((key[0], first, key[1], last - first + 1))
        for key in current:
            if key in open_runs:
                open_runs[key][1] = y
            else:
                open_runs[key] = [y, y]
    for key, (first, last) in open_runs.items():
        done.append((key[0], first, key[1], last - first + 1))
    return done


def intersects(a, b):
    return a[0] < b[0] + b[2] and b[0] < a[0] + a[2] and a[1] < b[1] + b[3] and b[1] < a[1] + a[3]


class Painter:
    """Collects map regions and remembers which tiles are taken, so buildings never land on roads, water or each other."""

    def __init__(self, size: int, rng: random.Random, palette: dict):
        self.size = size
        self.rng = rng
        self.palette = palette
        self.regions: list[dict] = []
        self.taken = [[False] * size for _ in range(size)]  # tiles nothing else may be built on
        self.count = 0
        self.props: list[tuple[str, int, int]] = []  # scenery asked for by position: (kind, x, y)
        self.doors: list[dict] = []  # doors that open for anyone who walks up to them
        self.area_scale = (size / 112) ** 2  # how much more a bigger district holds than a 112-tile one
        self.top, self.bottom = 0, size  # the rows of the canvas that stay in the map once it is cropped (set by compose)

    def add(self, name, x, y, w, h, surface, walkable, elevation, color, claim=False):
        x0, y0, x1, y1 = max(0, x), max(0, y), min(self.size, x + w), min(self.size, y + h)
        if x1 <= x0 or y1 <= y0:
            return
        self.count += 1
        self.regions.append({"id": f"{name}-{self.count}", "x": x0, "y": y0, "width": x1 - x0, "height": y1 - y0,
                             "surface": surface, "walkable": walkable, "elevation": elevation, "color": color})
        if claim:
            self.claim(x0, y0, x1 - x0, y1 - y0)

    def claim(self, x, y, w, h):
        for yy in range(max(0, y), min(self.size, y + h)):
            for xx in range(max(0, x), min(self.size, x + w)):
                self.taken[yy][xx] = True

    def free(self, x, y, w, h, gap=2) -> bool:
        """Is the rectangle, and `gap` tiles round it, clear, and inside the map with a three-tile margin?"""
        if x < 3 or y < self.top + 3 or x + w > self.size - 3 or y + h > self.bottom - 3:
            return False
        for yy in range(max(0, y - gap), min(self.size, y + h + gap)):
            for xx in range(max(0, x - gap), min(self.size, x + w + gap)):
                if self.taken[yy][xx]:
                    return False
        return True

    def shaped(self, x, y, w, h, elevation, colour) -> None:
        """A building that is not a plain box: an L, U, T or cross, a stepped tower, a podium with a tower on it, an H of two towers,
        or a ring round a courtyard that opens to the south. Built from tile sets so every part is a plain block the game can draw."""
        shape = self.rng.choice(["L", "U", "T", "cross", "stepped", "podium", "H", "ring"])
        tiles: dict[tuple[int, int], int] = {}

        def fill(dx, dy, pw, ph, height):
            for yy in range(y + dy, y + min(h, dy + ph)):
                for xx in range(x + dx, x + min(w, dx + pw)):
                    tiles[(xx, yy)] = height

        third_w, third_h = max(3, w // 3), max(3, h // 3)
        if shape == "L":
            fill(0, 0, w, h // 2, elevation)
            fill(0, 0, w // 2, h, elevation)
        elif shape == "U":
            fill(0, 0, w, third_h, elevation)
            fill(0, 0, third_w, h, elevation)
            fill(w - third_w, 0, third_w, h, elevation)
        elif shape == "T":
            fill(0, 0, w, third_h, elevation)
            fill((w - third_w) // 2, 0, third_w, h, elevation)
        elif shape == "cross":
            fill(0, (h - third_h) // 2, w, third_h, elevation)
            fill((w - third_w) // 2, 0, third_w, h, elevation)
        elif shape == "stepped":
            fill(0, 0, w, h, max(1, elevation - 2))
            fill(w // 5, h // 5, w - 2 * (w // 5), h - 2 * (h // 5), elevation)
            fill(w // 3, h // 3, w - 2 * (w // 3), h - 2 * (h // 3), elevation + 1)
        elif shape == "podium":
            fill(0, 0, w, h, 1)
            fill(w // 3, h // 3, w - 2 * (w // 3), h - 2 * (h // 3), elevation + 2)
        elif shape == "H":
            fill(0, 0, third_w, h, elevation)
            fill(w - third_w, 0, third_w, h, elevation)
            fill(third_w, h // 2 - 1, w - 2 * third_w, 3, 1)
        else:  # ring: a wall of building round a yard that opens to the south
            fill(0, 0, w, h, elevation)
            for yy in range(y + 3, y + h - 3):
                for xx in range(x + 3, x + w - 3):
                    tiles.pop((xx, yy), None)
            for yy in range(y + h - 3, y + h):
                for xx in range(x + w // 2 - 2, x + w // 2 + 1):
                    tiles.pop((xx, yy), None)
        for height in sorted(set(tiles.values())):
            for rx, ry, rw, rh in merge_rectangles({t for t, e in tiles.items() if e == height}):
                self.add("building", rx, ry, rw, rh, "utility-building", False, height, colour)

    def building(self, x, y, w, h, elevation, color=None, name="building") -> bool:
        if not self.free(x, y, w, h):
            return False
        colour = color or self.rng.choice(self.palette["buildings"])
        if name == "building" and w >= 9 and h >= 9 and elevation >= 2 and self.rng.random() < 0.4:
            self.claim(x, y, w, h)
            self.shaped(x, y, w, h, elevation, colour)
            return True
        if name == "building" and elevation >= 2 and w >= 10 and h >= 9 and self.rng.random() < 0.4:
            self.claim(x, y, w, h)
            self.entrance(x, y, w, h, elevation, colour, self.rng.choice("se"))
            return True
        self.add(name, x, y, w, h, "utility-building", False, elevation, colour, claim=True)
        return True

    def entrance(self, x, y, w, h, elevation, colour, face) -> None:
        """A building with a way in: a forecourt cut into the face (hazard-striped paving), a door at the back of it that opens for
        anyone who walks up, and a small hall behind. `face` is "s" or "e" (the two faces the camera sees)."""
        along, depth = (w, h) if face == "s" else (h, w)
        notch_w, notch_d, hall_w, hall_d = 6, 3, 4, 4
        start = (along - notch_w) // 2
        hall_start = start + (notch_w - hall_w) // 2

        def tile(u, v):  # u along the face, v in from the outer edge of the face
            return (x + u, y + h - 1 - v) if face == "s" else (x + w - 1 - v, y + u)

        floor, hall, door = set(), set(), set()
        for u in range(start, start + notch_w):
            for v in range(notch_d):
                floor.add(tile(u, v))
        for u in range(hall_start, hall_start + hall_w):
            door.add(tile(u, notch_d)) if hall_start + 1 <= u < hall_start + 3 else hall.add(tile(u, notch_d))
            for v in range(notch_d + 1, notch_d + 1 + hall_d):
                hall.add(tile(u, v))
        holes = floor | hall | door
        solid = {(xx, yy) for xx in range(x, x + w) for yy in range(y, y + h)} - holes
        for rx, ry, rw, rh in merge_rectangles(solid):
            self.add("building", rx, ry, rw, rh, "utility-building", False, elevation, colour)
        for tx, ty in sorted(floor):
            self.add("forecourt", tx, ty, 1, 1, "chevron", True, 0, "#8a6a2a")
        for tx, ty in sorted(hall | door):
            self.add("hall", tx, ty, 1, 1, "rooftop", True, 0, "#3a2c22")
        xs, ys = [t[0] for t in door], [t[1] for t in door]
        self.doors.append({"id": f"door-entrance-{len(self.doors) + 1}", "kind": "door", "position": {"x": min(xs), "y": min(ys)},
                           "width": max(xs) - min(xs) + 1, "height": max(ys) - min(ys) + 1})

    def n(self, count: int) -> int:
        """A count for a 112-tile district, grown for a bigger one."""
        return max(1, round(count * self.area_scale))

    def scatter(self, area, tries, size_range, heights, gap_ok=True, color=None):
        """Drop buildings at random inside `area` (x, y, w, h) wherever they fit. Returns how many were placed."""
        placed = 0
        ax, ay, aw, ah = area
        for _ in range(self.n(tries)):
            w = self.rng.randint(*size_range[0])
            h = self.rng.randint(*size_range[1])
            x = self.rng.randint(ax, max(ax, ax + aw - w))
            y = self.rng.randint(ay, max(ay, ay + ah - h))
            if x + w > ax + aw or y + h > ay + ah:
                continue
            if self.building(x, y, w, h, self.rng.choice(heights), color):
                placed += 1
        return placed


# ------------------------------------------------------------------------------------------------------------------ the pieces
def lay_base(p: Painter, layout: dict) -> None:
    """The ground, the main avenue and the open yards at both ends, which every style has."""
    size = p.size
    surface, color = p.palette["ground"]
    p.add("ground", 0, 0, size, size, surface, True, 0, color)
    mid = size // 2
    layout["avenue"] = (mid - 2, 4)
    p.add("avenue", 0, mid - 2, size, 4, "street", True, 0, "#2d363d", claim=True)
    # Keep the entry's surroundings and the exit yard free of buildings.
    p.claim(0, mid - 8, 14, 16)
    p.claim(size - 16, mid - 12, 16, 24)
    if layout.get("rail"):
        p.claim(0, p.top, size, 8)  # the elevated railway and its station platforms run along the north edge


def cross_street(p: Painter, x: int, width: int = 4, y0: int = 0, y1: int | None = None) -> None:
    p.add("street", x, y0, width, (y1 if y1 is not None else p.size) - y0, "street", True, 0, "#2d363d", claim=True)


def lane(p: Painter, x, y, w, h, kind="ground") -> None:
    """A walkable strip in the ground's own surface or a given one (a path, a quay), kept clear of buildings."""
    if kind == "ground":
        surface, color = p.palette["ground"]
        p.add("lane", x, y, w, h, surface, True, 0, color, claim=True)
    else:
        surface, color = kind
        p.add("lane", x, y, w, h, surface, True, 0, color, claim=True)


def water(p: Painter, x, y, w, h, color=None) -> None:
    p.add("water", x, y, w, h, "runoff-channel", False, 0, color or p.palette.get("water", "#12313d"), claim=True)


def bridge(p: Painter, x, y, w, h) -> None:
    p.add("bridge", x, y, w, h, "signal-grate", True, 1, "#59717a", claim=True)


def wall_ring(p: Painter, x, y, w, h, gaps, kind="service-wall", color=None, elevation=2) -> None:
    """A wall (or fence) round a yard with openings. `gaps` are (side, offset, width), side one of n, s, w, e."""
    color = color or (p.palette["wall"] if kind == "service-wall" else "#3a4650")
    elevation = elevation if kind == "service-wall" else 1
    sides = {"n": (x, y, w, 1), "s": (x, y + h - 1, w, 1), "w": (x, y, 1, h), "e": (x + w - 1, y, 1, h)}
    for side, (sx, sy, sw, sh) in sides.items():
        cuts = sorted((off, wid) for s, off, wid in gaps if s == side)
        start = 0
        length = sw if side in "ns" else sh
        pieces = []
        for off, wid in cuts:
            if off > start:
                pieces.append((start, off - start))
            start = off + wid
        if start < length:
            pieces.append((start, length - start))
        for pos, span in pieces:
            if side in "ns":
                p.add("wall", sx + pos, sy, span, 1, kind, False, elevation, color, claim=True)
            else:
                p.add("wall", sx, sy + pos, 1, span, kind, False, elevation, color, claim=True)


def trees(p: Painter, area, count, spacing=3) -> None:
    ax, ay, aw, ah = area
    placed: list[tuple[int, int]] = []
    for _ in range(count * 6):
        if len(placed) >= count:
            break
        x, y = p.rng.randint(ax, ax + aw - 1), p.rng.randint(ay, ay + ah - 1)
        if not (2 < x < p.size - 3 and 2 < y < p.size - 3) or p.taken[y][x]:
            continue
        if any(abs(x - tx) + abs(y - ty) < spacing for tx, ty in placed):
            continue
        placed.append((x, y))
        p.props.append(("tree", x, y))


def pylon(p: Painter, x: int, y: int) -> bool:
    """A steel lattice tower on a one-tile footing (blocks walking, not sight)."""
    if not p.free(x, y, 1, 1, 1):
        return False
    p.add("pylon", x, y, 1, 1, "pylon", False, 0, "#2a2f33", claim=True)
    return True


def pipe_run(p: Painter, x: int, y: int, length: int, along: str = "x") -> bool:
    """A run of pipes on supports, one tile wide: low cover that can be seen over but not walked through."""
    w, h = (length, 1) if along == "x" else (1, length)
    if not p.free(x, y, w, h, 1):
        return False
    ground = p.palette["ground"]
    p.add("pipe", x, y, w, h, "pipe", False, 0, ground[1], claim=True)
    return True


def garden(p: Painter, x: int, y: int, w: int, h: int, gap_side: str = "s") -> bool:
    """A fenced plot of dry grass with a three-tile way in (a small walled garden beside a brick hall)."""
    if w < 6 or h < 6 or not p.free(x, y, w, h):
        return False
    p.add("garden", x, y, w, h, "lawn", True, 0, p.palette.get("garden", "#6b5a2a"), claim=True)
    wall_ring(p, x, y, w, h, [(gap_side, (w if gap_side in "ns" else h) // 2 - 1, 3)], kind="service-fence")
    p.claim(x, y, w, h)
    trees(p, (x + 1, y + 1, w - 2, h - 2), max(1, (w * h) // 40), 4)
    for _ in range(max(2, (w * h) // 14)):  # flower beds and low planting
        p.props.append(("shrub", p.rng.randint(x + 1, x + w - 2), p.rng.randint(y + 1, y + h - 2)))
    return True


def terrace(p: Painter, x: int, y: int, w: int, h: int, levels: int, ways: list[tuple[str, int, int]], top="plaza", color=None,
            run=1) -> bool:
    """A raised paved terrace (or, with top="rooftop", a walkable roof): a kerb round it that nobody can cross, a flat top, and a
    flight of steps (run=1) or a footpath ramp (run=2, two tiles to each level) up at each way in, with a kerb along each side of it.
    `ways` are (side, offset, width) with side one of n, s, w, e; the way is as wide as `width` plus the kerbs either side."""
    reach = levels * run + 1
    if not p.free(x - reach, y - reach, w + 2 * reach, h + 2 * reach, 1):
        return False
    stone = color or p.palette.get("stone", "#7b7567")
    p.add("terrace", x, y, w, h, top, True, levels, stone, claim=True)
    sides = {"n": (x, y, w, 1), "s": (x, y + h - 1, w, 1), "w": (x, y, 1, h), "e": (x + w - 1, y, 1, h)}
    for side, (sx, sy, sw, sh) in sides.items():
        cuts = sorted((off, wid) for s_, off, wid in ways if s_ == side)
        length = sw if side in "ns" else sh
        start = 0
        pieces = []
        for off, wid in cuts:
            if off > start:
                pieces.append((start, off - start))
            start = off + wid
        if start < length:
            pieces.append((start, length - start))
        for pos, span in pieces:
            if side in "ns":
                p.add("kerb", sx + pos, sy, span, 1, "kerb", False, levels, "#6a655a", claim=True)
            else:
                p.add("kerb", sx, sy + pos, 1, span, "kerb", False, levels, "#6a655a", claim=True)
    flight = "steps-x"
    for side, off, wid in ways:
        for depth in range(reach):
            height = levels - depth // run  # each level takes `run` tiles; the first is level with the top
            if height < 1:
                break
            axis = "steps-x" if side in "we" else "steps-y"
            if side == "n":
                path, rails = (x + off, y - depth, wid, 1), [(x + off - 1, y - depth, 1, 1), (x + off + wid, y - depth, 1, 1)]
            elif side == "s":
                row = y + h - 1 + depth
                path, rails = (x + off, row, wid, 1), [(x + off - 1, row, 1, 1), (x + off + wid, row, 1, 1)]
            elif side == "w":
                path, rails = (x - depth, y + off, 1, wid), [(x - depth, y + off - 1, 1, 1), (x - depth, y + off + wid, 1, 1)]
            else:
                column = x + w - 1 + depth
                path, rails = (column, y + off, 1, wid), [(column, y + off - 1, 1, 1), (column, y + off + wid, 1, 1)]
            p.add("steps", *path, axis, True, height, stone, claim=True)
            if depth > 0:
                for rail in rails:
                    p.add("kerb", *rail, "kerb", False, height, "#6a655a", claim=True)
    return True


def roof_house(p: Painter, x: int, y: int, w: int, h: int, levels: int, way_side: str) -> bool:
    """A brick house with a walkable roof and a railed footpath up to it from the lane."""
    brick = p.rng.choice(p.palette["buildings"])
    offset = (w if way_side in "ns" else h) // 2 - 1
    garden_roof = p.rng.random() < 0.4
    top = "lawn" if garden_roof else "rooftop"
    colour = p.palette.get("garden", "#4a5a30") if garden_roof else brick
    if not terrace(p, x, y, w, h, levels, [(way_side, offset, 2)], top=top, color=colour, run=2):
        return False
    if garden_roof:
        # A roof garden: shrubs along the railing, a dome antenna on its stalk. (The sides are still brick: see the kerb and sides.)
        p.props.append(("antenna", x + w // 2, y + h // 2 - 1))
        for sx in range(x + 2, x + w - 2, 2):
            p.props.append(("shrub", sx, y + 1 if p.rng.random() < 0.5 else y + h - 2))
        return True
    # On the roof: a row of glass skylights along one side, and a vent dome (leaving the footpath's landing clear).
    inside = [(xx, yy) for xx in range(x + 2, x + w - 2) for yy in range(y + 2, y + h - 2)]
    if inside:
        row = p.rng.choice([y + 2, y + h - 3])
        for xx in range(x + 2, x + w - 2, 2):
            if abs(xx - (x + offset)) > 2 or way_side in "we":
                p.props.append(("skylight", xx, row))
        vx, vy = p.rng.choice(inside)
        p.props.append(("vent", vx, vy))
    return True


# ------------------------------------------------------------------------------------------------------------------- the styles
def style_harbour(p: Painter, layout: dict) -> None:
    size, rng = p.size, p.rng
    lay_base(p, layout)
    shore = p.bottom - rng.choice([24, 28, 30])
    # The sea along the south edge, with a stepped coast, and a quay along the shore. The avenue stops at the quay.
    coast = [(0, shore + rng.randint(0, 3))]
    for x in range(14, size - 14, 14):
        coast.append((x, shore + rng.randint(-2, 4)))
    for index, (x, edge) in enumerate(coast):
        width = (coast[index + 1][0] if index + 1 < len(coast) else size) - x
        water(p, x, edge, width, size - edge)
        lane(p, x, edge - 4, width, 4, (("dock", p.palette["dock"])[0], p.palette["dock"]))
    water(p, 0, shore + 2, 14, size - shore - 2)
    lane(p, 0, shore - 2, 14, 4, ("dock", p.palette["dock"]))
    # Piers out into the water, each ending in a moored ship.
    for x in range(20, size - 22, rng.choice([20, 24])):
        top = max(e for xx, e in coast if xx <= x)
        length = rng.randint(10, 16)
        lane(p, x, top - 4, 4, length + 4, ("dock", p.palette["dock"]))
        if rng.random() < 0.6 and top + length + 4 < p.bottom - 4:
            p.add("ship", x + 6, top + 3, 5, rng.randint(14, 18), "utility-building", False, 2, "#4a3a34", claim=True)
    # The container yard: rows of boxes with aisles, then warehouses along the avenue.
    yard_x, yard_y = 18, p.top + 10
    row_y = yard_y
    while row_y < size // 2 - 8:
        col_x = yard_x
        while col_x < size - 34:
            stack = rng.randint(2, 4)
            for _ in range(stack):
                if p.building(col_x, row_y, 2, 6, rng.choice([1, 1, 2]), rng.choice(p.palette["containers"]), "container"):
                    col_x += 3
            col_x += 4
        row_y += 9
    for _ in range(3):
        p.scatter((16, size // 2 + 4, size - 40, shore - size // 2 - 14), 20, ((10, 16), (8, 11)), [2, 3])
    for _ in range(p.n(3)):  # pipework along the quay
        pipe_run(p, rng.randint(16, size - 44), shore - 9, rng.randint(10, 22))
    layout["props_mix"] = {"streetlight": 0.04, "bin": 0.03, "wreck": 3}
    layout["quay_row"] = shore


def style_oldtown(p: Painter, layout: dict) -> None:
    size, rng = p.size, p.rng
    lay_base(p, layout)
    mid = size // 2
    # A cross street and a plaza with a fountain in the middle; everything else is a maze of two-tile lanes between close-set houses.
    plaza = (size // 2 - 9, mid - 9, 18, 18)
    p.add("plaza", plaza[0], plaza[1], plaza[2], plaza[3], p.palette["ground"][0], True, 0, "#7a6a54", claim=True)
    p.add("fountain", mid - 1, mid + 4, 3, 3, "runoff-channel", False, 0, p.palette["water"], claim=True)
    cross_street(p, size // 2 - 2, 4, 0, mid - 2)
    cross_street(p, size // 2 - 2, 4, mid + 2)
    trees(p, (plaza[0] + 1, plaza[1] + 1, plaza[2] - 2, plaza[3] - 2), 6, 5)
    # Houses with roofs you can walk on, reached by footpaths from the lanes.
    for _ in range(p.n(6)):
        for _ in range(40):
            rw, rh = rng.randint(8, 12), rng.randint(7, 10)
            rx, ry = rng.randint(16, size - 32 - rw), rng.randint(p.top + 6, p.bottom - 12 - rh)
            if abs(ry + rh / 2 - mid) > 12 and roof_house(p, rx, ry, rw, rh, rng.choice([2, 3]), rng.choice("nswe")):
                break
    # A civic terrace beside the plaza, up broad steps, and a garden or two.
    for _ in range(30):
        tx, ty = rng.randint(16, size - 40), rng.choice([p.top + 8, p.bottom - 22])
        if terrace(p, tx, ty, 18, 9, 2, [("s" if ty < mid else "n", 6, 6)]):
            break

    def split(x, y, w, h, depth=0):
        """Cut the district into house plots; a plot becomes a house, a courtyard house, or a small yard."""
        if (w <= 14 and h <= 14) or depth > 6 or min(w, h) < 8:
            if w >= 6 and h >= 6 and not intersects((x, y, w, h), plaza):
                roll = rng.random()
                inner = (x + 1, y + 1, w - 2, h - 2)
                if roll < 0.12:
                    garden(p, x + 1, y + 1, w - 2, h - 2, rng.choice("nswe"))
                    return
                if roll < 0.3 and w >= 9 and h >= 9:
                    # a house round a courtyard: four ranges and an opening
                    ix, iy, iw, ih = inner
                    colour = rng.choice(p.palette["buildings"])
                    height = rng.choice([1, 2, 2, 3])
                    for part in [(ix, iy, iw, 3), (ix, iy + ih - 3, iw, 3), (ix, iy + 3, 3, ih - 6), (ix + iw - 3, iy + 3, 3, ih - 6)]:
                        p.building(*part, height, colour)
                else:
                    p.building(*inner, rng.choice([2, 2, 3, 3, 4]))
            return
        horizontal = w < h if abs(w - h) > 4 else rng.random() < 0.5
        if horizontal and h < 12:
            horizontal = False  # too short to cut across, so cut along
        elif not horizontal and w < 12:
            horizontal = True
        if horizontal:
            cut = rng.randint(max(6, h // 3), min(h - 6, 2 * h // 3))
            split(x, y, w, cut, depth + 1)
            split(x, y + cut, w, h - cut, depth + 1)
        else:
            cut = rng.randint(max(6, w // 3), min(w - 6, 2 * w // 3))
            split(x, y, cut, h, depth + 1)
            split(x + cut, y, w - cut, h, depth + 1)

    # The plots are cut from the district minus the avenue, the plaza's street and the two end yards.
    split(14, p.top + 3, size - 14 - 16, mid - 5 - p.top)
    split(14, mid + 3, size - 14 - 16, p.bottom - mid - 6)
    layout["props_mix"] = {"tree": 0.03, "streetlight": 0.02, "bin": 0.04, "wreck": 1}


def style_industrial(p: Painter, layout: dict) -> None:
    size, rng = p.size, p.rng
    lay_base(p, layout)
    mid = size // 2
    columns = list(layout.get("street_columns") or [])
    for x in columns:
        cross_street(p, x, 4)
    # Big sheds in the blocks the streets cut, a tank farm, chimneys and fenced yards.
    xs = [14] + [x + 6 for x in columns]
    for index, x0 in enumerate(xs):
        x1 = (columns[index] - 2) if index < len(columns) else size - 18
        for y0, y1 in ((p.top + 6, mid - 6), (mid + 6, p.bottom - 6)):
            roll = rng.random()
            if roll < 0.45:
                p.scatter((x0, y0, x1 - x0, y1 - y0), 6, ((12, 18), (9, 13)), [2, 3])
            elif roll < 0.8:
                # a tank farm: round tanks drawn as squares with room between
                for tx in range(x0, x1 - 6, 8):
                    for ty in range(y0, y1 - 6, 8):
                        if rng.random() < 0.75:
                            p.building(tx, ty, 5, 5, rng.choice([1, 2]), rng.choice(p.palette["tanks"]), "tank")
            else:
                # a fenced yard with a gap, a shed and stacked pallets inside
                w, h = min(18, x1 - x0), min(14, y1 - y0)
                if w >= 12 and h >= 10 and p.free(x0, y0, w, h):
                    wall_ring(p, x0, y0, w, h, [("s", w // 2 - 1, 3), ("w", h // 2 - 1, 3)], kind="service-fence")
                    p.claim(x0, y0, w, h)
                    p.building(x0 + 3, y0 + 3, 7, 5, 2)
    for _ in range(p.n(5)):
        spot = (rng.randint(14, size - 22), rng.randint(p.top + 6, p.bottom - 8))
        p.building(spot[0], spot[1], 2, 2, 5, "#2a2f33", "chimney")
    for _ in range(p.n(3)):  # sheds with walkable roofs and a ramp up
        for _ in range(40):
            rw, rh = rng.randint(14, 20), rng.randint(9, 13)
            rx, ry = rng.randint(16, size - 34 - rw), rng.randint(p.top + 6, p.bottom - 12 - rh)
            if abs(ry + rh / 2 - mid) > 12 and roof_house(p, rx, ry, rw, rh, 2, rng.choice("nswe")):
                break
    for _ in range(p.n(5)):  # pipe runs between the sheds
        row = rng.choice([rng.randint(p.top + 6, mid - 10), rng.randint(mid + 8, p.bottom - 8)])
        pipe_run(p, rng.randint(16, size - 40), row, rng.randint(8, 22))
    for _ in range(p.n(3)):
        pipe_run(p, rng.randint(16, size - 24), rng.randint(p.top + 6, p.bottom - 30), rng.randint(8, 18), "y")
    for _ in range(p.n(6)):  # stacks of drums by the sheds
        bx, by = rng.randint(16, size - 24), rng.randint(p.top + 6, p.bottom - 8)
        if p.free(bx, by, 1, 1, 1) and abs(by - mid) > 6:
            p.props.append(("barrels", bx, by))
    for x in range(20, size - 20, 12):  # a line of pylons down each side of the avenue
        pylon(p, x, mid - 5)
        pylon(p, x + 6, mid + 4)
    layout["props_mix"] = {"streetlight": 0.04, "bin": 0.03, "wreck": 4}


def style_park(p: Painter, layout: dict) -> None:
    size, rng = p.size, p.rng
    lay_base(p, layout)
    mid = size // 2
    path = (p.palette["path"] and ("plaza", p.palette["path"]))
    # Footpaths loop through the lawns; a lake in the north half with a bridge; groves; and pavilions round the green.
    for y in (mid - 22, mid + 20):
        lane(p, 14, y, size - 32, 3, path)
    for x in (size // 3, 2 * size // 3):
        lane(p, x, mid - 22, 3, 45, path)
    lake = (size // 2 - 14, 8, 28, mid - 36)
    if lake[3] >= 8:
        water(p, *lake)
        bridge(p, size // 2 - 1, lake[1], 3, lake[3])
        lane(p, size // 2 - 1, lake[1] + lake[3], 3, mid - 22 - lake[1] - lake[3], path)
    pond = (size - 40, mid + 26, 14, 9)
    water(p, *pond)
    for _ in range(30):  # a pavilion on a stepped terrace with the lawns round it
        tx, ty = rng.randint(20, size - 44), rng.choice([mid - 12 - 8, mid + 9])
        if terrace(p, tx, ty, 16, 10, 2, [("w", 3, 4), ("e", 3, 4)]):
            p.building(tx + 4, ty + 2, 8, 5, 1, None, "pavilion")
            break
    for _ in range(p.n(2)):
        garden(p, rng.randint(16, size - 44), rng.randint(6, size - 20), rng.randint(9, 14), rng.randint(8, 12), rng.choice("nswe"))
    for _ in range(p.n(7)):
        p.scatter((16, p.top + 5, size - 36, p.bottom - p.top - 10), 12, ((6, 10), (5, 8)), [1, 2, 2, 3])
    for _ in range(p.n(9)):
        gx, gy = rng.randint(14, size - 30), rng.randint(p.top + 5, p.bottom - 14)
        trees(p, (gx, gy, 12, 10), 9, 3)
    layout["props_mix"] = {"tree": 0.0, "streetlight": 0.02, "bin": 0.05, "wreck": 0}


def style_river(p: Painter, layout: dict) -> None:
    size, rng = p.size, p.rng
    lay_base(p, layout)
    mid = size // 2
    # A river down the middle that wanders, crossed by three bridges (one on the avenue); quays along both banks.
    bridge_rows = sorted({mid - 2, rng.randint(p.top + 8, mid - 16), rng.randint(mid + 14, p.bottom - 16)})
    width = rng.choice([9, 10, 12])
    centre = size // 2 + rng.randint(-8, 8)
    bands = []
    edges = [0] + [row for r in bridge_rows for row in (r, r + 4)] + [size]
    previous = centre
    for index in range(0, len(edges), 2):
        top, bottom = edges[index], edges[index + 1]
        previous = max(26, min(size - 36, previous + rng.randint(-9, 9)))
        bands.append((top, bottom, previous))
        # the stretch between bridges
    for top, bottom, x in bands:
        if bottom > top:
            water(p, x, top, width, bottom - top)
    # Bridges span the widest of the two neighbouring stretches; the banks beside them are quay.
    for index, row in enumerate(bridge_rows):
        near = [b for b in bands if b[1] == row or b[0] == row + 4]
        low = min(x for _, _, x in near) - 1
        high = max(x + width for _, _, x in near) + 1
        if row == mid - 2:
            p.add("avenue-bridge", low, row, high - low, 4, "street", True, 1, "#2d363d", claim=True)
        else:
            bridge(p, low, row, high - low, 4)
    for top, bottom, x in bands:
        lane(p, x - 3, top, 3, bottom - top, ("dock", p.palette["dock"]))
        lane(p, x + width, top, 3, bottom - top, ("dock", p.palette["dock"]))
    for side, (x0, x1) in (("west", (14, 0)), ("east", (0, size - 18))):
        for top, bottom, x in bands:
            if side == "west":
                area = (14, top + 2, x - 20, bottom - top - 4)
            else:
                area = (x + width + 5, top + 2, size - 18 - (x + width + 5), bottom - top - 4)
            if area[2] > 10 and area[3] > 8:
                p.scatter(area, 14, ((7, 13), (6, 10)), [2, 2, 3, 4])
    layout["props_mix"] = {"tree": 0.03, "streetlight": 0.04, "bin": 0.03, "wreck": 2}


def style_desert(p: Painter, layout: dict) -> None:
    size, rng = p.size, p.rng
    lay_base(p, layout)
    mid = size // 2
    # A dry riverbed that wanders across (walkable gravel), walled compounds with a gate gap, huts, and an oasis.
    y = rng.randint(p.top + 14, p.top + 24)
    x = 12
    while x < size - 18:
        step = rng.randint(10, 16)
        lane(p, x, y, step + 3, 4, ("gravel", p.palette["wadi"]))
        x += step
        y = max(p.top + 8, min(p.bottom - 12, y + rng.choice([-9, -6, 7, 10])))
        lane(p, x, min(y, y - 0), 4, 12, ("gravel", p.palette["wadi"]))
    for _ in range(p.n(5)):
        w, h = rng.randint(16, 24), rng.randint(14, 20)
        x0, y0 = rng.randint(16, size - 40), rng.randint(p.top + 5, p.bottom - 24)
        if not p.free(x0, y0, w, h, 3):
            continue
        wall_ring(p, x0, y0, w, h, [(rng.choice("nswe"), rng.randint(3, 6), 4)])
        p.claim(x0, y0, w, h)
        for _ in range(3):
            p.scatter((x0 + 2, y0 + 2, w - 4, h - 4), 4, ((4, 7), (4, 6)), [1, 2])
    p.scatter((16, p.top + 4, size - 36, p.bottom - p.top - 8), 40, ((3, 6), (3, 5)), [1, 1, 2])
    for _ in range(30):  # a stepped ruin: a raised platform with stairs on all four sides
        tx, ty = rng.randint(20, size - 44), rng.choice([p.top + 8, p.bottom - 26])
        if terrace(p, tx, ty, 14, 14, 3, [("n", 5, 4), ("s", 5, 4), ("w", 5, 4), ("e", 5, 4)]):
            break
    ox, oy = rng.randint(30, size - 44), rng.choice([p.top + 8, p.bottom - 22])
    if p.free(ox, oy, 12, 9, 2):
        lane(p, ox - 2, oy - 2, 16, 13, ("lawn", "#34502f"))
        water(p, ox + 3, oy + 2, 6, 4)
        trees(p, (ox - 2, oy - 2, 16, 13), 8, 3)
    layout["props_mix"] = {"tree": 0.0, "streetlight": 0.0, "bin": 0.01, "wreck": 6}


def style_highrise(p: Painter, layout: dict) -> None:
    size, rng = p.size, p.rng
    lay_base(p, layout)
    mid = size // 2
    # Canyons: wide cross streets, towers of five floors in big footprints, with low podiums and a plaza or two between.
    columns = list(layout.get("street_columns") or [])
    for x in columns:
        cross_street(p, x, 4)
    xs = [14] + [x + 8 for x in columns]
    for index, x0 in enumerate(xs):
        x1 = (columns[index] - 3) if index < len(columns) else size - 18
        for y0, y1 in ((p.top + 5, mid - 6), (mid + 6, p.bottom - 5)):
            if x1 - x0 < 8 or y1 - y0 < 8:
                continue
            if rng.random() < 0.18:
                lane(p, x0, y0, x1 - x0, y1 - y0, ("plaza", "#3a444c"))
                water(p, x0 + (x1 - x0) // 2 - 2, y0 + (y1 - y0) // 2 - 2, 4, 4)
                continue
            tower_w = min(x1 - x0, rng.randint(11, 17))
            tower_h = min(y1 - y0, rng.randint(11, 16))
            p.building(x0 + rng.randint(0, max(0, x1 - x0 - tower_w)), y0 + rng.randint(0, max(0, y1 - y0 - tower_h)),
                       tower_w, tower_h, rng.choice([4, 5, 5]))
    p.scatter((14, p.top + 4, size - 34, p.bottom - p.top - 8), 30, ((4, 8), (4, 8)), [1, 2])
    for _ in range(p.n(3)):  # towers' lower roofs with footpaths up to them
        for _ in range(40):
            rw, rh = rng.randint(10, 16), rng.randint(8, 12)
            rx, ry = rng.randint(16, size - 34 - rw), rng.randint(p.top + 6, p.bottom - 12 - rh)
            if abs(ry + rh / 2 - mid) > 12 and roof_house(p, rx, ry, rw, rh, 3, rng.choice("nswe")):
                break
    for _ in range(40):  # a stepped podium plaza on the avenue's quiet side
        tx, ty = rng.randint(16, size - 40), rng.choice([p.top + 10, p.bottom - 24])
        if terrace(p, tx, ty, 22, 10, 2, [("s" if ty < mid else "n", 8, 6), ("w", 3, 4)]):
            break
    layout["props_mix"] = {"streetlight": 0.05, "bin": 0.04, "tree": 0.01, "wreck": 2}


def style_tundra(p: Painter, layout: dict) -> None:
    size, rng = p.size, p.rng
    lay_base(p, layout)
    mid = size // 2
    # A frozen lake with an ice-road crossing, a scatter of low sheds and fuel tanks, container stacks, and bare ground in between.
    lake = (rng.randint(30, size - 60), rng.choice([p.top + 6, p.bottom - 36]), rng.randint(26, 34), 28)
    water(p, *lake)
    for y in range(lake[1] + 3, lake[1] + 25, 9):
        lane(p, lake[0] - 1, y, lake[2] + 2, 2, ("snow", "#b8c2c8"))
    for _ in range(3):
        p.scatter((16, p.top + 4, size - 36, p.bottom - p.top - 8), 30, ((4, 8), (4, 6)), [1, 1, 2])
    for tx in range(20, size - 40, 8):
        for ty in (mid - 22, mid + 20):
            if rng.random() < 0.5:
                p.building(tx, ty, 4, 4, 1, "#5a5f63", "tank")
    for x in range(18, size - 36, 5):
        if rng.random() < 0.18:
            for k in range(rng.randint(2, 4)):
                p.building(x, mid + 8 + k * 3, 3, 2, 1, rng.choice(p.palette["containers"]), "container")
    for _ in range(p.n(11)):
        gx, gy = rng.randint(14, size - 28), rng.randint(p.top + 5, p.bottom - 14)
        trees(p, (gx, gy, 10, 8), 6, 3)
    layout["props_mix"] = {"tree": 0.0, "streetlight": 0.03, "bin": 0.02, "wreck": 4}


def style_jungle(p: Painter, layout: dict) -> None:
    size, rng = p.size, p.rng
    lay_base(p, layout)
    mid = size // 2
    # Swamp pools joined by boardwalks, stilt houses on the water's edge, ruined walls, and dense trees round clearings.
    for _ in range(p.n(6)):
        w, h = rng.randint(10, 18), rng.randint(8, 14)
        x0, y0 = rng.randint(16, size - 36), rng.randint(p.top + 5, p.bottom - 20)
        if not p.free(x0, y0, w, h, 3) or abs(y0 + h / 2 - mid) < h:
            continue
        water(p, x0, y0, w, h)
        lane(p, x0 - 1, y0 + h // 2, w + 2, 2, ("dock", p.palette["dock"]))
        lane(p, x0 + w // 2, y0 - 1, 2, h + 2, ("dock", p.palette["dock"]))
        p.building(x0 - 6, y0 + 1, 4, 4, 1, None, "stilt-house")
        p.building(x0 + w + 2, y0 + h - 5, 4, 4, 1, None, "stilt-house")
    for _ in range(p.n(4)):
        w, h = rng.randint(9, 14), rng.randint(8, 12)
        x0, y0 = rng.randint(16, size - 36), rng.randint(p.top + 5, p.bottom - 18)
        if p.free(x0, y0, w, h, 2):
            wall_ring(p, x0, y0, w, h, [("s", 2, 3), ("n", w - 6, 3), ("e", 3, 2)])
            p.claim(x0, y0, w, h)
    p.scatter((16, p.top + 4, size - 36, p.bottom - p.top - 8), 40, ((4, 7), (4, 6)), [1, 1, 2])
    for _ in range(30):  # an overgrown temple platform
        tx, ty = rng.randint(20, size - 44), rng.randint(p.top + 6, p.bottom - 24)
        if abs(ty - mid) > 10 and terrace(p, tx, ty, 12, 12, 3, [("s", 4, 4), ("n", 4, 4)]):
            break
    for _ in range(p.n(26)):
        gx, gy = rng.randint(14, size - 30), rng.randint(p.top + 5, p.bottom - 12)
        trees(p, (gx, gy, 10, 8), 8, 3)
    layout["props_mix"] = {"tree": 0.0, "streetlight": 0.0, "bin": 0.01, "wreck": 3}


def style_outskirts(p: Painter, layout: dict) -> None:
    size, rng = p.size, p.rng
    lay_base(p, layout)
    mid = size // 2
    # The avenue becomes a raised roadway with mesh fencing down both edges (a gap every so often to get off it) and steel pylons
    # standing beside it, over open scrub with a few walled yards, sheds, tanks and a gravel track across.
    p.regions = [r for r in p.regions if not r["id"].startswith("avenue")]
    p.add("roadway", 0, mid - 2, size, 4, "street", True, 1, "#2d363d", claim=True)
    gaps = [rng.randint(24, 34) + 26 * k for k in range(0, 8) if rng.randint(24, 34) + 26 * k < size - 40] + [size - 16]
    for side_y in (mid - 3, mid + 2):
        start = 0
        for gap in gaps:
            if gap - start > 2:
                p.add("roadside-fence", start, side_y, gap - start, 1, "service-fence", False, 1, "#3a4650", claim=True)
            start = gap + 4
        p.add("roadside-fence", start, side_y, size - start, 1, "service-fence", False, 1, "#3a4650", claim=True)
    # keep the entry and the exit yard open (their strips were claimed; the fence must not cross them)
    p.regions = [r for r in p.regions if not (r["surface"] == "service-fence" and r["id"].startswith("roadside") and r["x"] < 12)]
    for x in range(18, size - 20, 15):
        pylon(p, x + rng.randint(0, 3), mid - 7 if rng.random() < 0.5 else mid + 6)
    for x in range(30 + rng.randint(0, 20), size - 30, rng.choice([36, 44])):
        lane(p, x, p.top + 3, 3, p.bottom - p.top - 6, ("gravel", "#6e5d3f"))
    for _ in range(p.n(5)):
        w, h = rng.randint(14, 22), rng.randint(12, 18)
        x0, y0 = rng.randint(16, size - 42), rng.choice([rng.randint(p.top + 6, mid - h - 8), rng.randint(mid + 8, p.bottom - h - 6)])
        if p.free(x0, y0, w, h, 3):
            wall_ring(p, x0, y0, w, h, [(rng.choice("nswe"), 4, 4)], kind="service-fence")
            p.claim(x0, y0, w, h)
            p.scatter((x0 + 2, y0 + 2, w - 4, h - 4), 3, ((4, 8), (4, 6)), [1, 2])
    p.scatter((16, p.top + 4, size - 36, p.bottom - p.top - 8), 28, ((4, 9), (4, 7)), [1, 1, 2, 3])
    for tx in range(18, size - 30, 9):
        for ty in (rng.randint(p.top + 8, mid - 14), rng.randint(mid + 12, p.bottom - 12)):
            if rng.random() < 0.3:
                p.building(tx, ty, 5, 5, rng.choice([1, 2]), "#4c5256", "tank")
    for _ in range(p.n(4)):  # a pipeline across the scrub
        row = rng.choice([rng.randint(p.top + 6, mid - 12), rng.randint(mid + 10, p.bottom - 8)])
        pipe_run(p, rng.randint(16, size - 50), row, rng.randint(16, 34))
    for _ in range(p.n(5)):
        bx, by = rng.randint(16, size - 24), rng.randint(p.top + 6, p.bottom - 8)
        if p.free(bx, by, 1, 1, 1) and abs(by - mid) > 6:
            p.props.append(("barrels", bx, by))
    layout["props_mix"] = {"tree": 0.0, "streetlight": 0.03, "bin": 0.01, "wreck": 5}


STYLES = {
    "outskirts": style_outskirts,
    "harbour": style_harbour,
    "oldtown": style_oldtown,
    "industrial": style_industrial,
    "park": style_park,
    "river": style_river,
    "desert": style_desert,
    "highrise": style_highrise,
    "tundra": style_tundra,
    "jungle": style_jungle,
}


def compose(layout: dict) -> tuple[list[dict], list[dict], list[tuple[str, int, int]]]:
    """Regions, doors and requested scenery for a layout whose "style" is one of STYLES (the rest of the layout, the compound, fences
    and gate, is added by generate_maps.build as for any district)."""
    style = layout["style"]
    rng = random.Random(layout["seed"] + 101)
    painter = Painter(layout["size"], rng, PALETTES[style])
    painter.top, painter.bottom = layout.get("crop_top", 0), layout.get("crop_bottom", layout["size"])
    # A compound on the east edge (if the layout has one) is not built over.
    if layout.get("compound"):
        cx, cy, cw, ch = layout["compound"]
        painter.claim(cx - 2, cy - 2, cw + 4, ch + 4)
    STYLES[style](painter, layout)
    layout["palette"] = PALETTES[style]
    return painter.regions, painter.doors, painter.props
