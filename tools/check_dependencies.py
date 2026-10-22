#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-2.0-or-later

"""Require every npm package in web/package-lock.json to be registered."""

from __future__ import annotations

import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    registry = json.loads((ROOT / "provenance" / "dependencies.json").read_text())
    lock = json.loads((ROOT / "web" / "package-lock.json").read_text())
    accepted = set(registry["accepted_licenses"])
    registered = {(p["name"], p["version"]): p for p in registry["packages"]}
    errors: list[str] = []
    seen = set()

    for path, info in lock["packages"].items():
        if not path:
            continue
        name = path.rsplit("node_modules/", 1)[-1]
        key = (name, info["version"])
        seen.add(key)
        record = registered.get(key)
        if record is None:
            errors.append(f"unregistered npm package {name}@{info['version']}")
            continue
        if record["license"] not in accepted:
            errors.append(f"{name}: license {record['license']} is not accepted")

    for name, version in sorted(set(registered) - seen):
        errors.append(f"registered package not in lockfile: {name}@{version}")

    if errors:
        print("\n".join(f"dependencies: {e}" for e in errors), file=sys.stderr)
        return 1
    print(f"dependencies: validated {len(seen)} npm packages")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
