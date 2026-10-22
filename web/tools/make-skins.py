#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-2.0-or-later

"""Recolour the CC0 Kenney suit skin into four plain-clothes operative skins.

White clothing becomes a beige coat, green trim becomes a civic accent colour,
and hair and skin tones vary per operative. Output goes to
art-source/opensynd-skins/. Requires Pillow.
"""

from __future__ import annotations

import colorsys
import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "art-source/kenney-animated-characters-protagonists/Skins/criminalMaleA.png"
OUTPUT = ROOT / "art-source/opensynd-skins"

OPERATIVES = {
    "operative-one": {"coat": (201, 180, 138), "accent": (47, 184, 176), "hair": (34, 22, 20), "skin": 1.00},
    "operative-two": {"coat": (190, 168, 124), "accent": (225, 179, 90), "hair": (96, 52, 30), "skin": 0.78},
    "operative-three": {"coat": (212, 194, 158), "accent": (255, 107, 98), "hair": (20, 18, 18), "skin": 0.62},
    "operative-four": {"coat": (178, 160, 122), "accent": (121, 213, 155), "hair": (120, 118, 116), "skin": 0.90},
}


def classify(r: int, g: int, b: int) -> str:
    hue, saturation, value = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
    if saturation < 0.12 and value > 0.7:
        return "cloth"
    if 0.38 < hue < 0.52 and saturation > 0.5:
        return "accent"
    if 0.02 < hue < 0.09 and saturation > 0.25 and value > 0.6:
        return "skin"
    if value < 0.2 and 0.0 <= hue < 0.1 and saturation > 0.2:
        return "hair"
    return "other"


def recolour(image: Image.Image, look: dict) -> Image.Image:
    out = image.copy()
    pixels = out.load()
    for y in range(out.height):
        for x in range(out.width):
            r, g, b, a = pixels[x, y]
            kind = classify(r, g, b)
            if kind == "cloth":
                shade = (r + g + b) / (3 * 255)
                pixels[x, y] = tuple(int(c * shade) for c in look["coat"]) + (a,)
            elif kind == "accent":
                shade = max(r, g, b) / 160
                pixels[x, y] = tuple(min(255, int(c * shade)) for c in look["accent"]) + (a,)
            elif kind == "skin":
                pixels[x, y] = (int(r * look["skin"]), int(g * look["skin"]), int(b * look["skin"]), a)
            elif kind == "hair":
                shade = max(r, g, b) / 34
                pixels[x, y] = tuple(min(255, int(c * shade)) for c in look["hair"]) + (a,)
    return out


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    source = Image.open(SOURCE).convert("RGBA")
    for name, look in OPERATIVES.items():
        recolour(source, look).save(OUTPUT / f"{name}.png")
        print(f"wrote {name}")
    # Colours for the 3D coat, beret and boots added by render-sprites.mjs.
    looks = {
        name: {
            "coat": look["coat"],
            "beret": [int(c * 0.35) for c in look["accent"]],
            "boots": [38, 36, 31],
        }
        for name, look in OPERATIVES.items()
    }
    (OUTPUT / "looks.json").write_text(json.dumps(looks, indent=2) + "\n")


if __name__ == "__main__":
    main()
