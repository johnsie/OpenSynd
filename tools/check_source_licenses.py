#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-2.0-or-later

"""Classify source licenses and reject unknown or changed source files."""

from __future__ import annotations

import hashlib
import json
import re
import sys
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
REGISTRY = ROOT / "provenance" / "source-licenses.json"
SOURCE_ROOTS = (
    ROOT / "src",
    ROOT / "tests",
    ROOT / "tools",
    ROOT / "web" / "src",
    ROOT / "web" / "test",
)
SOURCE_SUFFIXES = {
    ".c", ".cc", ".cpp", ".h", ".hpp", ".js", ".jsx", ".m", ".mjs",
    ".py", ".ts", ".tsx",
}
ALLOWED_SPDX = {"GPL-2.0-or-later"}
SPDX_PATTERN = re.compile(r"SPDX-License-Identifier:\s*([^\s*]+)")


def digest(path: Path) -> str:
    checksum = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            checksum.update(chunk)
    return checksum.hexdigest()


def source_files() -> list[Path]:
    files: list[Path] = []
    for source_root in SOURCE_ROOTS:
        if source_root.exists():
            files.extend(
                path
                for path in source_root.rglob("*")
                if path.is_file() and path.suffix.lower() in SOURCE_SUFFIXES
            )
    standalone = ROOT / "web" / "build.mjs"
    if standalone.exists():
        files.append(standalone)
    return sorted(files)


def classify(contents: str) -> tuple[str | None, str | None]:
    spdx = SPDX_PATTERN.search(contents)
    if spdx:
        expression = spdx.group(1)
        if expression not in ALLOWED_SPDX:
            return None, f"unapproved SPDX expression: {expression}"
        return expression, None

    if (
        "Permission is hereby granted, free of charge, to any person or organization"
        in contents
    ):
        return "BSL-1.0", None
    if "Permission is hereby granted, free of charge, to any person obtaining a copy" in contents:
        return "MIT", None
    if "either version 2 of the" in contents and re.search(
        r"GNU\s+General Public License", contents
    ):
        return "GPL-2.0-or-later", None
    return None, "no recognized license notice"


def main() -> int:
    errors: list[str] = []
    try:
        payload = json.loads(REGISTRY.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        print(f"source-licenses: cannot read {REGISTRY}: {error}", file=sys.stderr)
        return 1

    if payload.get("schema_version") != 1:
        errors.append("registry schema_version must be 1")

    unresolved_records = payload.get("unresolved")
    if not isinstance(unresolved_records, list):
        print("source-licenses: registry 'unresolved' must be a list", file=sys.stderr)
        return 1

    unresolved: dict[str, dict[str, str]] = {}
    for index, record in enumerate(unresolved_records):
        if not isinstance(record, dict):
            errors.append(f"unresolved[{index}] must be an object")
            continue
        missing = {"path", "sha256", "classification", "notes"} - record.keys()
        if missing:
            errors.append(
                f"unresolved[{index}] is missing: {', '.join(sorted(missing))}"
            )
            continue
        relative = record["path"]
        if relative in unresolved:
            errors.append(f"duplicate unresolved source record: {relative}")
            continue
        unresolved[relative] = record

    counts: Counter[str] = Counter()
    discovered: set[str] = set()
    for source in source_files():
        relative = source.relative_to(ROOT).as_posix()
        discovered.add(relative)
        record = unresolved.get(relative)
        if record is not None:
            actual = digest(source)
            if actual != record["sha256"]:
                errors.append(
                    f"unresolved source changed: {relative}; review and update its classification"
                )
            counts["UNRESOLVED"] += 1
            continue

        try:
            contents = source.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError) as error:
            errors.append(f"cannot inspect {relative}: {error}")
            continue

        license_id, error = classify(contents)
        if error is not None:
            errors.append(f"{relative}: {error}")
        else:
            counts[str(license_id)] += 1

    for relative in sorted(unresolved.keys() - discovered):
        errors.append(f"unresolved source record does not exist: {relative}")

    if errors:
        for error in errors:
            print(f"source-licenses: ERROR: {error}", file=sys.stderr)
        print(f"source-licenses: failed with {len(errors)} error(s)", file=sys.stderr)
        return 1

    summary = ", ".join(f"{name}={counts[name]}" for name in sorted(counts))
    print(f"source-licenses: classified {sum(counts.values())} files ({summary})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
