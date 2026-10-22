#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-2.0-or-later

"""Dependency-free style checks for the browser prototype and project tools."""

from __future__ import annotations

import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CHECKED = [
    (ROOT / "web" / "src", {".js", ".html", ".css"}),
    (ROOT / "web" / "test", {".js"}),
    (ROOT / "web" / "e2e", {".mjs"}),
    (ROOT / "web" / "tools", {".mjs", ".html"}),
    (ROOT / "web", {".mjs"}),
    (ROOT / "tools", {".py"}),
]
SPDX = re.compile(r"SPDX-License-Identifier: [A-Za-z0-9.+-]+")
MAX_LINE = 140
SKIPPED_NAMES = {"package-lock.json"}


def files() -> list[Path]:
    found: set[Path] = set()
    for directory, suffixes in CHECKED:
        if not directory.exists():
            continue
        # The web/ entry only covers build scripts at its top level.
        pattern = directory.glob("*") if directory == ROOT / "web" else directory.rglob("*")
        found.update(
            path for path in pattern
            if path.is_file() and path.suffix in suffixes and path.name not in SKIPPED_NAMES
        )
    return sorted(found)


def check(path: Path) -> list[str]:
    errors: list[str] = []
    relative = path.relative_to(ROOT).as_posix()
    text = path.read_text(encoding="utf-8")
    lines = text.split("\n")

    if not SPDX.search("\n".join(lines[:5])):
        errors.append(f"{relative}: missing SPDX-License-Identifier in the first lines")
    if text and not text.endswith("\n"):
        errors.append(f"{relative}: missing final newline")
    if text.endswith("\n\n"):
        errors.append(f"{relative}: extra blank line at end of file")
    for number, line in enumerate(lines, start=1):
        if line != line.rstrip():
            errors.append(f"{relative}:{number}: trailing whitespace")
        if "\t" in line:
            errors.append(f"{relative}:{number}: tab character")
        if len(line) > MAX_LINE and "data:" not in line and "http" not in line:
            errors.append(f"{relative}:{number}: line longer than {MAX_LINE} characters")
        if relative.startswith(("web/src/", "web/test/")) and re.search(r"\bconsole\.log\(", line):
            errors.append(f"{relative}:{number}: leftover console.log")
        if path.suffix in {".js", ".mjs"} and re.search(r"\bdebugger\b", line):
            errors.append(f"{relative}:{number}: leftover debugger statement")
    return errors


def main() -> int:
    errors: list[str] = []
    checked = files()
    for path in checked:
        errors.extend(check(path))
    if errors:
        print("\n".join(f"style: {error}" for error in errors), file=sys.stderr)
        print(f"style: {len(errors)} problem(s) in {len(checked)} files", file=sys.stderr)
        return 1
    print(f"style: checked {len(checked)} files")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
