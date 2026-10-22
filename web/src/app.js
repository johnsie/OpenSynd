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
  edgePanDirection,
  panByKeys,
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
import { iconMarkup } from "./icons.js";
import {
  CAMPAIGN_KEY,
  SLOTS_PER_OPERATIVE,
  TRACKS,
  canResearchItem,
  buyIntoSlot,
  canBuy,
  canResearchTrack,
  captureItems,
  earnAchievement,
  earnTime,
  emptyCampaign,
  isItemAvailable,
  loadoutFor,
  netCost,
  nextTrackCost,
  parseCampaign,
  researchItem,
  researchTrack,
  sellFromSlot,
  sellValue,
  sanitizeLoadouts,
  serializeCampaign,
} from "./campaign.js";
import { newStats, newlyEarned } from "./achievements.js";
import {
  distanceBetween,
  energyItem,
  findLoot,
  inLootReach,
  lootBody,
  lootableAt,
  lootableBody,
  nearestLootable,
  useEnergyItem,
} from "./inventory.js";
import {
  advanceCombat,
  combatStats,
  heldWeapon,
  roundsLeft,
  advanceFocus,
  advancePatrols,
  advanceUnits,
  consumeFixedSteps,
} from "./simulation.js";
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
import {
  addEffect,
  advanceEffects,
  createEffects,
  effectProgress,
  facingVector,
  recoilOffset,
  walkBob,
} from "./effects.js";
import { effectiveLevels, speedMultiplier } from "./stats.js";
import {
  BARS,
  BAR_HINTS,
  BAR_LABELS,
  LEVEL_MAX,
  LEVEL_MIN,
  TRAINING_BUDGET_DEFAULT,
  adjustLevel,
  defaultLevels,
  pointsLeft,
} from "./stats.js";
import { isSelected, prune, selectMany, selectOnly, toggle } from "./selection.js";
import {
  PROGRESS_KEY,
  emptyProgress,
  isCompleted,
  isUnlocked,
  markCompleted,
  parseProgress,
  serializeProgress,
} from "./progress.js";
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
  edgeScroll: document.querySelector("#setting-edge"),
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
  settingControls.edgeScroll.checked = settings.edgeScroll;
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
    edgeScroll: settingControls.edgeScroll.checked,
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
  armoury: { operator: 0, slot: 0 },
  campaign: emptyCampaign(),
  catalog: [],
  opStats: newStats(0),
  earnedThisRun: [],
  shownFunds: -1,
  campaignTimer: 0,
  achievementTimer: 0,
  trainingBudget: TRAINING_BUDGET_DEFAULT,
  progress: emptyProgress(),
  missionList: [],
  missionIndex: 0,
  missionCount: 1,
  edge: { x: 0, y: 0 },
  panKeys: new Set(),
  camera: createCamera({ x: 0, y: 0 }),
  miniTerrain: null,
  selectedIds: [],
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

// Operators start with their campaign loadout (their mission defaults until one is chosen);
// everyone else carries what the mission gives them.
function startingEquipment(placement, definition, byPath, byId) {
  const defaults = placement.equipment.map((path) => byPath.get(path));
  if (definition.role !== "operator") return defaults;
  const ids = loadoutFor(state.campaign, placement.id, defaults.map((item) => item.id));
  return ids
    .map((id) => byId.get(id))
    .filter((item) => item && isItemAvailable(state.campaign, item))
    .slice(0, SLOTS_PER_OPERATIVE);
}

async function loadGame(index = state.missionIndex) {
  await loadSprites();
  const pack = await readJson("content/pack.json");
  const missionPath = pack.missions[index];
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
  state.catalog = [...equipmentDefinitions.values()];
  state.catalogPaths = [...equipmentDefinitions.entries()];
  if (!state.campaignLoaded) {
    state.campaign = sanitizeLoadouts(parseCampaign(readStored(CAMPAIGN_KEY)), state.catalog);
    state.campaignLoaded = true;
  }
  const definitionsById = new Map(state.catalog.map((definition) => [definition.id, definition]));
  updateFundsReadout();

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
      stamina: 1,
      focus: 1,
      walkPhase: 0,
      patrol: placement.patrol
        ? { route: buildPatrolRoute(state.grid, placement.position, placement.patrol), index: 0 }
        : null,
      path: [],
      research: definition.role === "operator" ? { heart: state.campaign.heart, brain: state.campaign.brain } : null,
      looted: [],
      activeSlot: null,
      initialEquipment: [],
      equipment: startingEquipment(placement, definition, equipmentDefinitions, definitionsById).map((item) => ({
        definition: item,
        charges: item.charges,
      })),
      health: definition.stats.vitality,
      cooldownRemaining: 0,
      targetId: null,
      disabled: false,
    };
  });
  for (const unit of state.units) unit.initialEquipment = unit.equipment.map((item) => ({ ...item }));
  // Reset only now that the new units exist, or the old squad would re-trigger the outcome.
  state.outcome = "active";
  state.missionSeconds = 0;
  state.opStats = newStats(mission.opponents.length);
  state.earnedThisRun = [];
  state.camera = createCamera(mission.team[0].position);
  buildMiniTerrain();
  state.selectedId = mission.team[0].id;
  state.selectedIds = [state.selectedId];
  state.cursor = { ...mission.team[0].position };
  state.paused = false;
  state.effects.length = 0;
  state.clock.accumulator = 0;
  state.lastFrame = performance.now();
  pauseButton.setAttribute("aria-pressed", "false");
  pauseLabel.textContent = "Pause";
  briefingText.textContent = mission.briefing;
  state.missionIndex = index;
  state.missionCount = pack.missions.length;
  state.trainingBudget = mission.trainingBudget ?? TRAINING_BUDGET_DEFAULT;
  if (state.missionList.length !== pack.missions.length) {
    state.missionList = await Promise.all(
      pack.missions.map(async (path) => {
        const entry = await readJson(`content/${path}`);
        return {
          id: entry.id,
          name: entry.name,
          objectives: entry.objectives.length,
          watchers: entry.opponents.length,
        };
      }),
    );
  }
  state.progress = parseProgress(readStored(PROGRESS_KEY));
  describeMission(mission, map, index);
  renderMissionList();
  setStatus("Local map established. Select a relay route.");
  updateLoadButton();
  renderInterface();
}

function syncGates() {
  syncMissionGates(state.grid, state.map, state.objectives);
}

// Show the loaded mission's name and story wherever the page mentions it.
function describeMission(mission, map, index) {
  const number = String(index + 1).padStart(2, "0");
  document.querySelector("#operation-eyebrow").textContent = `OPERATION ${number}`;
  document.querySelector("#operation-title").textContent = mission.name;
  document.querySelector("#brief-title").textContent = mission.name;
  document.querySelector("#title-heading").textContent = `OpenSynd: ${mission.name}`;
  document.querySelector("#title-story").textContent = mission.story ?? mission.briefing;
  document.title = `OpenSynd — ${mission.name}`;
  canvas.setAttribute("aria-label", `Isometric view of ${map.name}. Select an operator and choose a destination.`);
  minimap.setAttribute("aria-label", `Minimap of ${map.name}. Click to move the view.`);
}

const researchDialog = document.querySelector("#research-dialog");

function startingLoadout(placement) {
  const byPath = new Map(state.catalogPaths);
  return placement.equipment.map((path) => byPath.get(path)?.id).filter(Boolean);
}

