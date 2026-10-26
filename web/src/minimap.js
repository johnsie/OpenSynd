// SPDX-License-Identifier: GPL-2.0-or-later

// How a person or vehicle looks on the minimap. Bystanders are tiny white dots; the people who matter are larger dots: police blue,
// enemy agents red, guards white with a black centre. The squad, its followers, criminals and vehicles keep their squares.
export const BIG_DOT = 2.5;
export const TINY_DOT = 1;

const SQUARE_COLOURS = { team: "#42d6d0", criminal: "#ff9a4a", vehicle: "#b0bcc6" };

/** { shape: "dot", radius, fill, centre? } or { shape: "square", size, fill } for the unit. */
export function markerFor(unit, vehicle = false) {
  if (unit.persuaded) return { shape: "square", size: 3, fill: "#79d59b" };
  if (vehicle) return { shape: "square", size: 5, fill: SQUARE_COLOURS.vehicle };
  switch (unit.definition?.role) {
    case "civilian":
      return { shape: "dot", radius: TINY_DOT, fill: "#ffffff" };
    case "police":
      return { shape: "dot", radius: BIG_DOT, fill: "#4aa3ff" };
    case "enemy-agent":
      return { shape: "dot", radius: BIG_DOT, fill: "#ff3b30" };
    case "guard":
      return { shape: "dot", radius: BIG_DOT, fill: "#ffffff", centre: "#000000" };
    default:
      return { shape: "square", size: 3, fill: SQUARE_COLOURS[unit.side] ?? "#ff6b62" };
  }
}
