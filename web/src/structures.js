// SPDX-License-Identifier: GPL-2.0-or-later

// Drawn props for the map: chain-link fences, low walls, relay pylons, the gate console and the
// service-gate barrier. Everything is vector drawing; `p(gx, gy, z)` projects a grid position and
// a height in pixels to the screen.
export const FENCE_SURFACE = "service-fence";
export const WALL_SURFACE = "service-wall";

function polygon(context, points) {
  context.beginPath();
  points.forEach((point, index) => (index === 0 ? context.moveTo(point.x, point.y) : context.lineTo(point.x, point.y)));
  context.closePath();
}

// The run of a one-tile-wide prop: along y when its region is taller than wide, else along x.
function runAxis(tile) {
  return tile.height > tile.width ? "y" : "x";
}

// A point along (a) and across (b) the run, relative to the tile centre.
function onRun(p, tile, a, b, z) {
  return runAxis(tile) === "y" ? p(tile.x + b, tile.y + a, z) : p(tile.x + a, tile.y + b, z);
}

export function drawFenceTile(context, p, tile, cellHeight) {
  const height = cellHeight * 1.05;
  const start = onRun(p, tile, -0.5, 0, 0);
  const end = onRun(p, tile, 0.5, 0, 0);
  const startTop = onRun(p, tile, -0.5, 0, height);
  const endTop = onRun(p, tile, 0.5, 0, height);
  // Translucent mesh with a diamond lattice.
  context.fillStyle = "rgba(150, 190, 205, .13)";
  polygon(context, [start, end, endTop, startTop]);
  context.fill();
  context.strokeStyle = "rgba(170, 200, 212, .42)";
  context.lineWidth = 1;
  context.beginPath();
  const cells = 4;
  for (let index = 0; index <= cells; index += 1) {
    const u = index / cells;
    const lowX = start.x + (end.x - start.x) * u;
    const lowY = start.y + (end.y - start.y) * u;
    const nextU = Math.min(1, u + 1 / cells);
    const highX = start.x + (end.x - start.x) * nextU;
    const highY = startTop.y + (endTop.y - startTop.y) * nextU;
    if (index < cells) {
      context.moveTo(lowX, lowY);
      context.lineTo(highX, highY);
      const backX = start.x + (end.x - start.x) * u;
      const backY = startTop.y + (endTop.y - startTop.y) * u;
      const lowNextY = start.y + (end.y - start.y) * nextU;
      context.moveTo(backX, backY);
      context.lineTo(highX, lowNextY);
    }
  }
  context.stroke();
  // Posts and a glowing top rail.
  context.strokeStyle = "#6f8089";
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(start.x, start.y);
  context.lineTo(startTop.x, startTop.y);
  context.stroke();
  context.strokeStyle = "rgba(66, 214, 208, .8)";
  context.lineWidth = 1.5;
  context.beginPath();
  context.moveTo(startTop.x, startTop.y);
  context.lineTo(endTop.x, endTop.y);
  context.stroke();
}

export function drawWallTile(context, p, tile, cellHeight, color) {
  const height = cellHeight * 0.95;
  const half = 0.2;
  const along = runAxis(tile) === "y";
  const box = along
    ? { x0: tile.x - half, x1: tile.x + half, y0: tile.y - 0.5, y1: tile.y + 0.5 }
    : { x0: tile.x - 0.5, x1: tile.x + 0.5, y0: tile.y - half, y1: tile.y + half };
  const west = p(box.x0, box.y1, 0);
  const south = p(box.x1, box.y1, 0);
  const east = p(box.x1, box.y0, 0);
  const north = p(box.x0, box.y0, 0);
  const lift = (point, z) => ({ x: point.x, y: point.y - z });
  const faces = [
    [west, south, "rgba(255, 255, 255, .0)", 0.16],
    [south, east, "rgba(0, 0, 0, .0)", 0.32],
  ];
  for (const [from, to, , shadow] of faces) {
    context.fillStyle = color;
    polygon(context, [lift(from, height), lift(to, height), lift(to, 0), lift(from, 0)]);
    context.fill();
    context.fillStyle = `rgba(0, 0, 0, ${shadow})`;
    context.fill();
    // Block courses.
    context.strokeStyle = "rgba(0, 0, 0, .35)";
    context.lineWidth = 1;
    context.beginPath();
    for (let course = 1; course < 4; course += 1) {
      const a = lift(from, (height * course) / 4);
      const b = lift(to, (height * course) / 4);
      context.moveTo(a.x, a.y);
      context.lineTo(b.x, b.y);
    }
    context.stroke();
  }
  context.fillStyle = "rgba(190, 205, 215, .55)";
  polygon(context, [north, east, south, west].map((point) => lift(point, height)));
  context.fill();
}