function researchStatus(item) {
  if ((item.researchCost ?? 0) === 0) return "STARTING ITEM";
  return isItemAvailable(state.campaign, item) ? "RESEARCHED" : "LOCKED";
}

// The between-missions screen: spend funds on research and set each operative's slots.
function renderResearch() {
  const campaign = state.campaign;
  document.querySelector("#research-funds").textContent = `Funds ${campaign.funds}`;

  document.querySelector("#research-tracks").replaceChildren(
    ...Object.entries(TRACKS).map(([track, info]) => {
      const row = document.createElement("div");
      row.className = "research-row";
      const name = document.createElement("span");
      const level = campaign[track];
      name.textContent = `${info.label} (${info.bar}) · level ${level} of ${info.maxLevel}`;
      const cost = nextTrackCost(campaign, track);
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = cost === null ? "Fully researched" : `Research level ${level + 1} · ${cost} funds`;
      button.disabled = !canResearchTrack(campaign, track);
      button.addEventListener("click", () => {
        state.campaign = researchTrack(state.campaign, track);
        persistCampaign();
        updateFundsReadout();
        renderResearch();
      });
      const note = document.createElement("small");
      note.textContent = info.effect;
      row.append(name, button, note);
      return row;
    }),
  );

  document.querySelector("#research-items").replaceChildren(
    ...state.catalog.map((item) => {
      const row = document.createElement("div");
      row.className = "research-row";
      const name = document.createElement("span");
      name.textContent = item.name;
      const control = document.createElement("span");
      if ((item.researchCost ?? 0) > 0 && !isItemAvailable(campaign, item)) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = `Research · ${item.researchCost} funds`;
        button.setAttribute("aria-label", `Research ${item.name} for ${item.researchCost} funds`);
        button.disabled = !canResearchItem(campaign, item);
        button.addEventListener("click", () => {
          state.campaign = researchItem(state.campaign, item);
          persistCampaign();
          updateFundsReadout();
          renderResearch();
        });
        control.append(button);
      } else {
        control.className = "state";
        control.textContent = researchStatus(item);
      }
      row.title = item.description;
      row.append(name, control);
      return row;
    }),
  );

  renderArmoury();
}

// The Armoury: each operative's eight slots as pictures, and a shop that buys into the chosen slot.
function renderArmoury() {
  const campaign = state.campaign;
  const team = state.mission.team;
  state.armoury.operator = Math.min(state.armoury.operator, team.length - 1);
  const choice = state.armoury;
  const loadouts = team.map((placement) => loadoutFor(campaign, placement.id, startingLoadout(placement)));
  const byId = new Map(state.catalog.map((item) => [item.id, item]));

  document.querySelector("#armoury-squad").replaceChildren(
    ...team.map((placement, index) => {
      const card = document.createElement("div");
      card.className = "armoury-card";
      const heading = document.createElement("h4");
      heading.textContent = `Operator ${index + 1} · ${loadouts[index].length} of ${SLOTS_PER_OPERATIVE} slots`;
      const grid = document.createElement("div");
      grid.className = "armoury-slots";
      grid.setAttribute("role", "group");
      grid.setAttribute("aria-label", `Operator ${index + 1} slots`);
      for (let slot = 0; slot < SLOTS_PER_OPERATIVE; slot += 1) {
        const item = byId.get(loadouts[index][slot]);
        const square = document.createElement("button");
        square.type = "button";
        square.className = "slot big";
        square.classList.toggle("empty", !item);
        const chosen = choice.operator === index && choice.slot === slot;
        square.classList.toggle("chosen", chosen);
        square.setAttribute("aria-pressed", String(chosen));
        square.setAttribute("aria-label", `Operator ${index + 1} slot ${slot + 1}: ${item ? item.name : "empty"}`);
        square.title = item ? `${item.name}: ${item.description}` : "Empty slot. Choose it, then buy an item for it.";
        const number = document.createElement("span");
        number.className = "label";
        number.textContent = String(slot + 1);
        square.append(number);
        if (item) {
          square.insertAdjacentHTML("beforeend", iconMarkup(item.icon, 34));
          if (item.charges) {
            const badge = document.createElement("span");
            badge.className = "charges";
            badge.textContent = String(item.charges);
            square.append(badge);
          }
        }
        square.addEventListener("click", () => {
          state.armoury = { operator: index, slot };
          renderArmoury();
        });
        grid.append(square);
      }
      card.append(heading, grid);
      return card;
    }),
  );

  const placement = team[choice.operator];
  const defaults = startingLoadout(placement);
  const current = byId.get(loadouts[choice.operator][choice.slot]);
  const shop = document.querySelector("#armoury-shop");
  const heading = document.createElement("h4");
  heading.textContent = `Operator ${choice.operator + 1} · slot ${choice.slot + 1}: ${current ? current.name : "empty"}`;
  const sell = document.createElement("button");
  sell.type = "button";
  sell.textContent = current ? `Sell ${current.name} · +${sellValue(current)} funds` : "Nothing to sell";
  sell.disabled = !current;
  sell.addEventListener("click", () => {
    state.campaign = sellFromSlot(state.campaign, placement.id, choice.slot, state.catalog, defaults);
    persistCampaign();
    updateFundsReadout();
    renderResearch();
  });
  const rows = state.catalog.map((item) => {
    const row = document.createElement("div");
    row.className = "shop-row";
    const available = isItemAvailable(campaign, item);
    row.classList.toggle("locked", !available);
    const icon = document.createElement("span");
    icon.className = "icon";
    icon.innerHTML = iconMarkup(item.icon, 32);
    const text = document.createElement("span");
    const name = document.createElement("strong");
    name.textContent = item.name;
    const note = document.createElement("small");
    const supply = item.charges
      ? ` ${item.charges} ${item.action === "disable-pulse" ? "rounds" : "doses"} per operation.`
      : "";
    note.textContent = available
      ? `${item.description}${supply}`
      : `${item.description}${supply} Research it first (${item.researchCost} funds).`;
    text.append(name, note);
    const buy = document.createElement("button");
    buy.type = "button";
    const net = netCost(campaign, placement.id, choice.slot, item, state.catalog, defaults);
    buy.textContent = net < 0 ? `Swap · +${-net} funds` : `Buy · ${net} funds`;
    buy.setAttribute(
      "aria-label",
      `Buy ${item.name} for Operator ${choice.operator + 1} slot ${choice.slot + 1}, ${net} funds`,
    );
    buy.disabled = !available || current?.id === item.id || !canBuy(campaign, placement.id, choice.slot, item, state.catalog, defaults);
    buy.addEventListener("click", () => {
      state.campaign = buyIntoSlot(state.campaign, placement.id, choice.slot, item, state.catalog, defaults);
      persistCampaign();
      updateFundsReadout();
      renderResearch();
    });
    row.append(icon, text, buy);
    return row;
  });
  shop.replaceChildren(heading, sell, ...rows);
}

function openResearch() {
  renderResearch();
  researchDialog.showModal();
}

document.querySelector("#open-research").addEventListener("click", openResearch);
document.querySelector("#outcome-research").addEventListener("click", openResearch);
document.querySelector("#close-research").addEventListener("click", () => researchDialog.close());

const confirmDialog = document.querySelector("#confirm-dialog");

