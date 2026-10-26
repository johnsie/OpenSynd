#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-2.0-or-later

"""Write each territory's two other operations: the uprising and the defence.

Every territory has three operations. The main one is played to take it. If it later falls into revolt, the uprising is played
to take it back (put down the ringleaders). If a rival company moves to take it over, the defence is played to keep it (hold a
position while the rival's agents converge on it). Both are made from the main operation: the same map, squad, enemies and
people, with new objectives, text and, for the defence, patrols that head for the position to be held. Both fall back to the
landing area (a 4 by 4 square of their own over the landing point) to leave, so a shut gate never traps the team.

Everything is deterministic. Run `python3 tools/generate_variants.py`, then copy the pack to the site with
`rm -rf web/content && cp -r open-content/packs/developer/. web/content/`.
"""

from __future__ import annotations

import copy
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PACK = ROOT / "open-content/packs/developer"
LEADER_MIN, LEADER_MAX = 3, 6


def centre(zone: dict) -> dict:
    return {"x": zone["position"]["x"] + (zone["width"] - 1) // 2, "y": zone["position"]["y"] + (zone["height"] - 1) // 2}


def pick_hold_zone(zones: list[dict]) -> dict:
    """The place to hold: a marked hold square, else a relay or server, else the landing point."""
    for kind in ("hold", "interaction"):
        for zone in zones:
            if zone["kind"] == kind and zone["id"] not in {"gate-panel"}:
                return zone
    return next(zone for zone in zones if zone["kind"] == "entry")


def place_name(zone: dict) -> str:
    """How the briefing names the place to hold."""
    return "marked position" if zone["kind"] == "hold" else zone["id"].replace("-", " ")


def base_of(main: dict, kind: str) -> dict:
    mission = copy.deepcopy(main)
    for key in ("unlocks", "sequence", "intel", "title", "story", "debrief", "briefing"):
        mission.pop(key, None)
    mission["id"] = f"{main['id']}-{kind}"
    mission["variant"] = kind
    mission["territory"] = main["id"]
    return mission


def walkable_grid(map_value: dict) -> list[list[bool]]:
    """Which tiles can be walked, with gates shut (later regions are drawn over earlier ones, as the game does)."""
    width, height = map_value["dimensions"]["width"], map_value["dimensions"]["height"]
    grid = [[False] * width for _ in range(height)]
    for region in map_value["regions"]:
        for y in range(region["y"], region["y"] + region["height"]):
            for x in range(region["x"], region["x"] + region["width"]):
                grid[y][x] = bool(region["walkable"])
    for gate in map_value.get("objects", []):
        for y in range(gate["position"]["y"], gate["position"]["y"] + gate["height"]):
            for x in range(gate["position"]["x"], gate["position"]["x"] + gate["width"]):
                grid[y][x] = False
    return grid


def landing_area(map_value: dict) -> dict:
    """A 4 by 4 square of open ground over the landing point: the whole squad fits in it (the landing zone itself is 2 by 2)."""
    entry = next(zone for zone in map_value["zones"] if zone["kind"] == "entry")
    grid = walkable_grid(map_value)
    ex, ey = entry["position"]["x"], entry["position"]["y"]
    for y0 in range(ey - 2, ey + 1):
        for x0 in range(ex - 2, ex + 1):
            if x0 < 0 or y0 < 0 or y0 + 4 > len(grid) or x0 + 4 > len(grid[0]):
                continue
            if all(grid[y][x] for y in range(y0, y0 + 4) for x in range(x0, x0 + 4)):
                return {"id": "fall-back-area", "kind": "exit", "position": {"x": x0, "y": y0}, "width": 4, "height": 4}
    raise SystemExit(f"{map_value['id']}: no open 4 by 4 square over the landing point")


def fall_back() -> dict:
    return {"id": "fall-back", "type": "extract", "targetZone": "fall-back-area", "required": True,
            "description": "Fall back to the marked landing area with the whole team."}


def uprising(main: dict, map_value: dict) -> dict:
    mission = base_of(main, "uprising")
    place = main["region"]["name"]
    agents = [item for item in main["opponents"] if "enemy-agent" in item["unit"]] or list(main["opponents"])
    count = max(LEADER_MIN, min(LEADER_MAX, len(agents) // 3))
    leaders = [item["id"] for item in agents[:count]]
    mission["name"] = f"{main['name']} Uprising"
    mission["title"] = "The district has risen"
    mission["briefing"] = (
        f"{place} has risen against you and pays nothing until order is restored. Put down the {len(leaders)} ringleaders and "
        "fall back to the landing area. The crowds will go home once they fall."
    )
    mission["story"] = f"{place} Uprising: taxes too high for too long, and the streets belong to the ringleaders. End it."
    mission["debrief"] = {
        "success": f"The ringleaders are down and {place} goes home. The district is yours again and pays tax once more.",
        "failure": f"The team is lost and {place} stays in revolt. It pays nothing until it is taken back.",
    }
    mission["objectives"] = [
        {"id": "put-down-ringleaders", "type": "eliminate", "targets": leaders, "required": True,
         "description": f"Put down the {len(leaders)} ringleaders."},
        fall_back(),
    ]
    mission["zones"] = [landing_area(map_value)]
    mission["intel"] = [
        f"Patrol survey: the rising is led by {len(leaders)} agents, spread through the district.",
        "Full survey: only the ringleaders count; everyone else will fight if you come near.",
    ]
    return mission


def defence(main: dict, map_value: dict, rival: str) -> dict:
    mission = base_of(main, "defence")
    place = main["region"]["name"]
    zones = map_value["zones"]
    zone = pick_hold_zone(zones)
    spot = centre(zone)
    agents = [item for item in mission["opponents"] if "enemy-agent" in item["unit"]]
    seconds = max(35, min(75, 30 + 2 * len(agents)))
    # The rival sends its nearest agents, a few at a time: a third of them, at least three and at most eight. The rest keep their beats.
    sending = max(3, min(8, -(-len(agents) // 3)))
    nearest = sorted(agents, key=lambda a: (abs(a["position"]["x"] - spot["x"]) + abs(a["position"]["y"] - spot["y"]), a["id"]))[:sending]
    for agent in nearest:
        agent["patrol"] = [dict(agent["position"]), dict(spot)]
    mission["name"] = f"{main['name']} Defence"
    mission["title"] = "Hold the district"
    mission["briefing"] = (
        f"{rival} is moving on {place}. Its agents are coming for the {place_name(zone)}: hold it for {seconds} seconds "
        "while they close in, then fall back to the landing area."
    )
    mission["story"] = f"{place} Defence: {rival} wants the district and has sent its agents. Hold the line until they give up."
    mission["debrief"] = {
        "success": f"{rival} pulls back from {place}. The district stays yours.",
        "failure": f"The line broke. {rival} presses on, and {place} falls to it unless the next attempt holds.",
    }
    mission["objectives"] = [
        {"id": "hold-position", "type": "hold", "targetZone": zone["id"], "holdSeconds": seconds, "required": True,
         "description": f"Hold the {place_name(zone)} for {seconds} seconds."},
        fall_back(),
    ]
    mission["zones"] = [landing_area(map_value)]
    mission["intel"] = [
        f"Patrol survey: {rival} sends {len(nearest)} of its {len(agents)} agents at the position, the nearest first.",
        "Full survey: guards and police stay on their beats but will join a fight.",
    ]
    return mission


def write(path: Path, value: dict, indent: int = 1) -> None:
    path.write_text(json.dumps(value, indent=indent) + "\n", encoding="utf-8")


def main() -> None:
    territories_path = PACK / "territories.json"
    territories = json.loads(territories_path.read_text(encoding="utf-8"))
    pack_path = PACK / "pack.json"
    pack = json.loads(pack_path.read_text(encoding="utf-8"))
    variants: list[str] = []
    for entry in territories["territories"]:
        main_path = PACK / entry["mission"]
        main_mission = json.loads(main_path.read_text(encoding="utf-8"))
        map_value = json.loads((PACK / main_mission["map"]).read_text(encoding="utf-8"))
        stem = main_path.name.removesuffix(".mission.json")
        for kind, make in (("uprising", lambda: uprising(main_mission, map_value)),
                           ("defence", lambda: defence(main_mission, map_value, entry["owner"]))):
            relative = f"missions/{stem}-{kind}.mission.json"
            write(PACK / relative, make())
            entry[kind] = relative
            variants.append(relative)
    write(territories_path, territories, indent=2)
    pack["variants"] = sorted(variants)
    write(pack_path, pack, indent=2)
    print(f"wrote {len(variants)} variant missions for {len(territories['territories'])} territories")


if __name__ == "__main__":
    main()
