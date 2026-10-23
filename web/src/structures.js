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
// `open` may be a number from 0 (shut) to 1 (open) while a door is sliding.
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
  // `open` is true or false, or how far a door has slid open (0 shut to 1 open): the bars rise and bunch at the top.
  const amount = typeof open === "number" ? open : open ? 1 : 0;
  const colour = amount >= 0.5 ? "#79d59b" : "#ff6b62";
  const topFirst = point(-0.5, height);
  const topLast = point(0.5, height);
  if (amount >= 1) {
    context.setLineDash([4, 5]);
  } else {
    // Closed: horizontal bars of glowing red between the posts.
    for (const fraction of [0.35, 0.65, 0.92]) {
      const lifted = 1 - (1 - fraction) * (1 - amount);
      const a = point(-0.5, height * lifted);
      const b = point(0.5, height * lifted);
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

// A road vehicle: a curved hovering body, a glass canopy, head and tail lights, and what makes its kind its own
// (a flashing light bar on a patrol car, a red cross on an ambulance, heavy plating on an armored car). It lies
// along the way it is heading (snapped to a grid axis). Destroyed, it is a charred wreck that burns for a while.
const VEHICLE_SHAPES = Object.freeze({
  "city-car": { length: 2.1, width: 0.95, body: 0.5, cabin: 0.42, cabinInset: 0.5 },
  "patrol-car": { length: 2.2, width: 1.0, body: 0.5, cabin: 0.42, cabinInset: 0.5 },
  "armored-car": { length: 2.5, width: 1.15, body: 0.78, cabin: 0.5, cabinInset: 0.35 },
  ambulance: { length: 2.4, width: 1.05, body: 0.62, cabin: 0.55, cabinInset: 0.3 },
  "fire-engine": { length: 3.0, width: 1.1, body: 0.7, cabin: 0.5, cabinInset: 0.6 },
  "small-armored": { length: 2.2, width: 1.05, body: 0.68, cabin: 0.45, cabinInset: 0.4 },
});

// Cars are drawn a little smaller than their shape tables say, to sit better beside the people (FreeSynd's are one tile long).
const CAR_SCALE = 0.88;

function shadeHex(hex, amount) {
  const value = Number.parseInt(hex.slice(1), 16);
  const clamp = (part) => Math.max(0, Math.min(255, part));
  return `rgb(${clamp((value >> 16) + amount)}, ${clamp(((value >> 8) & 255) + amount)}, ${clamp((value & 255) + amount)})`;
}

export function drawVehicle(context, p, vehicle, cellHeight, time, { controlled = false } = {}) {
  const base = VEHICLE_SHAPES[vehicle.definition.kind] ?? VEHICLE_SHAPES["city-car"];
  const shape = {
    ...base,
    length: base.length * CAR_SCALE,
    width: base.width * CAR_SCALE,
    body: base.body * CAR_SCALE,
    cabin: base.cabin * CAR_SCALE,
  };
  const state = vehicle.vehicle;
  const wrecked = vehicle.disabled;
  const alongX = Math.abs(state.heading.x) >= Math.abs(state.heading.y);
  const halfX = (alongX ? shape.length : shape.width) / 2;
  const halfY = (alongX ? shape.width : shape.length) / 2;
  const { x, y } = vehicle.position;
  const { primaryColor, accentColor } = vehicle.definition.appearance;
  const bodyColour = wrecked ? "#26282b" : primaryColor;
  const lift = (point, z) => ({ x: point.x, y: point.y - z });
  const ground = p(x, y, 0);
  // A soft shadow and, when the squad is inside, a cyan ring.
  context.fillStyle = "rgba(0, 0, 0, .35)";
  context.beginPath();
  context.ellipse(ground.x, ground.y + 2, halfX * 40 + halfY * 28, (halfX + halfY) * 12, 0, 0, Math.PI * 2);
  context.fill();
  if (controlled) {
    context.strokeStyle = "rgba(66, 214, 208, .9)";
    context.lineWidth = 2;
    context.beginPath();
    context.ellipse(ground.x, ground.y + 2, (halfX + halfY) * 30, (halfX + halfY) * 14, 0, 0, Math.PI * 2);
    context.stroke();
  }

  // Hovering, streamlined and curved: the body is a rounded, tapering pill rising to a glass canopy, riding on a glow.
  const hover = wrecked ? 0.04 : 0.16 + 0.015 * Math.sin(time / 380 + x * 3);
  const wheelHeight = cellHeight * hover; // the height of the underside, which the markings below measure from
  const bodyTop = wheelHeight + cellHeight * shape.body;
  const front = alongX ? Math.sign(state.heading.x || 1) : Math.sign(state.heading.y || 1);
  // A ring of points around the body at `scale` of its size, from `shiftA` along its length (+1 is the nose).
  const ring = (scaleA, scaleB, shiftA = 0) => {
    const points = [];
    for (let step = 0; step < 32; step += 1) {
      const angle = (step / 32) * Math.PI * 2;
      const c = Math.cos(angle);
      const sn = Math.sin(angle);
      const a = Math.sign(c) * Math.abs(c) ** 0.62; // a squarish oval: long flat sides, round ends
      let b = Math.sign(sn) * Math.abs(sn) ** 0.62;
      b *= 1 - 0.34 * Math.max(0, a) ** 1.6 - 0.08 * Math.max(0, -a); // narrower at the nose
      const along = a * scaleA + shiftA;
      const across = b * scaleB;
      points.push({ x: x + (alongX ? along * front : across) * halfX, y: y + (alongX ? across : along * front) * halfY });
    }
    return points;
  };
  const tint = (colour, amount) => (colour.startsWith("#") ? shadeHex(colour, amount) : colour);
  // A rounded band between two rings, drawn on the sides the camera sees (lit more on the south-west side).
  const band = (low, lowZ, high, highZ, colour, glassy = false) => {
    for (let index = 0; index < low.length; index += 1) {
      const next = (index + 1) % low.length;
      const dx = low[next].x - low[index].x;
      const dy = low[next].y - low[index].y;
      // The outward normal of this slice (rings run clockwise on the ground).
      const normal = { x: dy, y: -dx };
      if (normal.x + normal.y <= 0) continue;
      const facing = (normal.y - normal.x) / (Math.hypot(normal.x, normal.y) || 1);
      context.fillStyle = tint(colour, Math.round(facing * (glassy ? 14 : 26)));
      polygon(context, [lift(p(high[index].x, high[index].y, 0), highZ), lift(p(high[next].x, high[next].y, 0), highZ),
        lift(p(low[next].x, low[next].y, 0), lowZ), lift(p(low[index].x, low[index].y, 0), lowZ)]);
      context.fill();
    }
  };
  const cap = (points, z, colour) => {
    context.fillStyle = colour;
    polygon(context, points.map((point) => lift(p(point.x, point.y, 0), z)));
    context.fill();
  };
  if (!wrecked) {
    // The glow under the hull: the vehicle floats on it.
    context.fillStyle = accentColor;
    context.globalAlpha = 0.28 + 0.1 * Math.sin(time / 300 + x);
    polygon(context, ring(1.08, 1.12).map((point) => lift(p(point.x, point.y, 0), 1)));
    context.fill();
    context.globalAlpha = 1;
  }
  const hullLow = ring(0.96, 0.86);
  const hullMid = ring(1, 1);
  const hullTop = ring(0.93, 0.82);
  const midZ = wheelHeight + cellHeight * shape.body * 0.55;
  band(hullLow, wheelHeight, hullMid, midZ, shadeHex(bodyColour, -14));
  band(hullMid, midZ, hullTop, bodyTop, bodyColour);
  cap(hullTop, bodyTop, shadeHex(bodyColour, 22));
  // The two ground points the markings below run between (the middle of the two visible sides).
  const west = p(x - halfX * 0.78, y + halfY, 0);
  const south = p(x + halfX * 0.78, y + halfY, 0);
  const up = lift;
  let cabinTop = bodyTop;

  if (!wrecked) {
    // A glass canopy set back from the nose, curving up from the roof line; a streak of light along it.
    const canopyShift = -0.12 * shape.cabinInset * 2;
    cabinTop = bodyTop + cellHeight * shape.cabin;
    const canopyBase = ring(0.66 * (1 - shape.cabinInset * 0.2), 0.7, canopyShift);
    const canopyTop = ring(0.4 * (1 - shape.cabinInset * 0.2), 0.42, canopyShift - 0.08);
    band(canopyBase, bodyTop, canopyTop, cabinTop, "#17303f", true);
    cap(canopyTop, cabinTop, "#2b5266");
    context.strokeStyle = "rgba(190, 240, 255, .5)";
    context.lineWidth = 1.2;
    const glint = canopyTop.filter((_, index) => index % 4 === 0).slice(2, 5);
    context.beginPath();
    glint.forEach((point, index) => {
      const at = lift(p(point.x, point.y, 0), cabinTop);
      if (index === 0) context.moveTo(at.x, at.y);
      else context.lineTo(at.x, at.y);
    });
    context.stroke();

    // Head and tail lights at the two ends.
    const end = (sign) => (alongX ? [x + sign * halfX * 0.97, y] : [x, y + sign * halfY * 0.97]);
    for (const [sign, colour] of [[front, "#ffeeb0"], [-front, "#ff4d5e"]]) {
      const [ex, ey] = end(sign);
      for (const side of [-0.4, 0.4]) {
        const at = p(alongX ? ex : ex + side * halfX, alongX ? ey + side * halfY : ey, wheelHeight + cellHeight * shape.body * 0.6);
        context.fillStyle = colour;
        context.globalAlpha = 0.9;
        context.beginPath();
        context.arc(at.x, at.y, 2.2, 0, Math.PI * 2);
        context.fill();
        context.globalAlpha = 1;
      }
    }
    // What makes each kind its own.
    const roof = lift(p(x, y, 0), cabinTop);
    if (vehicle.definition.kind === "patrol-car") {
      const flip = Math.floor(time / 220) % 2 === 0;
      for (const [offset, colour, on] of [[-0.35, "#ff3b4a", flip], [0.35, "#4a8dff", !flip]]) {
        const at = p(alongX ? x : x + offset * halfX, alongX ? y + offset * halfY : y, cabinTop + cellHeight * 0.08);
        context.fillStyle = colour;
        context.globalAlpha = on ? 1 : 0.35;
        context.fillRect(at.x - 5, at.y - 3, 10, 5);
        if (on) {
          context.globalAlpha = 0.25;
          context.beginPath();
          context.arc(at.x, at.y, 14, 0, Math.PI * 2);
          context.fill();
        }
        context.globalAlpha = 1;
      }
      context.fillStyle = shadeHex(accentColor, 0);
      const stripeTop = bodyTop - cellHeight * 0.08;
      const stripeBottom = bodyTop - cellHeight * 0.16;
      polygon(context, [up(west, stripeTop), up(south, stripeTop), up(south, stripeBottom), up(west, stripeBottom)]);
      context.fill();
    } else if (vehicle.definition.kind === "ambulance") {
      context.fillStyle = accentColor;
      const mid = { x: (west.x + south.x) / 2, y: (west.y + south.y) / 2 };
      const centre = up(mid, wheelHeight + cellHeight * shape.body * 0.55);
      context.fillRect(centre.x - 6, centre.y - 2, 12, 4);
      context.fillRect(centre.x - 2, centre.y - 6, 4, 12);
      const on = Math.floor(time / 300) % 2 === 0;
      context.fillStyle = on ? "#ff4d5e" : "#7a2530";
      context.fillRect(roof.x - 6, roof.y - 3, 12, 4);
    } else if (vehicle.definition.kind === "fire-engine") {
      // A ladder along the roof and a flashing light.
      context.strokeStyle = accentColor;
      context.lineWidth = 2;
      const [ladderA, ladderB] = alongX
        ? [p(x - halfX * 0.55, y - 0.12, bodyTop + 3), p(x + halfX * 0.3, y - 0.12, bodyTop + 3)]
        : [p(x - 0.12, y - halfY * 0.55, bodyTop + 3), p(x - 0.12, y + halfY * 0.3, bodyTop + 3)];
      context.beginPath();
      context.moveTo(ladderA.x, ladderA.y);
      context.lineTo(ladderB.x, ladderB.y);
      context.moveTo(ladderA.x + 4, ladderA.y + 2);
      context.lineTo(ladderB.x + 4, ladderB.y + 2);
      context.stroke();
      const on = Math.floor(time / 260) % 2 === 0;
      context.fillStyle = on ? "#ffd24d" : "#7a6a24";
      context.fillRect(roof.x - 6, roof.y - 3, 12, 4);
    } else if (vehicle.definition.kind === "armored-car" || vehicle.definition.kind === "small-armored") {
      context.strokeStyle = accentColor;
      context.lineWidth = 1.5;
      context.beginPath();
      for (const z of [0.3, 0.62]) {
        const a = up(west, wheelHeight + cellHeight * shape.body * z);
        const b = up(south, wheelHeight + cellHeight * shape.body * z);
        context.moveTo(a.x, a.y);
        context.lineTo(b.x, b.y);
      }
      context.stroke();
    } else {
      context.strokeStyle = accentColor;
      context.globalAlpha = 0.8;
      context.lineWidth = 1.5;
      const a = up(west, wheelHeight + cellHeight * shape.body * 0.35);
      const b = up(south, wheelHeight + cellHeight * shape.body * 0.35);
      context.beginPath();
      context.moveTo(a.x, a.y);
      context.lineTo(b.x, b.y);
      context.stroke();
      context.globalAlpha = 1;
    }
  } else if (state.wreckLeft > 0) {
    // Flames and smoke while the wreck burns.
    const top = lift(ground, bodyTop);
    for (let flame = 0; flame < 5; flame += 1) {
      const phase = (time / 420 + flame * 0.37) % 1;
      const spread = (flame - 2) * 6;
      context.fillStyle = `rgba(255, ${Math.round(150 - phase * 90)}, 40, ${0.85 * (1 - phase)})`;
      context.beginPath();
      context.ellipse(top.x + spread, top.y - phase * cellHeight * 1.2, 6 * (1 - phase * 0.5), 9 * (1 - phase * 0.4), 0, 0, Math.PI * 2);
      context.fill();
    }
    for (let puff = 0; puff < 3; puff += 1) {
      const phase = (time / 900 + puff / 3) % 1;
      context.fillStyle = `rgba(60, 64, 70, ${0.4 * (1 - phase)})`;
      context.beginPath();
      context.arc(top.x + puff * 4 - 4, top.y - cellHeight * (0.8 + phase * 1.8), 7 + phase * 10, 0, Math.PI * 2);
      context.fill();
    }
  }
}

// Street scenery. `prop` is a props.js record: "standing", "burning" (flames lick up for the ten seconds) or "destroyed"
// (a charred stump, a fallen pole, a dented bin).
export function drawScenery(context, p, prop, cellHeight, time) {
  const { x, y } = prop.position;
  const base = p(x, y, 0);
  const unit = cellHeight;
  const ellipse = (cx, cy, rx, ry, fill) => {
    context.fillStyle = fill;
    context.beginPath();
    context.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    context.fill();
  };
  const flames = (height, width) => {
    for (let tongue = 0; tongue < 4; tongue += 1) {
      const flicker = 0.6 + 0.4 * Math.sin(time / 120 + tongue * 1.7 + x * 3.1);
      const fx = base.x + (tongue - 1.5) * width * 0.3;
      context.fillStyle = tongue % 2 === 0 ? "rgba(255, 150, 60, 0.85)" : "rgba(255, 220, 120, 0.8)";
      context.beginPath();
      context.moveTo(fx - width * 0.16, base.y - height * 0.45);
      context.quadraticCurveTo(fx, base.y - height * (0.55 + 0.7 * flicker), fx + width * 0.16, base.y - height * 0.45);
      context.closePath();
      context.fill();
    }
  };
  context.fillStyle = "rgba(0, 0, 0, 0.28)";
  context.beginPath();
  context.ellipse(base.x, base.y, unit * 0.34, unit * 0.16, 0, 0, Math.PI * 2);
  context.fill();
  if (prop.kind === "tree") {
    if (prop.state === "destroyed") {
      ellipse(base.x, base.y - unit * 0.1, unit * 0.22, unit * 0.1, "#2a2420");
      context.fillStyle = "#1c1816";
      context.fillRect(base.x - unit * 0.07, base.y - unit * 0.55, unit * 0.14, unit * 0.5);
      return;
    }
    context.fillStyle = "#4b3a2c";
    context.fillRect(base.x - unit * 0.07, base.y - unit * 1.0, unit * 0.14, unit * 1.0);
    const sway = Math.sin(time / 900 + x) * unit * 0.03;
    const canopy = prop.state === "burning" ? ["#8a4a24", "#a65a2b", "#c27a30"] : ["#1f5a46", "#287059", "#318a6c"];
    ellipse(base.x + sway, base.y - unit * 1.35, unit * 0.58, unit * 0.46, canopy[0]);
    ellipse(base.x + sway - unit * 0.18, base.y - unit * 1.55, unit * 0.4, unit * 0.34, canopy[1]);
    ellipse(base.x + sway + unit * 0.2, base.y - unit * 1.5, unit * 0.36, unit * 0.3, canopy[2]);
    if (prop.state === "burning") flames(unit * 2.4, unit * 1.1);
  } else if (prop.kind === "streetlight") {
    if (prop.state === "destroyed") {
      context.strokeStyle = "#55636d";
      context.lineWidth = Math.max(2, unit * 0.1);
      context.beginPath();
      context.moveTo(base.x - unit * 0.5, base.y - unit * 0.05);
      context.lineTo(base.x + unit * 0.5, base.y + unit * 0.2);
      context.stroke();
      ellipse(base.x + unit * 0.55, base.y + unit * 0.22, unit * 0.1, unit * 0.06, "#2a3036");
      return;
    }
    context.strokeStyle = "#6a7a86";
    context.lineWidth = Math.max(2, unit * 0.1);
    context.beginPath();
    context.moveTo(base.x, base.y);
    context.lineTo(base.x, base.y - unit * 2.3);
    context.lineTo(base.x + unit * 0.4, base.y - unit * 2.4);
    context.stroke();
    const glow = 0.7 + 0.3 * Math.sin(time / 500 + x * 2);
    context.fillStyle = `rgba(255, 226, 150, ${0.12 * glow})`;
    context.beginPath();
    context.ellipse(base.x + unit * 0.4, base.y - unit * 2.25, unit * 0.9, unit * 0.5, 0, 0, Math.PI * 2);
    context.fill();
    ellipse(base.x + unit * 0.4, base.y - unit * 2.4, unit * 0.14, unit * 0.08, `rgba(255, 236, 170, ${0.9 * glow})`);
    if (prop.state === "burning") flames(unit * 2, unit * 0.6);
  } else if (prop.kind === "bin") {
    const tilt = prop.state === "destroyed" ? 0.25 : 0;
    context.save();
    context.translate(base.x, base.y);
    context.rotate(tilt);
    context.fillStyle = prop.state === "destroyed" ? "#2d3439" : "#3f4a52";
    context.fillRect(-unit * 0.2, -unit * 0.6, unit * 0.4, unit * 0.6);
    context.fillStyle = "#59666f";
    context.fillRect(-unit * 0.24, -unit * 0.66, unit * 0.48, unit * 0.1);
    context.restore();
  } else if (prop.kind === "billboard") {
    context.fillStyle = "#46505a";
    context.fillRect(base.x - unit * 0.05, base.y - unit * 1.8, unit * 0.1, unit * 1.8);
    if (prop.state !== "destroyed") {
      context.fillStyle = prop.state === "burning" ? "#6b4a2b" : "#1e3340";
      context.fillRect(base.x - unit * 0.9, base.y - unit * 2.9, unit * 1.8, unit * 1.0);
      context.strokeStyle = "#42d6d0";
      context.lineWidth = 2;
      context.strokeRect(base.x - unit * 0.9, base.y - unit * 2.9, unit * 1.8, unit * 1.0);
    }
    if (prop.state === "burning") flames(unit * 2.6, unit * 1.6);
  }
}

// A traffic signal at a corner of a crossing: a pole with a lamp that shows green or red for the way it faces.
export function drawSignal(context, p, { x, y }, cellHeight, green) {
  const base = p(x, y, 0);
  const unit = cellHeight;
  context.strokeStyle = "#55636d";
  context.lineWidth = Math.max(2, unit * 0.08);
  context.beginPath();
  context.moveTo(base.x, base.y);
  context.lineTo(base.x, base.y - unit * 1.5);
  context.stroke();
  context.fillStyle = "#1b2329";
  context.fillRect(base.x - unit * 0.12, base.y - unit * 1.95, unit * 0.24, unit * 0.5);
  const colour = green ? "#79d59b" : "#ff6b62";
  context.fillStyle = colour;
  context.beginPath();
  context.arc(base.x, base.y - unit * (green ? 1.55 : 1.8), unit * 0.09, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = green ? "rgba(121, 213, 155, 0.18)" : "rgba(255, 107, 98, 0.18)";
  context.beginPath();
  context.arc(base.x, base.y - unit * (green ? 1.55 : 1.8), unit * 0.3, 0, Math.PI * 2);
  context.fill();
}

/**
 * A whole train, nothing like a car: a long, low, flat-roofed carriage train on rails, the engine with a sloped cab at its front,
 * a band of lit windows down every carriage, a stripe in the accent colour and dark bogies under each one. `cars` is
 * [{ x, y, heading }] from trainCars, engine first; `p` is a projector at the height of the railway.
 */
export function drawTrain(context, p, vehicle, cars, cellHeight, time) {
  const { primaryColor, accentColor } = vehicle.definition.appearance;
  // Back to front, so the nearer carriages overlap the farther ones.
  const order = cars.map((car, index) => ({ car, index })).sort((a, b) => a.car.x + a.car.y - (b.car.x + b.car.y));
  for (const { car, index } of order) {
    const alongX = Math.abs(car.heading.x) >= Math.abs(car.heading.y);
    const length = 2.2;
    const width = 1.0;
    const halfX = (alongX ? length : width) / 2;
    const halfY = (alongX ? width : length) / 2;
    const bodyHeight = cellHeight * 1.5; // as tall as the people beside it, a little less (FreeSynd's vehicles are lower than people)
    const lift = (point, z) => ({ x: point.x, y: point.y - z });
    // Dark bogies under the floor at each end, and the shadow of the viaduct edge is the track itself.
    for (const end of [-0.7, 0.7]) {
      const bx = car.x + (alongX ? end * halfX : 0);
      const by = car.y + (alongX ? 0 : end * halfY);
      drawBox(context, p, bx, by, alongX ? 0.28 : 0.45, alongX ? 0.45 : 0.28, 0, cellHeight * 0.16, "#15191c", "#262b2f");
    }
    const { west, south, east } = drawBox(
      context, p, car.x, car.y, halfX, halfY, cellHeight * 0.16, bodyHeight, shadeHex(primaryColor, -6), shadeHex(primaryColor, 26),
    );
    // The long visible side: a stripe, and a band of lit windows. (For a train along y the long side is south to east.)
    const [from, to] = alongX ? [west, south] : [south, east];
    const along = (u, z) => lift({ x: from.x + (to.x - from.x) * u, y: from.y + (to.y - from.y) * u }, z);
    context.fillStyle = accentColor;
    context.beginPath();
    for (const [u0, u1] of [[0.02, 0.98]]) {
      const a = along(u0, bodyHeight * 0.42);
      const b = along(u1, bodyHeight * 0.42);
      const c = along(u1, bodyHeight * 0.34);
      const d = along(u0, bodyHeight * 0.34);
      context.moveTo(a.x, a.y);
      context.lineTo(b.x, b.y);
      context.lineTo(c.x, c.y);
      context.lineTo(d.x, d.y);
    }
    context.fill();
    context.fillStyle = "rgba(255, 226, 150, .85)";
    for (let window = 0; window < 5; window += 1) {
      const u0 = 0.1 + window * 0.17;
      const a = along(u0, bodyHeight * 0.88);
      const b = along(u0 + 0.12, bodyHeight * 0.88);
      const c = along(u0 + 0.12, bodyHeight * 0.52);
      const d = along(u0, bodyHeight * 0.52);
      polygon(context, [a, b, c, d]);
      context.fill();
    }
    if (index === 0) {
      // The engine: a cab at the front with a dark windscreen, a lamp and a pantograph on the roof.
      const sign = alongX ? Math.sign(car.heading.x || 1) : Math.sign(car.heading.y || 1);
      const noseAt = (z) => p(car.x + (alongX ? sign * halfX : 0), car.y + (alongX ? 0 : sign * halfY), z);
      const nose = lift(noseAt(0), bodyHeight * 0.62);
      context.fillStyle = "#1a2a35";
      context.fillRect(nose.x - 6, nose.y - 7, 12, 8);
      const lamp = lift(noseAt(0), bodyHeight * 0.28);
      context.fillStyle = "#ffeeb0";
      context.beginPath();
      context.arc(lamp.x, lamp.y, 2.6, 0, Math.PI * 2);
      context.fill();
      const roof = lift(p(car.x, car.y, 0), bodyHeight + 3);
      context.strokeStyle = "#aab4bc";
      context.lineWidth = 1.5;
      context.beginPath();
      context.moveTo(roof.x - 7, roof.y);
      context.lineTo(roof.x, roof.y - 6);
      context.lineTo(roof.x + 7, roof.y);
      context.stroke();
    }
  }
}
