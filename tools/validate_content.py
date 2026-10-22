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
            if item.get("kind") != "gate":
                self.error(path, f"object {object_id} has unsupported kind")
            if item.get("control") not in zone_ids:
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
        if value["action"] not in {"disable-pulse", "restore-vitality", "restore-energy", "stealth"}:
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
            not isinstance(effect.get("restoreVitality"), int)
            or effect["restoreVitality"] <= 0
        ):
            self.error(path, "restore-vitality effect requires positive restoreVitality")
        elif value["action"] == "restore-energy" and not (
            isinstance(effect.get("restoreStamina"), (int, float))
            or isinstance(effect.get("restoreFocus"), (int, float))
        ):
            self.error(path, "restore-energy effect requires restoreStamina or restoreFocus")
        elif value["action"] == "stealth" and not (
            isinstance(effect.get("sightFactor"), (int, float))
            and 0.1 <= effect["sightFactor"] <= 1
        ):
            self.error(path, "stealth effect requires sightFactor between 0.1 and 1")
        price = value.get("price")
        if not isinstance(price, int) or isinstance(price, bool) or not 0 <= price <= 1000:
            self.error(path, "price must be an integer from 0 to 1000")
        if value.get("icon") not in {"pulse", "heavy-pulse", "medkit", "syringe", "cloak"}:
            self.error(path, "icon must be one of pulse, heavy-pulse, medkit, syringe, cloak")
        cost = value.get("researchCost", 0)
        if not isinstance(cost, int) or isinstance(cost, bool) or not 0 <= cost <= 500:
            self.error(path, "researchCost must be an integer from 0 to 500")

    def validate_mission(
        self, path: Path, value: dict[str, Any], pack_root: Path,
        maps: dict[Path, tuple[dict[str, Any], set[str]]], unit_paths: set[Path],
        equipment_paths: set[Path],
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
        map_value, zones = maps[map_path]
        dimensions = map_value["dimensions"]

        placement_ids: set[str] = set()
        for group_name in ("team", "opponents"):
            group = value[group_name]
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
                    if group_name != "opponents":
                        self.error(path, f"only opponents may patrol: {placement_id}")
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
            if objective.get("targetZone") not in zones:
                self.error(path, f"unknown target zone: {objective.get('targetZone')}")

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
        missions: list[tuple[Path, dict[str, Any]]] = []

        for category in ("maps", "units", "equipment", "missions"):
            references = pack[category]
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
                else:
                    missions.append((content_path, content))

        for mission_path, mission in missions:
            self.validate_mission(
                mission_path, mission, pack_root, maps, units, equipment
            )

        actual = {path.resolve() for path in pack_root.rglob("*.json")}
        for unreferenced in sorted(actual - referenced):
            self.error(unreferenced, "content file is not declared in pack.json")

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
