// SPDX-License-Identifier: GPL-2.0-or-later

import {
  buildPatrolRoute,
  createTileGrid,
  isTerrainWalkable,
  findPath,
  formationTiles,
  findObjectiveAtPosition,
  gridToScreen,
  isWalkable,
  screenToGrid,
  zoneContains,
} from "./engine.js";
import {
  centreOn,
  clampCamera,
  createCamera,
  followTarget,
  forEachVisibleTile,
  miniProject,
  miniSize,
  miniUnproject,
  nearEdge,
  panByScreen,
  viewportFor as cameraViewport,
  visibleBounds,
  zoomCamera,
} from "./camera.js";
import { advanceCombat, advancePatrols, advanceUnits, consumeFixedSteps } from "./simulation.js";
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
import {
  missionComplete as isMissionComplete,
  missionOutcome,
  resolveArrival, syncGates as syncMissionGates,
} from "./mission.js";
import { addEffect, advanceEffects, createEffects, effectProgress, walkBob } from "./effects.js";
import { BARS, BAR_HINTS, BAR_LABELS, LEVEL_MAX, adjustLevel, defaultLevels } from "./stats.js";
import { createMusic } from "./music.js";
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
const titleDialog = document.querySelector("#title-dialog");
const outcomeDialog = document.querySelector("#outcome-dialog");
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

const music = createMusic({
  getSettings: () => settings,
  AudioContextClass: window.AudioContext ?? window.webkitAudioContext,
});
// Browsers only allow audio after a user gesture, so music starts on first input.
for (const type of ["pointerdown", "keydown"]) {
  window.addEventListener(type, () => music.start(), { once: true });
}

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
  music.refresh();
  applyTextScale();
}

function applyTextScale() {
  document.documentElement.style.fontSize = `${settings.textScale * 100}%`;
}

const settingsDialog = document.querySelector("#settings-dialog");
const settingControls = {
  volume: document.querySelector("#setting-volume"),
  muted: document.querySelector("#setting-muted"),
  music: document.querySelector("#setting-music"),
  musicVolume: document.querySelector("#setting-music-volume"),
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
  settingControls.music.checked = settings.music;
  settingControls.musicVolume.value = settings.musicVolume;
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
    music: settingControls.music.checked,
    musicVolume: Number(settingControls.musicVolume.value),
    captions: settingControls.captions.checked,
    reducedMotion: settingControls.reducedMotion.value,
    textScale: Number(settingControls.textScale.value),
  });
});
applyTextScale();

const SPRITE_SKINS = ["operative-one", "operative-two", "operative-three", "operative-four"];
const WATCHER_SKINS = ["watcher-one", "watcher-two"];
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
  camera: createCamera({ x: 0, y: 0 }),
  miniTerrain: null,
  group: false,
  outcome: "active",
  missionSeconds: 0,
  modal: false,
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
      alertedBy: null,
      levels: defaultLevels(),
      patrol: placement.patrol
        ? { route: buildPatrolRoute(state.grid, placement.position, placement.patrol), index: 0 }
        : null,
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
  // Reset only now that the new units exist, or the old squad would re-trigger the outcome.
  state.outcome = "active";
  state.missionSeconds = 0;
  state.group = false;
  state.camera = createCamera(mission.team[0].position);
  buildMiniTerrain();
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

function syncGates() {
  syncMissionGates(state.grid, state.map, state.objectives);
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
    patrolLengths: Object.fromEntries(
      state.units.map((unit) => [unit.id, unit.patrol?.route.length ?? 0]),
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
    unit.levels = { ...saved.levels };
    if (unit.patrol) unit.patrol.index = saved.patrolIndex;
  }
  const objectivesById = new Map(
    snapshot.objectives.map((objective) => [objective.id, objective]),
  );
  for (const objective of state.objectives) {
    objective.complete = objectivesById.get(objective.id).complete;
  }
  syncGates();
  state.group = false;
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
  return cameraViewport(state.camera, state.map, size);
}

const shadeCache = new Map();

