// SPDX-License-Identifier: GPL-2.0-or-later

import { hashString, seededRandom } from "./buildings.js";

// Procedural textures: ground tiles are painted once per zoom size into small sprites and
// reused, and walls and roofs get a repeating overlay. Nothing here is an image asset.

// Ground that is drawn as a flat tile sprite rather than a plain colour.
const SLAB_SURFACES = new Set(["service-concrete", "service-fence", "service-wall"]);

function lighten(hex, amount) {
  const value = Number.parseInt(hex.slice(1), 16);
  const clamp = (part) => Math.max(0, Math.min(255, part));
  return `rgb(${clamp((value >> 16) + amount)}, ${clamp(((value >> 8) & 255) + amount)}, ${clamp((value & 255) + amount)})`;
}

function diamondPath(context, width, height, grow) {
  context.beginPath();
  context.moveTo(width / 2, -grow);
  context.lineTo(width + grow, height / 2);
  context.lineTo(width / 2, height + grow);
  context.lineTo(-grow, height / 2);
  context.closePath();
}

// Where a point (u, v) in [0, 1] of the tile square lands inside its diamond sprite.
const corner = (width, height, u, v) => ({ x: (width / 2) * (1 + u - v), y: (height / 2) * (u + v) });

function speckle(context, random, width, height, count, light, dark) {
  for (let index = 0; index < count; index += 1) {
    const point = corner(width, height, random(), random());
    const bright = random() < 0.5;
    context.fillStyle = bright ? `rgba(${light}, ${0.04 + random() * 0.08})` : `rgba(${dark}, ${0.08 + random() * 0.14})`;
    const size = random() < 0.2 ? 2 : 1;
    context.fillRect(point.x, point.y, size, size);
  }
}

function stroke(context, width, height, points, colour, lineWidth = 1) {
  context.strokeStyle = colour;
  context.lineWidth = lineWidth;
  context.beginPath();
  points.forEach(([u, v], index) => {
    const point = corner(width, height, u, v);
    if (index === 0) context.moveTo(point.x, point.y);
    else context.lineTo(point.x, point.y);
  });
  context.stroke();
}

// Flags: bit 0 = slab seam on the tile's north-west edge, bit 1 = on its north-east edge.
function paintTile(context, surface, colour, variant, width, height) {
  const random = seededRandom(hashString(`${surface}:${colour}:${variant}`));
  const seams = variant & 3;
  const kind = variant >> 2;
  diamondPath(context, width, height, 1);
  context.fillStyle = lighten(colour, (kind - 1.5) * 2);
  context.fill();
  context.save();
  diamondPath(context, width, height, 1);
  context.clip();
  const count = Math.round((width * height) / 14);

  if (surface === "street") {
    speckle(context, random, width, height, count * 1.4, "200, 215, 225", "0, 0, 0");
    if (kind === 2) {
      // A darker resurfaced patch.
      stroke(context, width, height, [[0.2, 0.25], [0.8, 0.25], [0.8, 0.7], [0.2, 0.7], [0.2, 0.25]], "rgba(0, 0, 0, .22)");
    }
    if (kind === 3) stroke(context, width, height, [[0.1, 0.6], [0.35, 0.5], [0.5, 0.58], [0.8, 0.4]], "rgba(0, 0, 0, .35)");
  } else if (surface === "runoff-channel") {
    for (let line = 0; line < 4; line += 1) {
      const v = (line + 0.5) / 4 + (random() - 0.5) * 0.1;
      const u0 = random() * 0.4;
      stroke(context, width, height, [[u0, v], [u0 + 0.3, v - 0.04], [u0 + 0.5, v + 0.03]], "rgba(120, 210, 230, .3)");
    }
    speckle(context, random, width, height, count / 2, "160, 230, 245", "0, 20, 30");
  } else if (surface === "signal-grate") {
    for (let line = 1; line < 4; line += 1) {
      stroke(context, width, height, [[line / 4, 0], [line / 4, 1]], "rgba(0, 0, 0, .55)", 1.5);
      stroke(context, width, height, [[0, line / 4], [1, line / 4]], "rgba(0, 0, 0, .55)", 1.5);
    }
    stroke(context, width, height, [[0.04, 0.04], [0.96, 0.04], [0.96, 0.96], [0.04, 0.96], [0.04, 0.04]], "rgba(190, 220, 230, .35)");
  } else if (surface === "relay-pad") {
    // Hazard-striped border around a dark plate.
    context.fillStyle = "rgba(0, 0, 0, .35)";
    diamondPath(context, width * 0.7, height * 0.7, 0);
    context.save();
    context.translate(width * 0.15, height * 0.15);
    context.fill();
    context.restore();
    context.strokeStyle = "rgba(225, 179, 90, .5)";
    context.lineWidth = 2;
    for (let stripe = 0; stripe < 8; stripe += 1) {
      const a = corner(width, height, stripe / 8, 0);
      const b = corner(width, height, stripe / 8 + 0.06, 0.12);
      context.beginPath();
      context.moveTo(a.x, a.y);
      context.lineTo(b.x, b.y);
      context.stroke();
    }
    speckle(context, random, width, height, count / 2, "255, 230, 170", "0, 0, 0");
  } else {
    // Concrete paving: coarse speckle, a joint round every slab, the odd crack or stain.
    speckle(context, random, width, height, count / 2, "210, 225, 235", "0, 0, 0");
    stroke(context, width, height, [[0.5, 0.06], [0.5, 0.94]], "rgba(0, 0, 0, .1)");
    stroke(context, width, height, [[0.06, 0.5], [0.94, 0.5]], "rgba(0, 0, 0, .1)");
    if (kind === 2) stroke(context, width, height, [[0.15, 0.7], [0.35, 0.55], [0.45, 0.62], [0.7, 0.3]], "rgba(0, 0, 0, .3)");
    if (kind === 3) {
      context.fillStyle = "rgba(0, 0, 0, .08)";
      const centre = corner(width, height, 0.55, 0.45);
      context.beginPath();
      context.ellipse(centre.x, centre.y, width * 0.12, height * 0.12, 0, 0, Math.PI * 2);
      context.fill();
    }
  }
  if (seams & 1) stroke(context, width, height, [[0, 0], [0, 1]], "rgba(0, 0, 0, .4)", 1.5);
  if (seams & 2) stroke(context, width, height, [[0, 0], [1, 0]], "rgba(0, 0, 0, .4)", 1.5);
  if (seams & 1) stroke(context, width, height, [[0.03, 0.03], [0.03, 0.97]], "rgba(255, 255, 255, .06)");
  if (seams & 2) stroke(context, width, height, [[0.03, 0.03], [0.97, 0.03]], "rgba(255, 255, 255, .06)");
  context.restore();
}

