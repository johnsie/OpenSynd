#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-2.0-or-later

"""Write the tutorial's map and mission (Training Yard) into the developer pack.

The yard is one straight street from west to east with a course along it: a marked square to walk to, a standing practice
target, a civilian to persuade, a parked car, a console that opens the fence gate, and an exit beyond the gate. The mission is
declared in pack.json under "tutorial", outside the 50 territories, and winning it records nothing in the campaign.
Run `python3 tools/generate_tutorial.py`, then copy the pack to web/content as usual.
"""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PACK = ROOT / "open-content/packs/developer"
SIZE_X, SIZE_Y = 48, 40
STREET_TOP, STREET_ROWS = 18, 4  # the street runs along rows 18 to 21
GATE_X = 40


def region(name, x, y, w, h, surface, walkable, elevation, color):
    return {"id": name, "x": x, "y": y, "width": w, "height": h,
            "surface": surface, "walkable": walkable, "elevation": elevation, "color": color}


def zone(zone_id, kind, x, y, w, h, prop=None):
    value = {"id": zone_id, "kind": kind, "position": {"x": x, "y": y}, "width": w, "height": h}
    if prop:
        value["prop"] = prop
    return value


def build_map() -> dict:
    regions = [region("ground", 0, 0, SIZE_X, SIZE_Y, "service-concrete", True, 0, "#293138"),
               region("street-row-0", 0, STREET_TOP, SIZE_X, STREET_ROWS, "street", True, 0, "#2d363d")]
    colours = ["#1d2227", "#20262c", "#1a1f24", "#232a30"]
    blocks = [(6, 4, 12, 9), (21, 6, 10, 7), (33, 3, 5, 10), (4, 26, 9, 10), (16, 27, 12, 8), (31, 26, 7, 9)]
    for number, (x, y, w, h) in enumerate(blocks):
        regions.append(region(f"block-{number}", x, y, w, h, "utility-building", False, 2 + number % 4, colours[number % 4]))
    regions.append(region("gate-panel-base", 35, 22, 2, 2, "relay-pad", True, 1, "#8b6b32"))
    regions.append(region("fence-north", GATE_X, 0, 1, STREET_TOP + 1, "service-fence", False, 1, "#3a4650"))
    regions.append(region("fence-south", GATE_X, STREET_TOP + STREET_ROWS - 1, 1, SIZE_Y - STREET_TOP - STREET_ROWS + 1,
                          "service-fence", False, 1, "#3a4650"))
    props = [{"id": f"streetlight-{n}", "kind": "streetlight", "position": {"x": x, "y": y}}
             for n, (x, y) in enumerate([(4, 17), (14, 22), (24, 17), (32, 22), (38, 17)], 1)]
    props += [{"id": f"tree-{n}", "kind": "tree", "position": {"x": x, "y": y}}
              for n, (x, y) in enumerate([(2, 15), (19, 15), (28, 24), (45, 15)], 1)]
    props += [{"id": "bin-1", "kind": "bin", "position": {"x": 11, "y": 17}},
              {"id": "bin-2", "kind": "bin", "position": {"x": 26, "y": 22}}]
    return {
        "formatVersion": 1, "id": "developer.training-yard", "name": "Training Yard", "license": "CC0-1.0",
        "projection": "isometric-diamond", "dimensions": {"width": SIZE_X, "height": SIZE_Y}, "cellSize": {"width": 80, "height": 40},
        "regions": regions,
        "zones": [
            zone("team-entry", "entry", 3, 18, 2, 2),
            zone("walk-pad", "hold", 10, 19, 2, 2, "beacon"),
            zone("drive-pad", "hold", 33, 19, 2, 2, "beacon"),
            zone("gate-panel", "interaction", 35, 22, 2, 2, "console"),
            zone("safe-exit", "exit", 43, 18, 4, 4),
        ],
        "objects": [{"id": "service-gate", "kind": "gate", "position": {"x": GATE_X, "y": 19}, "width": 1, "height": 2,
                     "control": "gate-panel"}],
        "props": props,
    }


def build_mission() -> dict:
    kit, pulse, persuader = ("equipment/field-repair-kit.equipment.json", "equipment/civic-pulse-emitter.equipment.json",
                             "equipment/persuader.equipment.json")
    return {
        "formatVersion": 1, "id": "developer.training-yard", "name": "Training Yard", "license": "CC0-1.0",
        "title": "Basic training",
        "briefing": "A quiet yard to learn the controls. Nothing here can hurt you, and nothing you do here counts in your campaign. "
                    "Follow the prompts at the bottom of the screen.",
        "story": "Basic training: a closed yard, a practice target and a fence gate. Learn to move, shoot, loot, persuade and drive.",
        "debrief": {"success": "Training complete. You know enough to run an operation.",
                    "failure": "Training stopped. Start it again whenever you like."},
        "map": "maps/training-yard.map.json",
        "team": [
            {"id": "operator-one", "unit": "units/field-operator.unit.json", "position": {"x": 3, "y": 18},
             "equipment": [pulse, kit, persuader]},
            {"id": "operator-two", "unit": "units/field-operator.unit.json", "position": {"x": 4, "y": 19}, "equipment": [pulse]},
        ],
        "opponents": [{"id": "practice-target", "unit": "units/enemy-agent.unit.json", "position": {"x": 20, "y": 19},
                       "equipment": [kit]}],
        "bystanders": [{"id": "civilian-1", "unit": "units/civilian-man.unit.json", "position": {"x": 28, "y": 20}, "equipment": []}],
        "vehicles": [{"id": "training-car", "vehicle": "vehicles/city-car.vehicle.json", "position": {"x": 24, "y": 19}}],
        "objectives": [
            {"id": "open-gate", "type": "interact", "targetZone": "gate-panel", "required": True,
             "description": "Use the console to open the gate."},
            {"id": "leave-yard", "type": "extract", "targetZone": "safe-exit", "required": True,
             "description": "Take the team out through the exit."},
        ],
    }


def main() -> None:
    for relative, value in (("maps/training-yard.map.json", build_map()), ("missions/training-yard.mission.json", build_mission())):
        (PACK / relative).write_text(json.dumps(value, indent=1) + "\n", encoding="utf-8")
        print(f"wrote {relative}")


if __name__ == "__main__":
    main()