// An in-page confirmation (native confirm() blocks and cannot be styled or tested reliably).
function confirmLeave(message) {
  document.querySelector("#confirm-text").textContent = message;
  return new Promise((resolve) => {
    const finish = (answer) => {
      confirmDialog.removeEventListener("close", onClose);
      resolve(answer);
    };
    const onClose = () => finish(confirmDialog.returnValue === "accept");
    confirmDialog.addEventListener("close", onClose);
    confirmDialog.returnValue = "cancel";
    confirmDialog.showModal();
  });
}

// True once the player has put real time into an operation that is not over.
function operationInProgress() {
  return state.outcome === "active" && state.missionSeconds > 5;
}

const missionListElement = document.querySelector("#mission-list");

// Operations the player may start: the first, plus any whose predecessor is complete.
function renderMissionList() {
  const ids = state.missionList.map((entry) => entry.id);
  missionListElement.replaceChildren(
    ...state.missionList.map((entry, index) => {
      const unlocked = isUnlocked(state.progress, ids, index);
      const done = isCompleted(state.progress, entry.id);
      const button = document.createElement("button");
      button.type = "button";
      button.disabled = !unlocked;
      button.setAttribute("aria-pressed", String(index === state.missionIndex));
      const name = document.createElement("span");
      name.textContent = `Operation ${String(index + 1).padStart(2, "0")} · ${entry.name}`;
      const status = document.createElement("span");
      status.className = "state";
      status.textContent = done ? "COMPLETED" : unlocked ? "AVAILABLE" : "LOCKED";
      const note = document.createElement("small");
      note.textContent = unlocked
        ? `${entry.objectives} objectives · ${entry.watchers} watchers`
        : `Complete ${state.missionList[index - 1].name} to unlock this operation.`;
      button.append(name, status, note);
      button.addEventListener("click", async () => {
        if (index === state.missionIndex) return;
        if (
          operationInProgress() &&
          !(await confirmLeave("Switching operations abandons the one in progress. Save first if you want to come back to it."))
        ) {
          return;
        }
        loadGame(index).catch(showFatalError);
      });
      return button;
    }),
  );
}

function saveProgress() {
  try {
    localStorage.setItem(PROGRESS_KEY, serializeProgress(state.progress));
  } catch {
    // Progress still counts for this session when storage is unavailable.
  }
}

