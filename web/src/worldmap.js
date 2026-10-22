// SPDX-License-Identifier: GPL-2.0-or-later

import { hashString, seededRandom } from "./buildings.js";
import { isCompleted, isUnlocked } from "./progress.js";

// The world map used to choose an operation. Geography is original: three invented landmasses,
// each operation a region the player clicks. Everything is drawn from the data below, so a
// content pack only has to say where its missions sit (`region` in the mission file).
export const MAP_WIDTH = 1000;
export const MAP_HEIGHT = 500;

export const LANDMASSES = Object.freeze([
  { id: "western-reach", label: "WESTERN REACH", points: [[40, 150], [120, 90], [230, 100], [300, 170], [340, 260], [300, 350], [220, 410], [120, 390], [60, 300]] },
  { id: "central-mesh", label: "CENTRAL MESH", points: [[390, 90], [480, 60], [600, 80], [680, 140], [650, 220], [560, 260], [470, 240], [400, 180]] },
  { id: "eastern-spur", label: "EASTERN SPUR", points: [[640, 300], [720, 260], [840, 270], [930, 330], [950, 420], [860, 470], [740, 450], [670, 390]] },
]);

// A few small islands for texture.
export const ISLANDS = Object.freeze([
  [[360, 330], [395, 315], [420, 345], [385, 370]],
  [[880, 120], [925, 105], [940, 150], [895, 165]],
  [[90, 440], [130, 430], [150, 465], [105, 475]],
]);

const REGION_RADIUS = 46;

// An irregular outline around a centre, the same every time for the same id.
export function regionShape(id, centre, radius = REGION_RADIUS, sides = 10) {
  const random = seededRandom(hashString(`region:${id}`));
  const points = [];
  for (let index = 0; index < sides; index += 1) {
    const angle = (index / sides) * Math.PI * 2;
    const reach = radius * (0.74 + random() * 0.36);
    points.push([centre.x + Math.cos(angle) * reach, centre.y + Math.sin(angle) * reach * 0.82]);
  }
  return points;
}

// Where an operation sits on the map in map units. Missions with no region are spread along a line
// so a pack that does not describe them still gets a usable map.
export function regionCentre(entry, index, count) {
  if (entry.region) {
    return { x: (entry.region.x / 100) * MAP_WIDTH, y: (entry.region.y / 100) * MAP_HEIGHT };
  }
  return { x: ((index + 1) / (count + 1)) * MAP_WIDTH, y: MAP_HEIGHT / 2 };
}

export function pointInPolygon(point, polygon) {
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
  const ids = entries.map((entry) => entry.id);
  return entries.map((entry, index) => ({
    index,
    id: entry.id,
    state: isCompleted(progress, entry.id) ? "completed" : isUnlocked(progress, ids, index) ? "available" : "locked",
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
      ? `Complete ${entries[index - 1]?.name ?? "the previous operation"} to unlock this operation.`
      : `${entry.objectives} objectives · ${entry.watchers} watchers`;
  return { title: `Operation ${number} · ${entry.name}`, place, label, detail };
}

const SVG = "http://www.w3.org/2000/svg";
function svg(tag, attributes = {}, children = []) {
  const element = document.createElementNS(SVG, tag);
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, String(value));
  for (const child of children) element.append(child);
  return element;
}
const path = (points) => `M${points.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join("L")}Z`;

/**
 * Draw the map into `container`. `onSelect(index)` is called when an unlocked region is chosen;
 * `onCard(card)` is told what to show (or null) when a region is hovered or focused.
 */
export function renderWorldMap({ container, entries, progress, selectedIndex, onSelect, onCard }) {
  const states = regionStates(entries, progress, selectedIndex);
  const root = svg("svg", {
    viewBox: `0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`,
    class: "world-map-svg",
    role: "group",
    "aria-label": "World map of operations",
  });
  root.append(
    svg("defs", {}, [
      svg("pattern", { id: "map-grid", width: 50, height: 50, patternUnits: "userSpaceOnUse" }, [
        svg("path", { d: "M50 0H0V50", fill: "none", stroke: "currentColor", "stroke-width": 0.6 }),
      ]),
    ]),
    svg("rect", { width: MAP_WIDTH, height: MAP_HEIGHT, class: "map-sea" }),
    svg("rect", { width: MAP_WIDTH, height: MAP_HEIGHT, fill: "url(#map-grid)", class: "map-grid" }),
  );
  for (const island of ISLANDS) root.append(svg("path", { d: path(island), class: "map-island" }));
  for (const land of LANDMASSES) {
    root.append(svg("path", { d: path(land.points), class: "map-land" }));
    const sum = land.points.reduce((total, [x, y]) => ({ x: total.x + x, y: total.y + y }), { x: 0, y: 0 });
    const label = svg("text", { x: sum.x / land.points.length, y: sum.y / land.points.length + 70, class: "map-label" });
    label.textContent = land.label;
    root.append(label);
  }
  const centres = entries.map((entry, index) => regionCentre(entry, index, entries.length));
  // The campaign's route: dashed between operations, lit once the earlier one is done.
  for (let index = 1; index < centres.length; index += 1) {
    const from = centres[index - 1];
    const to = centres[index];
    const bend = { x: (from.x + to.x) / 2, y: Math.min(from.y, to.y) - 60 };
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
      svg("path", { d: path(regionShape(entry.id, centre)), class: "map-region-shape" }),
      svg("circle", { cx: centre.x, cy: centre.y, r: 5, class: "map-pin" }),
    );
    const name = svg("text", { x: centre.x, y: centre.y + REGION_RADIUS + 18, class: "map-region-name" });
    name.textContent = `${String(index + 1).padStart(2, "0")} ${entry.region?.name ?? entry.name}`;
    const status = svg("text", { x: centre.x, y: centre.y + REGION_RADIUS + 34, class: "map-region-state" });
    status.textContent = card.label;
    group.append(name, status);
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
