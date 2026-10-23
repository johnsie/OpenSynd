// SPDX-License-Identifier: GPL-2.0-or-later

import { createTileGrid } from "./engine.js";
import {
  addItem,
  addPatrolPoint,
  clearPatrol,
  editObjective,
  exportMission,
  moveItem,
  parseScript,
  pickPlacement,
  placements,
  removeItem,
  setScript,
  validateDraft,
} from "./editor-core.js";

const canvas = document.querySelector("#editor-canvas");
const context = canvas.getContext("2d");
const select = document.querySelector("#mission-select");
const hint = document.querySelector("#editor-hint");

// What can be placed: the tool name, the group it goes in, and the file and name stem it makes.
const TOOLS = [
  { id: "move", label: "Move or select" },
  { id: "delete", label: "Delete" },
  { id: "route", label: "Edit route and script" },
  { id: "enemy", label: "Add enemy agent", group: "opponents", kind: "units/enemy-agent.unit.json", stem: "enemy-agent" },
  { id: "guard", label: "Add guard", group: "opponents", kind: "units/guard.unit.json", stem: "guard" },
  { id: "criminal", label: "Add criminal", group: "bystanders", kind: "units/criminal.unit.json", stem: "criminal" },
  { id: "police", label: "Add police officer", group: "bystanders", kind: "units/city-police.unit.json", stem: "police" },
  { id: "man", label: "Add civilian (man)", group: "bystanders", kind: "units/civilian-man.unit.json", stem: "civilian" },
  { id: "woman", label: "Add civilian (woman)", group: "bystanders", kind: "units/civilian-woman.unit.json", stem: "civilian" },
  {
    id: "car",
    label: "Add car with a driver",
    group: "vehicles",
    kind: "vehicles/city-car.vehicle.json",
    stem: "city-car",
    driver: "units/civilian-man.unit.json",
  },
];
const COLOURS = { team: "#42d6d0", opponents: "#ff6b62", bystanders: "#8d9aa3", vehicles: "#e1b35a" };

const editor = { pack: null, mission: null, map: null, grid: null, tool: "move", holding: null, scale: 1, chosen: null };