// A relay pylon standing on its pad: plinth, mast, glowing rings and a beacon. Restored relays
// glow green and throw a beam upward; unrestored ones pulse amber.
export function drawRelay(context, p, { x, y }, cellHeight, complete, time) {
  const green = "#79d59b";
  const amber = "#e1b35a";
  const glowColour = complete ? green : amber;
  const lift = (point, z) => ({ x: point.x, y: point.y - z });
  const prism = (cx, cy, half, z0, z1, wallColour, capColour) => {
    const west = p(cx - half, cy + half, 0);
    const south = p(cx + half, cy + half, 0);
    const east = p(cx + half, cy - half, 0);
    const north = p(cx - half, cy - half, 0);
    context.fillStyle = wallColour;
    polygon(context, [lift(west, z1), lift(south, z1), lift(south, z0), lift(west, z0)]);
    context.fill();
    context.fillStyle = "rgba(0, 0, 0, .28)";
    polygon(context, [lift(south, z1), lift(east, z1), lift(east, z0), lift(south, z0)]);
    context.fill();
    context.fillStyle = wallColour;
    polygon(context, [lift(south, z1), lift(east, z1), lift(east, z0), lift(south, z0)]);
    context.globalAlpha = 0.75;
    context.fill();
    context.globalAlpha = 1;
    context.fillStyle = capColour;
    polygon(context, [north, east, south, west].map((point) => lift(point, z1)));
    context.fill();
  };
  // Plinth, then the mast.
  prism(x, y, 0.42, 0, cellHeight * 0.35, "#55636d", "#7d8c96");
  prism(x, y, 0.16, cellHeight * 0.35, cellHeight * 3.1, "#6a7a86", "#9fb0ba");
  const baseCentre = p(x, y, 0);
  const radiusX = cellHeight * 0.55;
  const radiusY = cellHeight * 0.27;
  const pulse = complete ? 1 : 0.55 + 0.45 * Math.sin(time / 260);
  for (const height of [1.2, 1.9, 2.6]) {
    const centre = lift(baseCentre, cellHeight * height);
    context.strokeStyle = glowColour;
    context.globalAlpha = 0.2 * pulse;
    context.lineWidth = 5;
    context.beginPath();
    context.ellipse(centre.x, centre.y, radiusX, radiusY, 0, 0, Math.PI * 2);
    context.stroke();
    context.globalAlpha = 0.9 * pulse;
    context.lineWidth = 1.5;
    context.beginPath();
    context.ellipse(centre.x, centre.y, radiusX, radiusY, 0, 0, Math.PI * 2);
    context.stroke();
  }
  // Beacon at the tip, with a beam once restored.
  const tip = lift(baseCentre, cellHeight * 3.1);
  if (complete) {
    const beam = context.createLinearGradient(0, tip.y, 0, tip.y - cellHeight * 5);
    beam.addColorStop(0, "rgba(121, 213, 155, .45)");
    beam.addColorStop(1, "rgba(121, 213, 155, 0)");
    context.fillStyle = beam;
    context.fillRect(tip.x - 3, tip.y - cellHeight * 5, 6, cellHeight * 5);
  }
  context.globalAlpha = 1;
  const orb = context.createRadialGradient(tip.x, tip.y, 0, tip.x, tip.y, 9);
  orb.addColorStop(0, complete ? "#d8ffe6" : "#fff0c8");
  orb.addColorStop(0.35, glowColour);
  orb.addColorStop(1, "rgba(0, 0, 0, 0)");
  context.globalAlpha = 0.6 + 0.4 * pulse;
  context.fillStyle = orb;
  context.beginPath();
  context.arc(tip.x, tip.y, 9, 0, Math.PI * 2);
  context.fill();
  context.globalAlpha = 1;
}