function shade(hex, amount) {
  const key = `${hex}${amount}`;
  let result = shadeCache.get(key);
  if (result === undefined) {
    const value = Number.parseInt(hex.slice(1), 16);
    const clamp = (part) => Math.max(0, Math.min(255, part));
    result = `rgb(${clamp((value >> 16) + amount)}, ${clamp(((value >> 8) & 255) + amount)}, ${clamp((value & 255) + amount)})`;
    shadeCache.set(key, result);
  }
  return result;
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
  if (!sprites.manifest) return null;
  if (unit.side !== "team") {
    const index = state.units.filter((item) => item.side !== "team").indexOf(unit);
    return sprites.manifest.sheets[WATCHER_SKINS[index % WATCHER_SKINS.length]] ?? null;
  }
  const index = state.units.filter((item) => item.side === "team").indexOf(unit);
  return sprites.manifest.sheets[SPRITE_SKINS[index % SPRITE_SKINS.length]] ?? null;
}

// Eight facings, 0 toward the camera, increasing clockwise as seen on screen.
function isPatrolling(unit) {
  return Boolean(unit.patrol && unit.patrol.route.length > 0 && !unit.targetId && !unit.disabled);
}

function updateFacing(unit, viewport) {
  let toward = unit.path[0] ?? null;
  if (!toward && isPatrolling(unit)) toward = unit.patrol.route[unit.patrol.index];
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
  const moving = (unit.path.length > 0 && !unit.disabled) || isPatrolling(unit);
  const animation = sheet.animations.find((item) => item.name === (moving ? "walk" : "idle"));
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

  const inGroup = state.group && unit.side === "team" && !unit.disabled;
  if (unit.id === state.selectedId || inGroup) {
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

  forEachVisibleTile(state.grid, visibleBounds(viewport, state.map), (tile) => drawTile(tile, viewport));
  drawZones(viewport);
  drawCursor(viewport);

  const units = [...state.units].sort(
    (left, right) => left.position.x + left.position.y - (right.position.x + right.position.y),
  );
  for (const unit of units) drawUnit(unit, viewport);
  drawEffects(viewport);
  drawMinimap(viewport);
}

const minimap = document.querySelector("#minimap");
const miniContext = minimap.getContext("2d");
const MINI_COLORS = {
  "runoff-channel": "#1f5568",
  "signal-grate": "#7a96a0",
  "utility-building": "#12171b",
  "service-fence": "#6b7a84",
  "relay-pad": "#e1b35a",
};

// Terrain never changes, so it is painted once per mission and reused each frame.
function buildMiniTerrain() {
  const { width, height } = miniSize(state.map);
  const canvasElement = document.createElement("canvas");
  canvasElement.width = width;
  canvasElement.height = height;
  const painter = canvasElement.getContext("2d");
  for (const row of state.grid) {
    for (const tile of row) {
      if (!tile) continue;
      const point = miniProject(tile, state.map);
      painter.fillStyle = MINI_COLORS[tile.surface] ?? "#3a4750";
      painter.fillRect(Math.round(point.x - 1), Math.floor(point.y), 2, 1);
    }
  }
  state.miniTerrain = canvasElement;
  minimap.width = width;
  minimap.height = height;
}

function drawMinimap(viewport) {
  if (!state.miniTerrain) return;
  miniContext.clearRect(0, 0, minimap.width, minimap.height);
  miniContext.drawImage(state.miniTerrain, 0, 0);
  for (const gate of state.map.objects ?? []) {
    const open = state.grid[gate.position.y][gate.position.x].walkable;
    const point = miniProject(gate.position, state.map);
    miniContext.fillStyle = open ? "#79d59b" : "#ff6b62";
    miniContext.fillRect(Math.round(point.x - 2), Math.floor(point.y) - 1, 4, 3);
  }
  for (const zone of state.map.zones) {
    const objective = state.objectives.find((item) => item.targetZone === zone.id);
    if (zone.kind === "interaction" || zone.kind === "exit") {
      const point = miniProject(zone.position, state.map);
      miniContext.strokeStyle = objective?.complete ? "#79d59b" : "#e1b35a";
      miniContext.strokeRect(Math.round(point.x - 3), Math.floor(point.y) - 2, 6, 4);
    }
  }
  for (const unit of state.units) {
    if (unit.disabled) continue;
    const point = miniProject(unit.position, state.map);
    miniContext.fillStyle = unit.side === "team" ? "#42d6d0" : "#ff6b62";
    miniContext.fillRect(Math.round(point.x) - 1, Math.round(point.y) - 1, 3, 3);
  }
  // The area the main view currently shows.
  const corners = [
    { x: 0, y: 0 },
    { x: viewport.width, y: 0 },
    { x: viewport.width, y: viewport.height },
    { x: 0, y: viewport.height },
  ].map((corner) => miniProject(screenToGrid(corner, viewport.cellSize, viewport.origin), state.map));
  miniContext.strokeStyle = "rgba(255, 255, 255, .85)";
  miniContext.lineWidth = 1;
  miniContext.beginPath();
  corners.forEach((point, index) => {
    if (index === 0) miniContext.moveTo(point.x, point.y);
    else miniContext.lineTo(point.x, point.y);
  });
  miniContext.closePath();
  miniContext.stroke();
}

minimap.addEventListener("click", (event) => {
  if (!state.map) return;
  const bounds = minimap.getBoundingClientRect();
  const point = {
    x: ((event.clientX - bounds.left) / bounds.width) * minimap.width,
    y: ((event.clientY - bounds.top) / bounds.height) * minimap.height,
  };
  centreOn(state.camera, miniUnproject(point, state.map));
  clampCamera(state.camera, state.map);
  canvas.focus();
});

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
  state.missionSeconds += deltaSeconds;
  let interfaceChanged = false;
  for (const arrival of advanceUnits(state.units, deltaSeconds)) {
    interfaceChanged = true;
    interfaceChanged = completeObjectivesAt(arrival.position) || interfaceChanged;
  }
  for (const event of advancePatrols(state.units, deltaSeconds, state.grid)) {
    const watcher = state.units.find((unit) => unit.id === event.unitId);
    const spotted = state.units.find((unit) => unit.id === event.targetId);
    setStatus(`${watcher.definition.name} spotted ${spotted.definition.name}! It is closing in.`);
    audio.play("alert");
    interfaceChanged = true;
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

function formatDuration(seconds) {
  const whole = Math.round(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

function showOutcome(outcome) {
  const won = outcome === "success";
  document.querySelector("#outcome-eyebrow").textContent = won ? "OPERATION COMPLETE" : "OPERATION LOST";
  document.querySelector("#outcome-heading").textContent = won
    ? "Signal Yard is back on the mesh"
    : "The team has gone dark";
  document.querySelector("#outcome-text").textContent = won
    ? "Both relays carry the district's voice again, the gate stands open, and your team slips away before the watchers can respond."
    : "Every operator has been disabled. The relays stay silent and the gate stays locked. Regroup and try a different approach.";
  const teamDown = state.units.filter((unit) => unit.side === "team" && unit.disabled).length;
  const watchersDown = state.units.filter((unit) => unit.side === "opposition" && unit.disabled).length;
  const stats = document.querySelector("#outcome-stats");
  stats.replaceChildren();
  for (const [label, value] of [
    ["Time", formatDuration(state.missionSeconds)],
    ["Operators disabled", String(teamDown)],
    ["Watchers disabled", String(watchersDown)],
  ]) {
    const term = document.createElement("dt");
    term.textContent = label;
    const detail = document.createElement("dd");
    detail.textContent = value;
    stats.append(term, detail);
  }
  state.modal = true;
  outcomeDialog.showModal();
}

function checkOutcome() {
  if (state.outcome !== "active") return;
  const outcome = missionOutcome(state.objectives, state.units);
  if (outcome === "active") return;
  state.outcome = outcome;
  showOutcome(outcome);
}

function update(deltaSeconds) {
  if (state.paused || state.modal) {
    state.clock.accumulator = 0;
    return;
  }
  state.elapsed += deltaSeconds;
  advanceEffects(state.effects, deltaSeconds);
  consumeFixedSteps(state.clock, deltaSeconds, simulationStep);
  checkOutcome();
}

function completeObjectivesAt(position) {
  let changed = false;
  for (const event of resolveArrival(state.objectives, state.map.zones, position)) {
    if (event.type === "blocked") {
      setStatus("Extraction is available after all other commitments are fulfilled.");
      continue;
    }
    const { objective } = event;
    syncGates();
    changed = true;
    audio.play("objective");
    const zone = state.map.zones.find((item) => item.id === objective.targetZone);
    const restoredBy = state.units.find(
      (unit) => unit.side === "team" && zoneContains(zone, unit.position),
    );
    if (restoredBy) addEffect(state.effects, "restore", { unitId: restoredBy.id });
    setStatus(
      objective.type === "extract" && isMissionComplete(state.objectives)
        ? "Operation complete. Signal Yard has rejoined the district mesh."
        : `${objective.description} Commitment fulfilled.`,
    );
  }
  return changed;
}

// The operator who can interact right now (any group member in group mode) and what with.
function interactionCandidate() {
  const candidates = state.group ? activeOperators() : [selectedUnit()];
  for (const unit of candidates) {
    if (!unit || unit.disabled || unit.path.length > 0) continue;
    const objective = findObjectiveAtPosition(
      state.objectives,
      state.map.zones,
      { x: Math.round(unit.position.x), y: Math.round(unit.position.y) },
      "interact",
    );
    if (objective) return { unit, objective };
  }
  return null;
}

function nearbyInteraction() {
  return interactionCandidate()?.objective ?? null;
}

function performInteraction() {
  const candidate = interactionCandidate();
  if (!candidate) {
    setStatus("No unrestored relay is within reach.");
    return;
  }
  const { unit, objective } = candidate;
  objective.complete = true;
  syncGates();
  audio.play("objective");
  addEffect(state.effects, "restore", { unitId: unit.id });
  setStatus(`${objective.description} Commitment fulfilled.`);
  renderInterface();
}

function frame(time) {
  const delta = Math.min((time - state.lastFrame) / 1000, 0.05);
  state.lastFrame = time;
  if (state.map) followTarget(state.camera, delta, reduceMotion);
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
  state.group = false;
  const unit = selectedUnit();
  if (unit) {
    state.cursor = { x: Math.round(unit.position.x), y: Math.round(unit.position.y) };
    centreOn(state.camera, unit.position);
  }
  setStatus(`${unit?.definition.name ?? "Operator"} selected.`);
  audio.play("select");
  renderInterface();
  canvas.focus();
}

function activeOperators() {
  return state.units.filter((unit) => unit.side === "team" && !unit.disabled);
}

function selectAll() {
  const operators = activeOperators();
  if (operators.length === 0) {
    setStatus("No operators are available.");
    return;
  }
  state.group = true;
  if (!operators.some((unit) => unit.id === state.selectedId)) state.selectedId = operators[0].id;
  setStatus(`All ${operators.length} operators selected.`);
  audio.play("select");
  renderInterface();
  canvas.focus();
}

// Order one operator along a route; returns the number of steps, or 0 if there is none.
function orderMove(unit, destination) {
  unit.targetId = null;
  const start = { x: Math.round(unit.position.x), y: Math.round(unit.position.y) };
  const path = findPath(state.grid, start, destination);
  if (path.length === 0) return 0;
  unit.position = start;
  unit.path = path;
  if (reduceMotion) {
    for (const step of path) completeObjectivesAt(step);
    unit.position = { ...destination };
    unit.path = [];
  }
  return path.length;
}

// Spread a group over distinct tiles around the destination, nearest tile first.
function groupDestinations(operators, destination) {
  const free = formationTiles(state.grid, destination, operators.length);
  const assignments = [];
  for (const unit of [...operators].sort((left, right) => (left.id < right.id ? -1 : 1))) {
    let best = 0;
    for (let index = 1; index < free.length; index += 1) {
      const distance = (tile) => Math.hypot(tile.x - unit.position.x, tile.y - unit.position.y);
      if (distance(free[index]) < distance(free[best])) best = index;
    }
    if (free.length > 0) assignments.push([unit, free.splice(best, 1)[0]]);
  }
  return assignments;
}

function issueMove(destination) {
  if (state.group) {
    const assignments = groupDestinations(activeOperators(), destination);
    const moving = assignments.filter(([unit, tile]) => orderMove(unit, tile) > 0);
    if (moving.length === 0) {
      setStatus("No safe route to that tile.");
      return;
    }
    state.cursor = { ...destination };
    audio.play("move");
    setStatus(`${moving.length} operators moving.`);
    renderInterface();
    return;
  }
  const unit = selectedUnit();
  if (!unit || unit.side !== "team" || unit.disabled) return;
  const start = { x: Math.round(unit.position.x), y: Math.round(unit.position.y) };
  const steps = orderMove(unit, destination);
  if (steps === 0) {
    setStatus(
      start.x === destination.x && start.y === destination.y
        ? "Operator is already at that position."
        : "No safe route to that tile.",
    );
    return;
  }
  state.cursor = { ...destination };
  audio.play("move");
  setStatus(reduceMotion ? `Route completed: ${steps} grid steps.` : `Route accepted: ${steps} grid steps.`);
  renderInterface();
}

function lockPulse(attacker, target) {
  const pulse = equipmentWithAction(attacker, "disable-pulse");
  if (!pulse) return "no-tool";
  const distance = Math.hypot(
    attacker.position.x - target.position.x,
    attacker.position.y - target.position.y,
  );
  if (distance > combatStats(attacker).range) {
    attacker.targetId = null;
    return "out-of-range";
  }
  attacker.path = [];
  attacker.targetId = target.id;
  return "locked";
}

function issueAttack(targetId) {
  const target = state.units.find((unit) => unit.id === targetId);
  if (!target || target.side !== "opposition") return;
  if (target.disabled) {
    setStatus("That watcher is already disabled.");
    return;
  }
  if (state.group) {
    const operators = activeOperators();
    const locked = operators.filter((unit) => lockPulse(unit, target) === "locked");
    if (locked.length === 0) {
      setStatus("No selected operator is within pulse range. Move closer, then target again.");
      return;
    }
    setStatus(`Pulse locked on ${target.definition.name} by ${locked.length} of ${operators.length} operators.`);
    audio.play("pulse");
    renderInterface();
    canvas.focus();
    return;
  }
  const attacker = selectedUnit();
  if (!attacker || attacker.disabled) return;
  const result = lockPulse(attacker, target);
  if (result === "no-tool") {
    setStatus("This operator has no disabling tool equipped.");
    return;
  }
  if (result === "out-of-range") {
    setStatus(`Target is out of range. Move within ${combatStats(attacker).range} tiles, then target again.`);
    return;
  }
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

// Scroll the view when the cursor nears the edge of the canvas.
function followCursor() {
  if (state.viewport && nearEdge(state.cursor, state.viewport)) centreOn(state.camera, state.cursor);
}

function centreOnSelection() {
  const unit = selectedUnit();
  if (unit) centreOn(state.camera, unit.position);
}

// Dragging the map pans it; a drag must not also count as a click.
const drag = { pointerId: null, lastX: 0, lastY: 0, moved: 0, active: false, suppressClick: false };
canvas.addEventListener("pointerdown", (event) => {
  if (!state.map || event.button !== 0) return;
  Object.assign(drag, { pointerId: event.pointerId, lastX: event.clientX, lastY: event.clientY, moved: 0, active: false });
});
canvas.addEventListener("pointermove", (event) => {
  if (drag.pointerId !== event.pointerId || !state.viewport) return;
  const deltaX = event.clientX - drag.lastX;
  const deltaY = event.clientY - drag.lastY;
  drag.lastX = event.clientX;
  drag.lastY = event.clientY;
  drag.moved += Math.abs(deltaX) + Math.abs(deltaY);
  if (!drag.active) {
    if (drag.moved < 8) return;
    drag.active = true;
    canvas.setPointerCapture(event.pointerId);
  }
  drag.suppressClick = true;
  panByScreen(state.camera, deltaX, deltaY, state.viewport, state.map);
});
for (const type of ["pointerup", "pointercancel"]) {
  canvas.addEventListener(type, (event) => {
    if (drag.pointerId === event.pointerId) Object.assign(drag, { pointerId: null, active: false });
  });
}
canvas.addEventListener(
  "wheel",
  (event) => {
    if (!state.map) return;
    event.preventDefault();
    zoomCamera(state.camera, event.deltaY < 0 ? 1.12 : 1 / 1.12);
  },
  { passive: false },
);

canvas.addEventListener("click", (event) => {
  if (drag.suppressClick) {
    drag.suppressClick = false;
    return;
  }
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
    followCursor();
  } else if (action === "centre") {
    event.preventDefault();
    centreOnSelection();
  } else if (action === "zoomIn" || action === "zoomOut") {
    event.preventDefault();
    zoomCamera(state.camera, action === "zoomIn" ? 1.15 : 1 / 1.15);
  } else if (action === "move") {
    event.preventDefault();
    issueMove(state.cursor);
  } else if (action === "interact") {
    event.preventDefault();
    performInteraction();
  } else if (action === "repair") {
    event.preventDefault();
    useRepairKit();
  } else if (action === "selectAll") {
    event.preventDefault();
    selectAll();
  } else if (action === "deselect") {
    state.selectedId = null;
    state.group = false;
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
    followCursor();
  });
}
moveButton.addEventListener("click", () => issueMove(state.cursor));
document.querySelector("#select-all-button").addEventListener("click", selectAll);
actionButton.addEventListener("click", performInteraction);
repairButton.addEventListener("click", useRepairKit);
saveButton.addEventListener("click", saveLocally);
loadButton.addEventListener("click", loadLocally);
exportButton.addEventListener("click", exportSave);
importButton.addEventListener("click", () => importFile.click());
importFile.addEventListener("change", () => importSave(importFile.files[0]));
for (const dialog of [titleDialog, outcomeDialog]) {
  dialog.addEventListener("close", () => {
    state.modal = false;
    canvas.focus();
  });
}
document.querySelector("#begin-button").addEventListener("click", () => titleDialog.close());
document.querySelector("#replay-button").addEventListener("click", () => {
  outcomeDialog.close();
  loadGame().catch(showFatalError);
});
document.querySelector("#outcome-close").addEventListener("click", () => outcomeDialog.close());
titleDialog.showModal();
state.modal = true;
// Browser tests add ?e2e to reach states that take too long to play out.
if (new URLSearchParams(location.search).has("e2e")) {
  window.opensyndTest = {
    positions() {
      return Object.fromEntries(state.units.map((unit) => [unit.id, { ...unit.position }]));
    },
    disableOperators() {
      for (const unit of state.units) {
        if (unit.side === "team") {
          unit.health = 0;
          unit.disabled = true;
          unit.path = [];
          unit.targetId = null;
        }
      }
    },
    placeUnit(id, x, y) {
      const unit = state.units.find((item) => item.id === id);
      unit.position = { x, y };
      unit.path = [];
    },
    completeObjectives() {
      for (const objective of state.objectives) objective.complete = true;
    },
  };
}
document.querySelector("#about-button").addEventListener("click", () => aboutDialog.showModal());
document.querySelector("#close-about").addEventListener("click", () => aboutDialog.close());

function levelBar(level, label) {
  const bar = document.createElement("span");
  bar.className = "bar";
  bar.setAttribute("role", "img");
  bar.setAttribute("aria-label", `${label} ${level} of ${LEVEL_MAX}`);
  for (let index = 1; index <= LEVEL_MAX; index += 1) {
    const segment = document.createElement("i");
    segment.classList.toggle("filled", index <= level);
    bar.append(segment);
  }
  return bar;
}

// Raise or lower a bar for the selected operator, or for everyone in group mode.
function adjustTraining(bar, delta) {
  const targets = state.group ? activeOperators() : [selectedUnit()].filter(Boolean);
  let changed = 0;
  for (const unit of targets) {
    const next = adjustLevel(unit.levels, bar, delta);
    if (next !== unit.levels) {
      unit.levels = next;
      changed += 1;
    }
  }
  if (changed === 0) {
    setStatus(`${BAR_LABELS[bar]} cannot go ${delta > 0 ? "higher" : "lower"}.`);
    return;
  }
  const subject = state.group ? "All operators" : targets[0].definition.name;
  setStatus(`${subject}: ${BAR_LABELS[bar]} ${delta > 0 ? "raised" : "lowered"}.`);
  audio.play("select");
  renderInterface();
  canvas.focus();
}

function renderTraining() {
  const unit = selectedUnit();
  const container = document.querySelector("#training-bars");
  document.querySelector("#training-heading").textContent = unit
    ? `${unit.definition.name} ${state.units.filter((item) => item.side === "team").indexOf(unit) + 1}`
    : "Operative bars";
  container.replaceChildren(
    ...BARS.map((bar) => {
      const row = document.createElement("div");
      row.className = "training-row";
      row.title = BAR_HINTS[bar];
      const label = document.createElement("span");
      label.textContent = BAR_LABELS[bar];
      const level = unit?.levels[bar] ?? 0;
      const lower = document.createElement("button");
      lower.type = "button";
      lower.textContent = "−";
      lower.setAttribute("aria-label", `Lower ${BAR_LABELS[bar]}`);
      lower.disabled = !unit || level <= 1;
      lower.addEventListener("click", () => adjustTraining(bar, -1));
      const raise = document.createElement("button");
      raise.type = "button";
      raise.textContent = "+";
      raise.setAttribute("aria-label", `Raise ${BAR_LABELS[bar]}`);
      raise.disabled = !unit || level >= LEVEL_MAX;
      raise.addEventListener("click", () => adjustTraining(bar, 1));
      row.append(label, levelBar(level, BAR_LABELS[bar]), lower, raise);
      return row;
    }),
  );
}

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

  const selectAllButton = document.querySelector("#select-all-button");
  selectAllButton.textContent = `Select all (${bindingLabel(bindings.selectAll)})`;
  selectAllButton.setAttribute("aria-pressed", String(state.group));
  const operators = state.units.filter((unit) => unit.side === "team");
  rosterElement.replaceChildren(
    ...operators.map((unit, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.disabled = unit.disabled;
      button.setAttribute(
        "aria-pressed",
        String(unit.id === state.selectedId || (state.group && !unit.disabled)),
      );
      button.addEventListener("click", () => selectUnit(unit.id));
      const pad = (value) => Math.round(value).toString().padStart(2, "0");
      const location = `${pad(unit.position.x)}:${pad(unit.position.y)}`;
      const glyph = document.createElement("span");
      glyph.className = "operator-glyph";
      glyph.setAttribute("aria-hidden", "true");
      glyph.textContent = "◇";
      const name = document.createElement("span");
      name.textContent = `${unit.definition.name} ${index + 1} · ${unit.health}/${unit.definition.stats.vitality}`;
      const position = document.createElement("span");
      position.className = "operator-position";
      position.textContent = location;
      const bars = document.createElement("span");
      bars.className = "mini-bars";
      for (const bar of BARS) {
        const group = document.createElement("span");
        group.append(BAR_LABELS[bar], levelBar(unit.levels[bar], BAR_LABELS[bar]));
        bars.append(group);
      }
      button.append(glyph, name, position, bars);
      return button;
    }),
  );

  renderTraining();

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
  let orders = " · awaiting order";
  if (unit?.path.length) orders = ` · moving · ${unit.path.length} steps remain`;
  else if (unit?.targetId) orders = " · pulse target locked";
  selectedReadout.textContent = unit
    ? `${unit.definition.name} · integrity ${unit.health}/${unit.definition.stats.vitality}` +
      ` · at ${Math.round(unit.position.x)}, ${Math.round(unit.position.y)}${orders}`
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