async function readJson(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Unable to load ${path}`);
  return response.json();
}

async function openMission(path) {
  const mission = await readJson(`content/${path}`);
  editor.map = await readJson(`content/${mission.map}`);
  editor.grid = createTileGrid(editor.map);
  editor.mission = mission;
  editor.scale = canvas.width / Math.max(editor.map.dimensions.width, editor.map.dimensions.height);
  refresh();
}

function change(next) {
  if (next === editor.mission) return;
  editor.mission = next;
  refresh();
}

function refresh() {
  draw();
  renderObjectives();
  renderRoute();
  const problems = validateDraft(editor.mission, editor.map);
  const list = document.querySelector("#problem-list");
  list.replaceChildren(
    ...(problems.length === 0
      ? [Object.assign(document.createElement("li"), { className: "ok", textContent: "No problems found." })]
      : problems.map((text) => Object.assign(document.createElement("li"), { textContent: text }))),
  );
}

function draw() {
  const { map, mission, scale } = editor;
  context.clearRect(0, 0, canvas.width, canvas.height);
  for (const region of map.regions) {
    context.fillStyle = region.color ?? "#293138";
    context.fillRect(region.x * scale, region.y * scale, region.width * scale, region.height * scale);
  }
  for (const object of map.objects ?? []) {
    context.fillStyle = "#e1b35a";
    context.fillRect(
      object.position.x * scale,
      object.position.y * scale,
      Math.max(3, object.width * scale),
      Math.max(3, object.height * scale),
    );
  }
  for (const zone of map.zones) {
    context.strokeStyle = "#e1b35a";
    context.lineWidth = 2;
    context.strokeRect(zone.position.x * scale, zone.position.y * scale, zone.width * scale, zone.height * scale);
    context.fillStyle = "#e1b35a";
    context.font = "12px ui-sans-serif, sans-serif";
    context.fillText(zone.id, zone.position.x * scale + 3, zone.position.y * scale - 4);
  }
  for (const prop of map.props ?? []) {
    context.fillStyle = prop.kind === "tree" ? "#318a6c" : "#55636d";
    context.fillRect(prop.position.x * scale - 1, prop.position.y * scale - 1, 3, 3);
  }
  for (const entry of placements(mission)) {
    context.fillStyle = COLOURS[entry.group];
    context.beginPath();
    const radius = entry.group === "vehicles" ? 6 : 5;
    context.arc((entry.position.x + 0.5) * scale, (entry.position.y + 0.5) * scale, radius, 0, Math.PI * 2);
    context.fill();
    if (editor.holding && editor.holding.id === entry.id) {
      context.strokeStyle = "#fff";
      context.lineWidth = 2;
      context.stroke();
    }
    const route = entry.item.patrol ?? [];
    if (route.length > 0) {
      context.strokeStyle = "rgba(66, 214, 208, 0.7)";
      context.lineWidth = 1.5;
      context.beginPath();
      context.moveTo((entry.position.x + 0.5) * scale, (entry.position.y + 0.5) * scale);
      for (const point of route) context.lineTo((point.x + 0.5) * scale, (point.y + 0.5) * scale);
      context.stroke();
      for (const point of route) context.fillRect((point.x + 0.5) * scale - 2, (point.y + 0.5) * scale - 2, 4, 4);
    }
    if (editor.chosen && editor.chosen.id === entry.id) {
      context.strokeStyle = "#fff";
      context.lineWidth = 2;
      context.beginPath();
      context.arc((entry.position.x + 0.5) * scale, (entry.position.y + 0.5) * scale, 9, 0, Math.PI * 2);
      context.stroke();
    }
    for (const step of entry.item.script ?? []) {
      const point = step.to ?? step.at;
      if (!point) continue;
      context.strokeStyle = "rgba(232, 107, 214, 0.6)";
      context.beginPath();
      context.moveTo((entry.position.x + 0.5) * scale, (entry.position.y + 0.5) * scale);
      context.lineTo((point.x + 0.5) * scale, (point.y + 0.5) * scale);
      context.stroke();
    }
  }
}

function renderObjectives() {
  const container = document.querySelector("#objective-editor");
  container.replaceChildren(
    ...editor.mission.objectives.map((objective) => {
      const row = document.createElement("div");
      const text = document.createElement("input");
      text.type = "text";
      text.value = objective.description;
      text.maxLength = 240;
      text.setAttribute("aria-label", `Text of ${objective.id}`);
      text.addEventListener("change", () => change(editObjective(editor.mission, objective.id, { description: text.value })));
      const label = document.createElement("label");
      const required = document.createElement("input");
      required.type = "checkbox";
      required.checked = objective.required;
      required.addEventListener("change", () => change(editObjective(editor.mission, objective.id, { required: required.checked })));
      label.append(required, ` ${objective.type} · required`);
      row.append(text, label);
      return row;
    }),
  );
}

// The route and script box for the placement picked with the "Edit route and script" tool.
function renderRoute() {
  const panel = document.querySelector("#route-editor");
  const chosen = editor.chosen && placements(editor.mission).find((entry) => entry.id === editor.chosen.id);
  panel.hidden = !chosen;
  if (!chosen) return;
  document.querySelector("#route-title").textContent = `${chosen.id}: ${(chosen.item.patrol ?? []).length} route points`;
  const box = document.querySelector("#script-text");
  if (document.activeElement !== box) box.value = chosen.item.script ? JSON.stringify(chosen.item.script, null, 1) : "";
  box.disabled = chosen.group === "vehicles";
  document.querySelector("#script-apply").disabled = chosen.group === "vehicles";
}

function tilePoint(event) {
  const bounds = canvas.getBoundingClientRect();
  const x = ((event.clientX - bounds.left) / bounds.width) * canvas.width;
  const y = ((event.clientY - bounds.top) / bounds.height) * canvas.height;
  return { x: Math.floor(x / editor.scale), y: Math.floor(y / editor.scale) };
}

canvas.addEventListener("click", (event) => {
  if (!editor.mission) return;
  const point = tilePoint(event);
  const tool = TOOLS.find((entry) => entry.id === editor.tool);
  if (tool.id === "move") {
    // First click picks someone up, the second puts them down.
    if (editor.holding) {
      change(moveItem(editor.mission, editor.holding.group, editor.holding.id, point));
      hint.textContent = `Moved ${editor.holding.id} to ${point.x}, ${point.y}.`;
      editor.holding = null;
    } else {
      const found = pickPlacement(editor.mission, { x: point.x, y: point.y });
      editor.holding = found ? { group: found.group, id: found.id } : null;
      hint.textContent = found ? `Holding ${found.id}: click where it should go.` : "Nobody there.";
      draw();
    }
  } else if (tool.id === "route") {
    // Click a placement to choose it, then click the ground to add route points.
    const found = pickPlacement(editor.mission, point);
    if (found) {
      editor.chosen = { group: found.group, id: found.id };
      hint.textContent = `Chosen ${found.id}: click the ground to add a route point, or edit its script on the right.`;
      refresh();
    } else if (editor.chosen) {
      change(addPatrolPoint(editor.mission, editor.chosen.group, editor.chosen.id, point));
      hint.textContent = `Route point added at ${point.x}, ${point.y}.`;
    } else {
      hint.textContent = "Click someone first.";
    }
  } else if (tool.id === "delete") {
    const found = pickPlacement(editor.mission, point);
    if (found) change(removeItem(editor.mission, found.group, found.id));
  } else {
    change(addItem(editor.mission, tool.group, { kind: tool.kind, stem: tool.stem, position: point, driver: tool.driver }));
    hint.textContent = `Added at ${point.x}, ${point.y}.`;
  }
});

document.querySelector("#route-clear").addEventListener("click", () => {
  if (editor.chosen) change(clearPatrol(editor.mission, editor.chosen.group, editor.chosen.id));
});
document.querySelector("#script-apply").addEventListener("click", () => {
  if (!editor.chosen) return;
  const result = parseScript(document.querySelector("#script-text").value);
  const message = document.querySelector("#script-message");
  if (result.error) {
    message.textContent = result.error;
    return;
  }
  message.textContent = result.steps.length === 0 ? "Script removed." : `Script of ${result.steps.length} steps saved.`;
  change(setScript(editor.mission, editor.chosen.group, editor.chosen.id, result.steps));
  renderRoute();
});

document.querySelector("#export-button").addEventListener("click", () => {
  const blob = new Blob([exportMission(editor.mission)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${editor.mission.id.replace(/^developer\./, "")}.mission.json`;
  link.click();
  URL.revokeObjectURL(link.href);
});

select.addEventListener("change", () => openMission(select.value));

const toolList = document.querySelector("#tool-list");
for (const tool of TOOLS) {
  const label = document.createElement("label");
  const radio = document.createElement("input");
  radio.type = "radio";
  radio.name = "tool";
  radio.checked = tool.id === editor.tool;
  radio.addEventListener("change", () => {
    editor.tool = tool.id;
    editor.holding = null;
    if (tool.id !== "route") editor.chosen = null;
    hint.textContent = tool.id === "move" ? "Click someone to pick them up, then click where they should go." : tool.label;
  });
  label.append(radio, tool.label);
  toolList.append(label);
}

editor.pack = await readJson("content/pack.json");
for (const path of editor.pack.missions) {
  const mission = await readJson(`content/${path}`);
  select.append(Object.assign(document.createElement("option"), { value: path, textContent: mission.name }));
}
await openMission(editor.pack.missions[0]);
