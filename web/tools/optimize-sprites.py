#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-2.0-or-later

"""Shrink the rendered sprite sheets by reducing them to a 128-colour palette.

The art is flat-shaded, so the palette keeps its look while each sheet drops from
roughly 700 KB to about 120 KB. Run after tools/render-sprites.mjs. Requires Pillow.
Sheets that are already palette images are left alone, so it is safe to re-run.
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image

SPRITES = Path(__file__).resolve().parents[1] / "public" / "assets" / "sprites"
COLOURS = 128


def main() -> None:
    before = after = 0
    for path in sorted(SPRITES.glob("*.png")):
        size = path.stat().st_size
        before += size
        image = Image.open(path)
        if image.mode != "P":
            image = image.convert("RGBA").quantize(
                colors=COLOURS, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE
            )
            image.save(path, optimize=True)
        after += path.stat().st_size
    print(f"sprites: {before // 1024} KiB -> {after // 1024} KiB")


if __name__ == "__main__":
    main()
