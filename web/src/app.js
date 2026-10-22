// SPDX-License-Identifier: GPL-2.0-or-later

import {
  applyGates,
  createTileGrid,
  isTerrainWalkable,
  findPath,
  findObjectiveAtPosition,
  gridToScreen,
  isWalkable,
  screenToGrid,
  zoneContains,
} from "./engine.js";
import { advanceCombat, advanceUnits, consumeFixedSteps } from "./simulation.js";
import {
  LEGACY_LOCAL_SAVE_KEYS,
  LOCAL_SAVE_KEY,
  createSaveSnapshot,
  parseSaveSnapshot,
} from "./save.js";
import {
  ACTIONS,
  ACTION_LABELS,
  bindingFromEvent,
  bindingLabel,
  findConflict,
  normalizeBindings,
  resolveAction,
} from "./input.js";
import { addEffect, advanceEffects, createEffects, effectProgress, walkBob } from "./effects.js";
import { createAudio } from "./audio.js";
import { SETTINGS_KEY, parseSettings, prefersReducedMotion, serializeSettings } from "./settings.js";

const canvas = document.querySelector("#game-canvas");
const context = canvas.getContext("2d");
const pauseButton = document.querySelector("#pause-button");
const resetButton = document.querySelector("#reset-button");
const rosterElement = document.querySelector("#roster");
const threatsElement = document.querySelector("#threats");
const objectiveList = document.querySelector("#objective-list");
const objectiveCount = document.querySelector("#objective-count");
const pauseLabel = document.querySelector("#pause-label");
const briefingText = document.querySelector("#briefing-text");
const selectedReadout = document.querySelector("#selected-readout");
const statusMessage = document.querySelector("#status-message");
const aboutDialog = document.querySelector("#about-dialog");
const saveButton = document.querySelector("#save-button");
const loadButton = document.querySelector("#load-button");
const exportButton = document.querySelector("#export-button");
const importButton = document.querySelector("#import-button");
const importFile = document.querySelector("#import-file");
const moveButton = document.querySelector("#move-button");
const actionButton = document.querySelector("#action-button");
const actionLabel = document.querySelector("#action-label");
const repairButton = document.querySelector("#repair-button");
const repairLabel = document.querySelector("#repair-label");
let settings = parseSettings(readStored(SETTINGS_KEY));
const reduceMotion = prefersReducedMotion(
  settings,
  window.matchMedia("(prefers-reduced-motion: reduce)").matches,
);
let bindings = normalizeBindings(settings.keyBindings);
const audio = createAudio({
  getSettings: () => settings,
  onCaption: (text) => {
    document.querySelector("#sound-caption").textContent = `Sound: ${text}`;
  },
  AudioContextClass: window.AudioContext ?? window.webkitAudioContext,
});

