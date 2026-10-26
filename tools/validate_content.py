#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-2.0-or-later

"""Validate OpenSynd v1 content packs using only the Python standard library."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
CONTENT_ROOT = ROOT / "open-content"
PACKS_ROOT = CONTENT_ROOT / "packs"
SCHEMAS_ROOT = CONTENT_ROOT / "schemas"
ID_PATTERN = re.compile(r"^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$")
COLOR_PATTERN = re.compile(r"^#[0-9a-fA-F]{6}$")
CONTENT_LICENSES = {"CC0-1.0", "CC-BY-4.0"}


ICONS = {
    "pulse", "heavy-pulse", "medkit", "syringe", "cloak", "persuader", "smg", "rotary", "coil", "longshot",
    "bomb", "shield", "scatter", "flame", "beam", "scanner", "key",
}


class Validation:
    def __init__(self) -> None:
        self.errors: list[str] = []
        self.file_count = 0

    def error(self, path: Path, message: str) -> None:
        self.errors.append(f"{path.relative_to(ROOT)}: {message}")

    def read_object(self, path: Path) -> dict[str, Any] | None:
        try:
            value = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as error:
            self.error(path, f"cannot read JSON: {error}")
            return None
        self.file_count += 1
        if not isinstance(value, dict):
            self.error(path, "top-level value must be an object")
            return None
        return value

    def require(self, path: Path, value: dict[str, Any], fields: set[str]) -> bool:
        missing = fields - value.keys()
        if missing:
            self.error(path, f"missing fields: {', '.join(sorted(missing))}")
            return False
        return True

    def validate_identity(self, path: Path, value: dict[str, Any]) -> None:
        if value.get("formatVersion") != 1:
            self.error(path, "formatVersion must be 1")
        identifier = value.get("id")
        if not isinstance(identifier, str) or ID_PATTERN.fullmatch(identifier) is None:
            self.error(path, f"invalid id: {identifier!r}")
        if value.get("license") not in CONTENT_LICENSES:
            self.error(path, f"unsupported content license: {value.get('license')!r}")

    def resolve_reference(self, pack_root: Path, owner: Path, reference: Any) -> Path | None:
        if not isinstance(reference, str) or not reference.endswith(".json"):
            self.error(owner, f"invalid content reference: {reference!r}")
            return None
        candidate = (pack_root / reference).resolve()
        try:
            candidate.relative_to(pack_root.resolve())
        except ValueError:
            self.error(owner, f"content reference escapes its pack: {reference}")
            return None
        if not candidate.is_file():
            self.error(owner, f"content reference does not exist: {reference}")
            return None
        return candidate

    def validate_map(self, path: Path, value: dict[str, Any]) -> set[str]:
        required = {
            "formatVersion", "id", "name", "license", "projection",
            "dimensions", "cellSize", "regions", "zones",
        }
        if not self.require(path, value, required):
            return set()
        self.validate_identity(path, value)
        if value["projection"] != "isometric-diamond":
            self.error(path, "projection must be 'isometric-diamond'")

        dimensions = value["dimensions"]
        if not isinstance(dimensions, dict):
            self.error(path, "dimensions must be an object")
            return set()
        width = dimensions.get("width")
        height = dimensions.get("height")
        if not isinstance(width, int) or not 1 <= width <= 512:
            self.error(path, "dimensions.width must be an integer from 1 to 512")
            return set()
        if not isinstance(height, int) or not 1 <= height <= 512:
            self.error(path, "dimensions.height must be an integer from 1 to 512")
            return set()

        for collection_name in ("regions", "zones"):
            if not isinstance(value[collection_name], list):
                self.error(path, f"{collection_name} must be an array")
                return set()

        region_ids: set[str] = set()
        for region in value["regions"]:
            if not isinstance(region, dict):
                self.error(path, "every region must be an object")
                continue
            region_id = region.get("id")
            if region_id in region_ids:
                self.error(path, f"duplicate region id: {region_id}")
            region_ids.add(region_id)
            self.validate_rectangle(path, region, width, height, f"region {region_id}")
            if not isinstance(region.get("walkable"), bool):
                self.error(path, f"region {region_id} needs a boolean walkable value")
            if COLOR_PATTERN.fullmatch(str(region.get("color"))) is None:
                self.error(path, f"region {region_id} has an invalid color")

        zone_ids: set[str] = set()
        for zone in value["zones"]:
            if not isinstance(zone, dict):
                self.error(path, "every zone must be an object")
                continue
            zone_id = zone.get("id")
            if not isinstance(zone_id, str) or ID_PATTERN.fullmatch(zone_id) is None:
                self.error(path, f"invalid zone id: {zone_id!r}")
                continue
            if zone_id in zone_ids:
                self.error(path, f"duplicate zone id: {zone_id}")
            zone_ids.add(zone_id)
            position = zone.get("position")
            rectangle = dict(position) if isinstance(position, dict) else {}
            rectangle.update({"width": zone.get("width"), "height": zone.get("height")})
            self.validate_rectangle(path, rectangle, width, height, f"zone {zone_id}")

        prop_ids: set[str] = set()
        for item in value.get("props", []):
            prop_id = item.get("id") if isinstance(item, dict) else None
            if not isinstance(prop_id, str) or ID_PATTERN.fullmatch(prop_id) is None or prop_id in prop_ids:
                self.error(path, f"invalid or duplicate prop id: {prop_id!r}")
                continue
            prop_ids.add(prop_id)
            if item.get("kind") not in {"tree", "streetlight", "bin", "billboard", "wreck"}:
                self.error(path, f"prop {prop_id} has an unsupported kind")
            if item.get("facing", "east-west") not in {"east-west", "north-south"}:
                self.error(path, f"prop {prop_id} has an unsupported facing")
            position = item.get("position")
            rectangle = dict(position) if isinstance(position, dict) else {}
            rectangle.update({"width": 1, "height": 1})
            self.validate_rectangle(path, rectangle, width, height, f"prop {prop_id}")

        objects = value.get("objects", [])
        if not isinstance(objects, list):
            self.error(path, "objects must be an array")
            return zone_ids
        object_ids: set[str] = set()
        for item in objects:
            if not isinstance(item, dict):
                self.error(path, "every object must be an object")
                continue
            object_id = item.get("id")
            if not isinstance(object_id, str) or ID_PATTERN.fullmatch(object_id) is None:
                self.error(path, f"invalid object id: {object_id!r}")
                continue
            if object_id in object_ids:
                self.error(path, f"duplicate object id: {object_id}")
            object_ids.add(object_id)
            if item.get("kind") not in ("gate", "door"):
                self.error(path, f"object {object_id} has unsupported kind")
            if item.get("key") is not None and not isinstance(item.get("key"), str):
                self.error(path, f"object {object_id} key must be an equipment id")
            if item.get("kind") == "gate" and item.get("control") not in zone_ids:
                self.error(path, f"object {object_id} control zone does not exist")
            position = item.get("position")
            rectangle = dict(position) if isinstance(position, dict) else {}
            rectangle.update({"width": item.get("width"), "height": item.get("height")})
            self.validate_rectangle(path, rectangle, width, height, f"object {object_id}")
        return zone_ids

    def validate_rectangle(
        self, path: Path, rectangle: dict[str, Any], map_width: int,
        map_height: int, label: str,
    ) -> None:
        x = rectangle.get("x")
        y = rectangle.get("y")
        width = rectangle.get("width")
        height = rectangle.get("height")
        values = (x, y, width, height)
        if not all(isinstance(item, int) for item in values):
            self.error(path, f"{label} coordinates and size must be integers")
            return
        if x < 0 or y < 0 or width < 1 or height < 1:
            self.error(path, f"{label} has an invalid rectangle")
        elif x + width > map_width or y + height > map_height:
            self.error(path, f"{label} extends beyond map dimensions")

    def validate_unit(self, path: Path, value: dict[str, Any]) -> None:
        required = {
            "formatVersion", "id", "name", "license", "role", "stats",
            "abilities", "appearance",
        }
        if not self.require(path, value, required):
            return
        self.validate_identity(path, value)
        stats = value["stats"]
        stat_names = {"vitality", "speed", "awareness", "attack", "range", "cooldown"}
        if not isinstance(stats, dict) or not stat_names <= stats.keys():
            self.error(path, f"stats must define {', '.join(sorted(stat_names))}")
        elif (
            not isinstance(stats["attack"], int) or stats["attack"] < 0
            or not isinstance(stats["range"], (int, float)) or stats["range"] <= 0
            or not isinstance(stats["cooldown"], (int, float)) or stats["cooldown"] <= 0
        ):
            self.error(path, "combat stats must use non-negative attack and positive range/cooldown")
        carries = value.get("carries", [])
        if not isinstance(carries, list) or not all(isinstance(item, str) and item.endswith(".json") for item in carries):
            self.error(path, "carries must be a list of equipment paths")
        appearance = value["appearance"]
        if not isinstance(appearance, dict):
            self.error(path, "appearance must be an object")
            return
        sprites = appearance.get("sprites")
        if sprites is not None and (
            not isinstance(sprites, list) or not sprites
            or not all(isinstance(item, str) and ID_PATTERN.fullmatch(item) for item in sprites)
        ):
            self.error(path, "appearance.sprites must be a non-empty list of ids")
        for field in ("primaryColor", "accentColor"):
            if COLOR_PATTERN.fullmatch(str(appearance.get(field))) is None:
                self.error(path, f"appearance.{field} must be a six-digit hex color")

    def validate_vehicle(self, path: Path, value: dict[str, Any]) -> None:
        required = {"formatVersion", "id", "name", "license", "kind", "stats", "appearance"}
        if not self.require(path, value, required):
            return
        self.validate_identity(path, value)
        if value["kind"] not in {"city-car", "patrol-car", "armored-car", "ambulance", "fire-engine", "small-armored", "train"}:
            self.error(path, f"unsupported vehicle kind: {value['kind']!r}")
        stats = value["stats"]
        names = {"health", "speed", "seats", "blastRadius", "blastDamage"}
        if not isinstance(stats, dict) or not names <= stats.keys() or not all(
            isinstance(stats[name], (int, float)) and not isinstance(stats[name], bool) and stats[name] > 0
            for name in names if isinstance(stats, dict) and name in stats
        ):
            self.error(path, "vehicle stats must define positive health, speed, seats, blastRadius and blastDamage")
        appearance = value["appearance"]
        if not isinstance(appearance, dict):
            self.error(path, "appearance must be an object")
            return
        for field in ("primaryColor", "accentColor"):
            if COLOR_PATTERN.fullmatch(str(appearance.get(field))) is None:
                self.error(path, f"appearance.{field} must be a six-digit hex color")

    def validate_equipment(self, path: Path, value: dict[str, Any]) -> None:
        required = {
            "formatVersion", "id", "name", "description", "license", "type",
            "action", "charges", "effect",
        }
        if not self.require(path, value, required):
            return
        self.validate_identity(path, value)
        if value["type"] not in {"tool", "consumable"}:
            self.error(path, f"unsupported equipment type: {value['type']!r}")
        actions = {"disable-pulse", "restore-vitality", "stealth", "persuade", "time-bomb", "shield", "scan", "key"}
        if value["action"] not in actions:
            self.error(path, f"unsupported equipment action: {value['action']!r}")
        charges = value["charges"]
        if charges is not None and (
            not isinstance(charges, int) or isinstance(charges, bool) or not 1 <= charges <= 99
        ):
            self.error(path, "charges must be null or an integer from 1 to 99")
        effect = value["effect"]
        if not isinstance(effect, dict):
            self.error(path, "effect must be an object")
        elif value["action"] == "disable-pulse" and not {
            "attack", "range", "cooldown"
        } <= effect.keys():
            self.error(path, "disable-pulse effect requires attack, range, and cooldown")
        elif value["action"] == "restore-vitality" and (
            effect.get("restoreFull") is not True
            and (not isinstance(effect.get("restoreVitality"), int) or effect["restoreVitality"] <= 0)
        ):
            self.error(path, "restore-vitality effect requires restoreFull or a positive restoreVitality")
        elif value["action"] == "time-bomb" and not {"attack", "radius", "fuse"} <= effect.keys():
            self.error(path, "time-bomb effect requires attack, radius, and fuse")
        elif value["action"] == "key" and not isinstance(effect.get("range"), (int, float)):
            self.error(path, "key effect requires range")
        elif value["action"] == "scan" and not {"radius", "duration"} <= effect.keys():
            self.error(path, "scan effect requires radius and duration")
        elif value["action"] == "shield" and not isinstance(effect.get("duration"), (int, float)):
            self.error(path, "shield effect requires duration")
        elif value["action"] == "persuade" and not {"range", "cooldown"} <= effect.keys():
            self.error(path, "persuade effect requires range and cooldown")
        elif value["action"] == "stealth" and not (
            isinstance(effect.get("sightFactor"), (int, float))
            and 0.1 <= effect["sightFactor"] <= 1
        ):
            self.error(path, "stealth effect requires sightFactor between 0.1 and 1")
        pellets = effect.get("pellets") if isinstance(effect, dict) else None
        if pellets is not None and (not isinstance(pellets, int) or not 2 <= pellets <= 12):
            self.error(path, "pellets must be an integer from 2 to 12")
        burn = effect.get("burn") if isinstance(effect, dict) else None
        if burn is not None and not (isinstance(burn, dict) and {"dps", "seconds"} <= burn.keys()):
            self.error(path, "burn requires dps and seconds")
        weight = value.get("weight", 0)
        if not isinstance(weight, int) or isinstance(weight, bool) or not 0 <= weight <= 30:
            self.error(path, "weight must be an integer from 0 to 30")
        price = value.get("price")
        if not isinstance(price, int) or isinstance(price, bool) or not 0 <= price <= 100000:
            self.error(path, "price must be an integer from 0 to 100000")
        ammo_price = value.get("ammoPrice", 0)
        if not isinstance(ammo_price, int) or isinstance(ammo_price, bool) or not 0 <= ammo_price <= 100000:
            self.error(path, "ammoPrice must be an integer from 0 to 100000")
        if value.get("icon") not in ICONS:
            self.error(path, f"icon must be one of {', '.join(sorted(ICONS))}")
        if value.get("sound") not in {None, "pistol", "smg", "rotary", "rifle", "coil", "longshot", "scatter", "flame", "beam"}:
            self.error(path, "sound must be pistol, smg, rotary, rifle, coil, longshot, scatter, flame or beam")
        if value.get("carry") not in {None, "pistol", "rifle"}:
            self.error(path, "carry must be pistol or rifle")
        requires = value.get("requires", [])
        if not isinstance(requires, list) or not all(isinstance(entry, str) for entry in requires):
            self.error(path, "requires must be a list of equipment ids")
        cost = value.get("researchCost", 0)
        if not isinstance(cost, int) or isinstance(cost, bool) or not 0 <= cost <= 100000:
            self.error(path, "researchCost must be an integer from 0 to 100000")

    def validate_mission(
        self, path: Path, value: dict[str, Any], pack_root: Path,
        maps: dict[Path, tuple[dict[str, Any], set[str]]], unit_paths: set[Path],
        equipment_paths: set[Path],
        vehicle_paths: set[Path] | None = None,
    ) -> None:
        required = {
            "formatVersion", "id", "name", "license", "briefing", "map",
            "team", "opponents", "objectives",
        }
        if not self.require(path, value, required):
            return
        self.validate_identity(path, value)
        map_path = self.resolve_reference(pack_root, path, value["map"])
        if map_path not in maps:
            self.error(path, "mission map is not declared by its content pack")
            return
        map_value, map_zones = maps[map_path]
        dimensions = map_value["dimensions"]
        # A mission may add zones of its own to the map's (an area to fall back to, say).
        zones = set(map_zones)
        extra_zones = value.get("zones", [])
        if not isinstance(extra_zones, list):
            self.error(path, "zones must be an array")
            extra_zones = []
        for zone in extra_zones:
            zone_id = zone.get("id") if isinstance(zone, dict) else None
            if not isinstance(zone_id, str) or ID_PATTERN.fullmatch(zone_id) is None or zone_id in zones:
                self.error(path, f"a mission zone needs an id of its own: {zone_id!r}")
                continue
            if zone.get("kind") not in {"entry", "interaction", "hold", "exit"}:
                self.error(path, f"mission zone {zone_id} has an unknown kind")
            position = zone.get("position")
            rectangle = dict(position) if isinstance(position, dict) else {}
            rectangle.update({"width": zone.get("width"), "height": zone.get("height")})
            self.validate_rectangle(path, rectangle, dimensions["width"], dimensions["height"], f"mission zone {zone_id}")
            zones.add(zone_id)

        region = value.get("region")
        if region is not None:
            if (
                not isinstance(region, dict)
                or not isinstance(region.get("name"), str) or not region["name"]
                or not all(
                    isinstance(region.get(axis), (int, float)) and not isinstance(region.get(axis), bool)
                    and low <= region[axis] <= high
                    for axis, low, high in (("lon", -180, 180), ("lat", -58, 84))
                )
            ):
                self.error(path, "region must have a name, a longitude from -180 to 180 and a latitude from -58 to 84")

        placement_ids: set[str] = set()
        for group_name in ("team", "opponents", "bystanders"):
            group = value.get(group_name, [])
            if not isinstance(group, list):
                self.error(path, f"{group_name} must be an array")
                continue
            if group_name == "team" and not 1 <= len(group) <= 4:
                self.error(path, "team must contain one to four placements")
            for placement in group:
                if not isinstance(placement, dict):
                    self.error(path, f"{group_name} placements must be objects")
                    continue
                placement_id = placement.get("id")
                if placement_id in placement_ids:
                    self.error(path, f"duplicate placement id: {placement_id}")
                placement_ids.add(placement_id)
                unit_path = self.resolve_reference(pack_root, path, placement.get("unit"))
                if unit_path not in unit_paths:
                    self.error(path, f"unit is not declared by its pack: {placement.get('unit')}")
                equipment = placement.get("equipment")
                if not isinstance(equipment, list):
                    self.error(path, f"placement {placement_id} equipment must be an array")
                else:
                    resolved_equipment: list[Path] = []
                    for reference in equipment:
                        equipment_path = self.resolve_reference(pack_root, path, reference)
                        if equipment_path is not None:
                            resolved_equipment.append(equipment_path)
                            if equipment_path not in equipment_paths:
                                self.error(path, f"equipment is not declared by its pack: {reference}")
                    if len(set(resolved_equipment)) != len(resolved_equipment):
                        self.error(path, f"placement {placement_id} has duplicate equipment")
                position = placement.get("position")
                rectangle = dict(position) if isinstance(position, dict) else {}
                rectangle.update({"width": 1, "height": 1})
                self.validate_rectangle(
                    path, rectangle, dimensions["width"], dimensions["height"],
                    f"placement {placement_id}",
                )
                patrol = placement.get("patrol")
                if patrol is not None:
                    if group_name == "team":
                        self.error(path, f"only opponents and bystanders may patrol: {placement_id}")
                    if not isinstance(patrol, list) or not patrol:
                        self.error(path, f"placement {placement_id} patrol must be a non-empty array")
                    else:
                        for waypoint in patrol:
                            point = dict(waypoint) if isinstance(waypoint, dict) else {}
                            point.update({"width": 1, "height": 1})
                            self.validate_rectangle(
                                path, point, dimensions["width"], dimensions["height"],
                                f"patrol waypoint of {placement_id}",
                            )
                script = placement.get("script")
                if script is not None:
                    if group_name == "team" or not isinstance(script, list) or not script:
                        self.error(path, f"placement {placement_id} script must be a non-empty array on a non-team placement")
                        script = []
                    for step in script:
                        kind = step.get("type") if isinstance(step, dict) else None
                        needs = {"walk": "to", "escape": "to", "wait": "seconds", "trigger": "at", "say": "text",
                                 "enter": "vehicle", "drive": "to", "leave": None}.get(kind, False)
                        if kind == "leave":
                            continue
                        if needs is False or needs is None or needs not in step:
                            self.error(path, f"placement {placement_id} has an invalid script step: {step!r}")
                            continue
                        if needs == "text" and not (isinstance(step["text"], str) and 0 < len(step["text"]) <= 200):
                            self.error(path, f"placement {placement_id} has an invalid say step")
                        if needs == "vehicle" and not isinstance(step["vehicle"], str):
                            self.error(path, f"placement {placement_id} has an invalid enter step")
                        if needs in {"to", "at"}:
                            point = dict(step[needs]) if isinstance(step[needs], dict) else {}
                            point.update({"width": 1, "height": 1})
                            self.validate_rectangle(
                                path, point, dimensions["width"], dimensions["height"],
                                f"script step of {placement_id}",
                            )

        for placement in value.get("vehicles", []):
            if not isinstance(placement, dict):
                self.error(path, "vehicles must be objects")
                continue
            vehicle_id = placement.get("id")
            if vehicle_id in placement_ids:
                self.error(path, f"duplicate placement id: {vehicle_id}")
            placement_ids.add(vehicle_id)
            vehicle_path = self.resolve_reference(pack_root, path, placement.get("vehicle"))
            if vehicle_paths is None or vehicle_path not in vehicle_paths:
                self.error(path, f"vehicle is not declared by its pack: {placement.get('vehicle')}")
            driver = placement.get("driver")
            if driver is not None:
                driver_path = self.resolve_reference(pack_root, path, driver)
                if driver_path not in unit_paths:
                    self.error(path, f"driver unit is not declared by its pack: {driver}")
            position = placement.get("position")
            rectangle = dict(position) if isinstance(position, dict) else {}
            rectangle.update({"width": 1, "height": 1})
            self.validate_rectangle(path, rectangle, dimensions["width"], dimensions["height"], f"vehicle {vehicle_id}")
            for stop in placement.get("stops", []):
                point = {"x": stop.get("x"), "y": stop.get("y"), "width": 1, "height": 1} if isinstance(stop, dict) else {}
                self.validate_rectangle(path, point, dimensions["width"], dimensions["height"], f"stop of {vehicle_id}")
            for waypoint in placement.get("patrol", []):
                point = dict(waypoint) if isinstance(waypoint, dict) else {}
                point.update({"width": 1, "height": 1})
                self.validate_rectangle(
                    path, point, dimensions["width"], dimensions["height"], f"route waypoint of {vehicle_id}"
                )

        objective_ids: set[str] = set()
        objectives = value["objectives"]
        if not isinstance(objectives, list) or not objectives:
            self.error(path, "objectives must be a non-empty array")
            return
        for objective in objectives:
            if not isinstance(objective, dict):
                self.error(path, "objectives must be objects")
                continue
            objective_id = objective.get("id")
            if objective_id in objective_ids:
                self.error(path, f"duplicate objective id: {objective_id}")
            objective_ids.add(objective_id)
            kind = objective.get("type")
            known_ids = (
                {item.get("id") for key in ("team", "opponents", "bystanders", "vehicles")
                 for item in value.get(key, []) if isinstance(item, dict)}
            )
            targets = objective.get("targets")
            if kind == "disable":
                opponents = {item.get("id") for item in value["opponents"] if isinstance(item, dict)}
                if not isinstance(targets, list) or not targets or not set(targets) <= opponents:
                    self.error(path, f"objective {objective_id} must list opposition placements to disable")
                continue
            if kind in {"persuade", "destroy-vehicle", "use-vehicle", "protect"} or (kind in {"evacuate", "eliminate"} and targets):
                if not isinstance(targets, list) or not targets or not set(targets) <= known_ids:
                    self.error(path, f"objective {objective_id} must list placements that exist in this mission")
            if kind == "eliminate" and not targets and not objective.get("group"):
                self.error(path, f"objective {objective_id} needs targets or a group")
            if kind == "take-item" and not isinstance(objective.get("item"), str):
                self.error(path, f"objective {objective_id} needs an item")
            if kind in {"persuade", "eliminate", "destroy-vehicle", "use-vehicle", "take-item"}:
                continue
            if objective.get("targetZone") not in zones:
                self.error(path, f"unknown target zone: {objective.get('targetZone')}")
            if kind == "hold":
                seconds = objective.get("holdSeconds")
                if not isinstance(seconds, (int, float)) or isinstance(seconds, bool) or seconds <= 0:
                    self.error(path, f"objective {objective_id} needs a positive holdSeconds")

    def validate_pack(self, pack_path: Path) -> None:
        pack_root = pack_path.parent
        pack = self.read_object(pack_path)
        if pack is None:
            return
        required = {
            "formatVersion", "id", "name", "status", "license", "authors",
            "provenance", "maps", "units", "equipment", "missions",
        }
        if not self.require(pack_path, pack, required):
            return
        self.validate_identity(pack_path, pack)
        if pack["status"] not in {"development", "approved"}:
            self.error(pack_path, f"invalid pack status: {pack['status']!r}")
        provenance = pack["provenance"]
        if not isinstance(provenance, dict) or not {"source", "createdDate", "notes"} <= provenance.keys():
            self.error(pack_path, "provenance must define source, createdDate, and notes")
        elif pack["status"] == "approved" and not {
            "reviewedBy", "reviewDate"
        } <= provenance.keys():
            self.error(pack_path, "approved packs require reviewedBy and reviewDate")

        referenced = {pack_path.resolve()}
        maps: dict[Path, tuple[dict[str, Any], set[str]]] = {}
        units: set[Path] = set()
        equipment: set[Path] = set()
        vehicles: set[Path] = set()
        missions: list[tuple[Path, dict[str, Any]]] = []

        for category in ("maps", "units", "equipment", "vehicles", "missions"):
            references = pack.get(category, [])
            if not isinstance(references, list):
                self.error(pack_path, f"{category} must be an array")
                continue
            for reference in references:
                content_path = self.resolve_reference(pack_root, pack_path, reference)
                if content_path is None:
                    continue
                referenced.add(content_path)
                content = self.read_object(content_path)
                if content is None:
                    continue
                if content.get("license") != pack["license"]:
                    self.error(content_path, "content license must match its pack license")
                if category == "maps":
                    maps[content_path] = (content, self.validate_map(content_path, content))
                elif category == "units":
                    units.add(content_path)
                    self.validate_unit(content_path, content)
                elif category == "equipment":
                    equipment.add(content_path)
                    self.validate_equipment(content_path, content)
                elif category == "vehicles":
                    vehicles.add(content_path)
                    self.validate_vehicle(content_path, content)
                else:
                    missions.append((content_path, content))

        # The tutorial is a mission outside the campaign: checked like any other, but it belongs to no territory.
        tutorial_paths: set[Path] = set()
        if pack.get("tutorial") is not None:
            tutorial_path = self.resolve_reference(pack_root, pack_path, pack["tutorial"])
            tutorial = self.read_object(tutorial_path) if tutorial_path is not None else None
            if tutorial is not None:
                referenced.add(tutorial_path)
                if tutorial.get("license") != pack["license"]:
                    self.error(tutorial_path, "content license must match its pack license")
                if tutorial.get("unlocks"):
                    self.error(tutorial_path, "the tutorial cannot unlock operations")
                tutorial_paths.add(tutorial_path.resolve())
                missions.append((tutorial_path, tutorial))

        # Each territory's uprising and defence operations: checked like any other, but they belong to a territory's slots.
        variant_paths: dict[Path, dict[str, Any]] = {}
        variant_references = pack.get("variants", [])
        if not isinstance(variant_references, list):
            self.error(pack_path, "variants must be an array")
            variant_references = []
        for reference in variant_references:
            variant_path = self.resolve_reference(pack_root, pack_path, reference)
            variant = self.read_object(variant_path) if variant_path is not None else None
            if variant is None:
                continue
            referenced.add(variant_path)
            if variant.get("license") != pack["license"]:
                self.error(variant_path, "content license must match its pack license")
            if variant.get("variant") not in {"uprising", "defence"} or not isinstance(variant.get("territory"), str):
                self.error(variant_path, "an uprising or defence operation needs a variant and the territory (main operation id) it is for")
            if variant.get("unlocks"):
                self.error(variant_path, "an uprising or defence cannot unlock operations")
            variant_paths[variant_path.resolve()] = variant
            missions.append((variant_path, variant))

        equipment_items: dict[str, tuple[Path, dict[str, Any]]] = {}
        for equipment_path in equipment:
            try:
                item = json.loads(equipment_path.read_text(encoding="utf-8"))
            except (OSError, ValueError):
                continue
            if isinstance(item, dict) and isinstance(item.get("id"), str):
                equipment_items[item["id"]] = (equipment_path, item)
        for equipment_id, (equipment_path, item) in equipment_items.items():
            for needed in item.get("requires", []):
                if needed not in equipment_items or needed == equipment_id:
                    self.error(equipment_path, f"requires unknown equipment: {needed}")

        mission_ids = {m.get("id") for _, m in missions}
        for mission_path, mission in missions:
            for target in mission.get("unlocks", []):
                if target not in mission_ids or target == mission.get("id"):
                    self.error(mission_path, f"unlocks an operation that is not in the pack: {target}")
        for mission_path, mission in missions:
            self.validate_mission(
                mission_path, mission, pack_root, maps, units, equipment, vehicles
            )

        self.validate_territories(
            pack_path, pack_root, pack, referenced,
            [item for item in missions if item[0].resolve() not in tutorial_paths and item[0].resolve() not in variant_paths],
            variant_paths,
        )

        actual = {path.resolve() for path in pack_root.rglob("*.json")}
        for unreferenced in sorted(actual - referenced):
            self.error(unreferenced, "content file is not declared in pack.json")

    TERRITORY_COUNT = 50  # the campaign is 50 territories, one main mission each (ROADMAP F45)

    def validate_territories(self, pack_path: Path, pack_root: Path, pack: dict[str, Any],
                             referenced: set[Path], missions: list[tuple[Path, dict[str, Any]]],
                             variants: dict[Path, dict[str, Any]] | None = None) -> None:
        """The world: exactly 50 territories; every mission belongs to exactly one, and matches its place."""
        reference = pack.get("territories")
        if reference is None:
            return
        territories_path = self.resolve_reference(pack_root, pack_path, reference)
        if territories_path is None:
            return
        referenced.add(territories_path)
        value = self.read_object(territories_path)
        if value is None:
            return
        entries = value.get("territories")
        if not isinstance(entries, list):
            self.error(territories_path, "territories must be an array")
            return
        if len(entries) != self.TERRITORY_COUNT:
            self.error(territories_path, f"the world has {self.TERRITORY_COUNT} territories, found {len(entries)}")
        ids: set[str] = set()
        names: set[str] = set()
        owned: dict[Path, dict[str, Any]] = {}
        variant_owner: dict[Path, tuple[dict[str, Any], str]] = {}
        for entry in entries:
            if not isinstance(entry, dict):
                self.error(territories_path, "every territory must be an object")
                continue
            identifier = entry.get("id")
            if not isinstance(identifier, str) or ID_PATTERN.fullmatch(identifier) is None:
                self.error(territories_path, f"invalid territory id: {identifier!r}")
                continue
            if identifier in ids:
                self.error(territories_path, f"duplicate territory id: {identifier}")
            ids.add(identifier)
            if entry.get("name") in names:
                self.error(territories_path, f"duplicate territory name: {entry.get('name')}")
            names.add(entry.get("name"))
            for key in ("name", "owner"):
                if not isinstance(entry.get(key), str) or not entry[key]:
                    self.error(territories_path, f"territory {identifier} needs a {key}")
            lon, lat = entry.get("lon"), entry.get("lat")
            if not all(isinstance(v, (int, float)) for v in (lon, lat)) or not (-180 <= lon <= 180 and -60 <= lat <= 84):
                self.error(territories_path, f"territory {identifier} needs a longitude and latitude on the map")
            population = entry.get("population")
            if not isinstance(population, int) or not 500_000 <= population <= 20_000_000:
                self.error(territories_path, f"territory {identifier} population must be 500000 to 20000000")
            if entry.get("mission") is not None:
                mission_path = self.resolve_reference(pack_root, territories_path, entry["mission"])
                if mission_path is None:
                    continue
                if mission_path in owned:
                    self.error(territories_path, f"mission {entry['mission']} belongs to two territories")
                owned[mission_path] = entry
            # The two other operations every territory has: each is its own, and made for this territory and this kind.
            main_path = self.resolve_reference(pack_root, territories_path, entry["mission"]) if entry.get("mission") else None
            main_id = next((m.get("id") for p, m in missions if p.resolve() == (main_path.resolve() if main_path else None)), None)
            for kind in ("uprising", "defence"):
                if variants is None or entry.get(kind) is None:
                    if variants:
                        self.error(territories_path, f"territory {identifier} needs an {kind} operation")
                    continue
                variant_path = self.resolve_reference(pack_root, territories_path, entry[kind])
                if variant_path is None:
                    continue
                variant = variants.get(variant_path.resolve())
                if variant is None:
                    self.error(territories_path, f"{entry[kind]} is not declared in the pack's variants")
                    continue
                if variant_path.resolve() in variant_owner:
                    self.error(territories_path, f"{entry[kind]} belongs to two territories")
                variant_owner[variant_path.resolve()] = (entry, kind)
                if variant.get("variant") != kind:
                    self.error(variant_path, f"this is the {kind} of {identifier} but says it is the {variant.get('variant')}")
                if variant.get("territory") != main_id:
                    self.error(variant_path, f"its territory must be the main operation of {identifier} ({main_id})")
                region = variant.get("region") or {}
                if (region.get("name"), region.get("lon"), region.get("lat")) != (entry["name"], entry["lon"], entry["lat"]):
                    self.error(variant_path, f"region must match its territory {identifier}")
        for variant_path, variant in (variants or {}).items():
            if variant_path not in variant_owner:
                self.error(variant_path, "operation does not belong to any territory")
        for mission_path, mission in missions:
            entry = owned.get(mission_path.resolve())
            if entry is None:
                self.error(mission_path, "mission does not belong to any territory")
                continue
            region = mission.get("region") or {}
            if (region.get("name"), region.get("lon"), region.get("lat")) != (entry["name"], entry["lon"], entry["lat"]):
                self.error(mission_path, f"mission region must match its territory {entry['id']}")

    def run(self) -> int:
        schema_paths = sorted(SCHEMAS_ROOT.glob("*.schema.json"))
        if not schema_paths:
            self.errors.append("open-content/schemas: no schemas found")
        for schema_path in schema_paths:
            schema = self.read_object(schema_path)
            if schema is not None and schema.get("$schema") != "https://json-schema.org/draft/2020-12/schema":
                self.error(schema_path, "schema must declare JSON Schema draft 2020-12")

        pack_paths = sorted(PACKS_ROOT.glob("*/pack.json"))
        if not pack_paths:
            self.errors.append("open-content/packs: no content packs found")
        for pack_path in pack_paths:
            self.validate_pack(pack_path)

        if self.errors:
            for error in self.errors:
                print(f"content: ERROR: {error}", file=sys.stderr)
            print(f"content: failed with {len(self.errors)} error(s)", file=sys.stderr)
            return 1
        print(f"content: validated {len(pack_paths)} pack(s) and {self.file_count} JSON files")
        return 0


if __name__ == "__main__":
    raise SystemExit(Validation().run())