// The gate control console: a pedestal with a slanted screen that is amber until the gate is open.
export function drawConsole(context, p, { x, y }, cellHeight, complete, time) {
  const lift = (point, z) => ({ x: point.x, y: point.y - z });
  const half = 0.34;
  const west = p(x - half, y + half, 0);
  const south = p(x + half, y + half, 0);
  const east = p(x + half, y - half, 0);
  const north = p(x - half, y - half, 0);
  const height = cellHeight * 1.05;
  context.fillStyle = "#3a464f";
  polygon(context, [lift(west, height), lift(south, height), lift(south, 0), lift(west, 0)]);
  context.fill();
  context.fillStyle = "#2c363d";
  polygon(context, [lift(south, height), lift(east, height), lift(east, 0), lift(south, 0)]);
  context.fill();
  // Slanted screen on top of the south-west face.
  const screenColour = complete ? "#79d59b" : "#e1b35a";
  const flicker = complete ? 1 : 0.7 + 0.3 * Math.sin(time / 190);
  context.fillStyle = "#1a2229";
  const slant = height + cellHeight * 0.35;
  polygon(context, [lift(north, height), lift(east, height), lift(south, slant), lift(west, slant)]);
  context.fill();
  context.globalAlpha = 0.85 * flicker;
  context.fillStyle = screenColour;
  const inset = 0.2;
  const a = p(x - half + inset, y + half - inset, 0);
  const b = p(x + half - inset, y + half - inset, 0);
  const upper = height + cellHeight * 0.3;
  const lower = height + cellHeight * 0.1;
  polygon(context, [lift(a, upper), lift(b, upper), lift(b, lower), lift(a, lower)]);
  context.fill();
  context.globalAlpha = 0.2 * flicker;
  context.lineWidth = 5;
  context.strokeStyle = screenColour;
  context.stroke();
  context.globalAlpha = 1;
}

// The service gate: two posts with a bar of red light that drops away when the gate is open.
export function drawGateTile(context, p, tile, cellHeight, open, time) {
  const along = tile.gateAlong ?? "y";
  const point = (a, z) => (along === "y" ? p(tile.x, tile.y + a, z) : p(tile.x + a, tile.y, z));
  const height = cellHeight * 1.25;
  const first = point(-0.5, 0);
  const last = point(0.5, 0);
  context.strokeStyle = "#8795a0";
  context.lineWidth = 3;
  context.beginPath();
  for (const base of [first, last]) {
    context.moveTo(base.x, base.y);
    context.lineTo(base.x, base.y - height);
  }
  context.stroke();
  const colour = open ? "#79d59b" : "#ff6b62";
  const topFirst = point(-0.5, height);
  const topLast = point(0.5, height);
  if (open) {
    context.setLineDash([4, 5]);
  } else {
    // Closed: horizontal bars of glowing red between the posts.
    for (const fraction of [0.35, 0.65, 0.92]) {
      const a = point(-0.5, height * fraction);
      const b = point(0.5, height * fraction);
      context.strokeStyle = colour;
      context.globalAlpha = 0.25;
      context.lineWidth = 5;
      context.beginPath();
      context.moveTo(a.x, a.y);
      context.lineTo(b.x, b.y);
      context.stroke();
      context.globalAlpha = 0.95;
      context.lineWidth = 1.5;
      context.beginPath();
      context.moveTo(a.x, a.y);
      context.lineTo(b.x, b.y);
      context.stroke();
    }
  }
  context.globalAlpha = 0.7 + 0.3 * Math.sin(time / 300);
  context.strokeStyle = colour;
  context.lineWidth = 1.5;
  context.beginPath();
  context.moveTo(topFirst.x, topFirst.y);
  context.lineTo(topLast.x, topLast.y);
  context.stroke();
  context.setLineDash([]);
  context.globalAlpha = 1;
}

// A box on the ground: the two faces the camera sees, and a lighter cap.
function drawBox(context, p, cx, cy, halfX, halfY, z0, z1, wallColour, capColour) {
  const lift = (point, z) => ({ x: point.x, y: point.y - z });
  const west = p(cx - halfX, cy + halfY, 0);
  const south = p(cx + halfX, cy + halfY, 0);
  const east = p(cx + halfX, cy - halfY, 0);
  const north = p(cx - halfX, cy - halfY, 0);
  context.fillStyle = wallColour;
  polygon(context, [lift(west, z1), lift(south, z1), lift(south, z0), lift(west, z0)]);
  context.fill();
  context.fillStyle = wallColour;
  polygon(context, [lift(south, z1), lift(east, z1), lift(east, z0), lift(south, z0)]);
  context.fill();
  context.fillStyle = "rgba(0, 0, 0, .3)";
  context.fill();
  context.fillStyle = capColour;
  polygon(context, [north, east, south, west].map((point) => lift(point, z1)));
  context.fill();
  return { west, south, east, lift };
}