function readStored(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function updateSettings(changes) {
  settings = parseSettings(serializeSettings({ ...settings, ...changes }));
  try {
    localStorage.setItem(SETTINGS_KEY, serializeSettings(settings));
  } catch {
    // Settings still apply for this session when storage is unavailable.
  }
  bindings = settings.keyBindings;
  applyTextScale();
}

function applyTextScale() {
  document.documentElement.style.fontSize = `${settings.textScale * 100}%`;
}

const settingsDialog = document.querySelector("#settings-dialog");
const settingControls = {
  volume: document.querySelector("#setting-volume"),
  muted: document.querySelector("#setting-muted"),
  captions: document.querySelector("#setting-captions"),
  reducedMotion: document.querySelector("#setting-motion"),
  textScale: document.querySelector("#setting-text"),
};

const bindingList = document.querySelector("#binding-list");
const bindingMessage = document.querySelector("#binding-message");

function renderBindings() {
  bindingList.replaceChildren();
  for (const action of ACTIONS) {
    const label = document.createElement("span");
    label.textContent = ACTION_LABELS[action];
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = bindingLabel(bindings[action]);
    button.setAttribute("aria-label", `${ACTION_LABELS[action]}: ${bindingLabel(bindings[action])}. Change`);
    button.addEventListener("click", () => captureBinding(action, button));
    bindingList.append(label, button);
  }
}

function captureBinding(action, button) {
  button.textContent = "Press a key…";
  bindingMessage.textContent = `Press the new key for “${ACTION_LABELS[action]}”, or Escape to cancel.`;
  const onKey = (event) => {
    if (["Shift", "Control", "Alt", "Meta"].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    window.removeEventListener("keydown", onKey, true);
    if (event.key === "Escape") {
      bindingMessage.textContent = "Change cancelled.";
    } else {
      const key = bindingFromEvent(event);
      const conflict = findConflict(bindings, action, key);
      if (conflict) {
        bindingMessage.textContent = `${bindingLabel(key)} is already used for “${ACTION_LABELS[conflict]}”.`;
      } else {
        updateSettings({ keyBindings: { ...bindings, [action]: key } });
        bindingMessage.textContent = `“${ACTION_LABELS[action]}” is now ${bindingLabel(key)}.`;
      }
    }
    renderBindings();
  };
  window.addEventListener("keydown", onKey, true);
}

document.querySelector("#reset-bindings").addEventListener("click", () => {
  updateSettings({ keyBindings: {} });
  bindingMessage.textContent = "Default keys restored.";
  renderBindings();
});

function showSettings() {
  renderBindings();
  settingControls.volume.value = settings.volume;
  settingControls.muted.checked = settings.muted;
  settingControls.captions.checked = settings.captions;
  settingControls.reducedMotion.value = settings.reducedMotion;
  settingControls.textScale.value = settings.textScale;
  settingsDialog.showModal();
}

document.querySelector("#settings-button").addEventListener("click", showSettings);
document.querySelector("#close-settings").addEventListener("click", () => settingsDialog.close());
document.querySelector("#settings-form").addEventListener("input", () => {
  updateSettings({
    volume: Number(settingControls.volume.value),
    muted: settingControls.muted.checked,
    captions: settingControls.captions.checked,
    reducedMotion: settingControls.reducedMotion.value,
    textScale: Number(settingControls.textScale.value),
  });
});
applyTextScale();

const SPRITE_SKINS = ["operative-one", "operative-two", "operative-three", "operative-four"];
const sprites = { manifest: null, images: new Map() };

// Sprite sheets are optional: units fall back to vector shapes if they fail to load.
async function loadSprites() {
  if (sprites.manifest) return;
  try {
    const manifest = await readJson("assets/sprites/sprites.json");
    await Promise.all(
      Object.values(manifest.sheets).map(
        (sheet) =>
          new Promise((resolve, reject) => {
            const image = new Image();
            image.onload = () => {
              sprites.images.set(sheet.file, image);
              resolve();
            };
            image.onerror = () => reject(new Error(`Unable to load ${sheet.file}`));
            image.src = `assets/sprites/${sheet.file}`;
          }),
      ),
    );
    sprites.manifest = manifest;
  } catch {
    sprites.manifest = null;
  }
}

const state = {
  effects: createEffects(),
  elapsed: 0,
  map: null,
  mission: null,
  grid: null,
  units: [],
  objectives: [],
  selectedId: null,
  cursor: { x: 1, y: 5 },
  paused: false,
  lastFrame: performance.now(),
  clock: { accumulator: 0 },
  viewport: null,
};

async function readJson(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Unable to load ${path}`);
  return response.json();
}

async function loadGame() {
  await loadSprites();
  const pack = await readJson("content/pack.json");
  const missionPath = pack.missions[0];
  const mission = await readJson(`content/${missionPath}`);
  const map = await readJson(`content/${mission.map}`);
  const unitEntries = await Promise.all(
    pack.units.map(async (path) => [path, await readJson(`content/${path}`)]),
  );
  const unitDefinitions = new Map(unitEntries);
  const equipmentEntries = await Promise.all(
    pack.equipment.map(async (path) => [path, await readJson(`content/${path}`)]),
  );
  const equipmentDefinitions = new Map(equipmentEntries);

  state.map = map;
  state.mission = mission;
  state.grid = createTileGrid(map);
  state.objectives = mission.objectives.map((objective) => ({
    ...objective,
    complete: false,
  }));
  syncGates();
  state.units = [...mission.team, ...mission.opponents].map((placement) => {
    const definition = unitDefinitions.get(placement.unit);
    return {
      ...placement,
      definition,
      side: definition.role === "operator" ? "team" : "opposition",
      position: { ...placement.position },
      initialPosition: { ...placement.position },
      path: [],
      equipment: placement.equipment.map((path) => {
        const equipment = equipmentDefinitions.get(path);
        return { definition: equipment, charges: equipment.charges };
      }),
      health: definition.stats.vitality,
      cooldownRemaining: 0,
      targetId: null,
      disabled: false,
    };
  });
  state.selectedId = mission.team[0].id;
  state.cursor = { ...mission.team[0].position };
  state.paused = false;
  state.effects.length = 0;
  state.clock.accumulator = 0;
  state.lastFrame = performance.now();
  pauseButton.setAttribute("aria-pressed", "false");
  pauseLabel.textContent = "Pause";
  briefingText.textContent = mission.briefing;
  setStatus("Local map established. Select a relay route.");
  updateLoadButton();
  renderInterface();
}

function gateOpen(gate) {
  return state.objectives.some((item) => item.targetZone === gate.control && item.complete);
}

function syncGates() {
  applyGates(state.grid, state.map.objects ?? [], gateOpen);
}

function equipmentWithAction(unit, action) {
  return unit?.equipment.find((item) => item.definition.action === action) ?? null;
}

function combatStats(unit) {
  return equipmentWithAction(unit, "disable-pulse")?.definition.effect ?? unit.definition.stats;
}

function saveContext() {
  return {
    missionId: state.mission.id,
    unitIds: state.units.map((unit) => unit.id),
    selectableUnitIds: state.units
      .filter((unit) => unit.side === "team")
      .map((unit) => unit.id),
    objectiveIds: state.objectives.map((objective) => objective.id),
    bounds: { ...state.map.dimensions },
    isWalkable: (x, y) => isTerrainWalkable(state.grid, x, y),
    unitRules: Object.fromEntries(
      state.units.map((unit) => [
        unit.id,
        {
          side: unit.side,
          vitality: unit.definition.stats.vitality,
          cooldown: unit.definition.stats.cooldown,
        },
      ]),
    ),
    initialUnits: Object.fromEntries(
      state.units.map((unit) => [unit.id, { position: { ...unit.initialPosition } }]),
    ),
  };
}

function applySaveSnapshot(snapshot) {
  const unitsById = new Map(snapshot.units.map((unit) => [unit.id, unit]));
  for (const unit of state.units) {
    const saved = unitsById.get(unit.id);
    unit.position = { ...saved.position };
    unit.path = saved.path.map((point) => ({ ...point }));
    unit.health = saved.health;
    unit.cooldownRemaining = saved.cooldownRemaining;
    unit.targetId = saved.targetId;
    unit.disabled = saved.disabled;
  }
  const objectivesById = new Map(
    snapshot.objectives.map((objective) => [objective.id, objective]),
  );
  for (const objective of state.objectives) {
    objective.complete = objectivesById.get(objective.id).complete;
  }
  syncGates();
  state.selectedId = snapshot.selectedId;
  state.cursor = { ...snapshot.cursor };
  state.paused = false;
  state.clock.accumulator = 0;
  state.lastFrame = performance.now();
  pauseButton.setAttribute("aria-pressed", "false");
  pauseLabel.textContent = "Pause";
  renderInterface();
}

function currentSaveJson() {
  if (!state.mission) throw new Error("Mission data is not ready");
  return `${JSON.stringify(createSaveSnapshot(state), null, 2)}\n`;
}

function updateLoadButton() {
  try {
    loadButton.disabled = [LOCAL_SAVE_KEY, ...LEGACY_LOCAL_SAVE_KEYS].every(
      (key) => localStorage.getItem(key) === null,
    );
  } catch {
    loadButton.disabled = true;
  }
}

function saveLocally() {
  try {
    localStorage.setItem(LOCAL_SAVE_KEY, currentSaveJson());
    updateLoadButton();
    setStatus("Operation saved in this browser.");
  } catch (error) {
    setStatus(`Local save failed: ${error.message}`);
  }
}

function loadLocally() {
  try {
    const key = [LOCAL_SAVE_KEY, ...LEGACY_LOCAL_SAVE_KEYS].find(
      (candidate) => localStorage.getItem(candidate) !== null,
    );
    const text = key ? localStorage.getItem(key) : null;
    if (text === null) throw new Error("No local save exists");
    const snapshot = parseSaveSnapshot(text, saveContext());
    applySaveSnapshot(snapshot);
    if (key !== LOCAL_SAVE_KEY) {
      localStorage.setItem(LOCAL_SAVE_KEY, `${JSON.stringify(snapshot, null, 2)}\n`);
    }
    setStatus("Local operation restored.");
  } catch (error) {
    setStatus(`Local load failed: ${error.message}`);
  }
}

function exportSave() {
  try {
    const blob = new Blob([currentSaveJson()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "opensynd-first-light-save.json";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    setStatus("Save exported as readable JSON.");
  } catch (error) {
    setStatus(`Save export failed: ${error.message}`);
  }
}

async function importSave(file) {
  if (!file) return;
  try {
    if (file.size > 256 * 1024) throw new Error("Save file exceeds 256 KiB");
    const snapshot = parseSaveSnapshot(await file.text(), saveContext());
    applySaveSnapshot(snapshot);
    let storedLocally = true;
    try {
      localStorage.setItem(LOCAL_SAVE_KEY, `${JSON.stringify(snapshot, null, 2)}\n`);
    } catch {
      storedLocally = false;
    }
    updateLoadButton();
    setStatus(
      storedLocally
        ? "Validated save imported, restored, and stored locally."
        : "Validated save restored; browser storage is unavailable.",
    );
  } catch (error) {
    setStatus(`Save import failed: ${error.message}`);
  } finally {
    importFile.value = "";
  }
}

function resizeCanvas() {
  const bounds = canvas.getBoundingClientRect();
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.round(bounds.width * ratio));
  const height = Math.max(1, Math.round(bounds.height * ratio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  return { width: bounds.width, height: bounds.height };
}

function viewportFor(size) {
  const map = state.map;
  const base = map.cellSize;
  const horizontalExtent = (map.dimensions.width + map.dimensions.height) * (base.width / 2);
  const verticalExtent = (map.dimensions.width + map.dimensions.height) * (base.height / 2);
  const scale = Math.min(1, (size.width - 28) / horizontalExtent, (size.height - 105) / verticalExtent);
  const cellSize = { width: base.width * scale, height: base.height * scale };
  const centerOffset =
    ((map.dimensions.width - map.dimensions.height) * cellSize.width) / 4;
  return {
    cellSize,
    origin: { x: size.width / 2 - centerOffset, y: 54 },
    width: size.width,
    height: size.height,
  };
}

function shade(hex, amount) {
  const value = Number.parseInt(hex.slice(1), 16);
  const clamp = (part) => Math.max(0, Math.min(255, part));
  const red = clamp((value >> 16) + amount);
  const green = clamp(((value >> 8) & 255) + amount);
  const blue = clamp((value & 255) + amount);
  return `rgb(${red}, ${green}, ${blue})`;
}

function diamond(center, cellSize) {
  context.beginPath();
  context.moveTo(center.x, center.y - cellSize.height / 2);
  context.lineTo(center.x + cellSize.width / 2, center.y);
  context.lineTo(center.x, center.y + cellSize.height / 2);
  context.lineTo(center.x - cellSize.width / 2, center.y);
  context.closePath();
}

function drawTile(tile, viewport) {
  const { cellSize, origin } = viewport;
  const elevationHeight = tile.elevation * cellSize.height * 0.28;
  const baseCenter = gridToScreen(tile, cellSize, origin, 0);
  const topCenter = { x: baseCenter.x, y: baseCenter.y - elevationHeight };

  if (elevationHeight > 0) {
    context.fillStyle = shade(tile.color, -22);
    context.beginPath();
    context.moveTo(topCenter.x - cellSize.width / 2, topCenter.y);
    context.lineTo(topCenter.x, topCenter.y + cellSize.height / 2);
    context.lineTo(baseCenter.x, baseCenter.y + cellSize.height / 2);
    context.lineTo(baseCenter.x - cellSize.width / 2, baseCenter.y);
    context.closePath();
    context.fill();

    context.fillStyle = shade(tile.color, -34);
    context.beginPath();
    context.moveTo(topCenter.x + cellSize.width / 2, topCenter.y);
    context.lineTo(topCenter.x, topCenter.y + cellSize.height / 2);
    context.lineTo(baseCenter.x, baseCenter.y + cellSize.height / 2);
    context.lineTo(baseCenter.x + cellSize.width / 2, baseCenter.y);
    context.closePath();
    context.fill();
  }

  diamond(topCenter, cellSize);
  context.fillStyle = tile.gate ? (tile.walkable ? "#3f6b57" : "#b5524a") : tile.color;
  context.fill();
  if (tile.gate) {
    // Shape, not only colour, shows the gate state: bars when closed, a dashed rail when open.
    context.strokeStyle = "rgba(255, 255, 255, .85)";
    context.lineWidth = 2;
    context.setLineDash(tile.walkable ? [6, 6] : []);
    context.beginPath();
    context.moveTo(topCenter.x - cellSize.width / 4, topCenter.y);
    context.lineTo(topCenter.x + cellSize.width / 4, topCenter.y);
    if (!tile.walkable) {
      context.moveTo(topCenter.x, topCenter.y - cellSize.height / 4);
      context.lineTo(topCenter.x, topCenter.y + cellSize.height / 4);
    }
    context.stroke();
    context.setLineDash([]);
  }
  context.strokeStyle = tile.walkable ? "rgba(124, 161, 170, .22)" : "rgba(0, 0, 0, .5)";
  context.lineWidth = 1;
  context.stroke();
}

function drawZones(viewport) {
  for (const zone of state.map.zones) {
    const objective = state.objectives.find((item) => item.targetZone === zone.id);
    const complete = objective?.complete;
    for (let y = zone.position.y; y < zone.position.y + zone.height; y += 1) {
      for (let x = zone.position.x; x < zone.position.x + zone.width; x += 1) {
        const tile = state.grid[y][x];
        const center = gridToScreen({ x, y }, viewport.cellSize, viewport.origin, tile.elevation);
        diamond(center, viewport.cellSize);
        context.strokeStyle = complete
          ? "rgba(121, 213, 155, .95)"
          : zone.kind === "exit"
            ? "rgba(66, 214, 208, .85)"
            : "rgba(225, 179, 90, .9)";
        context.lineWidth = 2;
        context.stroke();
      }
    }
  }
}

function drawCursor(viewport) {
  const { x, y } = state.cursor;
  const tile = state.grid[y]?.[x];
  if (!tile) return;
  const center = gridToScreen({ x, y }, viewport.cellSize, viewport.origin, tile.elevation);
  diamond(center, viewport.cellSize);
  context.fillStyle = isWalkable(state.grid, x, y)
    ? "rgba(66, 214, 208, .12)"
    : "rgba(255, 107, 98, .12)";
  context.fill();
  context.strokeStyle = isWalkable(state.grid, x, y) ? "#42d6d0" : "#ff6b62";
  context.lineWidth = 2;
  context.stroke();
}

function spriteSheetFor(unit) {
  if (!sprites.manifest || unit.side !== "team") return null;
  const index = state.units.filter((item) => item.side === "team").indexOf(unit);
  return sprites.manifest.sheets[SPRITE_SKINS[index % SPRITE_SKINS.length]] ?? null;
}

// Eight facings, 0 toward the camera, increasing clockwise as seen on screen.
function updateFacing(unit, viewport) {
  let toward = unit.path[0] ?? null;
  if (!toward && unit.targetId) {
    toward = state.units.find((item) => item.id === unit.targetId)?.position ?? null;
  }
  if (!toward) return;
  const from = gridToScreen(unit.position, viewport.cellSize, viewport.origin);
  const to = gridToScreen(toward, viewport.cellSize, viewport.origin);
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) + Math.abs(dy) < 0.001) return;
  unit.facing = (Math.round(Math.atan2(dx, dy) / (Math.PI / 4)) + 8) % 8;
}

function drawSprite(unit, sheet, viewport, size) {
  updateFacing(unit, viewport);
  const moving = unit.path.length > 0 && !unit.disabled;
  const animation = sheet.animations.find((item) => item.name === (moving ? "run" : "idle"));
  const clock = reduceMotion ? 0 : (state.elapsed + unit.id.length * 0.13) / animation.seconds;
  const frame = Math.floor((clock % 1) * animation.frames) % animation.frames;
  const direction = unit.facing ?? 0;
  const image = sprites.images.get(sheet.file);
  const source = sheet.frameSize;
  const drawSize = viewport.cellSize.height * 3.3;
  context.save();
  if (unit.disabled) context.globalAlpha = 0.55;
  // The figure's feet sit about 84% down its frame; anchor them to the tile.
  context.drawImage(
    image,
    frame * source,
    (animation.row + direction) * source,
    source,
    source,
    -drawSize / 2,
    -drawSize * 0.84 + size * 1.0,
    drawSize,
    drawSize,
  );
  context.restore();
}

function drawUnit(unit, viewport) {
  const tile = state.grid[Math.round(unit.position.y)]?.[Math.round(unit.position.x)];
  const center = gridToScreen(
    unit.position,
    viewport.cellSize,
    viewport.origin,
    tile?.elevation ?? 0,
  );
  const size = Math.max(9, viewport.cellSize.height * 0.34);
  const appearance = unit.definition.appearance;

  const bob = spriteSheetFor(unit)
    ? 0
    : walkBob(state.elapsed, unit.path.length > 0 && !unit.disabled, reduceMotion);
  context.save();
  context.translate(center.x, center.y - size * 0.8 + bob);
  context.fillStyle = "rgba(0, 0, 0, .35)";
  context.beginPath();
  context.ellipse(0, size * 1.05, size * 0.9, size * 0.35, 0, 0, Math.PI * 2);
  context.fill();

  if (unit.id === state.selectedId) {
    context.strokeStyle = "#42d6d0";
    context.lineWidth = 2;
    context.beginPath();
    context.arc(0, 0, size * 1.35, 0, Math.PI * 2);
    context.stroke();
  }

  const sheet = spriteSheetFor(unit);
  if (sheet) drawSprite(unit, sheet, viewport, size);
  context.fillStyle = appearance.primaryColor;
  context.strokeStyle = appearance.accentColor;
  context.lineWidth = 3;
  context.beginPath();
  if (sheet) {
    // The sprite replaces the vector body.
  } else if (appearance.shape === "hexagon") {
    for (let index = 0; index < 6; index += 1) {
      const angle = Math.PI / 3 * index - Math.PI / 2;
      const point = { x: Math.cos(angle) * size, y: Math.sin(angle) * size };
      if (index === 0) context.moveTo(point.x, point.y);
      else context.lineTo(point.x, point.y);
    }
    context.closePath();
  } else {
    context.moveTo(0, -size * 1.2);
    context.lineTo(size * 0.9, 0);
    context.lineTo(0, size * 1.2);
    context.lineTo(-size * 0.9, 0);
    context.closePath();
  }
  if (!sheet) {
    context.fill();
    context.stroke();
    context.fillStyle = "#071012";
    context.font = `700 ${Math.max(9, size * 0.8)}px ui-monospace, monospace`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(appearance.marker, 0, 1);
  }

  const healthRatio = unit.health / unit.definition.stats.vitality;
  context.fillStyle = "rgba(3, 8, 10, .9)";
  context.fillRect(-size, size * 1.5, size * 2, 3);
  context.fillStyle = unit.disabled ? "#58646a" : healthRatio > 0.35 ? "#79d59b" : "#ff6b62";
  context.fillRect(-size, size * 1.5, size * 2 * healthRatio, 3);
  if (unit.disabled) {
    context.strokeStyle = "#ff6b62";
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(-size * 0.75, -size * 0.75);
    context.lineTo(size * 0.75, size * 0.75);
    context.moveTo(size * 0.75, -size * 0.75);
    context.lineTo(-size * 0.75, size * 0.75);
    context.stroke();
  }
  context.restore();
}

function draw() {
  if (!state.map) return;
  const size = resizeCanvas();
  const viewport = viewportFor(size);
  state.viewport = viewport;
  context.clearRect(0, 0, size.width, size.height);

  const tiles = state.grid.flat().filter(Boolean);
  tiles.sort((left, right) => left.x + left.y - (right.x + right.y));
  for (const tile of tiles) drawTile(tile, viewport);
  drawZones(viewport);
  drawCursor(viewport);

  const units = [...state.units].sort(
    (left, right) => left.position.x + left.position.y - (right.position.x + right.position.y),
  );
  for (const unit of units) drawUnit(unit, viewport);
  drawEffects(viewport);
}

function unitScreenPoint(unit, viewport) {
  const tile = state.grid[Math.round(unit.position.y)]?.[Math.round(unit.position.x)];
  const point = gridToScreen(unit.position, viewport.cellSize, viewport.origin, tile?.elevation ?? 0);
  return { x: point.x, y: point.y - Math.max(9, viewport.cellSize.height * 0.34) * 0.8 };
}

function drawEffects(viewport) {
  const size = Math.max(9, viewport.cellSize.height * 0.34);
  for (const effect of state.effects) {
    const progress = effectProgress(effect);
    const fade = 1 - progress;
    // Reduced motion keeps the cue visible but removes travel and growth.
    const grow = reduceMotion ? 1 : progress;
    context.save();
    context.lineWidth = 2;
    if (effect.type === "pulse") {
      const from = state.units.find((unit) => unit.id === effect.fromId);
      const to = state.units.find((unit) => unit.id === effect.toId);
      if (from && to) {
        const a = unitScreenPoint(from, viewport);
        const b = unitScreenPoint(to, viewport);
        context.strokeStyle = `rgba(66, 214, 208, ${0.9 * fade})`;
        context.setLineDash([8, 5]);
        context.beginPath();
        context.moveTo(a.x, a.y);
        context.lineTo(b.x, b.y);
        context.stroke();
        context.setLineDash([]);
        context.beginPath();
        context.arc(b.x, b.y, size * (0.6 + grow), 0, Math.PI * 2);
        context.stroke();
      }
    } else {
      const unit = state.units.find((item) => item.id === effect.unitId);
      const at = unit ? unitScreenPoint(unit, viewport) : effect.at;
      if (at) {
        const color = effect.type === "repair" ? "121, 213, 155" : "225, 179, 90";
        context.strokeStyle = `rgba(${color}, ${0.9 * fade})`;
        const rise = reduceMotion ? 0 : progress * size * 1.2;
        context.beginPath();
        context.arc(at.x, at.y - rise, size * (0.8 + grow * 0.9), 0, Math.PI * 2);
        context.stroke();
      }
    }
    context.restore();
  }
}

function simulationStep(deltaSeconds) {
  let interfaceChanged = false;
  for (const arrival of advanceUnits(state.units, deltaSeconds)) {
    interfaceChanged = true;
    interfaceChanged = completeObjectivesAt(arrival.position) || interfaceChanged;
  }
  const combatEvents = advanceCombat(state.units, deltaSeconds);
  if (combatEvents.length > 0) {
    interfaceChanged = true;
    for (const event of combatEvents) {
      if (event.type === "damage") {
        addEffect(state.effects, "pulse", { fromId: event.attackerId, toId: event.targetId });
      }
    }
    const latest = combatEvents.at(-1);
    if (latest.type === "disabled") {
      audio.play("disabled");
      const unit = state.units.find((item) => item.id === latest.unitId);
      setStatus(
        unit.side === "opposition"
          ? `${unit.definition.name} disabled. Route is clearer.`
          : `${unit.definition.name} disabled. Select another operator.`,
      );
      if (latest.unitId === state.selectedId) {
        state.selectedId = state.units.find(
          (item) => item.side === "team" && !item.disabled,
        )?.id ?? null;
      }
    } else {
      const target = state.units.find((item) => item.id === latest.targetId);
      setStatus(`${target.definition.name} integrity: ${latest.remaining}.`);
    }
  }
  if (interfaceChanged) renderInterface();
}

function update(deltaSeconds) {
  if (state.paused) {
    state.clock.accumulator = 0;
    return;
  }
  state.elapsed += deltaSeconds;
  advanceEffects(state.effects, deltaSeconds);
  consumeFixedSteps(state.clock, deltaSeconds, simulationStep);
}

function completeObjectivesAt(position) {
  let changed = false;
  for (const objective of state.objectives) {
    if (objective.complete) continue;
    if (objective.type === "interact") continue;
    const zone = state.map.zones.find((item) => item.id === objective.targetZone);
    if (!zone || !zoneContains(zone, position)) continue;
    if (objective.type === "extract") {
      const pending = state.objectives.some(
        (item) => item.required && item.type !== "extract" && !item.complete,
      );
      if (pending) {
        setStatus("Extraction is available after both relays are restored.");
        continue;
      }
    }
    objective.complete = true;
    syncGates();
    changed = true;
    audio.play("objective");
    const zoneRect = state.map.zones.find((item) => item.id === objective.targetZone);
    const restoredBy = state.units.find(
      (unit) => unit.side === "team" && zoneContains(zoneRect, unit.position),
    );
    if (restoredBy) addEffect(state.effects, "restore", { unitId: restoredBy.id });
    setStatus(
      objective.type === "extract"
        ? "Operation complete. Signal Yard has rejoined the district mesh."
        : `${objective.description} Commitment fulfilled.`,
    );
  }
  return changed;
}

function nearbyInteraction() {
  const unit = selectedUnit();
  if (!unit || unit.disabled || unit.path.length > 0) return null;
  return findObjectiveAtPosition(
    state.objectives,
    state.map.zones,
    { x: Math.round(unit.position.x), y: Math.round(unit.position.y) },
    "interact",
  );
}

function performInteraction() {
  const objective = nearbyInteraction();
  if (!objective) {
    setStatus("No unrestored relay is within reach.");
    return;
  }
  objective.complete = true;
  syncGates();
  audio.play("objective");
  if (selectedUnit()) addEffect(state.effects, "restore", { unitId: selectedUnit().id });
  setStatus(`${objective.description} Commitment fulfilled.`);
  renderInterface();
}

function frame(time) {
  const delta = Math.min((time - state.lastFrame) / 1000, 0.05);
  state.lastFrame = time;
  update(delta);
  draw();
  requestAnimationFrame(frame);
}

function selectedUnit() {
  return state.units.find((unit) => unit.id === state.selectedId) ?? null;
}

function selectUnit(id) {
  const requested = state.units.find((unit) => unit.id === id);
  if (!requested || requested.side !== "team" || requested.disabled) {
    setStatus("That operator is unavailable.");
    return;
  }
  state.selectedId = id;
  const unit = selectedUnit();
  if (unit) state.cursor = { x: Math.round(unit.position.x), y: Math.round(unit.position.y) };
  setStatus(`${unit?.definition.name ?? "Operator"} selected.`);
  audio.play("select");
  renderInterface();
  canvas.focus();
}

function issueMove(destination) {
  const unit = selectedUnit();
  if (!unit || unit.side !== "team" || unit.disabled) return;
  unit.targetId = null;
  const start = { x: Math.round(unit.position.x), y: Math.round(unit.position.y) };
  const path = findPath(state.grid, start, destination);
  if (path.length === 0) {
    setStatus(
      start.x === destination.x && start.y === destination.y
        ? "Operator is already at that position."
        : "No safe route to that tile.",
    );
    return;
  }
  unit.position = start;
  unit.path = path;
  state.cursor = { ...destination };
  audio.play("move");
  if (reduceMotion) {
    let objectiveChanged = false;
    for (const step of path) {
      objectiveChanged = completeObjectivesAt(step) || objectiveChanged;
    }
    unit.position = { ...destination };
    unit.path = [];
    if (!objectiveChanged) {
      setStatus(`Route completed: ${path.length} grid steps.`);
    }
  } else {
    setStatus(`Route accepted: ${path.length} grid steps.`);
  }
  renderInterface();
}

function issueAttack(targetId) {
  const attacker = selectedUnit();
  const target = state.units.find((unit) => unit.id === targetId);
  if (!attacker || attacker.disabled || !target || target.side !== "opposition") return;
  if (target.disabled) {
    setStatus("That watcher is already disabled.");
    return;
  }
  const distance = Math.hypot(
    attacker.position.x - target.position.x,
    attacker.position.y - target.position.y,
  );
  const pulse = equipmentWithAction(attacker, "disable-pulse");
  if (!pulse) {
    setStatus("This operator has no disabling tool equipped.");
    return;
  }
  const stats = combatStats(attacker);
  if (distance > stats.range) {
    attacker.targetId = null;
    setStatus(
      `Target is out of range. Move within ${stats.range} tiles, then target again.`,
    );
    return;
  }
  attacker.path = [];
  attacker.targetId = target.id;
  setStatus(`Disabling pulse locked on ${target.definition.name}.`);
  audio.play("pulse");
  renderInterface();
  canvas.focus();
}

function useRepairKit() {
  const unit = selectedUnit();
  const kit = equipmentWithAction(unit, "restore-vitality");
  if (!unit || unit.disabled || !kit || kit.charges === 0) {
    setStatus("No field repair kit is available.");
    return;
  }
  const maximum = unit.definition.stats.vitality;
  if (unit.health >= maximum) {
    setStatus("Operator integrity is already full.");
    return;
  }
  const restored = Math.min(kit.definition.effect.restoreVitality, maximum - unit.health);
  unit.health += restored;
  if (kit.charges !== null) kit.charges -= 1;
  setStatus(`${kit.definition.name} restored ${restored} integrity.`);
  audio.play("repair");
  addEffect(state.effects, "repair", { unitId: unit.id });
  renderInterface();
}

function hitUnit(position) {
  if (!state.viewport) return null;
  let closest = null;
  let closestDistance = 28;
  for (const unit of state.units) {
    const tile = state.grid[Math.round(unit.position.y)]?.[Math.round(unit.position.x)];
    const center = gridToScreen(
      unit.position,
      state.viewport.cellSize,
      state.viewport.origin,
      tile?.elevation ?? 0,
    );
    const distance = Math.hypot(position.x - center.x, position.y - (center.y - 12));
    if (distance < closestDistance) {
      closest = unit;
      closestDistance = distance;
    }
  }
  return closest;
}

canvas.addEventListener("click", (event) => {
  if (!state.map || !state.viewport) return;
  const bounds = canvas.getBoundingClientRect();
  const position = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  const unit = hitUnit(position);
  if (unit) {
    if (unit.side === "team") selectUnit(unit.id);
    else issueAttack(unit.id);
    return;
  }
  const destination = screenToGrid(position, state.viewport.cellSize, state.viewport.origin);
  if (
    destination.x >= 0 &&
    destination.y >= 0 &&
    destination.x < state.map.dimensions.width &&
    destination.y < state.map.dimensions.height
  ) {
    issueMove(destination);
  }
});

canvas.addEventListener("keydown", (event) => {
  const moves = {
    cursorLeft: { x: -1, y: 0 },
    cursorRight: { x: 1, y: 0 },
    cursorUp: { x: 0, y: -1 },
    cursorDown: { x: 0, y: 1 },
  };
  const action = resolveAction(bindings, event);
  if (moves[action]) {
    event.preventDefault();
    state.cursor.x = Math.max(
      0,
      Math.min(state.map.dimensions.width - 1, state.cursor.x + moves[action].x),
    );
    state.cursor.y = Math.max(
      0,
      Math.min(state.map.dimensions.height - 1, state.cursor.y + moves[action].y),
    );
  } else if (action === "move") {
    event.preventDefault();
    issueMove(state.cursor);
  } else if (action === "interact") {
    event.preventDefault();
    performInteraction();
  } else if (action === "repair") {
    event.preventDefault();
    useRepairKit();
  } else if (action === "deselect") {
    state.selectedId = null;
    renderInterface();
  }
});

function togglePause() {
  state.paused = !state.paused;
  pauseButton.setAttribute("aria-pressed", String(state.paused));
  pauseLabel.textContent = state.paused ? "Resume" : "Pause";
  setStatus(state.paused ? "Operation paused." : "Operation resumed.");
}

pauseButton.addEventListener("click", togglePause);
window.addEventListener("keydown", (event) => {
  if (resolveAction(bindings, event) === "pause" && event.target === canvas) {
    event.preventDefault();
    togglePause();
  }
});
resetButton.addEventListener("click", () => {
  loadGame().catch(showFatalError);
});
for (const button of document.querySelectorAll("[data-cursor-x]")) {
  button.addEventListener("click", () => {
    if (!state.map) return;
    state.cursor.x = Math.max(
      0,
      Math.min(state.map.dimensions.width - 1, state.cursor.x + Number(button.dataset.cursorX)),
    );
    state.cursor.y = Math.max(
      0,
      Math.min(state.map.dimensions.height - 1, state.cursor.y + Number(button.dataset.cursorY)),
    );
  });
}
moveButton.addEventListener("click", () => issueMove(state.cursor));
actionButton.addEventListener("click", performInteraction);
repairButton.addEventListener("click", useRepairKit);
saveButton.addEventListener("click", saveLocally);
loadButton.addEventListener("click", loadLocally);
exportButton.addEventListener("click", exportSave);
importButton.addEventListener("click", () => importFile.click());
importFile.addEventListener("change", () => importSave(importFile.files[0]));
document.querySelector("#about-button").addEventListener("click", () => aboutDialog.showModal());
document.querySelector("#close-about").addEventListener("click", () => aboutDialog.close());

function renderInterface() {
  if (!state.mission) return;
  objectiveList.replaceChildren(
    ...state.objectives.map((objective) => {
      const item = document.createElement("li");
      item.textContent = objective.description;
      item.classList.toggle("complete", objective.complete);
      item.setAttribute(
        "aria-label",
        `${objective.complete ? "Complete" : "Pending"}: ${objective.description}`,
      );
      return item;
    }),
  );
  const completed = state.objectives.filter((objective) => objective.complete).length;
  objectiveCount.textContent = `${completed} / ${state.objectives.length}`;

  const operators = state.units.filter((unit) => unit.side === "team");
  rosterElement.replaceChildren(
    ...operators.map((unit, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.disabled = unit.disabled;
      button.setAttribute("aria-pressed", String(unit.id === state.selectedId));
      button.addEventListener("click", () => selectUnit(unit.id));
      const location = `${Math.round(unit.position.x).toString().padStart(2, "0")}:${Math.round(unit.position.y).toString().padStart(2, "0")}`;
      const glyph = document.createElement("span");
      glyph.className = "operator-glyph";
      glyph.setAttribute("aria-hidden", "true");
      glyph.textContent = "◇";
      const name = document.createElement("span");
      name.textContent = `${unit.definition.name} ${index + 1} · ${unit.health}/${unit.definition.stats.vitality}`;
      const position = document.createElement("span");
      position.className = "operator-position";
      position.textContent = location;
      button.append(glyph, name, position);
      return button;
    }),
  );

  const threats = state.units.filter((unit) => unit.side === "opposition");
  threatsElement.replaceChildren(
    ...threats.map((unit, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.disabled = String(unit.disabled);
      button.addEventListener("click", () => issueAttack(unit.id));
      const name = document.createElement("span");
      name.textContent = `${unit.definition.name} ${index + 1}`;
      const vitality = document.createElement("span");
      vitality.className = "vitality";
      vitality.textContent = unit.disabled
        ? "DISABLED"
        : `${unit.health}/${unit.definition.stats.vitality}`;
      button.append(name, vitality);
      return button;
    }),
  );

  const unit = selectedUnit();
  const interaction = nearbyInteraction();
  actionButton.disabled = interaction === null;
  actionLabel.textContent = interaction ? "Restore nearby relay" : "Restore relay";
  const repairKit = equipmentWithAction(unit, "restore-vitality");
  const canRepair = Boolean(
    unit &&
    !unit.disabled &&
    unit.health < unit.definition.stats.vitality &&
    repairKit &&
    repairKit.charges !== 0,
  );
  repairButton.disabled = !canRepair;
  repairLabel.textContent = repairKit
    ? `Use repair kit (${repairKit.charges ?? "∞"})`
    : "No repair kit";
  selectedReadout.textContent = unit
    ? `${unit.definition.name} · integrity ${unit.health}/${unit.definition.stats.vitality} · at ${Math.round(unit.position.x)}, ${Math.round(unit.position.y)}${unit.path.length ? ` · moving · ${unit.path.length} steps remain` : unit.targetId ? " · pulse target locked" : " · awaiting order"}`
    : "No operator selected.";
}

function setStatus(message) {
  statusMessage.textContent = message;
}

function showFatalError(error) {
  console.error(error);
  setStatus(`Prototype could not start: ${error.message}`);
}

fetch("build-meta.json")
  .then((response) => response.json())
  .then((metadata) => {
    document.querySelector("#revision").textContent = `source: ${metadata.revision.slice(0, 12)}`;
  })
  .catch(() => {
    document.querySelector("#revision").textContent = "source: unavailable";
  });

loadGame().catch(showFatalError);
requestAnimationFrame(frame);
