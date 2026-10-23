// SPDX-License-Identifier: GPL-2.0-or-later

import { hashString, seededRandom } from "./buildings.js";
import { CONTINENTS, INLAND_SEAS, ISLANDS, MAP_HEIGHT, MAP_WIDTH, SEA_LABELS, polygonPath, project } from "./atlas.js";
import { isCompleted, isUnlocked, prerequisites } from "./progress.js";

// The world map used to choose an operation: a flat atlas of the Earth (see atlas.js) with each
// operation a region the player clicks. A mission says where it sits with `region` (a name and a
// longitude and latitude), so a content pack places its own operations anywhere in the world.
export { MAP_HEIGHT, MAP_WIDTH };
export const LANDMASSES = CONTINENTS;

const REGION_RADIUS = 20;
// With a whole campaign on the map the regions are small and only the chosen one is named.
export const CROWDED = 12;
const radiusFor = (count) => (count > CROWDED ? 10 : REGION_RADIUS);

// An irregular outline around a centre, the same every time for the same id.
export function regionShape(id, centre, radius = REGION_RADIUS, sides = 9) {
  const random = seededRandom(hashString(`region:${id}`));
  const points = [];
  for (let index = 0; index < sides; index += 1) {
    const angle = (index / sides) * Math.PI * 2;
    const reach = radius * (0.8 + random() * 0.3);
    points.push([centre.x + Math.cos(angle) * reach, centre.y + Math.sin(angle) * reach * 0.82]);
  }
  return points;
}

// Where an operation sits on the map in map units. Missions with no region are spread along a line
// so a pack that does not describe them still gets a usable map.
export function regionCentre(entry, index, count) {
  if (entry.region) {
    const [x, y] = project([entry.region.lon, entry.region.lat]);
    return { x, y };
  }
  return { x: ((index + 1) / (count + 1)) * MAP_WIDTH, y: MAP_HEIGHT / 2 };
}

