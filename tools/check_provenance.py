#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-2.0-or-later

"""Validate OpenSynd's asset provenance registry without external packages."""

from __future__ import annotations

import hashlib
import json
import sys
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
REGISTRY = ROOT / "provenance" / "assets.json"
ASSET_ROOTS = (ROOT / "data", ROOT / "icon", ROOT / "web" / "public" / "assets")
STATUSES = {"approved", "quarantined", "excluded"}
APPROVED_LICENSES = {"CC0-1.0", "CC-BY-4.0", "OFL-1.1"}
REQUIRED_FIELDS = {
    "path",
    "sha256",
    "status",
    "classification",
    "creator",
    "copyright",
    "license",
    "source",
    "notes",
}


def digest(path: Path) -> str:
    checksum = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            checksum.update(chunk)
    return checksum.hexdigest()


def tracked_assets() -> set[str]:
    paths: set[str] = set()
    for asset_root in ASSET_ROOTS:
        if not asset_root.exists():
            continue
        paths.update(
            path.relative_to(ROOT).as_posix()
            for path in asset_root.rglob("*")
            if path.is_file()
        )
    return paths


def main() -> int:
    errors: list[str] = []
    try:
        payload = json.loads(REGISTRY.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        print(f"provenance: cannot read {REGISTRY}: {error}", file=sys.stderr)
        return 1

    if payload.get("schema_version") != 1:
        errors.append("registry schema_version must be 1")

    records = payload.get("assets")
    if not isinstance(records, list):
        print("provenance: registry 'assets' must be a list", file=sys.stderr)
        return 1

    registered: dict[str, dict[str, object]] = {}
    for index, record in enumerate(records):
        label = f"assets[{index}]"
        if not isinstance(record, dict):
            errors.append(f"{label} must be an object")
            continue

        missing = REQUIRED_FIELDS - record.keys()
        if missing:
            errors.append(f"{label} is missing: {', '.join(sorted(missing))}")
            continue

        relative = record["path"]
        if not isinstance(relative, str) or not relative:
            errors.append(f"{label}.path must be a non-empty string")
            continue
        if relative in registered:
            errors.append(f"duplicate asset record: {relative}")
            continue
        registered[relative] = record

        candidate = (ROOT / relative).resolve()
        try:
            candidate.relative_to(ROOT)
        except ValueError:
            errors.append(f"asset path escapes the repository: {relative}")
            continue
        if not candidate.is_file():
            errors.append(f"registered asset does not exist: {relative}")
            continue

        expected = record["sha256"]
        actual = digest(candidate)
        if expected != actual:
            errors.append(f"SHA-256 mismatch for {relative}: expected {expected}, got {actual}")

        status = record["status"]
        if status not in STATUSES:
            errors.append(f"invalid status for {relative}: {status}")
        if status == "approved":
            if record["license"] not in APPROVED_LICENSES:
                errors.append(f"unapproved license for {relative}: {record['license']}")
            for field in ("creator", "copyright", "source"):
                if record[field] in ("UNKNOWN", "NOASSERTION", ""):
                    errors.append(f"approved asset {relative} has unresolved {field}")
            if not record.get("reviewer") or not record.get("review_date"):
                errors.append(f"approved asset {relative} lacks reviewer or review_date")
            if not record.get("editable_source"):
                errors.append(f"approved asset {relative} lacks editable_source")

    discovered = tracked_assets()
    for relative in sorted(discovered - registered.keys()):
        errors.append(f"unregistered asset: {relative}")
    for relative in sorted(registered.keys() - discovered):
        errors.append(f"registry path is outside a managed asset root: {relative}")

    if errors:
        for error in errors:
            print(f"provenance: ERROR: {error}", file=sys.stderr)
        print(f"provenance: failed with {len(errors)} error(s)", file=sys.stderr)
        return 1

    counts = Counter(str(record["status"]) for record in records)
    summary = ", ".join(f"{status}={counts[status]}" for status in sorted(STATUSES))
    print(f"provenance: validated {len(records)} assets ({summary})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