// The vault server: a tall rack with rows of blinking lights on its face and a screen strip.
// The lights turn steady green once the data has been downloaded.
export function drawServer(context, p, { x, y }, cellHeight, complete, time) {
  const height = cellHeight * 2.3;
  const { west, south, lift } = drawBox(context, p, x, y, 0.46, 0.34, 0, height, "#34414a", "#566570");
  const lights = complete ? ["#79d59b"] : ["#42d6d0", "#e1b35a", "#e86bd6"];
  const rows = 9;
  for (let row = 0; row < rows; row += 1) {
    const z = cellHeight * 0.25 + (row / rows) * (height - cellHeight * 0.7);
    for (let column = 0; column < 4; column += 1) {
      const u = 0.12 + column * 0.2;
      const lit = complete || Math.sin(time / 170 + row * 1.7 + column * 2.3) > -0.2;
      if (!lit) continue;
      const a = {
        x: west.x + (south.x - west.x) * u,
        y: west.y + (south.y - west.y) * u,
      };
      context.fillStyle = lights[(row + column) % lights.length];
      context.globalAlpha = 0.9;
      const point = lift(a, z);
      context.fillRect(point.x - 1.5, point.y - 1, 3, 2);
    }
  }
  context.globalAlpha = 1;
  // A dark screen strip across the top of the face.
  context.fillStyle = "#10181d";
  polygon(context, [
    lift(west, height - cellHeight * 0.35),
    lift(south, height - cellHeight * 0.35),
    lift(south, height - cellHeight * 0.1),
    lift(west, height - cellHeight * 0.1),
  ]);
  context.fill();
  const glow = complete ? "#79d59b" : "#42d6d0";
  const centre = lift({ x: (west.x + south.x) / 2, y: (west.y + south.y) / 2 }, height + cellHeight * 0.25);
  context.globalAlpha = 0.3 + 0.2 * Math.sin(time / 300);
  context.fillStyle = glow;
  context.beginPath();
  context.arc(centre.x, centre.y, 7, 0, Math.PI * 2);
  context.fill();
  context.globalAlpha = 1;
}

// The uplink beacon: a mast with a dish. Rings of signal rise from it, stronger the longer it has
// been held, and it stands steady green with a full beam once the broadcast is done.
export function drawBeacon(context, p, { x, y }, cellHeight, complete, time, progress = 0) {
  const lift = (point, z) => ({ x: point.x, y: point.y - z });
  drawBox(context, p, x, y, 0.5, 0.5, 0, cellHeight * 0.3, "#4d5a64", "#6c7b86");
  drawBox(context, p, x, y, 0.14, 0.14, cellHeight * 0.3, cellHeight * 2.6, "#5b6a75", "#8fa0ab");
  const base = p(x, y, 0);
  const colour = complete ? "121, 213, 155" : "232, 107, 214";
  const strength = complete ? 1 : 0.25 + 0.75 * progress;
  // A dish near the top, tilted skyward.
  const dish = lift(base, cellHeight * 2.4);
  context.fillStyle = "#9fb0ba";
  context.beginPath();
  context.ellipse(dish.x, dish.y, cellHeight * 0.5, cellHeight * 0.22, -0.4, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = `rgba(${colour}, ${0.5 + 0.4 * strength})`;
  context.beginPath();
  context.ellipse(dish.x, dish.y, cellHeight * 0.32, cellHeight * 0.13, -0.4, 0, Math.PI * 2);
  context.fill();
  // Rising signal rings.
  for (let ring = 0; ring < 3; ring += 1) {
    const phase = ((time / 1100 + ring / 3) % 1);
    const centre = lift(base, cellHeight * (2.7 + phase * 2.4));
    context.strokeStyle = `rgba(${colour}, ${(1 - phase) * 0.8 * strength})`;
    context.lineWidth = 1.5;
    context.beginPath();
    context.ellipse(centre.x, centre.y, cellHeight * (0.35 + phase * 0.6), cellHeight * (0.16 + phase * 0.28), 0, 0, Math.PI * 2);
    context.stroke();
  }
  if (complete || progress > 0) {
    const top = lift(base, cellHeight * 2.7);
    const beam = context.createLinearGradient(0, top.y, 0, top.y - cellHeight * 6);
    beam.addColorStop(0, `rgba(${colour}, ${0.45 * strength})`);
    beam.addColorStop(1, `rgba(${colour}, 0)`);
    context.fillStyle = beam;
    context.fillRect(top.x - 3, top.y - cellHeight * 6, 6, cellHeight * 6);
  }
}