function equipmentWithAction(unit, action) {
  return unit?.equipment.find((item) => item.definition.action === action) ?? null;
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
    itemIds: state.catalog.map((item) => item.id),
    initialEquipment: Object.fromEntries(
      state.units.map((unit) => [
        unit.id,
        unit.initialEquipment.map((item) => ({ id: item.definition.id, charges: item.charges })),
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
    unit.stamina = saved.stamina;
    unit.focus = saved.focus;
    unit.equipment = saved.equipment.map((item) => ({
      definition: state.catalog.find((entry) => entry.id === item.id),
      charges: item.charges,
    }));
    unit.looted = [...saved.looted];
    if (unit.patrol) unit.patrol.index = saved.patrolIndex;
  }
  const objectivesById = new Map(
    snapshot.objectives.map((objective) => [objective.id, objective]),
  );
  for (const objective of state.objectives) {
    objective.complete = objectivesById.get(objective.id).complete;
  }
  syncGates();
  state.selectedId = snapshot.selectedId;
  state.selectedIds = snapshot.selectedId ? [snapshot.selectedId] : [];
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
    loadButton.disabled = saveKeyCandidates().every(
      (key) => localStorage.getItem(key) === null,
    );
  } catch {
    loadButton.disabled = true;
  }
}

// Each operation has its own local save slot; the first also reads the older unscoped slots.
function missionSaveKey() {
  return `${LOCAL_SAVE_KEY}.${state.mission.id}`;
}

function saveKeyCandidates() {
  const keys = [missionSaveKey()];
  if (state.missionIndex === 0) keys.push(LOCAL_SAVE_KEY, ...LEGACY_LOCAL_SAVE_KEYS);
  return keys;
}

function saveLocally() {
  try {
    localStorage.setItem(missionSaveKey(), currentSaveJson());
    updateLoadButton();
    setStatus("Operation saved in this browser.");
  } catch (error) {
    setStatus(`Local save failed: ${error.message}`);
  }
}

function loadLocally() {
  try {
    const key = saveKeyCandidates().find(
      (candidate) => localStorage.getItem(candidate) !== null,
    );
    const text = key ? localStorage.getItem(key) : null;
    if (text === null) throw new Error("No local save exists");
    const snapshot = parseSaveSnapshot(text, saveContext());
    applySaveSnapshot(snapshot);
    if (key !== missionSaveKey()) {
      localStorage.setItem(missionSaveKey(), `${JSON.stringify(snapshot, null, 2)}\n`);
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
      localStorage.setItem(missionSaveKey(), `${JSON.stringify(snapshot, null, 2)}\n`);
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

// The sheet for a unit: its character, or the armed version when it is holding a weapon (both
// hands on the pistol or rifle that is selected).
function spriteSheetFor(unit) {
  if (!sprites.manifest) return null;
  const sheets = sprites.manifest.sheets;
  let key;
  if (unit.side !== "team") {
    const index = state.units.filter((item) => item.side !== "team").indexOf(unit);
    key = WATCHER_SKINS[index % WATCHER_SKINS.length];
  } else {
    const index = state.units.filter((item) => item.side === "team").indexOf(unit);
    key = SPRITE_SKINS[index % SPRITE_SKINS.length];
  }
  const held = heldWeapon(unit);
  return (held && sheets[`${key}-${held.definition.icon}`]) || sheets[key] || null;
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
  // Tired units walk with a slower cadence: their walk phase advances more slowly.
  const phase = moving ? unit.walkPhase : state.elapsed;
  const clock = reduceMotion ? 0 : (phase + unit.id.length * 0.13) / animation.seconds;
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
  const kick = recoilOffset(state.elapsed, unit.firedAt, unit.facing, 3.5, reduceMotion);
  context.translate(center.x + kick.x, center.y - size * 0.8 + bob + kick.y);
  context.fillStyle = "rgba(0, 0, 0, .35)";
  context.beginPath();
  context.ellipse(0, size * 1.05, size * 0.9, size * 0.35, 0, 0, Math.PI * 2);
  context.fill();

  const picked = state.selectedIds.includes(unit.id) && !unit.disabled;
  if (unit.id === state.selectedId || picked) {
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
  drawPickups(viewport);
  for (const unit of units) drawUnit(unit, viewport);
  drawAim(viewport);
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

// Gear dropped where a watcher fell: a small case on the floor with a pulsing ring.
function drawPickups(viewport) {
  const { cellSize, origin } = viewport;
  for (const body of state.units) {
    if (!lootableBody(body)) continue;
    const tile = state.grid[Math.round(body.position.y)]?.[Math.round(body.position.x)];
    const centre = gridToScreen(body.position, cellSize, origin, tile?.elevation ?? 0);
    const width = cellSize.width * 0.18;
    const height = cellSize.height * 0.18;
    const pulse = reduceMotion ? 0.6 : 0.5 + 0.5 * Math.sin(state.elapsed * 4);
    context.save();
    context.translate(centre.x + cellSize.width * 0.14, centre.y + cellSize.height * 0.1);
    context.strokeStyle = `rgba(225, 179, 90, ${0.35 + 0.5 * pulse})`;
    context.lineWidth = 2;
    context.beginPath();
    context.ellipse(0, 0, width * (1.5 + 0.4 * pulse), height * (1.5 + 0.4 * pulse), 0, 0, Math.PI * 2);
    context.stroke();
    // The case: a lid, a front face and a side face in amber tones.
    context.fillStyle = "#e1b35a";
    context.beginPath();
    context.moveTo(0, -height * 1.6);
    context.lineTo(width, -height * 0.8);
    context.lineTo(0, 0);
    context.lineTo(-width, -height * 0.8);
    context.closePath();
    context.fill();
    context.fillStyle = "#a9802f";
    context.beginPath();
    context.moveTo(-width, -height * 0.8);
    context.lineTo(0, 0);
    context.lineTo(0, height * 1.1);
    context.lineTo(-width, height * 0.3);
    context.closePath();
    context.fill();
    context.fillStyle = "#7d5d20";
    context.beginPath();
    context.moveTo(width, -height * 0.8);
    context.lineTo(0, 0);
    context.lineTo(0, height * 1.1);
    context.lineTo(width, height * 0.3);
    context.closePath();
    context.fill();
    context.restore();
  }
}

// Where the muzzle is on screen: out in front of the unit along its facing, at chest height.
function muzzlePoint(unit, viewport) {
  const body = unitScreenPoint(unit, viewport);
  const direction = facingVector(unit.facing ?? 0);
  const reach = Math.max(9, viewport.cellSize.height * 0.34) * 1.7;
  return { x: body.x + direction.x * reach, y: body.y + direction.y * reach * 0.55 + 4 };
}

// A thin aim line from each armed unit to the target it has locked, so the lock is visible
// between shots (cyan for the squad, red for watchers).
function drawAim(viewport) {
  context.save();
  context.lineWidth = 1.5;
  context.setLineDash([3, 5]);
  for (const unit of state.units) {
    if (!unit.targetId || unit.disabled || !heldWeapon(unit)) continue;
    const target = state.units.find((item) => item.id === unit.targetId);
    if (!target || target.disabled) continue;
    const from = muzzlePoint(unit, viewport);
    const to = unitScreenPoint(target, viewport);
    context.strokeStyle = unit.side === "team" ? "rgba(66, 214, 208, 0.55)" : "rgba(255, 107, 98, 0.55)";
    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(to.x, to.y);
    context.stroke();
  }
  context.restore();
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
    } else if (effect.type === "muzzle") {
      const unit = state.units.find((item) => item.id === effect.unitId);
      if (unit) {
        const at = muzzlePoint(unit, viewport);
        const radius = size * (0.5 + 0.4 * fade);
        context.fillStyle = `rgba(255, 244, 214, ${0.95 * fade})`;
        context.beginPath();
        context.arc(at.x, at.y, radius * 0.45, 0, Math.PI * 2);
        context.fill();
        context.strokeStyle = `rgba(120, 245, 240, ${0.9 * fade})`;
        context.lineWidth = 2;
        context.beginPath();
        for (let ray = 0; ray < 6; ray += 1) {
          const angle = (ray * Math.PI) / 3 + unit.facing;
          context.moveTo(at.x + Math.cos(angle) * radius * 0.5, at.y + Math.sin(angle) * radius * 0.5);
          context.lineTo(at.x + Math.cos(angle) * radius * 1.3, at.y + Math.sin(angle) * radius * 1.3);
        }
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
  const arrivals = advanceUnits(state.units, deltaSeconds);
  advanceFocus(state.units, deltaSeconds);
  for (const unit of state.units) {
    if (unit.side !== "team" || unit.disabled) continue;
    if (unit.stamina < 0.15 && unit.path.length > 0 && !unit.tired) {
      unit.tired = true;
      setStatus(`${unit.definition.name} is exhausted and slowing down. Stop to let them recover.`);
    } else if (unit.stamina > 0.4) {
      unit.tired = false;
    }
  }
  for (const unit of state.units) {
    if (!unit.lootTargetId || unit.path.length > 0) continue;
    const body = state.units.find((item) => item.id === unit.lootTargetId);
    unit.lootTargetId = null;
    if (body && lootableBody(body) && inLootReach(unit, body)) {
      lootNow(unit, body);
      interfaceChanged = true;
    }
  }
  for (const arrival of arrivals) {
    interfaceChanged = true;
    interfaceChanged = completeObjectivesAt(arrival.position) || interfaceChanged;
  }
  for (const event of advancePatrols(state.units, deltaSeconds, state.grid)) {
    const watcher = state.units.find((unit) => unit.id === event.unitId);
    const spotted = state.units.find((unit) => unit.id === event.targetId);
    setStatus(`${watcher.definition.name} spotted ${spotted.definition.name}! It is closing in.`);
    audio.play("alert");
    state.opStats.spotted += 1;
    interfaceChanged = true;
  }
  const combatEvents = advanceCombat(state.units, deltaSeconds);
  if (combatEvents.length > 0) {
    interfaceChanged = true;
    for (const event of combatEvents) {
      if (event.type === "damage") {
        addEffect(state.effects, "pulse", { fromId: event.attackerId, toId: event.targetId });
        addEffect(state.effects, "muzzle", { unitId: event.attackerId });
        const shooter = state.units.find((item) => item.id === event.attackerId);
        if (shooter) shooter.firedAt = state.elapsed;
        if (event.outOfRounds) {
          const shooter = state.units.find((item) => item.id === event.attackerId);
          if (shooter.side === "team") {
            setStatus(`${shooter.definition.name}: ${event.weapon} is out of rounds.`);
            audio.play("alert");
          }
        }
      } else if (event.type === "disabled") {
        const down = state.units.find((item) => item.id === event.unitId);
        if (down.side === "opposition") state.opStats.watchersDisabled += 1;
        else state.opStats.operatorsDisabled += 1;
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
      pruneSelection();
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
  const debrief = state.mission.debrief;
  document.querySelector("#outcome-heading").textContent = won
    ? state.mission.title ?? "Operation complete"
    : "The team has gone dark";
  const earned = state.earnedThisRun;
  document.querySelector("#outcome-awards").textContent = earned.length
    ? `Achievements: ${earned.map((item) => `${item.name} +${item.reward}`).join(", ")}.`
    : "";
  document.querySelector("#outcome-text").textContent = won
    ? debrief?.success ?? "The operation is complete."
    : debrief?.failure ?? "Every operator has been disabled. Regroup and try a different approach.";
  const hasNext = won && state.missionIndex + 1 < state.missionCount;
  document.querySelector("#next-button").hidden = !hasNext;
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

function persistCampaign() {
  try {
    localStorage.setItem(CAMPAIGN_KEY, serializeCampaign(state.campaign));
  } catch {
    // The campaign still counts for this session when storage is unavailable.
  }
  state.campaignTimer = 0;
}

function updateFundsReadout() {
  state.shownFunds = state.campaign.funds;
  document.querySelector("#funds-readout").textContent = `Funds ${state.campaign.funds}`;
}

// Pay out any achievements the operation's record now satisfies.
function checkAchievements() {
  for (const achievement of newlyEarned(state.opStats, state.campaign.achievements)) {
    state.campaign = earnAchievement(state.campaign, achievement);
    state.earnedThisRun.push(achievement);
    document.querySelector("#achievement-toast").textContent =
      `Achievement: ${achievement.name} (+${achievement.reward} funds). ${achievement.description}`;
    audio.play("objective");
    persistCampaign();
  }
  updateFundsReadout();
}

// A successful operation keeps what the operators looted: captured gear counts as
// researched and joins their loadout while there is room.
function keepLoot() {
  for (const unit of state.units.filter((item) => item.side === "team" && item.looted.length > 0)) {
    const carried = unit.equipment.map((item) => item.definition.id);
    // Start from what they carried in (without the loot), so the loadout reflects their kit.
    const before = carried.filter((id, index) => index < carried.length - unit.looted.length);
    state.campaign = captureItems(
      { ...state.campaign, loadouts: { ...state.campaign.loadouts, [unit.id]: before } },
      unit.id,
      unit.looted,
      state.catalog,
      before,
    );
  }
  persistCampaign();
}

function checkOutcome() {
  if (state.outcome !== "active") return;
  const outcome = missionOutcome(state.objectives, state.units);
  if (outcome === "active") return;
  state.outcome = outcome;
  state.opStats.outcome = outcome;
  state.opStats.seconds = state.missionSeconds;
  if (outcome === "success") {
    state.progress = markCompleted(state.progress, state.mission.id);
    saveProgress();
    renderMissionList();
    keepLoot();
  }
  checkAchievements();
  persistCampaign();
  showOutcome(outcome);
}

function update(deltaSeconds) {
  if (state.paused || state.modal) {
    state.clock.accumulator = 0;
    return;
  }
  state.elapsed += deltaSeconds;
  if (state.outcome === "active") {
    // Funds accrue with game time; the record is saved every few seconds.
    state.campaign = earnTime(state.campaign, deltaSeconds);
    state.opStats.seconds = state.missionSeconds;
    state.campaignTimer += deltaSeconds;
    state.achievementTimer += deltaSeconds;
    if (state.campaignTimer >= 5) persistCampaign();
    if (state.achievementTimer >= 0.5) {
      state.achievementTimer = 0;
      checkAchievements();
    }
    if (state.campaign.funds !== state.shownFunds) updateFundsReadout();
  }
  state.meterClock = (state.meterClock ?? 0) + deltaSeconds;
  if (state.meterClock >= 0.2) {
    state.meterClock = 0;
    updateMeters();
  }
  for (const unit of state.units) {
    const effective = effectiveLevels(unit.levels, unit.stamina, unit.focus);
    unit.walkPhase += deltaSeconds * speedMultiplier(effective);
  }
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
    state.opStats.objectivesCompleted += 1;
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
        ? "Operation complete. Every commitment is fulfilled."
        : `${objective.description} Commitment fulfilled.`,
    );
  }
  return changed;
}

// The operator who can interact right now (any group member in group mode) and what with.
function interactionCandidate() {
  const candidates = selectedOperators();
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
  state.opStats.objectivesCompleted += 1;
  syncGates();
  audio.play("objective");
  addEffect(state.effects, "restore", { unitId: unit.id });
  setStatus(`${objective.description} Commitment fulfilled.`);
  renderInterface();
}

function frame(time) {
  const delta = Math.min((time - state.lastFrame) / 1000, 0.05);
  state.lastFrame = time;
  if (state.map && state.viewport) {
    const edge = settings.edgeScroll && !state.modal && !drag.active ? state.edge : { x: 0, y: 0 };
    const direction = {
      x: (state.panKeys.has("panRight") ? 1 : 0) - (state.panKeys.has("panLeft") ? 1 : 0) + edge.x,
      y: (state.panKeys.has("panDown") ? 1 : 0) - (state.panKeys.has("panUp") ? 1 : 0) + edge.y,
    };
    panByKeys(state.camera, direction, delta, state.viewport, state.map);
  }
  if (state.map) followTarget(state.camera, delta, reduceMotion);
  update(delta);
  draw();
  requestAnimationFrame(frame);
}

function selectedUnit() {
  return state.units.find((unit) => unit.id === state.selectedId) ?? null;
}

function activeOperators() {
  return state.units.filter((unit) => unit.side === "team" && !unit.disabled);
}

function applySelection(selection) {
  state.selectedId = selection.primary;
  state.selectedIds = selection.ids;
}

// Operators that orders apply to: everyone selected who can still act.
function selectedOperators() {
  const picked = activeOperators().filter((unit) => isSelected({ ids: state.selectedIds }, unit.id));
  if (picked.length > 0) return picked;
  const primary = selectedUnit();
  return primary && !primary.disabled ? [primary] : [];
}

function pruneSelection() {
  applySelection(
    prune(
      { primary: state.selectedId, ids: state.selectedIds },
      activeOperators().map((unit) => unit.id),
    ),
  );
}

function selectUnit(id) {
  const requested = state.units.find((unit) => unit.id === id);
  if (!requested || requested.side !== "team" || requested.disabled) {
    setStatus("That operator is unavailable.");
    return;
  }
  applySelection(selectOnly(id));
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

// Add or remove one operator from the selection (Ctrl/Shift-click or the roster checkbox).
function toggleSelect(id) {
  const requested = state.units.find((unit) => unit.id === id);
  if (!requested || requested.side !== "team" || requested.disabled) {
    setStatus("That operator is unavailable.");
    return;
  }
  applySelection(toggle({ primary: state.selectedId, ids: state.selectedIds }, id));
  setStatus(`${selectedOperators().length} operators selected.`);
  audio.play("select");
  renderInterface();
  canvas.focus();
}

function selectAll() {
  const operators = activeOperators();
  if (operators.length === 0) {
    setStatus("No operators are available.");
    return;
  }
  const keepPrimary = operators.find((unit) => unit.id === state.selectedId);
  const primary = (keepPrimary ?? operators[0]).id;
  applySelection(selectMany([primary, ...operators.map((unit) => unit.id).filter((id) => id !== primary)]));
  setStatus(`All ${operators.length} operators selected.`);
  audio.play("select");
  renderInterface();
  canvas.focus();
}

// Order one operator along a route; returns the number of steps, or 0 if there is none.
function orderMove(unit, destination) {
  unit.targetId = null;
  unit.lootTargetId = null;
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
  const squad = selectedOperators();
  if (squad.length > 1) {
    const assignments = groupDestinations(squad, destination);
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
  const armed = (attacker.equipment ?? []).some((item) => item.definition.action === "disable-pulse");
  if (!armed) return "no-tool";
  if (roundsLeft(attacker) === 0) return "no-rounds";
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
    if (lootableBody(target)) goLoot(target);
    else setStatus("That watcher is already disabled and has nothing left to loot.");
    return;
  }
  const squad = selectedOperators();
  if (squad.length > 1) {
    const operators = squad;
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
  if (result === "no-rounds") {
    setStatus(`${attacker.definition.name} is out of rounds. Swap to another weapon or loot one.`);
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

function useRepairOn(unit, kit) {
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

function useRepairKit() {
  const unit = selectedUnit();
  useRepairOn(unit, equipmentWithAction(unit, "restore-vitality"));
}

// The selected operator who most needs a stimulant and has one to use.
function useStim() {
  const candidates = selectedOperators().filter((unit) => energyItem(unit));
  if (candidates.length === 0) {
    setStatus("No stim injector is available.");
    return;
  }
  candidates.sort((left, right) => Math.min(left.stamina, left.focus) - Math.min(right.stamina, right.focus));
  for (const unit of candidates) {
    const item = useEnergyItem(unit);
    if (!item) continue;
    setStatus(`${unit.definition.name} used a ${item.definition.name}: stamina and focus restored.`);
    audio.play("repair");
    addEffect(state.effects, "repair", { unitId: unit.id });
    updateMeters();
    renderInterface();
    return;
  }
  setStatus("Stamina and focus are already full.");
}

// Take a disabled watcher's gear with one of the selected operators.
function lootNow(operator, body) {
  const { taken, left } = lootBody(operator, body);
  operator.lootTargetId = null;
  if (taken.length === 0) {
    setStatus(`${operator.definition.name} has no free slots (${SLOTS_PER_OPERATIVE} items maximum), so cannot pick anything up.`);
    return;
  }
  state.opStats.itemsLooted += taken.length;
  const names = taken.map((item) => item.definition.name).join(", ");
  setStatus(
    `${operator.definition.name} picked up ${names}.` +
      (left > 0 ? ` ${left} item${left > 1 ? "s" : ""} left behind: no free slots.` : ""),
  );
  audio.play("objective");
  addEffect(state.effects, "restore", { unitId: operator.id });
  checkAchievements();
  renderInterface();
}

// F: pick up what is within reach, otherwise send the nearest selected operator to the
// closest body that still carries gear.
function lootAction() {
  const squad = selectedOperators();
  const found = findLoot(squad, state.units);
  if (found) {
    lootNow(found.operator, found.body);
    return;
  }
  let target = null;
  for (const unit of squad) {
    const candidate = nearestLootable(unit, state.units);
    if (candidate && (!target || distanceBetween(unit, candidate) < distanceBetween(target.unit, target.body))) {
      target = { unit, body: candidate };
    }
  }
  if (target) goLoot(target.body);
  else setStatus("There is nothing to pick up. Disable a watcher that carries gear first.");
}

// Send the nearest selected operator to a body; they loot it on arrival.
function goLoot(body) {
  const squad = selectedOperators();
  if (squad.length === 0) return;
  const nearest = squad.reduce((best, unit) =>
    Math.hypot(unit.position.x - body.position.x, unit.position.y - body.position.y) <
    Math.hypot(best.position.x - body.position.x, best.position.y - body.position.y)
      ? unit
      : best,
  );
  if (inLootReach(nearest, body)) {
    lootNow(nearest, body);
    return;
  }
  const steps = orderMove(nearest, { x: Math.round(body.position.x), y: Math.round(body.position.y) });
  if (steps === 0) {
    setStatus("No safe route to that body.");
    return;
  }
  nearest.lootTargetId = body.id;
  audio.play("move");
  setStatus(`${nearest.definition.name} is walking over to pick up ${body.definition.name}'s gear.`);
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

// Edge scrolling follows the mouse; touch and pen pointers never trigger it.
canvas.addEventListener("pointermove", (event) => {
  if (event.pointerType !== "mouse" || !state.viewport) return;
  const bounds = canvas.getBoundingClientRect();
  state.edge = edgePanDirection(
    { x: event.clientX - bounds.left, y: event.clientY - bounds.top },
    { width: bounds.width, height: bounds.height },
  );
});
canvas.addEventListener("pointerleave", () => {
  state.edge = { x: 0, y: 0 };
  setPointerCursor(null);
});

// The pointer shows what a click would do: a crosshair over a watcher still standing, and
// a pickup cursor over gear an operator could collect.
function setPointerCursor(kind) {
  canvas.classList.toggle("cursor-attack", kind === "attack");
  canvas.classList.toggle("cursor-loot", kind === "loot");
}

canvas.addEventListener("pointermove", (event) => {
  if (event.pointerType !== "mouse" || !state.viewport || drag.active) return;
  const bounds = canvas.getBoundingClientRect();
  const position = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  if (selectedOperators().length === 0) {
    setPointerCursor(null);
    return;
  }
  const unit = hitUnit(position);
  const ground = screenToGrid(position, state.viewport.cellSize, state.viewport.origin);
  if (unit && unit.side === "opposition" && !unit.disabled) setPointerCursor("attack");
  else if ((unit && lootableBody(unit)) || lootableAt(state.units, ground, 0.9)) setPointerCursor("loot");
  else setPointerCursor(null);
});

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
    if (unit.side !== "team") issueAttack(unit.id);
    else if (event.ctrlKey || event.shiftKey || event.metaKey) toggleSelect(unit.id);
    else selectUnit(unit.id);
    return;
  }
  const destination = screenToGrid(position, state.viewport.cellSize, state.viewport.origin);
  // Clicking the ground where an enemy fell picks up its gear: an operator walks over.
  const dropped = lootableAt(state.units, destination, 0.9);
  if (dropped && selectedOperators().length > 0) {
    goLoot(dropped);
    return;
  }
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
  if (action?.startsWith("pan")) {
    // Held keys pan smoothly; the frame loop applies them every frame.
    event.preventDefault();
    state.panKeys.add(action);
    return;
  }
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
  } else if (action === "useStim") {
    event.preventDefault();
    useStim();
  } else if (action === "loot") {
    event.preventDefault();
    lootAction();
  } else if (action === "selectAll") {
    event.preventDefault();
    selectAll();
  } else if (action === "deselect") {
    applySelection({ primary: null, ids: [] });
    renderInterface();
  }
});

canvas.addEventListener("keyup", (event) => {
  const action = resolveAction(bindings, event);
  if (action?.startsWith("pan")) state.panKeys.delete(action);
});
canvas.addEventListener("blur", () => state.panKeys.clear());

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
resetButton.addEventListener("click", async () => {
  if (operationInProgress() && !(await confirmLeave("Resetting restarts this operation from the beginning."))) return;
  loadGame(state.missionIndex).catch(showFatalError);
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
document.querySelector("#stim-button").addEventListener("click", useStim);
document.querySelector("#loot-button").addEventListener("click", lootAction);
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
document.querySelector("#operations-button").addEventListener("click", () => {
  state.modal = true;
  titleDialog.showModal();
});
document.querySelector("#reset-progress").addEventListener("click", () => {
  state.progress = emptyProgress();
  try {
    localStorage.removeItem(PROGRESS_KEY);
  } catch {
    // Nothing stored, nothing to clear.
  }
  renderMissionList();
  setStatus("Completed operations cleared.");
});
document.querySelector("#confirm-accept").addEventListener("click", () => confirmDialog.close("accept"));
document.querySelector("#confirm-cancel").addEventListener("click", () => confirmDialog.close("cancel"));
document.querySelector("#begin-button").addEventListener("click", () => titleDialog.close());
document.querySelector("#replay-button").addEventListener("click", () => {
  outcomeDialog.close();
  loadGame(state.missionIndex).catch(showFatalError);
});
document.querySelector("#next-button").addEventListener("click", () => {
  outcomeDialog.close();
  loadGame(state.missionIndex + 1)
    .then(() => {
      state.modal = true;
      titleDialog.showModal();
    })
    .catch(showFatalError);
});
document.querySelector("#outcome-close").addEventListener("click", () => outcomeDialog.close());
titleDialog.showModal();
state.modal = true;
// Browser tests add ?e2e to reach states that take too long to play out.
if (new URLSearchParams(location.search).has("e2e")) {
  window.opensyndTest = {
    camera() {
      return { x: state.camera.x, y: state.camera.y };
    },
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
    setFocus(id, value) {
      state.units.find((item) => item.id === id).focus = value;
    },
    setFunds(amount) {
      state.campaign = { ...state.campaign, funds: amount };
      updateFundsReadout();
    },
    setStamina(id, value) {
      state.units.find((item) => item.id === id).stamina = value;
    },
    disableUnit(id) {
      const unit = state.units.find((item) => item.id === id);
      unit.health = 0;
      unit.disabled = true;
      unit.path = [];
      unit.targetId = null;
      renderInterface();
    },
    placeNear(id, otherId, dx = 1, dy = 0) {
      const other = state.units.find((item) => item.id === otherId);
      const unit = state.units.find((item) => item.id === id);
      unit.position = { x: other.position.x + dx, y: other.position.y + dy };
      unit.path = [];
      renderInterface();
    },
    held(id) {
      const unit = state.units.find((item) => item.id === id);
      return heldWeapon(unit)?.definition.name ?? null;
    },
    focusOn(id) {
      const unit = state.units.find((item) => item.id === id);
      state.camera.x = unit.position.x;
      state.camera.y = unit.position.y;
      state.camera.target = { ...unit.position };
    },
    screenPoint(id) {
      const unit = state.units.find((item) => item.id === id);
      const tile = state.grid[Math.round(unit.position.y)]?.[Math.round(unit.position.x)];
      const point = gridToScreen(unit.position, state.viewport.cellSize, state.viewport.origin, tile?.elevation ?? 0);
      const bounds = canvas.getBoundingClientRect();
      return { x: bounds.left + point.x, y: bounds.top + point.y };
    },
    placeUnit(id, x, y) {
      const unit = state.units.find((item) => item.id === id);
      unit.position = { x, y };
      unit.path = [];
    },
    markInProgress() {
      state.missionSeconds = 30;
    },
    completeObjectives() {
      for (const objective of state.objectives) objective.complete = true;
    },
  };
}
document.querySelector("#about-button").addEventListener("click", () => aboutDialog.showModal());
document.querySelector("#close-about").addEventListener("click", () => aboutDialog.close());

const METER_TEXT = {
  stamina: { word: "Stamina", hint: "walking tires the legs; standing still recovers slowly" },
  focus: {
    word: "Focus",
    hint: "turning Brain above 3 strains the mind; at 3 or lower it recovers slowly",
  },
};

// The eight item squares: a picture per item, and a click selects or uses it.
function slotRow(unit, label) {
  const row = document.createElement("div");
  row.className = "slots";
  row.setAttribute("role", "group");
  row.setAttribute("aria-label", `${label} items`);
  for (let slot = 0; slot < SLOTS_PER_OPERATIVE; slot += 1) {
    const entry = unit.equipment[slot];
    const square = document.createElement("button");
    square.type = "button";
    square.className = "slot";
    square.dataset.slot = String(slot);
    if (!entry) {
      square.classList.add("empty");
      square.disabled = unit.disabled;
      square.setAttribute("aria-label", `${label} slot ${slot + 1}: empty`);
      square.title = "Empty slot. Buy gear in the Armoury before an operation.";
      row.append(square);
      continue;
    }
    const definition = entry.definition;
    const active = definition.action === "disable-pulse" && unit.activeSlot === slot;
    const spent = entry.charges === 0;
    square.classList.toggle("active", active);
    square.classList.toggle("spent", spent);
    square.innerHTML = iconMarkup(definition.icon, 22);
    if (entry.charges !== null && entry.charges !== undefined) {
      const badge = document.createElement("span");
      badge.className = "charges";
      badge.textContent = String(entry.charges);
      square.append(badge);
    }
    const detail = active ? "selected weapon" : spent ? "used up" : slotHint(definition);
    square.setAttribute("aria-label", `${label} slot ${slot + 1}: ${definition.name}, ${detail}`);
    square.setAttribute("aria-pressed", String(active));
    square.title = `${definition.name}: ${definition.description}`;
    square.disabled = unit.disabled;
    square.addEventListener("click", () => pressSlot(unit, slot));
    row.append(square);
  }
  return row;
}

function slotHint(definition) {
  switch (definition.action) {
    case "disable-pulse":
      return "weapon, click to select";
    case "restore-vitality":
    case "restore-energy":
      return "click to use";
    default:
      return "worn";
  }
}

// Weapons are selected (click again for automatic choice); consumables are used; worn gear explains itself.
function pressSlot(unit, slot) {
  const entry = unit.equipment[slot];
  if (!entry || unit.disabled) return;
  const definition = entry.definition;
  if (definition.action === "disable-pulse") {
    unit.activeSlot = unit.activeSlot === slot ? null : slot;
    setStatus(
      unit.activeSlot === slot
        ? `${unit.definition.name}: ${definition.name} selected. It will be the only weapon that fires.`
        : `${unit.definition.name}: automatic weapon choice.`,
    );
    audio.play("select");
    renderInterface();
  } else if (definition.action === "restore-vitality") {
    useRepairOn(unit, entry);
  } else if (definition.action === "restore-energy") {
    const used = useEnergyItem(unit);
    if (!used) {
      setStatus(entry.charges === 0 ? "That stim is used up." : "Stamina and focus are already full.");
      return;
    }
    setStatus(`${unit.definition.name} used a ${used.definition.name}: stamina and focus restored.`);
    audio.play("repair");
    addEffect(state.effects, "repair", { unitId: unit.id });
    updateMeters();
    renderInterface();
  } else {
    setStatus(`${definition.name} is worn: ${definition.description}`);
  }
}

function paintMeter(element, unit) {
  const kind = element.dataset.kind;
  const value = unit[kind];
  const percent = Math.round(value * 100);
  element.classList.toggle("low", value < 0.5 && value >= 0.2);
  element.classList.toggle("empty", value < 0.2);
  element.setAttribute("aria-label", `${METER_TEXT[kind].word} of ${element.dataset.label} ${percent} percent`);
  element.title = `${METER_TEXT[kind].word} ${percent}%: ${METER_TEXT[kind].hint}.`;
  element.querySelector("i").style.width = `${percent}%`;
}

function makeMeter(unit, kind, label) {
  const meter = document.createElement("div");
  meter.className = `meter ${kind}`;
  meter.dataset.unit = unit.id;
  meter.dataset.kind = kind;
  meter.dataset.label = label;
  meter.setAttribute("role", "img");
  meter.append(METER_TEXT[kind].word, document.createElement("i"));
  paintMeter(meter, unit);
  return meter;
}

// Fatigue shows on the bars: levels lost to tiredness are drawn hollow. The
// bar keeps its trained level, and the effective level is what actually counts.
function paintBar(element, unit) {
  const bar = element.dataset.bar;
  const level = unit.levels[bar];
  const effective = Math.round(effectiveLevels(unit.levels, unit.stamina, unit.focus)[bar]);
  const lost = level - effective;
  element.querySelectorAll("i").forEach((segment, index) => {
    segment.classList.toggle("filled", index + 1 <= effective);
    segment.classList.toggle("fatigued", index + 1 > effective && index + 1 <= level);
  });
  element.setAttribute(
    "aria-label",
    `${element.dataset.label} ${level} of ${LEVEL_MAX}${lost > 0 ? `, tired down to ${effective}` : ""}`,
  );
  element.title = lost > 0 ? `${BAR_LABELS[bar]} is ${lost} level${lost > 1 ? "s" : ""} lower from fatigue.` : "";
}

// Fatigue changes every step, so update the meters and bars in place instead of
// rebuilding the roster (which would swallow clicks on its buttons).
function updateMeters() {
  for (const element of document.querySelectorAll(".meter")) {
    const unit = state.units.find((item) => item.id === element.dataset.unit);
    if (unit) paintMeter(element, unit);
  }
  for (const element of document.querySelectorAll(".bar[data-unit]")) {
    const unit = state.units.find((item) => item.id === element.dataset.unit);
    if (unit) paintBar(element, unit);
  }
}

function levelBar(unit, bar, label) {
  const element = document.createElement("span");
  element.className = "bar";
  element.setAttribute("role", "img");
  element.dataset.bar = bar;
  element.dataset.label = label;
  for (let index = 1; index <= LEVEL_MAX; index += 1) element.append(document.createElement("i"));
  if (unit) {
    element.dataset.unit = unit.id;
    paintBar(element, unit);
  } else {
    element.setAttribute("aria-label", `${label} none`);
  }
  return element;
}

function applyLevelChange(targets, bar, delta, subject) {
  let changed = 0;
  for (const unit of targets) {
    const next = adjustLevel(unit.levels, bar, delta, state.trainingBudget);
    if (next !== unit.levels) {
      unit.levels = next;
      changed += 1;
    }
  }
  if (changed === 0) {
    const outOfPoints = delta > 0 && targets.some((unit) => unit.levels[bar] < LEVEL_MAX);
    setStatus(
      outOfPoints
        ? "No training points left: lower another bar first."
        : `${BAR_LABELS[bar]} cannot go ${delta > 0 ? "higher" : "lower"}.`,
    );
    return;
  }
  setStatus(`${subject}: ${BAR_LABELS[bar]} ${delta > 0 ? "raised" : "lowered"}.`);
  audio.play("select");
  renderInterface();
}

// Change one operator's own bar from its roster entry.
function adjustOperator(unit, bar, delta) {
  applyLevelChange([unit], bar, delta, unit.definition.name);
}

// Change a bar for every selected operator from the Training panel.
function adjustTraining(bar, delta) {
  const targets = selectedOperators();
  const subject = targets.length > 1 ? "Selected operators" : targets[0]?.definition.name;
  applyLevelChange(targets, bar, delta, subject);
  canvas.focus();
}

function renderTraining() {
  const unit = selectedUnit();
  const container = document.querySelector("#training-bars");
  const picked = selectedOperators();
  document.querySelector("#training-heading").textContent = picked.length > 1
    ? `${picked.length} operators selected`
    : unit
      ? `${unit.definition.name} ${state.units.filter((item) => item.side === "team").indexOf(unit) + 1}` +
        ` · ${pointsLeft(unit.levels, state.trainingBudget)} points left`
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
      raise.disabled = !unit || level >= LEVEL_MAX || pointsLeft(unit.levels, state.trainingBudget) <= 0;
      raise.addEventListener("click", () => adjustTraining(bar, 1));
      row.append(label, levelBar(unit, bar, BAR_LABELS[bar]), lower, raise);
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
  selectAllButton.setAttribute(
    "aria-pressed",
    String(activeOperators().length > 1 && selectedOperators().length === activeOperators().length),
  );
  const operators = state.units.filter((unit) => unit.side === "team");
  rosterElement.replaceChildren(
    ...operators.map((unit, index) => {
      const label = `${unit.definition.name} ${index + 1}`;
      const picked = isSelected({ ids: state.selectedIds }, unit.id) && !unit.disabled;
      const item = document.createElement("div");
      item.className = "roster-item";
      item.classList.toggle("selected", picked);
      item.classList.toggle("down", unit.disabled);

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = picked;
      checkbox.disabled = unit.disabled;
      checkbox.setAttribute("aria-label", `Include ${label} in the selection`);
      checkbox.addEventListener("change", () => toggleSelect(unit.id));

      const button = document.createElement("button");
      button.type = "button";
      button.className = "roster-select";
      button.disabled = unit.disabled;
      button.setAttribute("aria-pressed", String(picked));
      button.title = "Click: select only this operator. Ctrl/Shift-click: add to the selection.";
      button.addEventListener("click", (event) => {
        if (event.ctrlKey || event.shiftKey || event.metaKey) toggleSelect(unit.id);
        else selectUnit(unit.id);
      });
      const pad = (value) => Math.round(value).toString().padStart(2, "0");
      const glyph = document.createElement("span");
      glyph.className = "operator-glyph";
      glyph.setAttribute("aria-hidden", "true");
      glyph.textContent = "◇";
      const name = document.createElement("span");
      name.textContent = `Op ${index + 1}`;
      name.title = label;
      const health = document.createElement("small");
      health.className = "hp";
      health.textContent = `${unit.health}/${unit.definition.stats.vitality}`;
      name.append(" ", health);
      const position = document.createElement("span");
      position.className = "operator-position";
      position.textContent = `${pad(unit.position.x)}:${pad(unit.position.y)}`;
      button.append(glyph, name, position);

      // Each operator's own bars: these change only this operator.
      const bars = document.createElement("div");
      bars.className = "roster-bars";
      for (const bar of BARS) {
        const group = document.createElement("span");
        group.className = "bar-group";
        const lower = document.createElement("button");
        lower.type = "button";
        lower.textContent = "−";
        lower.disabled = unit.disabled || unit.levels[bar] <= LEVEL_MIN;
        lower.setAttribute("aria-label", `Lower ${BAR_LABELS[bar]} for ${label}`);
        lower.addEventListener("click", () => adjustOperator(unit, bar, -1));
        const raise = document.createElement("button");
        raise.type = "button";
        raise.textContent = "+";
        raise.disabled =
          unit.disabled || unit.levels[bar] >= LEVEL_MAX || pointsLeft(unit.levels, state.trainingBudget) <= 0;
        raise.setAttribute("aria-label", `Raise ${BAR_LABELS[bar]} for ${label}`);
        raise.addEventListener("click", () => adjustOperator(unit, bar, 1));
        group.append(BAR_LABELS[bar], levelBar(unit, bar, `${BAR_LABELS[bar]} of ${label}`), lower, raise);
        bars.append(group);
      }
      const meters = document.createElement("div");
      meters.className = "meters";
      meters.append(makeMeter(unit, "stamina", label), makeMeter(unit, "focus", label));
      const points = document.createElement("span");
      points.className = "points";
      const left = pointsLeft(unit.levels, state.trainingBudget);
      points.textContent = `${left} pts`;
      points.title = `Each operator may spend ${state.trainingBudget} points across Legs and Brain.`;
      points.classList.toggle("none", left <= 0);
      button.insertBefore(points, button.lastChild);
      item.append(checkbox, button, slotRow(unit, label), bars, meters);
      return item;
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
  const stimButton = document.querySelector("#stim-button");
  const stimmers = selectedOperators().filter((candidate) => energyItem(candidate));
  stimButton.disabled = stimmers.length === 0;
  const doses = stimmers.reduce((sum, candidate) => sum + (energyItem(candidate).charges ?? 1), 0);
  document.querySelector("#stim-label").textContent = stimmers.length ? `Use stim (${doses})` : "No stim";
  const lootButton = document.querySelector("#loot-button");
  const nearBody = findLoot(selectedOperators(), state.units);
  const bodies = state.units.filter(lootableBody).length;
  lootButton.disabled = !nearBody && bodies === 0;
  document.querySelector("#loot-label").textContent = nearBody
    ? `Pick up ${nearBody.body.equipment.length} item${nearBody.body.equipment.length > 1 ? "s" : ""}`
    : bodies > 0
      ? "Pick up (walk there)"
      : "Pick up gear";
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
