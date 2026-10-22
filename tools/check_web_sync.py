#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-2.0-or-later

"""Ensure the self-contained Site source matches canonical open content."""

from __future__ import annotations

import filecmp
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DIRECTORIES = [
    (ROOT / "open-content" / "packs" / "developer", ROOT / "web" / "content"),
]
FILES = [
    (ROOT / "LICENSES" / "CC0-1.0.txt", ROOT / "web" / "LICENSES" / "CC0-1.0.txt"),
    (
        ROOT / "LICENSES" / "GPL-2.0-or-later.txt",
        ROOT / "web" / "LICENSES" / "GPL-2.0-or-later.txt",
    ),
    (ROOT / "LICENSES" / "GPL-3.0.txt", ROOT / "web" / "LICENSES" / "GPL-3.0.txt"),
]


def relative_files(root: Path) -> set[Path]:
    return {path.relative_to(root) for path in root.rglob("*") if path.is_file()}


def main() -> int:
    errors: list[str] = []
    for canonical, site_copy in DIRECTORIES:
        canonical_files = relative_files(canonical)
        site_files = relative_files(site_copy)
        for missing in sorted(canonical_files - site_files):
            errors.append(f"site copy is missing {missing}")
        for extra in sorted(site_files - canonical_files):
            errors.append(f"site copy has unexpected file {extra}")
        for relative in sorted(canonical_files & site_files):
            if not filecmp.cmp(canonical / relative, site_copy / relative, shallow=False):
                errors.append(f"site copy differs from canonical content: {relative}")

    for canonical, site_copy in FILES:
        if not site_copy.is_file() or not filecmp.cmp(canonical, site_copy, shallow=False):
            errors.append(f"site license copy differs: {site_copy.relative_to(ROOT)}")

    if errors:
        for error in errors:
            print(f"web-sync: ERROR: {error}", file=sys.stderr)
        return 1
    print("web-sync: Site content and license copies match canonical files")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