export function createTileSprites(createCanvas) {
  const cache = new Map();
  let cachedWidth = 0;
  return function sprite(tile, width, height) {
    const w = Math.round(width);
    const h = Math.round(height);
    if (w !== cachedWidth) {
      cache.clear();
      cachedWidth = w;
    }
    const surface = SLAB_SURFACES.has(tile.surface) ? "service-concrete" : tile.surface;
    const slab = surface === "service-concrete" || surface === "relay-pad";
    // Pavement is laid in single-tile slabs, so every tile gets both joints; roads have none.
    const seams = slab ? 3 : 0;
    const kind = (tile.x * 7 + tile.y * 13 + (tile.x ^ tile.y)) & 3;
    const pavement = SLAB_SURFACES.has(tile.surface) || tile.color === "#293138";
    const colour = surface === "street" ? "#1c2227" : pavement ? "#3b464f" : tile.color;
    const variant = seams | (kind << 2);
    const key = `${surface}|${colour}|${variant}`;
    let image = cache.get(key);
    if (!image) {
      image = createCanvas(w + 2, h + 2);
      const context = image.getContext("2d");
      context.translate(1, 1);
      paintTile(context, surface, colour, variant, w, h);
      cache.set(key, image);
    }
    return { image, offsetX: -(w / 2) - 1, offsetY: -(h / 2) - 1 };
  };
}

// A repeating, mostly transparent overlay for building walls (panel seams, grime) or roofs
// (gravel). 64 px square so it can be mapped onto a wall or roof with one transform.
export function createOverlay(createCanvas, kind) {
  const image = createCanvas(64, 64);
  const context = image.getContext("2d");
  const random = seededRandom(hashString(`overlay:${kind}`));
  for (let index = 0; index < 420; index += 1) {
    const bright = random() < (kind === "roof" ? 0.45 : 0.3);
    context.fillStyle = bright ? `rgba(220, 235, 245, ${0.03 + random() * 0.07})` : `rgba(0, 0, 0, ${0.06 + random() * 0.12})`;
    context.fillRect(Math.floor(random() * 64), Math.floor(random() * 64), kind === "roof" ? 2 : 1, kind === "roof" ? 2 : 1);
  }
  context.lineWidth = 1;
  context.strokeStyle = "rgba(0, 0, 0, .28)";
  context.beginPath();
  if (kind === "wall") {
    // Cladding panels: a seam each 32 px across and a staggered one down.
    context.moveTo(0.5, 0);
    context.lineTo(0.5, 64);
    context.moveTo(32.5, 0);
    context.lineTo(32.5, 64);
    context.moveTo(0, 0.5);
    context.lineTo(64, 0.5);
    context.moveTo(0, 32.5);
    context.lineTo(64, 32.5);
    context.stroke();
    // Rain streaks down from the seams.
    for (let streak = 0; streak < 5; streak += 1) {
      const x = Math.floor(random() * 64);
      const gradient = context.createLinearGradient(0, 0, 0, 64);
      gradient.addColorStop(0, "rgba(0, 0, 0, .0)");
      gradient.addColorStop(1, "rgba(0, 0, 0, .16)");
      context.fillStyle = gradient;
      context.fillRect(x, 0, 2, 64);
    }
  } else {
    context.moveTo(0.5, 0);
    context.lineTo(0.5, 64);
    context.moveTo(0, 0.5);
    context.lineTo(64, 0.5);
    context.stroke();
  }
  return image;
}
