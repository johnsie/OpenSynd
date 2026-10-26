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
  } else if (surface === "lawn" || surface === "mud" || surface === "scrub") {
    // Grass (or trampled earth): fine speckle and short blades, the odd darker tuft.
    const grain = {
      lawn: ["170, 230, 140", "0, 10, 0"],
      scrub: ["255, 215, 120", "40, 20, 0"],
      mud: ["200, 180, 130", "0, 10, 0"],
    }[surface];
    speckle(context, random, width, height, count * (surface === "scrub" ? 2 : 1.3), grain[0], grain[1]);
    for (let blade = 0; blade < count / 3; blade += 1) {
      const point = corner(width, height, random(), random());
      context.strokeStyle = random() < 0.5 ? "rgba(200, 255, 170, .14)" : "rgba(0, 20, 0, .22)";
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(point.x, point.y);
      context.lineTo(point.x + (random() - 0.5) * 2, point.y - 2 - random() * 2);
      context.stroke();
    }
    if (surface === "mud" && kind === 2) {
      context.fillStyle = "rgba(20, 40, 50, .3)";
      const puddle = corner(width, height, 0.5, 0.5);
      context.beginPath();
      context.ellipse(puddle.x, puddle.y, width * 0.16, height * 0.13, 0, 0, Math.PI * 2);
      context.fill();
    }
  } else if (surface === "sand") {
    // Dunes in miniature: wind ripples across the tile and a scatter of grains.
    speckle(context, random, width, height, count * 1.1, "255, 240, 200", "60, 40, 10");
    for (let ripple = 0; ripple < 3; ripple += 1) {
      const v = (ripple + 0.5) / 3 + (random() - 0.5) * 0.1;
      stroke(context, width, height, [[0.05, v], [0.3, v - 0.05], [0.6, v + 0.04], [0.95, v - 0.02]], "rgba(70, 50, 20, .16)");
    }
  } else if (surface === "snow") {
    speckle(context, random, width, height, count * 0.9, "255, 255, 255", "90, 120, 150");
    if (kind === 2) stroke(context, width, height, [[0.2, 0.65], [0.45, 0.55], [0.75, 0.62]], "rgba(90, 120, 150, .22)");
    if (kind === 3) {
      context.fillStyle = "rgba(255, 255, 255, .25)";
      const drift = corner(width, height, 0.45, 0.5);
      context.beginPath();
      context.ellipse(drift.x, drift.y, width * 0.2, height * 0.1, 0, 0, Math.PI * 2);
      context.fill();
    }
  } else if (surface === "gravel") {
    speckle(context, random, width, height, count * 2.2, "225, 225, 215", "0, 0, 0");
    for (let stone = 0; stone < count / 5; stone += 1) {
      const point = corner(width, height, random(), random());
      context.fillStyle = random() < 0.5 ? "rgba(255, 255, 255, .12)" : "rgba(0, 0, 0, .2)";
      context.fillRect(point.x, point.y, 2, 2);
    }
  } else if (surface === "chevron") {
    // Hazard-striped paving in front of an entrance: rows of dark chevrons across the tile.
    speckle(context, random, width, height, count / 2, "255, 230, 170", "0, 0, 0");
    for (let row = 0; row < 4; row += 1) {
      const at = row / 4;
      stroke(context, width, height, [[0, at + 0.02], [0.5, at + 0.2], [1, at + 0.02]], "rgba(25, 14, 0, .8)", 4);
    }
  } else if (surface === "rooftop") {
    // A flat roof of dark tiles with a joint between them, a grid of lighter seams and the odd stain.
    speckle(context, random, width, height, count / 2, "190, 200, 190", "0, 0, 0");
    for (const at of [0.25, 0.5, 0.75]) {
      stroke(context, width, height, [[at, 0.04], [at, 0.96]], "rgba(0, 0, 0, .45)", 1.4);
      stroke(context, width, height, [[0.04, at], [0.96, at]], "rgba(0, 0, 0, .45)", 1.4);
    }
    stroke(context, width, height, [[0.02, 0.02], [0.98, 0.02], [0.98, 0.98], [0.02, 0.98], [0.02, 0.02]], "rgba(255, 255, 255, .08)");
  } else if (surface === "plaza" || surface === "kerb") {
    // Cobbles or paving stones laid in staggered courses.
    speckle(context, random, width, height, count / 2, "230, 220, 200", "0, 0, 0");
    for (const v of [0.33, 0.66]) stroke(context, width, height, [[0.02, v], [0.98, v]], "rgba(0, 0, 0, .22)");
    for (const [row, joints] of [[0, [0.3, 0.7]], [1, [0.5]], [2, [0.2, 0.8]]]) {
      for (const u of joints) stroke(context, width, height, [[u, row / 3], [u, (row + 1) / 3]], "rgba(0, 0, 0, .22)");
    }
  } else if (surface === "dock") {
    // Planks along the tile's x axis, each a slightly different shade, with nail heads at the ends.
    for (let plank = 0; plank < 5; plank += 1) {
      const v0 = plank / 5;
      const tint = random() < 0.5 ? "255, 235, 200" : "0, 0, 0";
      stroke(context, width, height, [[0, v0 + 0.1], [1, v0 + 0.1]], `rgba(${tint}, ${0.05 + random() * 0.08})`, 3);
      stroke(context, width, height, [[0, v0], [1, v0]], "rgba(0, 0, 0, .35)", 1);
    }
    speckle(context, random, width, height, count / 3, "255, 230, 190", "0, 0, 0");
  } else if (surface === "steps-x" || surface === "steps-y") {
    // Stone steps: treads across the way up (steps-x climbs along the map's x axis), a lit front edge to each and a shadow under it.
    const across = surface === "steps-x";
    speckle(context, random, width, height, count / 2, "230, 225, 210", "0, 0, 0");
    for (let tread = 0; tread < 4; tread += 1) {
      const at = (tread + 0.5) / 4;
      const line = across ? [[at, 0], [at, 1]] : [[0, at], [1, at]];
      stroke(context, width, height, line, "rgba(0, 0, 0, .38)", 1.6);
      const lit = across ? [[at - 0.06, 0.02], [at - 0.06, 0.98]] : [[0.02, at - 0.06], [0.98, at - 0.06]];
      stroke(context, width, height, lit, "rgba(255, 250, 235, .22)", 1);
    }
  } else if (surface === "rail") {
    // Ballast with a sleeper every quarter tile and two steel rails along the track (which runs along the map's x axis).
    speckle(context, random, width, height, count * 1.2, "190, 190, 185", "0, 0, 0");
    for (let sleeper = 0; sleeper < 4; sleeper += 1) {
      stroke(context, width, height, [[(sleeper + 0.5) / 4, 0.12], [(sleeper + 0.5) / 4, 0.88]], "rgba(60, 44, 30, .85)", 2.5);
    }
    for (const side of [0.32, 0.68]) {
      stroke(context, width, height, [[0, side], [1, side]], "rgba(0, 0, 0, .55)", 3);
      stroke(context, width, height, [[0, side], [1, side]], "rgba(190, 200, 208, .85)", 1.4);
    }
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