export function pointInPolygon(point, polygon) {
  point = Array.isArray(point) ? { x: point[0], y: point[1] } : point;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if (yi > point.y !== yj > point.y && point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Each operation's state on the map: "locked", "available" or "completed", and which is chosen. */
export function regionStates(entries, progress, selectedIndex) {
  return entries.map((entry, index) => ({
    index,
    id: entry.id,
    state: isCompleted(progress, entry.id) ? "completed" : isUnlocked(progress, entries, index) ? "available" : "locked",
    selected: index === selectedIndex,
  }));
}

/** The text shown for a region when it is hovered or focused. */
export function regionCard(entry, index, state, entries) {
  const number = String(index + 1).padStart(2, "0");
  const place = entry.region?.name ?? entry.name;
  const label = state === "completed" ? "COMPLETED" : state === "available" ? "AVAILABLE" : "LOCKED";
  const detail =
    state === "locked"
      ? `Complete ${
          prerequisites(entries, index)
            .map((id) => entries.find((item) => item.id === id)?.name)
            .filter(Boolean)
            .join(" or ") || "the previous operation"
        } to unlock this operation.`
      : `${entry.objectives} objectives · ${entry.enemies} enemy agents`;
  return { title: `Operation ${number} · ${entry.name}`, place, label, detail };
}

/** What hovering a territory with no operation yet shows. */
export function territoryCard(territory) {
  const people = (territory.population / 1_000_000).toFixed(1);
  return {
    title: territory.name,
    place: territory.name,
    label: "NO OPERATION YET",
    detail: `${people} million people · held by ${territory.owner}.`,
  };
}

const SVG = "http://www.w3.org/2000/svg";
function svg(tag, attributes = {}, children = []) {
  const element = document.createElementNS(SVG, tag);
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, String(value));
  for (const child of children) element.append(child);
  return element;
}
const path = (points) => `M${points.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join("L")}Z`;

function text(attributes, content) {
  const element = svg("text", attributes);
  element.textContent = content;
  return element;
}

// The atlas itself: sea, graticule every 30 degrees, equator and tropics, land and labels.
function drawAtlas(root) {
  root.append(svg("rect", { width: MAP_WIDTH, height: MAP_HEIGHT, class: "map-sea" }));
  const lines = [];
  for (let lon = -150; lon <= 150; lon += 30) {
    const [x] = project([lon, 0]);
    lines.push(`M${x.toFixed(1)} 0V${MAP_HEIGHT}`);
  }
  for (let lat = 60; lat >= -30; lat -= 30) {
    const [, y] = project([0, lat]);
    lines.push(`M0 ${y.toFixed(1)}H${MAP_WIDTH}`);
  }
  root.append(svg("path", { d: lines.join(""), class: "map-grid" }));
  for (const lat of [0, 23.5, -23.5]) {
    const [, y] = project([0, lat]);
    root.append(svg("path", { d: `M0 ${y.toFixed(1)}H${MAP_WIDTH}`, class: lat === 0 ? "map-equator" : "map-tropic" }));
  }
  for (const island of ISLANDS) root.append(svg("path", { d: polygonPath(island), class: "map-island" }));
  for (const land of CONTINENTS) root.append(svg("path", { d: polygonPath(land.points), class: "map-land" }));
  for (const sea of INLAND_SEAS) root.append(svg("path", { d: polygonPath(sea), class: "map-inland-sea" }));
  for (const { label, at } of SEA_LABELS) {
    const [x, y] = project(at);
    root.append(text({ x, y, class: "map-sea-label" }, label));
  }
  for (const land of CONTINENTS) {
    const [x, y] = project(land.labelAt);
    root.append(text({ x, y, class: "map-label" }, land.label));
  }
}

/**
 * Draw the map into `container`. `onSelect(index)` is called when an unlocked region is chosen;
 * `onCard(card)` is told what to show (or null) when a region is hovered or focused.
 */
export function renderWorldMap({ container, entries, progress, selectedIndex, onSelect, onCard, territories = [] }) {
  const states = regionStates(entries, progress, selectedIndex);
  const root = svg("svg", {
    viewBox: `0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`,
    class: "world-map-svg",
    preserveAspectRatio: "xMidYMid meet",
    role: "group",
    "aria-label": "World map of operations",
  });
  drawAtlas(root);
  // Territories whose operation is not built yet: small dim markers, so the whole campaign world shows.
  for (const territory of territories) {
    const [x, y] = project([territory.lon, territory.lat]);
    const card = territoryCard(territory);
    const group = svg("g", {
      class: "map-territory",
      role: "img",
      "aria-label": `${card.title}. ${card.label}. ${card.detail}`,
      tabindex: 0,
    });
    group.append(
      svg("circle", { cx: x, cy: y, r: 11, class: "map-hit" }),
      svg("circle", { cx: x, cy: y, r: 3.5, class: "map-territory-pin" }),
    );
    group.addEventListener("pointerenter", () => onCard?.(card));
    group.addEventListener("focus", () => onCard?.(card));
    group.addEventListener("pointerleave", () => onCard?.(null));
    group.addEventListener("blur", () => onCard?.(null));
    root.append(group);
  }
  const centres = entries.map((entry, index) => regionCentre(entry, index, entries.length));
  const radius = radiusFor(entries.length);
  const crowded = entries.length > CROWDED;
  if (crowded) {
    // Only the routes that have opened are drawn: from each finished operation to the ones it unlocked.
    entries.forEach((entry, from) => {
      if (states[from].state !== "completed") return;
      for (const id of entry.unlocks ?? []) {
        const to = entries.findIndex((other) => other.id === id);
        if (to < 0) continue;
        root.append(
          svg("path", {
            d: `M${centres[from].x} ${centres[from].y}L${centres[to].x} ${centres[to].y}`,
            class: "map-route done",
          }),
        );
      }
    });
  }
  // The campaign's route: dashed between operations, lit once the earlier one is done.
  for (let index = 1; index < (crowded ? 0 : centres.length); index += 1) {
    const from = centres[index - 1];
    const to = centres[index];
    const bend = { x: (from.x + to.x) / 2, y: Math.min(from.y, to.y) - 40 };
    root.append(
      svg("path", {
        d: `M${from.x} ${from.y}Q${bend.x} ${bend.y} ${to.x} ${to.y}`,
        class: `map-route${states[index - 1].state === "completed" ? " done" : ""}`,
      }),
    );
  }
  entries.forEach((entry, index) => {
    const { state, selected } = states[index];
    const card = regionCard(entry, index, state, entries);
    const centre = centres[index];
    const group = svg("g", {
      class: `map-region ${state}${selected ? " selected" : ""}`,
      role: "button",
      "aria-label": `${card.title}, ${card.place}, ${card.label.toLowerCase()}. ${card.detail}`,
      "aria-pressed": selected,
      "aria-disabled": state === "locked",
      tabindex: state === "locked" ? -1 : 0,
      "data-index": index,
    });
    group.append(
      svg("circle", { cx: centre.x, cy: centre.y, r: radius * 1.7, class: "map-hit" }),
      svg("path", { d: path(regionShape(entry.id, centre, radius)), class: "map-region-shape" }),
      svg("circle", { cx: centre.x, cy: centre.y, r: crowded ? 3 : 4, class: "map-pin" }),
    );
    // Labels go to the right of the pin, except in the Americas where the open sea is to the left.
    const lon = entry.region?.lon ?? (centre.x / MAP_WIDTH) * 360 - 180;
    // A region with a neighbour close on its right puts its label on the left instead, so labels do not overlap.
    const crowdedRight = centres.some(
      (other, otherIndex) => otherIndex !== index && other.x > centre.x && other.x - centre.x < 90 && Math.abs(other.y - centre.y) < 30,
    );
    const toRight = lon > -62 && !crowdedRight;
    const anchor = toRight ? "start" : "end";
    const labelX = centre.x + (toRight ? radius + 8 : -(radius + 8));
    if (!crowded || selected) group.append(
      text(
        { x: labelX, y: centre.y - 2, class: "map-region-name", "text-anchor": anchor },
        `${String(index + 1).padStart(2, "0")} ${card.place}`,
      ),
      text(
        { x: labelX, y: centre.y + 14, class: "map-region-state", "text-anchor": anchor },
        `${card.label} · ${entry.name}`,
      ),
    );
    const choose = () => {
      if (state !== "locked") onSelect(index);
      else onCard?.(card);
    };
    group.addEventListener("click", choose);
    group.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        choose();
      }
    });
    group.addEventListener("pointerenter", () => onCard?.(card));
    group.addEventListener("focus", () => onCard?.(card));
    group.addEventListener("pointerleave", () => onCard?.(null));
    group.addEventListener("blur", () => onCard?.(null));
    root.append(group);
  });
  container.replaceChildren(root);
}
