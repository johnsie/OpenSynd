// SPDX-License-Identifier: GPL-2.0-or-later

import { accuracyText, killsText, newDebriefCounts, recordKill, recordShot, totals } from "./debrief.js";
import { THROW_RANGE, advanceBombs, plantBomb, shootBombs } from "./bombs.js";
import {
  advanceVehicles,
  ENTER_RANGE,
  canEnter,
  createRoadGrid,
  driveTo,
  enterVehicle,
  isSquadVehicle,
  isVehicle,
  leaveVehicle,
  newVehicleState,
  signalAt,
  vehicleDefinition,
} from "./vehicles.js";
import { createOverlay, createTileSprites } from "./textures.js";
import { renderWorldMap } from "./worldmap.js";
import { DRUG_HINTS, DRUG_LABELS, DRUG_NAMES, adrenalineSpeed, advanceDrugs, drugMultiplier, newDrugs, setDrug } from "./drugs.js";
import { advanceProps, damageProp, newProp, propsNear } from "./props.js";
import {
  FENCE_SURFACE,
  WALL_SURFACE,
  drawBeacon,
  drawScenery,
  drawSignal,
  drawConsole,
  drawFenceTile,
  drawGateTile,
  drawRelay,
  drawVehicle,
  drawServer,
  drawWallTile,
} from "./structures.js";
import { BUILDING_SURFACE, buildingStyle, buildingsFromMap, drawOrder, seededRandom } from "./buildings.js";
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
  screenToGridExact,
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
  canResearchItem,
  buyIntoSlot,
  canBuy,
  campaignEnding,
  captureItems,
  discoverItems,
  earnAchievement,
  INTEL_LABELS,
  enemyArmament,
  enemyUpgrades,
  describeStats,
  INTEL_LEVELS,
  buyIntel,
  intelLevel,
  intelPrice,
  advanceCampaign,
  dayOf,
  ensureTerritories,
  researchBlockers,
  setResearchLevel,
  setTerritoryTax,
  startResearch,
  suspendResearch,
  winTerritory,
  CIVILIAN_PENALTY,
  POLICE_PENALTY,
  emptyCampaign,
  isItemAvailable,
  penalise,
  loadoutFor,
  markEnded,
  netCost,
  parseCampaign,
  sellFromSlot,
  slotItem,
  sellValue,
  sanitizeLoadouts,
  serializeCampaign,
  canFit,
  resupplyCost,
  ROSTER_MAX,
  SQUAD_MAX,
  HIRE_PRICE,
  aliveMembers,
  bench,
  deploy,
  deployedMembers,
  hire,
  loseOperatives,
  recruit,
  fitUpgrade,
  removeUpgrade,
  upgradesOf,
} from "./campaign.js";
import {
  MOODS,
  RESEARCH_LEVELS,
  RESEARCH_RATES,
  SECONDS_PER_HOUR,
  TAX_STEP,
  dailyTax,
  moodRule,
  researchHourlyCost,
  researchHoursLeft,
} from "./strategy.js";
import {
  MAX_TIER,
  PARTS,
  PART_NAMES,
  chestVitality,
  legsPace,
  upgradePrice,
} from "./upgrades.js";
import { newStats, newlyEarned } from "./achievements.js";
import {
  distanceBetween,
  clearWeaponForAll,
  collectFallen,
  dropItem,
  findLoot,
  freeSlots,
  makeDrop,
  inLootReach,
  lootBody,
  lootableAt,
  lootableBody,
  nearestLootable,
  selectWeaponForAll,
} from "./inventory.js";
import {
  advanceCombat,
  advancePursuit,
  advanceRegeneration,
  combatStats,
  fireManual,
  heldWeapon,
  roundsLeft,
  seedSimulation,
  advancePatrols,
  advancePersuasion,
  advanceShields,
  hasWeaponSelected,
  raiseShield,
  advanceScanners,
  maxHealth,
  persuadePoints,
  scannedUnits,
  scannerItem,
  useScanner,
  startPanic,
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
  currentObjective,
  failureReason,
  objectiveFocus,
  resolveUnitObjectives,
  advanceHold, isOpenTarget, resolveArrival, resolveDisabled, resolveExtraction, syncGates as syncMissionGates,
} from "./mission.js";
import {
  addEffect,
  advanceEffects,
  createEffects,
  effectProgress,
  facingVector,
  knockbackOffset,
  recoilOffset,
  walkBob,
} from "./effects.js";
import { isSelected, prune, selectMany, selectOnly, toggle } from "./selection.js";
import {
  PROGRESS_KEY,
  emptyProgress,
  isCompleted,
  isUnlocked,
  prerequisites,
  markCompleted,
  parseProgress,
  serializeProgress,
} from "./progress.js";
import { createMusic } from "./music.js";
import { createAudio, shotCue, shotVolume } from "./audio.js";
import { SETTINGS_KEY, parseSettings, prefersReducedMotion, serializeSettings } from "./settings.js";

const canvas = document.querySelector("#game-canvas");
const context = canvas.getContext("2d");
const pauseButton = document.querySelector("#pause-button");
const resetButton = document.querySelector("#reset-button");
const rosterElement = document.querySelector("#roster");
const threatsElement = document.querySelector("#threats");
const enemyCount = document.querySelector("#enemy-count");
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
  trackUrl: "assets/music/the-core.mp3",
  alertTrackUrl: "assets/music/electric-stream.mp3",
  AudioElementClass: window.Audio,
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
// Which side of the fight a unit definition's role puts it on.
const SIDE_BY_ROLE = {
  operator: "team",
  "enemy-agent": "opposition",
  guard: "opposition",
  civilian: "civilian",
  criminal: "criminal",
  police: "police",
};
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
  armoury: { operator: 0, slot: 0, selected: [] },
  campaign: emptyCampaign(),
  catalog: [],
  opStats: newStats(0),
  earnedThisRun: [],
  shownFunds: -1,
  campaignTimer: 0,
  achievementTimer: 0,
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
  bombs: [],
  drops: [],
  armedBomb: null,
  listFilter: "open",
  elapsed: 0,
  map: null,
  mission: null,
  grid: null,
  units: [],
  objectives: [],
  props: [],
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
function squadTeam(slots) {
  return deployedMembers(state.campaign)
    .slice(0, slots.length)
    .map((member, index) => ({ ...slots[index], id: member.id, callsign: member.name }));
}

function startingEquipment(placement, definition, byPath, byId) {
  const defaults = placement.equipment.map((path) => byPath.get(path));
  const issued = state.enemyArms?.get(placement.id);
  if (issued && definition.role === "enemy-agent") defaults.push(issued);
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
  const rawMission = await readJson(`content/${missionPath}`);
  // The squad is chosen from the roster: its members take the mission's starting places in order.
  state.rawTeam = rawMission.team;
  const mission = { ...rawMission, team: squadTeam(rawMission.team) };
  const map = await readJson(`content/${mission.map}`);
  const unitEntries = await Promise.all(
    pack.units.map(async (path) => [path, await readJson(`content/${path}`)]),
  );
  const unitDefinitions = new Map(unitEntries);
  const vehicleEntries = await Promise.all(
    (pack.vehicles ?? []).map(async (path) => [path, await readJson(`content/${path}`)]),
  );
  const vehicleDefinitions = new Map(vehicleEntries);
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
  state.buildings = buildingsFromMap(map);
  state.bombs = [];
  state.drops = [];
  state.armedBomb = null;
  state.alertHold = 0;
  state.alertMusic = false;
  music.setAlert(false);
  // Relay pylons and the gate console stand on their pads. Their footprint is the pad's first tile
  // so operatives standing on the pad are drawn in front of them.
  state.structures = map.zones
    .filter((zone) => zone.kind === "interaction" || zone.kind === "hold")
    .map((zone) => ({
      id: zone.id,
      x: zone.position.x,
      y: zone.position.y,
      width: 1,
      height: 1,
      centre: { x: zone.position.x + (zone.width - 1) / 2, y: zone.position.y + (zone.height - 1) / 2 },
      structure: zone.prop ?? (zone.kind === "hold" ? "beacon" : zone.id.includes("gate") ? "console" : "relay"),
      elevation: state.grid[zone.position.y][zone.position.x]?.elevation ?? 0,
    }));
  // Street scenery: trees, lights and bins. They take damage and are drawn in depth order with everything else.
  state.props = (map.props ?? []).map(newProp);
  for (const prop of state.props) {
    state.structures.push({
      id: prop.id,
      x: prop.position.x,
      y: prop.position.y,
      width: 1,
      height: 1,
      structure: "scenery",
      prop,
      elevation: state.grid[prop.position.y]?.[prop.position.x]?.elevation ?? 0,
    });
  }
  state.objectives = mission.objectives.map((objective) => ({
    ...objective,
    complete: false,
    sequence: Boolean(mission.sequence),
  }));
  syncGates();
  const buildUnit = (placement, definition) => ({
    ...placement,
    definition,
    side: SIDE_BY_ROLE[definition.role] ?? "opposition",
    position: { ...placement.position },
    initialPosition: { ...placement.position },
    alertedBy: null,
    walkPhase: 0,
    script: placement.script
      ? { steps: placement.script, index: 0, waitLeft: null, loop: Boolean(placement.scriptLoop), done: false }
      : null,
    patrol: placement.patrol
      ? { route: buildPatrolRoute(state.grid, placement.position, placement.patrol), index: 0 }
      : null,
    path: [],
    upgrades:
      definition.role === "operator"
        ? upgradesOf(state.campaign, placement.id)
        : definition.role === "enemy-agent"
          ? enemyUpgrades(state.campaign)
          : null,
    drugs: definition.role === "operator" ? newDrugs() : null,
    looted: [],
    activeSlot: null,
    initialEquipment: [],
    equipment: startingEquipment(placement, definition, equipmentDefinitions, definitionsById).map((item) => ({
      definition: item,
      charges: item.charges,
    })),
    // What this kind of person carries besides what is in their hands (a policeman's sidearm): it drops when they fall.
    sidearm: (definition.carries ?? [])
      .map((path) => equipmentDefinitions.get(path))
      .filter(Boolean)
      .map((item) => ({ definition: item, charges: item.charges })),
    health:
      definition.stats.vitality +
      (definition.role === "operator"
        ? chestVitality(upgradesOf(state.campaign, placement.id))
        : definition.role === "enemy-agent"
          ? chestVitality(enemyUpgrades(state.campaign))
          : 0),
    cooldownRemaining: 0,
    targetId: null,
    disabled: false,
  });
  state.enemyArms = enemyArmament(
    mission.opponents.filter((placement) => unitDefinitions.get(placement.unit)?.role === "enemy-agent").map((placement) => placement.id),
    state.campaign,
    state.catalog,
  );
  seedSimulation(1);
  state.units = [...mission.team, ...mission.opponents, ...(mission.bystanders ?? [])].map((placement) =>
    buildUnit(placement, unitDefinitions.get(placement.unit)),
  );
  // Vehicles are units too (side "vehicle"), with an AI driver who is a unit riding inside.
  state.roadGrid = createRoadGrid(state.grid);
  // A signal at each corner of every crossing: two corners show the east-west light, two the north-south one.
  for (const crossing of state.roadGrid.crossings) {
    const corners = [
      { x: crossing.x - 0.5, y: crossing.y - 0.5, axis: "ew" },
      { x: crossing.x + crossing.width - 0.5, y: crossing.y + crossing.height - 0.5, axis: "ew" },
      { x: crossing.x + crossing.width - 0.5, y: crossing.y - 0.5, axis: "ns" },
      { x: crossing.x - 0.5, y: crossing.y + crossing.height - 0.5, axis: "ns" },
    ];
    corners.forEach((corner, index) => {
      state.structures.push({
        id: `${crossing.id}-signal-${index}`,
        x: Math.round(corner.x),
        y: Math.round(corner.y),
        width: 1,
        height: 1,
        structure: "signal",
        signal: { crossing, axis: corner.axis, at: { x: corner.x, y: corner.y } },
        elevation: 0,
      });
    });
  }
  for (const placement of mission.vehicles ?? []) {
    const definition = vehicleDefinition(vehicleDefinitions.get(placement.vehicle));
    const driverDefinition = placement.driver ? unitDefinitions.get(placement.driver) : null;
    const driverId = driverDefinition ? `${placement.id}-driver` : null;
    const vehicle = buildUnit({ id: placement.id, position: placement.position, equipment: [] }, definition);
    vehicle.side = "vehicle";
    vehicle.patrol = null;
    vehicle.vehicle = newVehicleState(driverId);
    if (placement.patrol) {
      vehicle.vehicle.route = { route: buildPatrolRoute(state.roadGrid, placement.position, placement.patrol), index: 0 };
    }
    state.units.push(vehicle);
    if (driverDefinition) {
      const driver = buildUnit({ id: driverId, position: placement.position, equipment: [] }, driverDefinition);
      driver.inVehicle = placement.id;
      driver.patrol = null;
      state.units.push(driver);
    }
  }
  // Each operative's number, shown in gold above their head and matching their place in the squad list.
  state.units.filter((unit) => unit.side === "team").forEach((unit, index) => {
    unit.number = index + 1;
  });
  for (const unit of state.units) unit.initialEquipment = unit.equipment.map((item) => ({ ...item }));
  // Reset only now that the new units exist, or the old squad would re-trigger the outcome.
  state.outcome = "active";
  state.missionSeconds = 0;
  state.opStats = newStats(mission.opponents.length);
  state.fundsAtStart = state.campaign.funds;
  state.debrief = newDebriefCounts();
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
  if (state.missionList.length !== pack.missions.length) {
    state.missionList = await Promise.all(
      pack.missions.map(async (path) => {
        const entry = await readJson(`content/${path}`);
        return {
          id: entry.id,
          name: entry.name,
          objectives: entry.objectives.length,
          enemies: entry.opponents.length,
          region: entry.region ?? null,
          population: entry.region?.population,
          unlocks: entry.unlocks ?? [],
          intel: entry.intel ?? [],
        };
      }),
    );
  }
  if (pack.territories && !state.territories) {
    state.territories = (await readJson(`content/${pack.territories}`)).territories;
  }
  state.progress = parseProgress(readStored(PROGRESS_KEY));
  state.campaign = ensureTerritories(state.campaign, state.missionList);
  describeMission(mission, map, index);
  renderMissionList();
  setStatus("Local map established. Select a relay route.");
  updateLoadButton();
  renderInterface();
}

function syncGates() {
  const doors = (state.map.objects ?? []).filter((object) => object.kind === "door");
  const wasOpen = doors.map((door) => state.grid[door.position.y]?.[door.position.x]?.door?.open);
  syncMissionGates(state.grid, state.map, state.objectives, state.units ?? []);
  // A door that has just opened or closed near the view is heard.
  doors.forEach((door, index) => {
    const now = state.grid[door.position.y]?.[door.position.x]?.door?.open;
    if (wasOpen[index] === undefined || now === wasOpen[index]) return;
    const away = Math.hypot(door.position.x - state.camera.x, door.position.y - state.camera.y);
    audio.play("door", { volume: shotVolume(away, false) });
  });
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
  document.querySelector("#research-funds").textContent = `Funds ${Math.floor(campaign.funds)}`;

  // Body upgrades for the operative chosen in the Armoury: six parts, three tiers each.
  const squad = squadTeam(state.rawTeam ?? state.mission.team);
  const fitted = squad[Math.min(state.armoury.operator, squad.length - 1)];
  document.querySelector("#upgrades-heading").textContent =
    `Body upgrades · Operator ${Math.min(state.armoury.operator, squad.length - 1) + 1} · ${fitted.callsign ?? fitted.id}`;
  const owned = upgradesOf(campaign, fitted.id);
  document.querySelector("#research-tracks").replaceChildren(
    ...PART_NAMES.map((part) => {
      const info = PARTS[part];
      const tier = owned[part];
      const row = document.createElement("div");
      row.className = "research-row";
      const name = document.createElement("span");
      name.textContent = `${info.label} · tier ${tier} of ${MAX_TIER}`;
      const controls = document.createElement("span");
      const fit = document.createElement("button");
      fit.type = "button";
      fit.textContent = tier >= MAX_TIER ? "Fully upgraded" : `Fit tier ${tier + 1} · ${upgradePrice(part, tier + 1)} funds`;
      fit.setAttribute("aria-label", `${info.label} for Operator ${state.armoury.operator + 1}: ${fit.textContent}`);
      fit.disabled = !canFit(campaign, fitted.id, part);
      fit.addEventListener("click", () => {
        state.campaign = fitUpgrade(state.campaign, fitted.id, part);
        persistCampaign();
        updateFundsReadout();
        renderResearch();
      });
      controls.append(fit);
      if (tier > 0) {
        const remove = document.createElement("button");
        remove.type = "button";
        remove.textContent = `Remove · +${upgradePrice(part, tier)}`;
        remove.addEventListener("click", () => {
          state.campaign = removeUpgrade(state.campaign, fitted.id, part);
          persistCampaign();
          updateFundsReadout();
          renderResearch();
        });
        controls.append(remove);
      }
      const note = document.createElement("small");
      note.textContent = info.effect;
      row.append(name, controls, note);
      return row;
    }),
  );

  renderResearchDial();
  document.querySelector("#research-items").replaceChildren(
    ...state.catalog.filter((item) => !item.missionItem).map((item) => {
      const row = document.createElement("div");
      row.className = "research-row";
      const name = document.createElement("span");
      name.textContent = item.name;
      const control = document.createElement("span");
      const researching = (item.researchCost ?? 0) > 0 && !isItemAvailable(campaign, item);
      if (researching) {
        const blockers = researchBlockers(campaign, item, state.catalog);
        const percent = Math.round(campaign.research.progress[item.id] ?? 0);
        const active = campaign.research.active === item.id;
        if (percent > 0) {
          const bar = document.createElement("progress");
          bar.max = 100;
          bar.value = percent;
          bar.setAttribute("aria-label", `${item.name} research ${percent} percent`);
          control.append(bar, document.createTextNode(` ${percent}% `));
        }
        const button = document.createElement("button");
        button.type = "button";
        if (blockers.length > 0) {
          const needed = blockers.map((id) => state.catalog.find((entry) => entry.id === id)?.name ?? id);
          button.textContent = `Needs ${needed.join(", ")}`;
          button.disabled = true;
        } else if (active) {
          button.textContent = "Researching · pause";
          button.setAttribute("aria-label", `Pause research on ${item.name}`);
          button.addEventListener("click", () => {
            state.campaign = suspendResearch(state.campaign);
            persistCampaign();
            renderResearch();
          });
        } else {
          button.textContent = percent > 0 ? "Resume" : `Research · ${item.researchCost} funds`;
          button.setAttribute("aria-label", `Research ${item.name}, ${item.researchCost} funds at the lowest funding level`);
          button.addEventListener("click", () => {
            state.campaign = startResearch(state.campaign, item, state.catalog);
            persistCampaign();
            renderResearch();
          });
        }
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

  renderRoster();
  renderArmoury();
}

// The funding dial for the research under way: ten levels, each faster and dearer, with the projected finish.
function renderResearchDial() {
  const dial = document.querySelector("#research-dial");
  const { active, level, progress } = state.campaign.research;
  const item = state.catalog.find((entry) => entry.id === active);
  if (!item) {
    dial.textContent = "Nothing is being researched. Choose an item below; it runs while operations are under way.";
    return;
  }
  const row = document.createElement("div");
  row.className = "dial-row";
  const label = document.createElement("label");
  label.textContent = `Funding for ${item.name}: level `;
  const range = document.createElement("input");
  range.type = "range";
  range.min = "1";
  range.max = String(RESEARCH_LEVELS);
  range.value = String(level);
  range.setAttribute("aria-label", `Research funding level, 1 to ${RESEARCH_LEVELS}`);
  const summary = document.createElement("span");
  const describe = (chosen) => {
    const hours = researchHoursLeft(progress[item.id] ?? 0, chosen);
    summary.textContent =
      ` ${chosen} · ${RESEARCH_RATES[chosen - 1]}% an hour · ${researchHourlyCost(item, chosen).toFixed(1)} funds an hour · ` +
      `about ${hours} game hours (${(hours / 24).toFixed(1)} days) to go`;
  };
  describe(level);
  range.addEventListener("input", () => describe(Number(range.value)));
  range.addEventListener("change", () => {
    state.campaign = setResearchLevel(state.campaign, Number(range.value));
    persistCampaign();
    renderResearch();
  });
  label.append(range);
  row.append(label, summary);
  dial.replaceChildren(row);
}

// The roster: who is alive, who deploys (up to four), and hiring a replacement. Fallen operatives are listed as lost.
function renderRoster() {
  const campaign = state.campaign;
  const list = document.querySelector("#roster-list");
  const cards = campaign.roster.map((member) => {
    const card = document.createElement("div");
    card.className = "roster-card";
    card.classList.toggle("fallen", !member.alive);
    const name = document.createElement("button");
    name.type = "button";
    name.className = "roster-pick";
    name.textContent = member.name;
    const deployed = member.alive && campaign.squad.includes(member.id);
    const team = squadTeam(state.rawTeam ?? state.mission.team);
    const lone = state.armoury.selected.length === 0 && team[state.armoury.operator]?.id === member.id;
    const picked = deployed && (state.armoury.selected.includes(member.id) || lone);
    name.setAttribute("aria-pressed", String(picked));
    name.title = deployed
      ? "Click to pick or unpick for buying; several can be picked at once."
      : "Only deploying operatives can be picked.";
    name.disabled = !deployed;
    card.classList.toggle("picked", picked);
    // Anywhere on the card picks the operative; only the Deploy checkbox itself does something else.
    card.addEventListener("click", (event) => {
      if (event.target.closest("input")) return;
      event.preventDefault(); // the Deploy label's text must not tick the box
      toggleLabPick(member);
    });
    card.append(name);
    if (!member.alive) {
      const lost = document.createElement("span");
      lost.textContent = "Lost";
      card.append(lost);
      return card;
    }
    const label = document.createElement("label");
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = campaign.squad.includes(member.id);
    box.setAttribute("aria-label", `Deploy ${member.name}`);
    box.disabled = box.checked ? campaign.squad.length <= 1 : campaign.squad.length >= SQUAD_MAX;
    box.addEventListener("change", () => {
      state.campaign = box.checked ? deploy(state.campaign, member.id) : bench(state.campaign, member.id);
      state.squadChanged = true;
      persistCampaign();
      renderResearch();
    });
    label.append(box, document.createTextNode("Deploy"));
    card.append(label);
    return card;
  });
  const hireButton = document.createElement("button");
  hireButton.type = "button";
  const wiped = aliveMembers(campaign).length === 0;
  hireButton.textContent = wiped ? "Take on a volunteer · free" : `Hire a replacement · ${HIRE_PRICE} funds`;
  hireButton.disabled = aliveMembers(campaign).length >= ROSTER_MAX || (!wiped && campaign.funds < HIRE_PRICE);
  hireButton.addEventListener("click", () => {
    const hired = hire(state.campaign);
    if (!hired.member) return;
    state.campaign = hired.campaign;
    state.squadChanged = true;
    persistCampaign();
    updateFundsReadout();
    renderResearch();
  });
  const insurance = document.createElement("label");
  const toggle = document.createElement("input");
  toggle.type = "checkbox";
  toggle.checked = campaign.permadeath;
  toggle.setAttribute("aria-label", "Fallen operatives are lost for good");
  toggle.addEventListener("change", () => {
    state.campaign = { ...state.campaign, permadeath: toggle.checked };
    persistCampaign();
    renderResearch();
  });
  insurance.append(toggle, document.createTextNode("Fallen operatives are lost for good"));
  list.replaceChildren(...cards, hireButton, insurance);
  document.querySelector("#roster-note").textContent =
    `${aliveMembers(campaign).length} of ${ROSTER_MAX} places filled, ${campaign.squad.length} of ${SQUAD_MAX} deploying. ` +
    "Persuade enemy agents and get them out alive to recruit them." +
    (state.squadChanged ? " Squad changes apply when the operation is restarted." : "");
}

// The operatives a purchase is for: everyone picked in the roster, or just the chosen operative.
function labTargets(team) {
  const picked = team.filter((placement) => state.armoury.selected.includes(placement.id));
  return picked.length > 0 ? picked : [team[state.armoury.operator]];
}

// Pick or unpick a roster member for the Squad tab; the one just picked becomes the chosen operative.
function toggleLabPick(member) {
  const team = squadTeam(state.rawTeam ?? state.mission.team);
  const index = team.findIndex((placement) => placement.id === member.id);
  if (index < 0) return; // benched or lost: nothing to buy for
  const selected = new Set(state.armoury.selected.filter((id) => team.some((placement) => placement.id === id)));
  let operator = state.armoury.operator;
  if (selected.has(member.id)) {
    selected.delete(member.id);
    if (operator === index) {
      const rest = team.findIndex((placement) => selected.has(placement.id));
      if (rest >= 0) operator = rest;
    }
  } else {
    selected.add(member.id);
    operator = index;
  }
  state.armoury = { ...state.armoury, operator, selected: [...selected] };
  renderResearch();
}

// The Armoury: each operative's eight slots as pictures, and a shop that buys into the chosen slot.
function renderArmoury() {
  const campaign = state.campaign;
  const team = squadTeam(state.rawTeam ?? state.mission.team);
  state.armoury.operator = Math.min(state.armoury.operator, team.length - 1);
  const choice = state.armoury;
  const loadouts = team.map((placement) => loadoutFor(campaign, placement.id, startingLoadout(placement)));
  const byId = new Map(state.catalog.map((item) => [item.id, item]));

  document.querySelector("#armoury-squad").replaceChildren(
    ...team.map((placement, index) => {
      if (index !== choice.operator) return null;
      const card = document.createElement("div");
      card.className = "armoury-card";
      const heading = document.createElement("h4");
      heading.textContent =
        `Operator ${index + 1} · ${placement.callsign ?? placement.id} · ` +
        `${loadouts[index].length} of ${SLOTS_PER_OPERATIVE} slots`;
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
          state.armoury = { ...state.armoury, operator: index, slot };
          renderArmoury();
        });
        grid.append(square);
      }
      card.append(heading, grid);
      return card;
    }).filter(Boolean),
  );

  const placement = team[choice.operator];
  const defaults = startingLoadout(placement);
  const current = byId.get(loadouts[choice.operator][choice.slot]);
  const shop = document.querySelector("#armoury-shop");
  const targets = labTargets(team);
  const heading = document.createElement("h4");
  heading.textContent =
    `Operator ${choice.operator + 1}${targets.length > 1 ? ` and ${targets.length - 1} more` : ""} · ` +
    `slot ${choice.slot + 1}: ${current ? current.name : "empty"}`;
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
  const rows = state.catalog.filter((item) => !item.missionItem).map((item) => {
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
    const figures = document.createElement("small");
    figures.className = "stats";
    figures.textContent = describeStats(item).join(" · ");
    text.append(name, note, figures);
    const buy = document.createElement("button");
    buy.type = "button";
    const defaultsFor = (target) => startingLoadout(target);
    const buyable = targets.filter(
      (target) => canBuy(campaign, target.id, choice.slot, item, state.catalog, defaultsFor(target)) &&
        slotItem(campaign, target.id, choice.slot, state.catalog, defaultsFor(target))?.id !== item.id,
    );
    const net = netCost(campaign, placement.id, choice.slot, item, state.catalog, defaults);
    if (targets.length > 1) {
      const total = buyable.reduce(
        (sum, target) => sum + netCost(campaign, target.id, choice.slot, item, state.catalog, defaultsFor(target)),
        0,
      );
      buy.textContent = `Buy for ${targets.length} · ${total} funds`;
      buy.setAttribute("aria-label", `Buy ${item.name} for ${targets.length} operators, ${total} funds`);
    } else {
      buy.textContent = net < 0 ? `Swap · +${-net} funds` : `Buy · ${net} funds`;
      buy.setAttribute(
        "aria-label",
        `Buy ${item.name} for Operator ${choice.operator + 1} slot ${choice.slot + 1}, ${net} funds`,
      );
    }
    buy.disabled = !available || buyable.length === 0;
    buy.addEventListener("click", () => {
      // Each picked operative gets it, in the chosen slot; those who cannot afford it are left out.
      let bought = 0;
      for (const target of targets) {
        const before = state.campaign;
        state.campaign = buyIntoSlot(state.campaign, target.id, choice.slot, item, state.catalog, defaultsFor(target));
        if (state.campaign !== before) bought += 1;
      }
      document.querySelector("#lab-message").textContent =
        targets.length > 1
          ? `${item.name} bought for ${bought} of ${targets.length} operators` +
            `${bought < targets.length ? " (the rest could not take it)" : ""}.`
          : "";
      persistCampaign();
      updateFundsReadout();
      renderResearch();
    });
    row.append(icon, text, buy);
    return row;
  });
  shop.replaceChildren(heading, sell, ...rows);
}

wireTabs(document.querySelector(".lab-tabs"));
wireTabs(document.querySelector(".list-filter"), (tab) => {
  state.listFilter = tab.dataset.filter;
  renderMissionList();
});

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
// Switch to operation `index`, asking first if that would abandon one in progress.
async function chooseMission(index) {
  if (index === state.missionIndex) return;
  if (
    operationInProgress() &&
    !(await confirmLeave("Switching operations abandons the one in progress. Save first if you want to come back to it."))
  ) {
    return;
  }
  loadGame(index).catch(showFatalError);
}

// The chosen operation's territory: who lives there, the tax rate you set, what it pays and how its people feel.
function renderTerritoryPanel() {
  const panel = document.querySelector("#territory-panel");
  const entry = state.missionList[state.missionIndex];
  const territory = entry ? state.campaign.territories[entry.id] : null;
  if (!territory) {
    panel.replaceChildren();
    return;
  }
  const people = `${(territory.population / 1_000_000).toFixed(2)} million people`;
  const held = territory.status === "finished";
  const revolt = territory.status === "rebel";
  const title = document.createElement("p");
  title.textContent =
    `${entry.name}: ${people} · ` + (revolt ? "IN REVOLT, take it back" : held ? "held" : "not yet taken");
  const taxRow = document.createElement("div");
  taxRow.className = "tax-row";
  const lower = document.createElement("button");
  lower.type = "button";
  lower.textContent = "−";
  lower.setAttribute("aria-label", `Lower tax on ${entry.name}`);
  lower.disabled = territory.tax <= 0;
  lower.addEventListener("click", () => changeTax(entry.id, territory.tax - TAX_STEP));
  const raise = document.createElement("button");
  raise.type = "button";
  raise.textContent = "+";
  raise.setAttribute("aria-label", `Raise tax on ${entry.name}`);
  raise.disabled = territory.tax >= 100;
  raise.addEventListener("click", () => changeTax(entry.id, territory.tax + TAX_STEP));
  const rate = document.createElement("span");
  rate.textContent = `Tax ${territory.tax}% · pays ${dailyTax({ ...territory, status: "finished" }).toFixed(1)} funds a day` +
    (held ? "" : " once held");
  taxRow.append(lower, rate, raise);
  const mood = document.createElement("p");
  mood.className = "mood";
  mood.classList.toggle("bad", territory.mood >= 3);
  const rule = moodRule(territory.tax);
  const daysLeft = Math.max(0, rule.days - territory.moodDays);
  mood.textContent =
    held || revolt
      ? `Mood: ${MOODS[territory.mood]} · ${rule.direction === "better" ? "improving" : "worsening"} in ${daysLeft} days`
      : "Mood: unknown until you hold it";
  const survey = document.createElement("div");
  survey.className = "tax-row";
  const level = intelLevel(state.campaign, entry.id);
  const label = document.createElement("span");
  label.textContent = `Intelligence: ${INTEL_LABELS[level]}`;
  survey.append(label);
  if (level < INTEL_LEVELS) {
    const price = intelPrice(level + 1, entry.enemies);
    const buy = document.createElement("button");
    buy.type = "button";
    buy.textContent = `Buy ${INTEL_LABELS[level + 1].toLowerCase()} · ${price} funds`;
    buy.setAttribute("aria-label", `Buy ${INTEL_LABELS[level + 1]} for ${entry.name}, ${price} funds`);
    buy.disabled = state.campaign.funds < price;
    buy.addEventListener("click", () => {
      state.campaign = buyIntel(state.campaign, entry.id, entry.enemies);
      persistCampaign();
      updateFundsReadout();
      renderTerritoryPanel();
    });
    survey.append(buy);
  }
  const lines = (entry.intel ?? [])
    .slice(0, level)
    .map((text) => Object.assign(document.createElement("p"), { textContent: text }));
  panel.replaceChildren(title, taxRow, mood, survey, ...lines);
}

function changeTax(id, tax) {
  state.campaign = setTerritoryTax(state.campaign, id, tax);
  persistCampaign();
  updateFundsReadout();
  renderTerritoryPanel();
}

function renderMissionList() {
  renderTerritoryPanel();
  renderWorldMap({
    container: document.querySelector("#world-map"),
    entries: state.missionList,
    territories: (state.territories ?? []).filter((territory) => !territory.mission),
    progress: state.progress,
    selectedIndex: state.missionIndex,
    onSelect: chooseMission,
    onCard: (card) => {
      document.querySelector("#world-map-card").textContent = card
        ? `${card.title} — ${card.place} — ${card.label}. ${card.detail}`
        : "Choose an operation on the map, or from the list below.";
    },
  });
  missionListElement.replaceChildren(
    ...state.missionList.map((entry, index) => {
      const unlocked = isUnlocked(state.progress, state.missionList, index);
      const done = isCompleted(state.progress, entry.id);
      // The list can show just what is open to play, what is finished, or everything; the chosen one always shows.
      const shown =
        state.listFilter === "all" ||
        index === state.missionIndex ||
        (state.listFilter === "done" ? done : unlocked && !done);
      if (!shown) return null;
      const button = document.createElement("button");
      button.type = "button";
      button.disabled = !unlocked;
      button.setAttribute("aria-pressed", String(index === state.missionIndex));
      const name = document.createElement("span");
      name.textContent = `Operation ${String(index + 1).padStart(2, "0")} · ${entry.name}`;
      const status = document.createElement("span");
      status.className = "state";
      const revolt = state.campaign.territories[entry.id]?.status === "rebel";
      status.textContent = revolt ? "REVOLT" : done ? "COMPLETED" : unlocked ? "AVAILABLE" : "LOCKED";
      const note = document.createElement("small");
      note.textContent = unlocked
        ? `${entry.objectives} objectives · ${entry.enemies} enemy agents`
        : `Complete ${prerequisites(state.missionList, index)
            .map((id) => state.missionList.find((item) => item.id === id)?.name ?? id)
            .join(" or ")} to unlock this operation.`;
      button.append(name, status, note);
      button.addEventListener("click", () => chooseMission(index));
      return button;
    }).filter(Boolean),
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
          vitality: maxHealth(unit),
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
  state.drops = (snapshot.drops ?? [])
    .map((drop) => {
      const definition = state.catalog.find((entry) => entry.id === drop.itemId);
      return definition ? makeDrop(drop.id, { definition, charges: drop.charges }, { x: drop.x, y: drop.y }) : null;
    })
    .filter(Boolean);
  const unitsById = new Map(snapshot.units.map((unit) => [unit.id, unit]));
  for (const unit of state.units) {
    const saved = unitsById.get(unit.id);
    unit.position = { ...saved.position };
    unit.path = saved.path.map((point) => ({ ...point }));
    unit.health = saved.health;
    unit.cooldownRemaining = saved.cooldownRemaining;
    unit.targetId = saved.targetId;
    unit.disabled = saved.disabled;
    if (saved.disabled) unit.sidearm = []; // what they carried has already dropped or been lost
    unit.equipment = saved.equipment.map((item) => ({
      definition: state.catalog.find((entry) => entry.id === item.id),
      charges: item.charges,
    }));
    unit.looted = [...saved.looted];
    // Who is inside which car is not kept in a save: operators start the loaded game on foot, and a wreck stays one.
    unit.inVehicle = unit.definition.role === "operator" ? null : unit.inVehicle;
    if (isVehicle(unit)) {
      unit.vehicle.controlledBy = null;
      unit.vehicle.exploded = unit.disabled;
      unit.vehicle.occupantIds = unit.vehicle.occupantIds.filter((id) => id === unit.vehicle.driverId);
    }
    unit.escaped = saved.escaped;
    if (unit.drugs && saved.drugs) unit.drugs = saved.drugs;
    if (unit.script) Object.assign(unit.script, { index: saved.scriptIndex, waitLeft: null, done: saved.scriptDone });
    unit.persuadedBy = saved.persuadedBy;
    unit.persuaded = saved.persuadedBy !== null;
    unit.persuasions = { ...saved.persuasions };
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

// Streets: dark asphalt with glowing edge lines, an amber and cyan centre divider, and lane
// chevrons that point each way. Crossings are left plain. Returns false if the tile is not a street.
function drawRoad(tile, topCenter, cellSize) {
  if (tile.surface !== "street" || tile.gate) return false;
  const column = tile.width < tile.height;
  const lanes = column ? tile.width : tile.height;
  const across = column ? tile.x - tile.regionX : tile.y - tile.regionY;
  const along = column ? tile.y : tile.x;
  const first = column ? [tile.x - across - 1, tile.y] : [tile.x, tile.y - across - 1];
  const last = column ? [tile.x - across + lanes, tile.y] : [tile.x, tile.y - across + lanes];
  const isStreet = ([x, y]) => state.grid[y]?.[x]?.surface === "street";
  const crossing = isStreet(first) && isStreet(last);
  // Grid offsets within the tile: a runs across the street, b along it.
  const point = (a, b) => {
    const dx = column ? a : b;
    const dy = column ? b : a;
    return {
      x: topCenter.x + (dx - dy) * (cellSize.width / 2),
      y: topCenter.y + (dx + dy) * (cellSize.height / 2),
    };
  };
  const line = (a0, b0, a1, b1, colour, width, alpha) => {
    const from = point(a0, b0);
    const to = point(a1, b1);
    context.strokeStyle = colour;
    context.lineWidth = width;
    context.globalAlpha = alpha;
    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(to.x, to.y);
    context.stroke();
  };
  const glow = (a0, b0, a1, b1, colour, alpha = 1) => {
    line(a0, b0, a1, b1, colour, 4, 0.16 * alpha);
    line(a0, b0, a1, b1, colour, 1.2, 0.9 * alpha);
  };
  if (!crossing) {
    // A pale kerb stone along each edge, with the neon line just inside it.
    if (across === 0) line(-0.5, -0.5, -0.5, 0.5, "#8d9aa3", 3, 0.9);
    if (across === lanes - 1) line(0.5, -0.5, 0.5, 0.5, "#8d9aa3", 3, 0.9);
    if (across === 0) glow(-0.36, -0.5, -0.36, 0.5, "#42d6d0");
    if (across === lanes - 1) glow(0.36, -0.5, 0.36, 0.5, "#42d6d0");
    const middle = lanes / 2;
    if (across === middle - 1) glow(0.46, -0.5, 0.46, 0.5, "#e1b35a");
    if (across === middle && along % 2 === 0) glow(-0.46, -0.4, -0.46, 0.4, "#9fefff");
    if (along % 8 === 4) {
      // A chevron in the middle of the lane; lanes on either side of the divider point opposite ways.
      const direction = across < middle ? -1 : 1;
      for (const [a0, b0, a1, b1] of [[-0.2, -0.12, 0, 0.12], [0.2, -0.12, 0, 0.12]]) {
        glow(a0, b0 * direction, a1, b1 * direction, "#42d6d0", 0.7);
      }
    }
  }
  context.globalAlpha = 1;
  return true;
}

const makeCanvas = (width, height) => {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
};
const tileSprites = createTileSprites(makeCanvas);
const overlays = {};

function overlayPattern(kind) {
  overlays[kind] ??= context.createPattern(createOverlay(makeCanvas, kind), "repeat");
  return overlays[kind];
}

// Fill a clipped polygon with a repeating overlay mapped onto a surface: `across` and `down` are the
// screen vectors one 64 px pattern repeat covers along the pattern's x and y axes.
function texturePolygon(points, kind, origin, across, down) {
  context.save();
  context.beginPath();
  points.forEach((point, index) => (index === 0 ? context.moveTo(point.x, point.y) : context.lineTo(point.x, point.y)));
  context.closePath();
  context.clip();
  context.transform(across.x / 64, across.y / 64, down.x / 64, down.y / 64, origin.x, origin.y);
  context.fillStyle = overlayPattern(kind);
  context.fillRect(-6000, -6000, 12000, 12000);
  context.restore();
}

function propProjector(viewport, elevation = 0) {
  const { cellSize, origin } = viewport;
  return (gx, gy, z = 0) => ({
    x: origin.x + (gx - gy) * (cellSize.width / 2),
    y: origin.y + (gx + gy) * (cellSize.height / 2) - elevation * cellSize.height * 0.28 - z,
  });
}

function drawTile(tile, viewport) {
  const { cellSize, origin } = viewport;
  const prop = tile.surface === FENCE_SURFACE || tile.surface === WALL_SURFACE;
  const elevation = prop ? 0 : tile.elevation;
  const elevationHeight = elevation * cellSize.height * 0.28;
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

  const { image, offsetX, offsetY } = tileSprites(tile, cellSize.width, cellSize.height);
  context.drawImage(image, topCenter.x + offsetX, topCenter.y + offsetY);

  const project = propProjector(viewport, elevation);
  if (tile.gate) {
    const gate = state.map.objects?.find((item) => item.id === tile.gate);
    const gateAlong = gate && gate.width > gate.height ? "x" : "y";
    drawGateTile(context, project, { ...tile, gateAlong }, cellSize.height, tile.door ? tile.door.open : tile.walkable, performance.now());
    return;
  }
  if (tile.surface === FENCE_SURFACE) drawFenceTile(context, project, tile, cellSize.height);
  else if (tile.surface === WALL_SURFACE) drawWallTile(context, project, tile, cellSize.height, shade(tile.color, 0));
  else drawRoad(tile, topCenter, cellSize);
}

// One building: solid walls with a base plinth, floor ledges and a few large windows per
// floor, topped by a flat roof with a raised parapet, vents and a stair house. Returns its
// screen box so hidden operatives can be marked.
function drawBuilding(building, viewport, size) {
  const style = buildingStyle(building);
  const { cellSize, origin } = viewport;
  const floors = building.elevation + 1;
  const floorHeight = cellSize.height * 0.62;
  const wallHeight = floors * floorHeight;
  const box = {
    x0: building.x - 0.5,
    y0: building.y - 0.5,
    x1: building.x + building.width - 0.5,
    y1: building.y + building.height - 0.5,
  };
  const topPoint = (gx, gy, z) => ({
    x: origin.x + (gx - gy) * (cellSize.width / 2),
    y: origin.y + (gx + gy) * (cellSize.height / 2) - z,
  });
  const bounds = {
    minX: topPoint(box.x0, box.y1, 0).x,
    maxX: topPoint(box.x1, box.y0, 0).x,
    minY: topPoint(box.x0, box.y0, wallHeight * 1.5).y - 30,
    maxY: topPoint(box.x1, box.y1, 0).y,
  };
  if (bounds.maxX < 0 || bounds.minX > size.width || bounds.maxY < 0 || bounds.minY > size.height) {
    return bounds;
  }
  const random = seededRandom(style.seed);
  const quad = (points) => {
    context.beginPath();
    points.forEach((point, index) => (index === 0 ? context.moveTo(point.x, point.y) : context.lineTo(point.x, point.y)));
    context.closePath();
  };
  // A point on a wall: u along it (0..1), z up from the ground.
  const onWall = (from, to, u, z) => ({ x: from.x + (to.x - from.x) * u, y: from.y + (to.y - from.y) * u - z });

  // The quadrilateral on a wall between u0..u1 along it and heights z0..z1.
  const strip = (wall, u0, u1, z0, z1) => [
    onWall(wall.from, wall.to, u0, z1),
    onWall(wall.from, wall.to, u1, z1),
    onWall(wall.from, wall.to, u1, z0),
    onWall(wall.from, wall.to, u0, z0),
  ];

  // A plain block: two walls and a roof face. Windows are added separately on the tall walls.
  const block = (rect, z0, z1, wallColour, roofColour) => {
    const west = topPoint(rect.x0, rect.y1, 0);
    const south = topPoint(rect.x1, rect.y1, 0);
    const east = topPoint(rect.x1, rect.y0, 0);
    const north = topPoint(rect.x0, rect.y0, 0);
    const walls = [
      { from: west, to: south, shadeBy: 14 },
      { from: south, to: east, shadeBy: -12 },
    ];
    for (const wall of walls) {
      context.fillStyle = shade(wallColour, wall.shadeBy);
      quad(strip(wall, 0, 1, z0, z1));
      context.fill();
      const length = wall === walls[0] ? rect.x1 - rect.x0 : rect.y1 - rect.y0;
      const scale = 2 / Math.max(length, 0.01);
      texturePolygon(
        strip(wall, 0, 1, z0, z1),
        "wall",
        onWall(wall.from, wall.to, 0, z1),
        { x: (wall.to.x - wall.from.x) * scale, y: (wall.to.y - wall.from.y) * scale },
        { x: 0, y: floorHeight * 2 },
      );
    }
    context.fillStyle = roofColour;
    const roofPoints = [north, east, south, west].map((point) => ({ x: point.x, y: point.y - z1 }));
    quad(roofPoints);
    context.fill();
    const roofAcross = { x: cellSize.width, y: cellSize.height };
    texturePolygon(roofPoints, "roof", roofPoints[0], roofAcross, { x: -cellSize.width, y: cellSize.height });
    return walls;
  };

  const wallColour = shade(building.color, 22);
  const walls = block(box, 0, wallHeight, wallColour, shade(building.color, 40));

  // Base plinth and a ledge at every floor line.
  for (const [index, wall] of walls.entries()) {
    const tone = index === 0 ? 0.28 : 0.4;
    context.fillStyle = `rgba(0, 0, 0, ${tone})`;
    quad(strip(wall, 0, 1, 0, floorHeight * 0.45));
    context.fill();
    context.strokeStyle = index === 0 ? "rgba(255, 255, 255, .13)" : "rgba(255, 255, 255, .07)";
    context.lineWidth = 1;
    context.beginPath();
    for (let floor = 1; floor <= floors; floor += 1) {
      const a = onWall(wall.from, wall.to, 0, floor * floorHeight);
      const b = onWall(wall.from, wall.to, 1, floor * floorHeight);
      context.moveTo(a.x, a.y);
      context.lineTo(b.x, b.y);
    }
    context.stroke();

    // Large windows: one per two tiles per floor, dark glass with a few lit rooms.
    const across = index === 0 ? box.x1 - box.x0 : box.y1 - box.y0;
    const bays = Math.max(1, Math.floor(across / 2));
    const glass = [];
    const lit = [];
    for (let floor = 1; floor < floors; floor += 1) {
      for (let bay = 0; bay < bays; bay += 1) {
        const u0 = (bay + 0.22) / bays;
        const u1 = (bay + 0.78) / bays;
        const z0 = floor * floorHeight + floorHeight * 0.18;
        const z1 = floor * floorHeight + floorHeight * 0.74;
        (random() < style.lit * 0.6 ? lit : glass).push(strip(wall, u0, u1, z0, z1));
      }
    }
    const fillAll = (list, colour) => {
      context.fillStyle = colour;
      context.beginPath();
      for (const points of list) {
        points.forEach((point, i) => (i === 0 ? context.moveTo(point.x, point.y) : context.lineTo(point.x, point.y)));
        context.closePath();
      }
      context.fill();
    };
    fillAll(glass, index === 0 ? "#1b3140" : "#142532");
    fillAll(lit, index === 0 ? "#e6c88a" : "#caa96b");
  }

  // Roof: a raised parapet around a flat, lighter roof surface.
  const parapet = cellSize.height * 0.32;
  const rim = 0.22;
  const west = topPoint(box.x0, box.y1, 0);
  const south = topPoint(box.x1, box.y1, 0);
  const east = topPoint(box.x1, box.y0, 0);
  const north = topPoint(box.x0, box.y0, 0);
  const inner = { x0: box.x0 + rim, y0: box.y0 + rim, x1: box.x1 - rim, y1: box.y1 - rim };
  const ip = {
    north: topPoint(inner.x0, inner.y0, wallHeight),
    east: topPoint(inner.x1, inner.y0, wallHeight),
    south: topPoint(inner.x1, inner.y1, wallHeight),
    west: topPoint(inner.x0, inner.y1, wallHeight),
  };
  context.fillStyle = shade(building.color, 70);
  quad([north, east, south, west].map((point) => ({ x: point.x, y: point.y - wallHeight })));
  context.fill();
  context.fillStyle = shade(building.color, 52);
  quad([ip.north, ip.east, ip.south, ip.west]);
  context.fill();
  // Inner faces of the far parapet, then the near parapet's outer faces.
  for (const [from, to, tone] of [[ip.west, ip.north, -4], [ip.north, ip.east, 6]]) {
    context.fillStyle = shade(building.color, 30 + tone);
    quad([from, to, { x: to.x, y: to.y - parapet }, { x: from.x, y: from.y - parapet }]);
    context.fill();
  }
  for (const [from, to, tone] of [[west, south, 28], [south, east, 6]]) {
    context.fillStyle = shade(building.color, 30 + tone);
    quad([
      { x: from.x, y: from.y - wallHeight - parapet },
      { x: to.x, y: to.y - wallHeight - parapet },
      { x: to.x, y: to.y - wallHeight },
      { x: from.x, y: from.y - wallHeight },
    ]);
    context.fill();
  }
  // A thin neon strip along the top of the near parapet is the only trim.
  context.strokeStyle = style.trim;
  context.globalAlpha = 0.8;
  context.lineWidth = 1.5;
  context.beginPath();
  context.moveTo(west.x, west.y - wallHeight - parapet);
  context.lineTo(south.x, south.y - wallHeight - parapet);
  context.lineTo(east.x, east.y - wallHeight - parapet);
  context.stroke();
  context.globalAlpha = 1;

  // Roof fittings sit on the roof surface: vents and a stair house, then an antenna.
  const roof = wallHeight;
  const roofRandom = seededRandom(style.seed ^ 0x9e3779b9);
  const room = { x0: inner.x0 + 0.5, y0: inner.y0 + 0.5, x1: inner.x1 - 0.5, y1: inner.y1 - 0.5 };
  const count = Math.min(10, style.units + Math.floor(((room.x1 - room.x0) * (room.y1 - room.y0)) / 30));
  for (let index = 0; index < count; index += 1) {
    const w = Math.min(0.6 + roofRandom() * 1.4, (room.x1 - room.x0) * 0.3);
    const d = Math.min(0.6 + roofRandom() * 1.4, (room.y1 - room.y0) * 0.3);
    const x0 = room.x0 + roofRandom() * Math.max(0, room.x1 - room.x0 - w);
    const y0 = room.y0 + roofRandom() * Math.max(0, room.y1 - room.y0 - d);
    const height = cellSize.height * (index === 0 ? 1.1 : 0.4 + roofRandom() * 0.4);
    block({ x0, y0, x1: x0 + w, y1: y0 + d }, roof, roof + height, shade(building.color, 36), shade(building.color, 62));
  }
  if (style.antenna) {
    const mast = topPoint((room.x0 + room.x1) / 2, (room.y0 + room.y1) / 2, roof);
    context.strokeStyle = "#9aa9b0";
    context.lineWidth = 1.5;
    context.beginPath();
    context.moveTo(mast.x, mast.y);
    context.lineTo(mast.x, mast.y - cellSize.height * 2.2);
    context.stroke();
    if (Math.floor(performance.now() / 600) % 2 === 0) {
      context.fillStyle = "#ff4d5e";
      context.beginPath();
      context.arc(mast.x, mast.y - cellSize.height * 2.2, 2.4, 0, Math.PI * 2);
      context.fill();
    }
  }
  return bounds;
}

const STRUCTURE_DRAWERS = { relay: drawRelay, console: drawConsole, server: drawServer, beacon: drawBeacon };

// Planted time bombs: a dark case with a blinking light, the seconds left, and the blast radius.
function drawBombs(viewport) {
  const { cellSize, origin } = viewport;
  for (const bomb of state.bombs) {
    const base = gridToScreen(bomb.at, cellSize, origin, 0);
    const blink = bomb.left < 2 ? Math.floor(state.elapsed * 8) % 2 === 0 : Math.floor(state.elapsed * 2) % 2 === 0;
    context.save();
    context.strokeStyle = "rgba(255, 107, 98, .45)";
    context.lineWidth = 1.5;
    context.setLineDash([6, 6]);
    context.beginPath();
    context.ellipse(base.x, base.y, bomb.radius * cellSize.width * 0.707, bomb.radius * cellSize.height * 0.707, 0, 0, Math.PI * 2);
    context.stroke();
    context.setLineDash([]);
    const w = cellSize.width * 0.22;
    const h = cellSize.height * 0.45;
    context.fillStyle = "#2a323a";
    context.fillRect(base.x - w, base.y - h, w * 2, h);
    context.fillStyle = "#4a5660";
    context.beginPath();
    context.moveTo(base.x - w, base.y - h);
    context.lineTo(base.x, base.y - h - h * 0.45);
    context.lineTo(base.x + w, base.y - h);
    context.lineTo(base.x, base.y - h + h * 0.45);
    context.closePath();
    context.fill();
    context.fillStyle = blink ? "#ff4d5e" : "#5a1c24";
    context.beginPath();
    context.arc(base.x, base.y - h * 0.55, 2.6, 0, Math.PI * 2);
    context.fill();
    context.font = `800 ${Math.max(12, cellSize.height * 0.5)}px ui-sans-serif, sans-serif`;
    context.textAlign = "center";
    context.strokeStyle = "rgba(0, 0, 0, .85)";
    context.lineWidth = 3;
    context.strokeText(String(Math.ceil(bomb.left)), base.x, base.y - h * 1.9);
    context.fillStyle = "#ffd27a";
    context.fillText(String(Math.ceil(bomb.left)), base.x, base.y - h * 1.9);
    context.restore();
  }
}

function drawStructure(structure, viewport) {
  if (structure.signal) {
    const project = propProjector(viewport, 0);
    const at = project(structure.signal.at.x, structure.signal.at.y, 0);
    if (at.x < -120 || at.x > viewport.width + 120 || at.y < -200 || at.y > viewport.height + 120) return;
    const green = signalAt(structure.signal.crossing, state.missionSeconds) === structure.signal.axis;
    drawSignal(context, project, structure.signal.at, viewport.cellSize.height, green);
    return;
  }
  if (structure.prop) {
    const project = propProjector(viewport, structure.elevation);
    const at = project(structure.x, structure.y, 0);
    if (at.x < -120 || at.x > viewport.width + 120 || at.y < -200 || at.y > viewport.height + 120) return;
    drawScenery(context, project, structure.prop, viewport.cellSize.height, performance.now());
    return;
  }
  const objective = state.objectives.find((item) => item.targetZone === structure.id);
  const complete = objective?.complete ?? false;
  const progress = objective?.holdSeconds ? (objective.progress ?? 0) / objective.holdSeconds : 0;
  const project = propProjector(viewport, structure.elevation);
  STRUCTURE_DRAWERS[structure.structure](
    context,
    project,
    structure.centre,
    viewport.cellSize.height,
    complete,
    performance.now(),
    progress,
  );
}

// Operatives behind a building keep a faint ring so they are never lost from view.
function drawHiddenOperatives(order, boxes, viewport) {
  for (const entry of order) {
    if (entry.kind !== "unit" || !entry.behind || entry.item.side !== "team" || entry.item.disabled) continue;
    const bounds = boxes.get(entry.behind);
    const point = gridToScreen(entry.item.position, viewport.cellSize, viewport.origin, 0);
    if (!bounds || point.x < bounds.minX || point.x > bounds.maxX || point.y < bounds.minY || point.y > bounds.maxY) continue;
    context.strokeStyle = "rgba(66, 214, 208, .85)";
    context.lineWidth = 2;
    context.beginPath();
    context.ellipse(point.x, point.y, viewport.cellSize.width * 0.28, viewport.cellSize.height * 0.28, 0, 0, Math.PI * 2);
    context.stroke();
  }
}

function drawZones(viewport) {
  const { cellSize, origin } = viewport;
  for (const zone of state.map.zones) {
    const objective = state.objectives.find((item) => item.targetZone === zone.id);
    const complete = objective?.complete;
    const first = state.grid[zone.position.y]?.[zone.position.x];
    const lift = (first?.elevation ?? 0) * cellSize.height * 0.28;
    const corner = (gx, gy) => ({
      x: origin.x + (gx - gy) * (cellSize.width / 2),
      y: origin.y + (gx + gy) * (cellSize.height / 2) - lift,
    });
    const x0 = zone.position.x - 0.5;
    const y0 = zone.position.y - 0.5;
    const x1 = x0 + zone.width;
    const y1 = y0 + zone.height;
    const points = [corner(x0, y0), corner(x1, y0), corner(x1, y1), corner(x0, y1)];
    const colour = complete ? "121, 213, 155" : zone.kind === "interaction" || zone.kind === "hold" ? "225, 179, 90" : "66, 214, 208";
    const holdFraction = objective?.holdSeconds ? (objective.progress ?? 0) / objective.holdSeconds : 0;
    context.beginPath();
    points.forEach((point, index) => (index === 0 ? context.moveTo(point.x, point.y) : context.lineTo(point.x, point.y)));
    context.closePath();
    context.fillStyle = `rgba(${colour}, ${zone.kind === "interaction" ? 0.06 : 0.1})`;
    context.fill();
    if (holdFraction > 0 && !complete) {
      context.fillStyle = `rgba(121, 213, 155, ${0.08 + 0.3 * holdFraction})`;
      context.fill();
    }
    context.strokeStyle = `rgba(${colour}, .9)`;
    context.lineWidth = 2;
    context.setLineDash(zone.kind === "interaction" ? [] : [10, 6]);
    context.stroke();
    context.setLineDash([]);
    if (zone.kind === "exit") {
      // Three chevrons pointing along the way out.
      const centre = corner(zone.position.x + (zone.width - 1) / 2, zone.position.y + (zone.height - 1) / 2);
      context.strokeStyle = `rgba(${colour}, .85)`;
      context.lineWidth = 2;
      for (const offset of [-0.55, 0, 0.55]) {
        const y = centre.y + offset * cellSize.height * 0.6;
        context.beginPath();
        context.moveTo(centre.x - cellSize.width * 0.12, y - cellSize.height * 0.1);
        context.lineTo(centre.x, y + cellSize.height * 0.08);
        context.lineTo(centre.x + cellSize.width * 0.12, y - cellSize.height * 0.1);
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
  const looks = unit.definition.appearance.sprites;
  if (looks) {
    // Civilians and police: each kind hands its looks out in turn, so a crowd is not clones.
    const index = state.units.filter((item) => item.definition === unit.definition).indexOf(unit);
    key = looks[index % looks.length];
    // Enemy agents, guards and criminals always show a weapon; police only once they have spotted a drawn one;
    // a persuaded follower while its owner has a weapon out and it has one.
    const owner = unit.persuaded ? state.units.find((item) => item.id === unit.persuadedBy) : null;
    const carrying = unit.equipment.some((item) => item.definition.action === "disable-pulse" && item.charges !== 0);
    const armed =
      !unit.disabled &&
      (unit.side === "opposition" ||
        unit.side === "criminal" ||
        (unit.side === "police" && Boolean(unit.alertedBy)) ||
        (unit.persuaded && carrying && Boolean(owner) && Boolean(heldWeapon(owner, state.elapsed))));
    if (armed && sheets[`${key}-pulse`]) return sheets[`${key}-pulse`];
    return sheets[key] ?? null;
  }
  if (unit.side !== "team") {
    const index = state.units.filter((item) => item.side === "opposition").indexOf(unit);
    key = WATCHER_SKINS[index % WATCHER_SKINS.length];
  } else {
    const index = state.units.filter((item) => item.side === "team").indexOf(unit);
    key = SPRITE_SKINS[index % SPRITE_SKINS.length];
  }
  const held = heldWeapon(unit, state.elapsed);
  if (held) {
    // New weapons borrow the art of the pistol or rifle grip they are held with.
    const grip = { rifle: "heavy-pulse", pistol: "pulse" }[held.definition.carry] ?? held.definition.icon;
    return sheets[`${key}-${grip}`] || sheets[key] || null;
  }
  if (unit.side === "opposition") {
    // Enemy agents always show their weapon: the one they carry, or a pistol if they carry none.
    const carried = unit.equipment.find((item) => item.definition.action === "disable-pulse");
    return sheets[`${key}-${carried?.definition.icon ?? "pulse"}`] || sheets[key] || null;
  }
  return sheets[key] || null;
}

// Eight facings, 0 toward the camera, increasing clockwise as seen on screen.
function isPatrolling(unit) {
  return Boolean(unit.patrol && unit.patrol.route.length > 0 && !unit.targetId && !unit.disabled);
}

function updateFacing(unit, viewport) {
  // Just after firing by hand, face the way the shot went.
  const aiming = unit.aimAt && unit.firedAt !== undefined && state.elapsed - unit.firedAt < 0.7;
  let toward = aiming ? unit.aimAt : (unit.path[0] ?? null);
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
  if (unit.escaped) return;
  if (unit.inVehicle) return;
  if (isVehicle(unit)) {
    const controlled = Boolean(unit.vehicle.controlledBy) && state.selectedIds.includes(unit.vehicle.controlledBy);
    drawVehicle(context, propProjector(viewport, 0), unit, viewport.cellSize.height, performance.now(), { controlled });
    return;
  }
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
  const thrown = knockbackOffset(state.elapsed, unit.hitAt, unit.hitDirection, size * 0.9, reduceMotion);
  context.translate(center.x + kick.x + thrown.x, center.y - size * 0.8 + bob + kick.y + thrown.y);
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

  if (unit.number) {
    // The operative's number in gold above their head (dimmer once they are down).
    context.font = `800 ${Math.max(14, size * 1.5)}px ui-sans-serif, sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "alphabetic";
    context.lineWidth = 4;
    context.strokeStyle = "rgba(0, 0, 0, .9)";
    context.strokeText(String(unit.number), 0, -size * 5.6);
    context.fillStyle = unit.disabled ? "rgba(225, 179, 90, .45)" : "#f2c14e";
    context.fillText(String(unit.number), 0, -size * 5.6);
  }
  if ((unit.shieldLeft ?? 0) > 0 && !unit.disabled) {
    // A raised shield: a shimmering bubble that flickers as it is about to fail.
    const fading = unit.shieldLeft < 2;
    let shimmer = 0.7;
    if (!reduceMotion) shimmer = fading ? (Math.floor(state.elapsed * 10) % 2 ? 0.9 : 0.25) : 0.65 + 0.2 * Math.sin(state.elapsed * 6);
    context.fillStyle = `rgba(66, 214, 208, ${0.13 * shimmer})`;
    context.strokeStyle = `rgba(120, 245, 240, ${shimmer})`;
    context.lineWidth = 2;
    context.beginPath();
    context.ellipse(0, -size * 0.2, size * 1.7, size * 2.6, 0, 0, Math.PI * 2);
    context.fill();
    context.stroke();
  }
  if (unit.persuaded && !unit.disabled) {
    // A persuaded follower: a green ring at its feet and a small link diamond above its head.
    context.strokeStyle = "rgba(121, 213, 155, .9)";
    context.lineWidth = 2;
    context.beginPath();
    context.ellipse(0, size * 1.05, size * 1.1, size * 0.45, 0, 0, Math.PI * 2);
    context.stroke();
    context.fillStyle = "#79d59b";
    context.beginPath();
    context.moveTo(0, -size * 2.9);
    context.lineTo(size * 0.4, -size * 2.5);
    context.lineTo(0, -size * 2.1);
    context.lineTo(-size * 0.4, -size * 2.5);
    context.closePath();
    context.fill();
  }
  if (unit.persuading && !unit.disabled) {
    // The Persuader is on: slow magenta waves roll out from the agent.
    for (const phase of [0, 0.5]) {
      const wave = reduceMotion ? 0.5 : (state.elapsed * 0.8 + phase) % 1;
      context.strokeStyle = `rgba(232, 107, 214, ${0.7 * (1 - wave)})`;
      context.lineWidth = 2;
      context.beginPath();
      context.ellipse(0, size * 1.05, size * (1 + wave * 2.6), size * (0.4 + wave * 1.1), 0, 0, Math.PI * 2);
      context.stroke();
    }
  }
  if (["opposition", "police", "criminal"].includes(unit.side) && unit.alertedBy && !unit.disabled && !unit.persuaded) {
    // An alert marker over a watcher that has noticed the squad and is giving chase.
    const pulse = reduceMotion ? 1 : 0.8 + 0.2 * Math.sin(state.elapsed * 8);
    context.fillStyle = `rgba(255, 107, 98, ${pulse})`;
    context.font = `800 ${Math.max(20, size * 2.2)}px ui-sans-serif, sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "alphabetic";
    context.strokeStyle = "rgba(0, 0, 0, 0.8)";
    context.lineWidth = 3;
    context.strokeText("!", 0, -size * 2.7);
    context.fillText("!", 0, -size * 2.7);
  }
  if (!unit.disabled && unit.side !== "team" && state.scanned?.has(unit.id)) {
    // Seen by a scanner: a ring around the feet that shows through whatever stands in front.
    context.strokeStyle = "rgba(120, 245, 240, 0.9)";
    context.lineWidth = 2;
    context.beginPath();
    context.ellipse(0, size * 1.05, size * 1.2, size * 0.5, 0, 0, Math.PI * 2);
    context.stroke();
  }
  if (!unit.disabled && isOpenTarget(state.objectives, unit.id)) {
    // A named target of an open objective: a pulsing diamond and label above the head.
    const pulse = reduceMotion ? 1 : 0.75 + 0.25 * Math.sin(state.elapsed * 5);
    const top = -size * (unit.alertedBy ? 4.6 : 3.2);
    context.fillStyle = `rgba(232, 107, 214, ${pulse})`;
    context.beginPath();
    context.moveTo(0, top + size * 0.9);
    context.lineTo(size * 0.55, top + size * 0.35);
    context.lineTo(0, top - size * 0.2);
    context.lineTo(-size * 0.55, top + size * 0.35);
    context.closePath();
    context.fill();
    context.font = `700 ${Math.max(9, size * 0.7)}px ui-sans-serif, sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "alphabetic";
    context.strokeStyle = "rgba(0, 0, 0, 0.85)";
    context.lineWidth = 3;
    context.strokeText("TARGET", 0, top - size * 0.4);
    context.fillStyle = "#f6c6ef";
    context.fillText("TARGET", 0, top - size * 0.4);
  }
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

// The route a selected operator has been told to take: a faint line through its waypoints, numbered when there are
// several (Shift+click adds one after the last).
function drawQueuedRoutes(viewport) {
  for (const unit of selectedOperators()) {
    if (unit.path.length === 0 || unit.disabled) continue;
    const points = [unit.position, ...unit.path].map((tile) => gridToScreen(tile, viewport.cellSize, viewport.origin));
    context.strokeStyle = "rgba(66, 214, 208, 0.55)";
    context.lineWidth = 2;
    context.setLineDash([6, 5]);
    context.beginPath();
    points.forEach((point, index) => (index === 0 ? context.moveTo(point.x, point.y) : context.lineTo(point.x, point.y)));
    context.stroke();
    context.setLineDash([]);
    const marks = unit.waypoints ?? [];
    if (marks.length < 2) continue;
    context.font = "700 12px ui-sans-serif, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    marks.forEach((mark, index) => {
      const at = gridToScreen(mark, viewport.cellSize, viewport.origin);
      context.fillStyle = "rgba(10, 14, 18, 0.85)";
      context.beginPath();
      context.arc(at.x, at.y, 9, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = "#42d6d0";
      context.fillText(String(index + 1), at.x, at.y + 1);
    });
  }
}

function draw() {
  if (!state.map) return;
  const size = resizeCanvas();
  const viewport = viewportFor(size);
  state.viewport = viewport;
  state.scanned = new Set(scannedUnits(state.units).map((unit) => unit.id));
  context.clearRect(0, 0, size.width, size.height);

  forEachVisibleTile(state.grid, visibleBounds(viewport, state.map), (tile) => {
    if (tile.surface !== BUILDING_SURFACE || tile.gate) drawTile(tile, viewport);
  });
  drawZones(viewport);
  drawQueuedRoutes(viewport);
  drawCursor(viewport);

  drawPickups(viewport);
  drawBombs(viewport);
  const boxes = new Map();
  const order = drawOrder([...(state.buildings ?? []), ...(state.structures ?? [])], state.units);
  for (const entry of order) {
    if (entry.kind !== "building") drawUnit(entry.item, viewport);
    else if (entry.item.structure) drawStructure(entry.item, viewport);
    else boxes.set(entry.item, drawBuilding(entry.item, viewport, size));
  }
  drawHiddenOperatives(order, boxes, viewport);
  drawEffects(viewport);
  drawMinimap(viewport);
}

const minimap = document.querySelector("#minimap");
const miniContext = minimap.getContext("2d");
// How far from the squad the minimap still shows other people.
const MINI_SIGHT = 16;
const MINI_UNIT_COLOURS = {
  team: "#42d6d0",
  opposition: "#ff6b62",
  police: "#4aa3ff",
  civilian: "#8d9aa3",
  criminal: "#ff9a4a",
  vehicle: "#b0bcc6",
};
const MINI_COLORS = {
  "runoff-channel": "#1f5568",
  "signal-grate": "#7a96a0",
  "utility-building": "#12171b",
  "service-fence": "#6b7a84",
  "service-wall": "#6b7a84",
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
    const gateTile = state.grid[gate.position.y][gate.position.x];
    const open = gateTile.door ? gateTile.door.open : gateTile.walkable;
    const point = miniProject(gate.position, state.map);
    miniContext.fillStyle = open ? "#79d59b" : "#ff6b62";
    miniContext.fillRect(Math.round(point.x - 2), Math.floor(point.y) - 1, 4, 3);
  }
  for (const zone of state.map.zones) {
    const objective = state.objectives.find((item) => item.targetZone === zone.id);
    if (zone.kind === "interaction" || zone.kind === "hold" || zone.kind === "exit") {
      const point = miniProject(zone.position, state.map);
      miniContext.strokeStyle = objective?.complete ? "#79d59b" : "#e1b35a";
      miniContext.strokeRect(Math.round(point.x - 3), Math.floor(point.y) - 2, 6, 4);
    }
  }
  // The map shows the squad and its followers, and anyone within sight of them or picked up by a scanner.
  const friends = state.units.filter((unit) => (unit.side === "team" || unit.persuaded) && !unit.disabled);
  const scanned = new Set(scannedUnits(state.units).map((unit) => unit.id));
  const survey = intelLevel(state.campaign, state.mission.id);
  for (const unit of state.units) {
    if (unit.disabled || unit.inVehicle) continue;
    const known =
      unit.side === "team" ||
      unit.persuaded ||
      scanned.has(unit.id) ||
      (survey >= 1 && unit.side === "opposition") ||
      (survey >= 2 && unit.side !== "team") ||
      friends.some((friend) => Math.hypot(friend.position.x - unit.position.x, friend.position.y - unit.position.y) <= MINI_SIGHT);
    if (!known) continue;
    const point = miniProject(unit.position, state.map);
    if (scanned.has(unit.id)) {
      miniContext.strokeStyle = "#78f5f0";
      miniContext.strokeRect(Math.round(point.x) - 3, Math.round(point.y) - 3, 6, 6);
    }
    miniContext.fillStyle = unit.persuaded ? "#79d59b" : (MINI_UNIT_COLOURS[unit.side] ?? "#ff6b62");
    const size = isVehicle(unit) ? 5 : 3;
    miniContext.fillRect(Math.round(point.x) - Math.floor(size / 2), Math.round(point.y) - Math.floor(size / 2), size, size);
  }
  // A beacon where the current objective is: slow rings spread out over the whole minimap, so it is easy to find from anywhere.
  const goal = currentObjective(state.objectives);
  if (goal) {
    const reach = Math.hypot(minimap.width, minimap.height);
    for (const place of objectiveFocus(goal, state.map.zones, state.units)) {
      const point = miniProject(place, state.map);
      miniContext.lineWidth = 1.5;
      for (let ring = 0; ring < 2; ring += 1) {
        const phase = reduceMotion ? (ring + 0.5) / 2 : (state.elapsed * 0.12 + ring / 2) % 1;
        miniContext.strokeStyle = `rgba(232, 107, 214, ${(1 - phase) * 0.7})`;
        miniContext.beginPath();
        miniContext.arc(point.x, point.y, 4 + phase * reach, 0, Math.PI * 2);
        miniContext.stroke();
      }
      miniContext.fillStyle = "#e86bd6";
      miniContext.beginPath();
      miniContext.arc(point.x, point.y, 2.5, 0, Math.PI * 2);
      miniContext.fill();
    }
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

// Item icons for the map: the same drawings as the item squares, as images the canvas can draw.
const pickupIcons = new Map();
function pickupIcon(name) {
  if (!pickupIcons.has(name)) {
    const image = new Image();
    const markup = iconMarkup(name, 64).replaceAll("currentColor", "#e1b35a");
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
    pickupIcons.set(name, image);
  }
  return pickupIcons.get(name);
}

// Gear lying on the ground: each item shows its own icon with a pulsing ring.
function drawPickups(viewport) {
  const { cellSize, origin } = viewport;
  for (const body of state.drops) {
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
    // The item itself: its own icon on a dark plate, in the same amber as the squad's item squares.
    const icon = pickupIcon(body.equipment[0].definition.icon);
    const side = Math.max(14, cellSize.width * 0.3);
    context.fillStyle = "rgba(8, 14, 18, 0.82)";
    context.beginPath();
    context.ellipse(0, -side * 0.35, side * 0.62, side * 0.62, 0, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    if (icon.complete && icon.naturalWidth > 0) context.drawImage(icon, -side / 2, -side * 0.85, side, side);
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

function drawEffects(viewport) {
  const size = Math.max(9, viewport.cellSize.height * 0.34);
  for (const effect of state.effects) {
    const progress = effectProgress(effect);
    const fade = 1 - progress;
    // Reduced motion keeps the cue visible but removes travel and growth.
    const grow = reduceMotion ? 1 : progress;
    context.save();
    context.lineWidth = 2;
    if (effect.type === "blast") {
      const ground = gridToScreen(effect.at, viewport.cellSize, viewport.origin, 0);
      const rx = effect.radius * viewport.cellSize.width * 0.707;
      const ry = effect.radius * viewport.cellSize.height * 0.707;
      const spread = reduceMotion ? 1 : Math.min(1, progress * 3);
      const fire = context.createRadialGradient(ground.x, ground.y - ry * 0.3, 0, ground.x, ground.y - ry * 0.3, rx * spread);
      fire.addColorStop(0, `rgba(255, 245, 200, ${fade})`);
      fire.addColorStop(0.45, `rgba(255, 150, 60, ${0.8 * fade})`);
      fire.addColorStop(1, "rgba(255, 60, 40, 0)");
      context.fillStyle = fire;
      context.beginPath();
      context.ellipse(ground.x, ground.y - ry * 0.3, rx * spread, ry * spread * 1.1, 0, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = `rgba(255, 220, 170, ${fade})`;
      context.lineWidth = 3;
      context.beginPath();
      context.ellipse(ground.x, ground.y, rx * Math.min(1.1, progress * 1.6), ry * Math.min(1.1, progress * 1.6), 0, 0, Math.PI * 2);
      context.stroke();
    } else if (effect.type === "persuade") {
      const unit = state.units.find((item) => item.id === effect.unitId);
      if (unit) {
        const at = unitScreenPoint(unit, viewport);
        context.strokeStyle = `rgba(232, 107, 214, ${fade})`;
        context.lineWidth = 2;
        for (const ring of [0, 0.35]) {
          const spread = Math.max(0, grow - ring);
          context.beginPath();
          context.ellipse(at.x, at.y + size * 0.2, size * (0.5 + spread * 2.2), size * (0.25 + spread * 1.0), 0, 0, Math.PI * 2);
          context.stroke();
        }
        context.fillStyle = `rgba(121, 213, 155, ${fade})`;
        context.beginPath();
        context.arc(at.x, at.y - size * (1.6 + grow * 1.6), size * 0.3, 0, Math.PI * 2);
        context.fill();
      }
    } else if (effect.type === "impact" || effect.type === "puff") {
      const unit = effect.unitId ? state.units.find((item) => item.id === effect.unitId) : null;
      let at = unit ? unitScreenPoint(unit, viewport) : null;
      if (at) at = { x: at.x, y: at.y - size * 2.0 };
      if (!at) {
        const ground = gridToScreen(effect.to, viewport.cellSize, viewport.origin);
        at = { x: ground.x, y: ground.y - size * 0.4 };
      }
      const hit = effect.type === "impact";
      const reach = size * (0.7 + grow * (hit ? 2.0 : 1.0));
      // A bright flash that dies at once, then sparks flying out.
      context.fillStyle = `rgba(255, 246, 220, ${Math.max(0, 0.9 - progress * 3)})`;
      context.beginPath();
      context.arc(at.x, at.y, size * (0.35 + 0.3 * fade), 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = hit ? `rgba(255, 190, 110, ${fade})` : `rgba(170, 200, 210, ${0.8 * fade})`;
      context.lineWidth = 2;
      context.beginPath();
      const rays = hit ? 9 : 6;
      for (let ray = 0; ray < rays; ray += 1) {
        const angle = (ray / rays) * Math.PI * 2 + (effect.spin ?? 0);
        const near = reach * 0.45;
        context.moveTo(at.x + Math.cos(angle) * near, at.y + Math.sin(angle) * near * 0.7);
        context.lineTo(at.x + Math.cos(angle) * reach, at.y + Math.sin(angle) * reach * 0.7);
      }
      context.stroke();
      if (hit) {
        context.strokeStyle = `rgba(255, 107, 98, ${0.8 * fade})`;
        context.beginPath();
        context.arc(at.x, at.y, size * (0.5 + grow * 1.1), 0, Math.PI * 2);
        context.stroke();
      }
    } else if (effect.type === "flame") {
      const unit = state.units.find((item) => item.id === effect.unitId);
      if (unit) {
        const at = unitScreenPoint(unit, viewport);
        for (let tongue = 0; tongue < 3; tongue += 1) {
          const lift = size * (0.4 + progress * 1.4 + tongue * 0.25);
          context.fillStyle = `rgba(${255 - tongue * 20}, ${150 + tongue * 40}, 60, ${0.85 * fade})`;
          context.beginPath();
          context.arc(at.x + (tongue - 1) * size * 0.35, at.y - lift, size * (0.3 - progress * 0.12), 0, Math.PI * 2);
          context.fill();
        }
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

// Throw a unit that was just hit back, away from whoever hit it (drawn only; the unit stays put).
function knockBack(victim, shooter) {
  const dx = victim.position.x - shooter.position.x;
  const dy = victim.position.y - shooter.position.y;
  const x = dx - dy;
  const y = dx + dy;
  const length = Math.hypot(x, y) || 1;
  victim.hitAt = state.elapsed;
  victim.hitDirection = { x: x / length, y: y / length };
}

// Keep the record of who has been put out of action, and charge for bystanders.
function countDisabled(down) {
  if (down.side === "vehicle") return;
  if (down.side === "opposition") state.opStats.enemiesDisabled += 1;
  else if (down.side === "civilian") harmBystander(down, CIVILIAN_PENALTY, "civiliansHarmed");
  else if (down.side === "police") harmBystander(down, POLICE_PENALTY, "policeHarmed");
  else state.opStats.operatorsDisabled += 1;
}

// A civilian or police officer has been killed: it costs funds and goes on the record.
function harmBystander(unit, cost, counter) {
  state.opStats[counter] += 1;
  state.campaign = penalise(state.campaign, cost);
  updateFundsReadout();
  persistCampaign();
}

// Scenery that caught fire or broke: a puff of debris and a line in the status.
const PROP_NAMES = { tree: "A tree", streetlight: "A street light", bin: "A bin", billboard: "A billboard" };
function announceProp(event) {
  const prop = state.props.find((item) => item.id === event.propId);
  if (!prop) return;
  addEffect(state.effects, "puff", { to: prop.position, spin: Math.random() * 3 });
  if (event.state === "burning") setStatus(`${PROP_NAMES[prop.kind]} catches fire.`);
  else audio.play("hit");
}

// Effects, counters and messages for shots, from automatic combat and from shots fired by hand.
function handleCombatEvents(combatEvents) {
  for (const event of combatEvents) {
    if (event.type === "damage" || event.type === "shot") {
      const shooter = state.units.find((item) => item.id === event.attackerId);
      addEffect(state.effects, "muzzle", { unitId: event.attackerId });
      if (shooter?.side === "team") {
        recordShot(state.debrief, shooter.id, event.type === "damage");
        const victim = event.type === "damage" ? state.units.find((item) => item.id === event.targetId) : null;
        if (victim && event.remaining === 0 && victim.side !== "team") recordKill(state.debrief, shooter.id, victim.definition.role);
      }
      // A bomb on the ground goes off when a shot passes it.
      if (shooter && state.bombs.length > 0) {
        const struck = event.type === "damage" ? state.units.find((item) => item.id === event.targetId) : null;
        const to = struck?.position ?? event.end;
        if (to && shootBombs(state.bombs, shooter.position, to) > 0) setStatus("A shot hit a charge on the ground: it is about to go off.");
      }
      // Each weapon sounds like itself; fire further from the view is quieter.
      if (shooter) {
        const away = Math.hypot(shooter.position.x - state.camera.x, shooter.position.y - state.camera.y);
        audio.play(shotCue(event.sound), { volume: shotVolume(away, shooter.side === "team") });
      }
      if (event.type === "damage" && event.blocked) {
        // The shield took it: sparks off the field, no knockback.
        const victim = state.units.find((item) => item.id === event.targetId);
        audio.play("shield-hit");
        addEffect(state.effects, "puff", { to: victim.position, spin: Math.random() * 3 });
      } else if (event.type === "damage") {
        const victim = state.units.find((item) => item.id === event.targetId);
        audio.play("hit");
        addEffect(state.effects, "impact", { unitId: event.targetId, spin: Math.random() * 3 });
        if (shooter && victim) knockBack(victim, shooter);
      } else {
        addEffect(state.effects, "puff", { to: event.end, spin: Math.random() * 3 });
      }
      if (shooter) shooter.firedAt = state.elapsed;
      if (event.outOfRounds && shooter?.side === "team") {
        setStatus(`${shooter.definition.name}: ${event.weapon} is out of rounds.`);
        audio.play("alert");
      }
    } else if (event.type === "prop") {
      announceProp(event);
    } else if (event.type === "burn") {
      addEffect(state.effects, "flame", { unitId: event.targetId });
    } else if (event.type === "disabled") {
      countDisabled(state.units.find((item) => item.id === event.unitId));
    } else if (event.type === "ejected") {
      const out = state.units.find((item) => item.id === event.unitId);
      const car = state.units.find((item) => item.id === event.vehicleId);
      setStatus(`${out.definition.name} is thrown out of the ${car.definition.name}.`);
    }
  }
  const latest = combatEvents.at(-1);
  if (latest.type === "burn") return;
  if (latest.type === "disabled") {
    audio.play("disabled");
    const unit = state.units.find((item) => item.id === latest.unitId);
    if (unit.side === "civilian" || unit.side === "police") {
      const cost = unit.side === "police" ? POLICE_PENALTY : CIVILIAN_PENALTY;
      setStatus(`${unit.definition.name} killed. The city notices: -${cost} funds.`);
    } else {
      setStatus(
        unit.side === "opposition"
          ? `${unit.definition.name} disabled. Route is clearer.`
          : `${unit.definition.name} disabled. Select another operator.`,
      );
    }
    pruneSelection();
  } else if (latest.type === "damage") {
    const target = state.units.find((item) => item.id === latest.targetId);
    setStatus(`${target.definition.name} integrity: ${latest.remaining}.`);
  }
}

// The intense score plays only while an enemy agent (a watcher) has seen the squad, and for a few
// seconds after the last one loses it. Guards and police on alert do not bring it in.
const ALERT_MUSIC_HOLD_SECONDS = 6;
function updateAlertMusic(deltaSeconds) {
  const seen = state.units.some(
    (unit) => unit.definition.role === "enemy-agent" && unit.alertedBy && !unit.disabled && !unit.persuaded,
  );
  state.alertHold = seen ? ALERT_MUSIC_HOLD_SECONDS : Math.max(0, (state.alertHold ?? 0) - deltaSeconds);
  const intense = state.outcome === "active" && state.alertHold > 0;
  if (intense !== state.alertMusic) {
    state.alertMusic = intense;
    music.setAlert(intense);
  }
}

function simulationStep(deltaSeconds) {
  state.missionSeconds += deltaSeconds;
  let interfaceChanged = false;
  if (state.holdFire && state.viewport && state.outcome === "active") {
    fireByHand(screenToGridExact(state.holdFire, state.viewport.cellSize, state.viewport.origin), true);
  }
  for (const event of advancePursuit(state.units, state.grid)) {
    if (event.reason === "none-selected") {
      const unit = state.units.find((item) => item.id === event.unitId);
      setStatus(`${unit.definition.name} has no weapon selected and stops the pursuit.`);
      interfaceChanged = true;
    } else if (event.reason === "no-rounds") {
      const unit = state.units.find((item) => item.id === event.unitId);
      setStatus(`${unit.definition.name} is out of rounds and stops the pursuit.`);
      audio.play("alert");
      interfaceChanged = true;
    }
  }
  const arrivals = advanceUnits(state.units, deltaSeconds);
  advanceRegeneration(state.units, deltaSeconds);
  collectFallenGear();
  for (const unit of state.units) {
    if (!unit.lootTargetId || unit.path.length > 0) continue;
    const body = state.drops.find((item) => item.id === unit.lootTargetId);
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
  for (const event of advancePatrols(state.units, deltaSeconds, state.grid, state.elapsed, state.drops)) {
    const watcher = state.units.find((unit) => unit.id === event.unitId);
    if (event.type === "pickup") {
      setStatus(`${watcher.definition.name} takes ${event.items.join(" and ")} from the fallen.`);
      audio.play("select");
      interfaceChanged = true;
      continue;
    }
    if (event.type === "say") {
      setStatus(`${watcher.definition.name}: “${event.text}”`);
      audio.play("select");
      interfaceChanged = true;
      continue;
    }
    if (event.type === "warning") {
      setStatus(`${watcher.definition.name}: "Put down your weapon!" Holster it, or they open fire in two seconds.`);
      audio.play("police-warning");
      interfaceChanged = true;
      continue;
    }
    const spotted = state.units.find((unit) => unit.id === event.targetId);
    setStatus(`${watcher.definition.name} spotted ${spotted.definition.name}! It is closing in.`);
    audio.play("alert");
    state.opStats.spotted += 1;
    interfaceChanged = true;
  }
  updateAlertMusic(deltaSeconds);
  advanceShields(state.units, deltaSeconds);
  advanceScanners(state.units, deltaSeconds);
  advanceDrugs(state.units, deltaSeconds);
  for (const bomb of state.bombs) {
    const second = Math.ceil(bomb.left);
    if (bomb.tickedAt !== second) {
      bomb.tickedAt = second;
      audio.play("tick");
    }
  }
  const vehicleEvents = advanceVehicles(state.units, deltaSeconds, state.roadGrid, state.grid, state.missionSeconds);
  for (const hit of vehicleEvents.filter((event) => event.type === "runover")) {
    const victim = state.units.find((unit) => unit.id === hit.unitId);
    const car = state.units.find((unit) => unit.id === hit.vehicleId);
    addEffect(state.effects, "impact", { unitId: hit.unitId, spin: Math.random() * 3 });
    audio.play("hit");
    knockBack(victim, car);
    if (hit.disabled) {
      // The city does not bill the squad for a stranger's bad driving: only the squad's own car counts against it.
      const bystander = victim.side === "civilian" || victim.side === "police";
      if (!bystander || car.vehicle.controlledBy) countDisabled(victim);
      pruneSelection();
      interfaceChanged = true;
    }
  }
  const blasts = [
    ...vehicleEvents.filter((event) => event.type === "blast"),
    ...advanceBombs(state.bombs, state.units, deltaSeconds, state.grid),
  ];
  for (const blast of blasts) {
    for (const prop of propsNear(state.props, blast.at, blast.radius)) {
      const change = damageProp(prop, 40, "explosion");
      if (change) announceProp(change);
    }
    addEffect(state.effects, "blast", { at: blast.at, radius: blast.radius });
    audio.play("blast");
    startPanic(state.units, blast.at, state.grid);
    for (const hit of blast.hits) {
      const victim = state.units.find((unit) => unit.id === hit.unitId);
      addEffect(state.effects, "impact", { unitId: hit.unitId, spin: Math.random() * 3 });
      knockBack(victim, { position: blast.at });
      if (hit.disabled) countDisabled(victim);
    }
    const harmed = blast.hits.filter((hit) => hit.disabled).length;
    const source = blast.source ? state.units.find((unit) => unit.id === blast.source) : null;
    setStatus(
      `${source ? `The ${source.definition.name} explodes` : "The Delay Charge goes off"}: ` +
        `${blast.hits.length} caught in the blast` +
        (harmed > 0 ? `, ${harmed} down.` : "."),
    );
    pruneSelection();
    interfaceChanged = true;
  }
  for (const event of advancePersuasion(state.units, deltaSeconds, state.grid)) {
    const agent = state.units.find((unit) => unit.id === event.agentId);
    const target = state.units.find((unit) => unit.id === event.targetId);
    if (event.type === "persuaded") {
      addEffect(state.effects, "persuade", { unitId: event.targetId });
      audio.play("persuade");
      const kinds = { civilian: "civilians", criminal: "criminals", guard: "guards", police: "police", opposition: "enemy agents" };
      const counted = event.kind === "criminal" ? "civilians" : kinds[event.kind];
      setStatus(
        `${target.definition.name} now follows ${agent.definition.name} ` +
          `(${event.count} ${counted} persuaded, ${persuadePoints(agent)} points).` +
          (event.outOfCharges ? " The Persuader is spent." : ""),
      );
    } else if (event.type === "refused") {
      setStatus(`${agent.definition.name} cannot persuade ${target.definition.name} yet: ${event.needs} needed.`);
    } else if (event.type === "reassigned") {
      setStatus(`${state.units.find((unit) => unit.id === event.unitId).definition.name} now follows ${agent.definition.name}.`);
    }
    interfaceChanged = true;
  }
  const fires = advanceProps(state.props, state.units, deltaSeconds);
  for (const change of fires.events) announceProp(change);
  for (const id of fires.ignited) {
    const unit = state.units.find((item) => item.id === id);
    if (unit) setStatus(`${unit.definition.name} catches fire from the flames nearby.`);
  }
  const combatEvents = advanceCombat(state.units, deltaSeconds, state.grid, state.elapsed);
  if (combatEvents.length > 0) {
    interfaceChanged = true;
    handleCombatEvents(combatEvents);
  }
  for (const event of [
    ...resolveDisabled(state.objectives, state.units),
    ...resolveUnitObjectives(state.objectives, state.map.zones, state.units),
    ...advanceHold(state.objectives, state.map.zones, state.units, deltaSeconds),
    ...resolveExtraction(state.objectives, state.map.zones, state.units),
  ]) {
    state.opStats.objectivesCompleted += 1;
    syncGates();
    audio.play("objective");
    setStatus(`${event.objective.description} Commitment fulfilled.`);
    interfaceChanged = true;
  }
  if (interfaceChanged) renderInterface();
}

function formatDuration(seconds) {
  const whole = Math.round(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

// "120 → 168 (+48)" for the debrief: what the operation did to the funds (tax, awards, fines and the resupply bill).
function fundsChange(before, after) {
  const change = Math.round((after - before) * 100) / 100;
  return `${Math.floor(before)} → ${Math.floor(after)} (${change >= 0 ? "+" : "−"}${Math.abs(change)})`;
}

function showOutcome(outcome) {
  const won = outcome === "success";
  audio.play(won ? "victory" : "failed");
  if (won) music.duck(11); // the drums and fanfare play over a quiet score
  document.querySelector("#outcome-eyebrow").textContent = won ? "OPERATION COMPLETE" : "OPERATION LOST";
  const debrief = state.mission.debrief;
  const reason = won ? null : failureReason(state.objectives, state.units);
  // Winning the last of the 50 main missions ends the campaign (once).
  const ending = won ? campaignEnding(state.campaign, state.progress.completed, state.missionList.map((entry) => entry.id)) : null;
  const finale = Boolean(ending?.won && !ending.shown);
  if (finale) {
    state.campaign = markEnded(state.campaign);
    persistCampaign();
    document.querySelector("#outcome-eyebrow").textContent = "CAMPAIGN COMPLETE";
  }
  document.querySelector("#outcome-heading").textContent = finale
    ? "The whole world is yours"
    : won
    ? state.mission.title ?? "Operation complete"
    : reason
      ? "The operation is lost"
      : "The team has gone dark";
  const earned = state.earnedThisRun;
  document.querySelector("#outcome-awards").textContent = earned.length
    ? `Achievements: ${earned.map((item) => `${item.name} +${item.reward}`).join(", ")}.`
    : "";
  document.querySelector("#outcome-text").textContent = finale
    ? `${debrief?.success ?? ""} That was the last of the ${state.missionList.length} territories: ` +
      "no syndicate holds a district any more."
    : won
    ? debrief?.success ?? "The operation is complete."
    : reason ?? debrief?.failure ?? "Every operator has been disabled. Regroup and try a different approach.";
  const hasNext = won && nextOperation() !== -1;
  document.querySelector("#next-button").hidden = !hasNext;
  const teamDown = state.units.filter((unit) => unit.side === "team" && unit.disabled).length;
  const watchersDown = state.units.filter((unit) => unit.side === "opposition" && unit.disabled).length;
  const stats = document.querySelector("#outcome-stats");
  stats.replaceChildren();
  for (const [label, value] of [
    ["Time", formatDuration(state.missionSeconds)],
    ["Objectives", `${state.objectives.filter((objective) => objective.complete).length} of ${state.objectives.length}`],
    ["Operators disabled", String(teamDown)],
    ["Enemies disabled", String(watchersDown)],
    ...(state.units.some((unit) => unit.persuaded && !unit.disabled)
      ? [["Following the squad", String(state.units.filter((unit) => unit.persuaded && !unit.disabled).length)]]
      : []),
    ["Shooting", accuracyText(totals(state.debrief).shots, totals(state.debrief).hits)],
    ...(killsText(state.debrief) ? [["Put down", killsText(state.debrief)]] : []),
    ...state.units
      .filter((unit) => unit.side === "team" && state.debrief.shooters[unit.id])
      .map((unit) => {
        const record = state.debrief.shooters[unit.id];
        const name = state.campaign.roster.find((member) => member.id === unit.id)?.name ?? unit.id;
        return [name, `${accuracyText(record.shots, record.hits)}${record.kills ? `, ${record.kills} down` : ""}`];
      }),
    ...(state.opStats.lost?.length > 0 ? [["Operatives lost", state.opStats.lost.join(", ")]] : []),
    ...(state.opStats.recruited?.length > 0 ? [["Recruited", state.opStats.recruited.join(", ")]] : []),
    ...(finale
      ? [
          ["Campaign length", `${ending.days} days`],
          ["Territories held", `${ending.held} of ${state.missionList.length}`],
          ["Operatives lost", String(ending.lost)],
          ["Funds in hand", String(ending.funds)],
        ]
      : []),
    ...(state.opStats.discovered?.length > 0 ? [["Discovered", state.opStats.discovered.join(", ")]] : []),
    ...(state.opStats.resupply > 0 ? [["Resupply bill", `${state.opStats.resupply} funds`]] : []),
    ["Funds", fundsChange(state.fundsAtStart ?? state.campaign.funds, state.campaign.funds)],
    ...(state.opStats.civiliansHarmed + state.opStats.policeHarmed > 0
      ? [["Bystanders killed", String(state.opStats.civiliansHarmed + state.opStats.policeHarmed)]]
      : []),
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
  document.querySelector("#funds-readout").textContent = `Funds ${Math.floor(state.campaign.funds)}`;
  const income = Object.values(state.campaign.territories).reduce((sum, territory) => sum + dailyTax(territory), 0);
  document.querySelector("#clock-readout").textContent =
    `Day ${dayOf(state.campaign) + 1}` + (income > 0 ? ` · tax +${income.toFixed(1)}/day` : "");
}

// Game hours pass: research is paid for, days collect tax. News goes to the status line.
function passHours(hours) {
  const result = advanceCampaign(state.campaign, hours, state.catalog);
  state.campaign = result.campaign;
  for (const event of result.events) {
    if (event.type === "researched") {
      const item = state.catalog.find((entry) => entry.id === event.itemId);
      setStatus(`Research complete: ${item.name}. It is ready in the Armoury.`);
      audio.play("objective");
    } else if (event.type === "revolt") {
      const territory = state.missionList.find((entry) => entry.id === event.id);
      setStatus(`${territory?.name ?? "A territory"} is in revolt. It pays no tax until you take it back.`);
      audio.play("alert");
    }
  }
  updateFundsReadout();
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

// Bring home a weapon that is not researched and it boosts its research instead (once per item).
function discover(itemIds) {
  const found = discoverItems(state.campaign, itemIds, state.catalog);
  state.campaign = found.campaign;
  for (const event of found.events) {
    const name = state.catalog.find((item) => item.id === event.itemId)?.name ?? event.itemId;
    state.opStats.discovered.push(event.finished ? `${name} (research finished)` : `${name} (+25% research)`);
  }
}

// A successful operation keeps what the operators looted: gear that is already researched joins their loadout while
// there is room, and anything new boosts its research.
function keepLoot() {
  state.opStats.discovered = [];
  for (const unit of state.units.filter((item) => item.side === "team" && item.looted.length > 0)) {
    const carried = unit.equipment.map((item) => item.definition.id);
    // Start from what they carried in (without the loot), so the loadout reflects their kit.
    const before = carried.filter((id, index) => index < carried.length - unit.looted.length);
    discover(unit.looted);
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

// After a won operation the roster is settled: operatives who fell are lost for good (with permadeath on), and any
// enemy agent still following the squad is taken on with the gear they carry. A lost operation costs nobody their life;
// the squad pulls back and can try again. If the whole roster is gone a volunteer steps in.
function settleRoster() {
  const nameOf = (id) => state.campaign.roster.find((member) => member.id === id)?.name ?? id;
  const fallen = state.units.filter((unit) => unit.side === "team" && unit.disabled).map((unit) => unit.id);
  state.opStats.lost = state.campaign.permadeath ? fallen.map(nameOf) : [];
  state.campaign = loseOperatives(state.campaign, fallen);
  state.opStats.recruited = [];
  const captives = state.units.filter(
    (unit) => unit.persuaded && !unit.disabled && unit.side === "opposition" && unit.definition.role === "enemy-agent",
  );
  for (const captive of captives) {
    const gear = captive.equipment.map((item) => item.definition.id);
    const joined = recruit(state.campaign);
    if (!joined.member) break;
    state.campaign = joined.campaign;
    discover(gear);
    state.campaign = captureItems(state.campaign, joined.member.id, gear, state.catalog, []);
    state.opStats.recruited.push(joined.member.name);
  }
  if (aliveMembers(state.campaign).length === 0) {
    const volunteer = hire(state.campaign);
    if (volunteer.member) {
      state.campaign = volunteer.campaign;
      state.opStats.recruited.push(volunteer.member.name);
    }
  }
}

function checkOutcome() {
  if (state.outcome !== "active") return;
  const outcome = missionOutcome(state.objectives, state.units);
  if (outcome === "active") return;
  state.outcome = outcome;
  state.opStats.outcome = outcome;
  state.opStats.seconds = state.missionSeconds;
  // Refilling what the squad used up is paid for; it can leave the funds at zero but never below.
  state.opStats.resupply = resupplyCost(
    state.units.filter((unit) => unit.side === "team").flatMap((unit) => unit.equipment ?? []),
  );
  state.campaign = penalise(state.campaign, state.opStats.resupply);
  if (outcome === "success") {
    state.progress = markCompleted(state.progress, state.mission.id);
    saveProgress();
    renderMissionList();
    keepLoot();
    settleRoster();
    state.campaign = winTerritory(state.campaign, state.mission.id);
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
    // The campaign clock runs with the operation: four seconds make a game hour, which pays for research, and a day
    // collects tax. The record is saved every few seconds.
    state.clockCarry = (state.clockCarry ?? 0) + deltaSeconds;
    if (state.clockCarry >= SECONDS_PER_HOUR) {
      const hours = Math.floor(state.clockCarry / SECONDS_PER_HOUR);
      state.clockCarry -= hours * SECONDS_PER_HOUR;
      passHours(hours);
    }
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
    if (state.mission) updateVehicleButton();
    boardWaitingOperators();
    runPendingOrders();
    if (state.map?.objects?.some((gate) => gate.key || gate.kind === "door")) syncGates();
    if (state.objectives.some((objective) => objective.type === "hold" && !objective.complete && objective.progress > 0)) {
      renderInterface();
    }
  }
  for (const unit of state.units) {
    unit.walkPhase += deltaSeconds * legsPace(unit.upgrades) * adrenalineSpeed(unit.drugs);
  }
  advanceEffects(state.effects, deltaSeconds);
  consumeFixedSteps(state.clock, deltaSeconds, simulationStep);
  checkOutcome();
}

function completeObjectivesAt(position) {
  let changed = false;
  for (const event of resolveArrival(state.objectives, state.map.zones, position, state.units)) {
    if (event.type === "waiting") {
      setStatus(`Extraction needs everyone: ${event.outside} operative${event.outside > 1 ? "s" : ""} still to reach the zone.`);
      continue;
    }
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
    setStatus("Nothing to use is within reach.");
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
  // The crosshair colour follows the range as operators or watchers move, even if the mouse is still.
  state.cursorClock = (state.cursorClock ?? 0) + delta;
  if (state.cursorClock >= 0.1 && state.pointer && !drag.active) {
    state.cursorClock = 0;
    setPointerCursor(pointerKindAt(state.pointer));
  }
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
// With `queue` (Shift held) the new route is added after the one already under way, from where it ends.
// A plain order replaces everything, including actions queued after the route (`keepPending` is for the queue itself).
function orderMove(unit, destination, queue = false, keepPending = false) {
  unit.targetId = null;
  unit.lootTargetId = null;
  unit.followId = null;
  if (!keepPending) unit.pending = [];
  if (queue && unit.pending?.length > 0) {
    // Actions are waiting after the route: the walk joins the queue behind them.
    unit.pending.push({ type: "move", to: { ...destination } });
    return 1;
  }
  const queued = queue && unit.path.length > 0;
  const last = queued ? unit.path.at(-1) : unit.position;
  const start = { x: Math.round(last.x), y: Math.round(last.y) };
  const path = findPath(state.grid, start, destination);
  if (path.length === 0) return 0;
  if (queued) {
    unit.path = [...unit.path, ...path];
    unit.waypoints = [...(unit.waypoints ?? []), { ...destination }];
    return path.length;
  }
  unit.waypoints = [{ ...destination }];
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

// Orders for operators who are in a vehicle drive it: it goes to the nearest road to the point clicked.
function driveOrder(destination) {
  const driver = selectedOperators().find((unit) => unit.inVehicle);
  if (!driver) return false;
  const car = state.units.find((unit) => unit.id === driver.inVehicle);
  if (!car || car.vehicle.controlledBy !== driver.id) {
    setStatus("Only the driver can steer. Leave the vehicle with V.");
    return true;
  }
  if (!driveTo(car, destination, state.roadGrid)) {
    setStatus("No road to drive there.");
    return true;
  }
  state.cursor = { ...destination };
  audio.play("move");
  setStatus(`${car.definition.name} driving off.`);
  renderInterface();
  return true;
}

function issueMove(destination, queue = false) {
  if (driveOrder(destination)) return;
  const squad = selectedOperators();
  if (squad.length > 1) {
    const assignments = groupDestinations(squad, destination);
    const moving = assignments.filter(([unit, tile]) => orderMove(unit, tile, queue) > 0);
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
  const steps = orderMove(unit, destination, queue);
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

// Clicking a watcher sends the selected armed operators after it. Each closes in until the
// watcher is within range of the weapon it would fire (the selected one, if any), then stands
// and shoots; if the watcher moves away it is followed again.
function issueAttack(targetId, queue = false) {
  const target = state.units.find((unit) => unit.id === targetId);
  if (!target || !isAttackable(target)) return;
  if (target.disabled) {
    const gear = nearestDrop(target.position, 3);
    if (gear) goLoot(gear, queue);
    else setStatus(`${target.definition.name} is already down and has nothing left to loot.`);
    return;
  }
  const squad = selectedOperators();
  if (squad.length === 0) return;
  const carrying = (unit) => unit.equipment.some((item) => item.definition.action === "disable-pulse");
  const armed = squad.filter((unit) => carrying(unit) && roundsLeft(unit) !== 0 && hasWeaponSelected(unit));
  if (armed.length === 0) {
    setStatus(
      squad.some((unit) => carrying(unit) && roundsLeft(unit) !== 0)
        ? "No weapon selected. Click a weapon in the operator's inventory, then give the order."
        : squad.some(carrying)
          ? "Out of rounds. Swap to another weapon or loot one."
          : "No selected operator has a weapon equipped.",
    );
    return;
  }
  for (const unit of armed) {
    unit.followId = target.id;
    unit.lootTargetId = null;
  }
  const inRange = armed.filter(
    (unit) => distanceBetween(unit, target) <= combatStats(unit, distanceBetween(unit, target)).range,
  );
  const who = armed.length > 1 ? `${armed.length} operators` : armed[0].definition.name;
  setStatus(
    inRange.length === armed.length
      ? `${who} engaging ${target.definition.name}.`
      : `${who} closing in on ${target.definition.name}.`,
  );
  audio.play("move");
  renderInterface();
  canvas.focus();
}

function useRepairOn(unit, kit) {
  if (!unit || unit.disabled || !kit || kit.charges === 0) {
    setStatus("No field repair kit is available.");
    return;
  }
  const maximum = maxHealth(unit);
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

// Anyone who has just been put down drops what they carried, scattered around where they fell (FreeSynd), unless a
// beam, or fire or a blast without a strong chest, took it with them.
function collectFallenGear() {
  const events = collectFallen(state.units, state.drops, state.grid);
  for (const event of events) {
    const who = state.units.find((unit) => unit.id === event.unitId);
    if (event.type === "destroyed" && who?.side === "opposition") setStatus(`${who.definition.name}'s gear was destroyed with them.`);
  }
  if (state.drops.some((drop) => !lootableBody(drop))) state.drops = state.drops.filter(lootableBody);
  if (events.some((event) => event.type === "dropped")) renderInterface();
}

// The nearest gear lying within `within` tiles of a point, or null.
function nearestDrop(position, within) {
  let best = null;
  for (const drop of state.drops) {
    const gap = Math.hypot(drop.position.x - position.x, drop.position.y - position.y);
    if (gap <= within && (!best || gap < best.gap)) best = { drop, gap };
  }
  return best?.drop ?? null;
}

// Pick up gear lying on the ground with one of the selected operators.
function lootNow(operator, body) {
  const { taken, left } = lootBody(operator, body);
  operator.lootTargetId = null;
  state.drops = state.drops.filter(lootableBody);
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
  // Everything within reach goes in at once, as far as there are free slots.
  let found = findLoot(squad, state.drops);
  if (found) {
    if (freeSlots(found.operator) === 0) lootNow(found.operator, found.body); // says why nothing was taken
    while (found && freeSlots(found.operator) > 0) {
      lootNow(found.operator, found.body);
      found = findLoot(squad, state.drops);
    }
    return;
  }
  let target = null;
  for (const unit of squad) {
    const candidate = nearestLootable(unit, state.drops);
    if (candidate && (!target || distanceBetween(unit, candidate) < distanceBetween(target.unit, target.body))) {
      target = { unit, body: candidate };
    }
  }
  if (target) goLoot(target.body);
  else setStatus("There is nothing to pick up. Gear lies where an armed person falls.");
}

// Send the nearest selected operator to a body; they loot it on arrival.
function goLoot(body, queue = false) {
  const squad = selectedOperators();
  if (squad.length === 0) return;
  const nearest = squad.reduce((best, unit) =>
    Math.hypot(unit.position.x - body.position.x, unit.position.y - body.position.y) <
    Math.hypot(best.position.x - body.position.x, best.position.y - body.position.y)
      ? unit
      : best,
  );
  if (queue && isBusy(nearest)) {
    queueAction(nearest, { type: "loot", id: body.id }, `pick up the ${body.definition.name}`);
    return;
  }
  sendLoot(nearest, body);
}

// Send one operator to gear on the ground (lootNow once they are beside it).
function sendLoot(unit, body, keepPending = false) {
  if (inLootReach(unit, body)) {
    lootNow(unit, body);
    return;
  }
  const steps = orderMove(unit, { x: Math.round(body.position.x), y: Math.round(body.position.y) }, false, keepPending);
  if (steps === 0) {
    setStatus("No safe route to that gear.");
    return;
  }
  unit.lootTargetId = body.id;
  audio.play("move");
  setStatus(`${unit.definition.name} is walking over to pick up the ${body.definition.name}.`);
  renderInterface();
}

// Orders queued after the current route (Shift+click): walk on, pick up gear, get into a vehicle, in the order given.
// An operator is busy while they still have somewhere to go or something to do.
function isBusy(unit) {
  return unit.path.length > 0 || Boolean(unit.lootTargetId) || Boolean(unit.enterTargetId) || (unit.pending?.length ?? 0) > 0;
}

function queueAction(unit, action, description) {
  unit.pending = [...(unit.pending ?? []), action];
  audio.play("move");
  setStatus(`${unit.definition.name} will ${description} next (${unit.pending.length} queued, Esc clears).`);
  renderInterface();
}

// When an operator has finished what they were doing, start the next queued order; one that can no longer be
// done (the body is gone, the vehicle is wrecked, no route) is skipped with a message.
function runPendingOrders() {
  for (const unit of state.units) {
    if (unit.side !== "team" || unit.disabled || unit.inVehicle || !unit.pending?.length) continue;
    if (unit.path.length > 0 || unit.lootTargetId || unit.enterTargetId) continue;
    const next = unit.pending.shift();
    if (next.type === "move") {
      if (orderMove(unit, next.to, false, true) === 0) setStatus(`${unit.definition.name}: no route to the next point, skipped.`);
    } else if (next.type === "loot") {
      const body = state.drops.find((item) => item.id === next.id);
      if (body && lootableBody(body)) sendLoot(unit, body, true);
      else setStatus(`${unit.definition.name}: nothing left to pick up, skipped.`);
    } else if (next.type === "enter") {
      const vehicle = state.units.find((item) => item.id === next.id);
      if (vehicle && !vehicle.disabled) sendEnter(unit, vehicle, true);
      else setStatus(`${unit.definition.name}: the vehicle is gone, skipped.`);
    }
  }
}

// The unit under a screen point. Characters are tall, so the target is a generous box around the
// whole figure, from a little below the feet to above the head, and the nearest one wins.
function hitUnit(position) {
  if (!state.viewport) return null;
  const { cellSize, origin } = state.viewport;
  const halfWidth = Math.max(18, cellSize.height * 0.8);
  const above = Math.max(46, cellSize.height * 2.3);
  const below = Math.max(12, cellSize.height * 0.4);
  let closest = null;
  let closestDistance = Infinity;
  for (const unit of state.units) {
    if (unit.inVehicle) continue;
    const tile = state.grid[Math.round(unit.position.y)]?.[Math.round(unit.position.x)];
    const center = gridToScreen(unit.position, cellSize, origin, tile?.elevation ?? 0);
    const dx = position.x - center.x;
    const dy = position.y - center.y;
    // A car is wide and low: a different box from a standing figure.
    const reachX = isVehicle(unit) ? cellSize.width * 0.75 : halfWidth;
    const reachUp = isVehicle(unit) ? cellSize.height * 1.5 : above;
    if (Math.abs(dx) > reachX || dy < -reachUp || dy > below) continue;
    // Nearest to the middle of the figure, counting height a little less than width.
    // (a body on the ground only counts when no one standing is under the pointer)
    const distance = Math.hypot(dx, (dy + above * 0.3) * 0.7) + (unit.disabled ? 1000 : 0);
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
  if (state.map && event.button === 2 && state.viewport && !state.modal && state.outcome === "active") {
    // Holding the right button keeps firing: an automatic weapon sprays for as long as it is held.
    const bounds = canvas.getBoundingClientRect();
    state.holdFire = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
    state.firedOnDownAt = performance.now();
    fireByHand(screenToGridExact(state.holdFire, state.viewport.cellSize, state.viewport.origin));
    return;
  }
  if (!state.map || event.button !== 0) return;
  Object.assign(drag, { pointerId: event.pointerId, lastX: event.clientX, lastY: event.clientY, moved: 0, active: false });
});
canvas.addEventListener("pointermove", (event) => {
  if (state.holdFire && state.viewport) {
    const bounds = canvas.getBoundingClientRect();
    state.holdFire = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  }
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
    if (event.button === 2 || type === "pointercancel") state.holdFire = null;
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
  state.holdFire = null;
  state.edge = { x: 0, y: 0 };
  state.pointer = null;
  setPointerCursor(null);
});

// The pointer shows what a click would do: a crosshair over a watcher still standing (red when a
// selected operator's weapon reaches it, white when it is out of range) and a pickup cursor over
// gear an operator could collect.
function setPointerCursor(kind) {
  canvas.classList.toggle("cursor-attack", kind === "attack");
  canvas.classList.toggle("cursor-attack-far", kind === "attack-far");
  canvas.classList.toggle("cursor-loot", kind === "loot");
}

// Anyone the squad could fire on: watchers, civilians and police, but not people it has persuaded.
function isAttackable(unit) {
  if (isVehicle(unit)) return !isSquadVehicle(unit);
  return ["opposition", "civilian", "police", "criminal"].includes(unit.side) && !unit.persuaded;
}

function pointerKindAt(position) {
  const squad = selectedOperators();
  if (squad.length === 0 || !state.viewport) return null;
  const unit = hitUnit(position);
  if (unit && isAttackable(unit) && !unit.disabled && !isVehicle(unit)) {
    const reachable = squad.some((operator) => {
      const gap = distanceBetween(operator, unit);
      return gap <= combatStats(operator, gap).range;
    });
    return reachable ? "attack" : "attack-far";
  }
  const ground = screenToGrid(position, state.viewport.cellSize, state.viewport.origin);
  if ((unit?.disabled && nearestDrop(unit.position, 3)) || lootableAt(state.drops, ground, 0.9)) return "loot";
  return null;
}

canvas.addEventListener("pointermove", (event) => {
  if (event.pointerType !== "mouse" || !state.viewport || drag.active) return;
  const bounds = canvas.getBoundingClientRect();
  state.pointer = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  setPointerCursor(pointerKindAt(state.pointer));
});

// Right-click: fire the selected weapon (or the best loaded one) in the direction of the pointer.
function fireByHand(aim, held = false) {
  const squad = selectedOperators();
  if (squad.length === 0) {
    if (!held) setStatus("Select an operator first, then right-click to fire.");
    return;
  }
  const events = [];
  const reasons = new Set();
  for (const unit of squad) {
    const result = fireManual(unit, aim, state.units, state.grid, state.props);
    if (result.fired) events.push(...result.events);
    else reasons.add(result.reason);
  }
  if (events.length > 0) {
    handleCombatEvents(events);
    renderInterface();
    return;
  }
  if (held) return;
  if (reasons.has("recharging")) setStatus("Weapon recharging.");
  else if (reasons.has("no-rounds")) setStatus("Out of rounds. Select another weapon or loot one.");
  else if (reasons.has("none-selected")) setStatus("No weapon selected. Click a weapon in the operator's inventory first.");
  else if (reasons.has("no-weapon")) setStatus("No weapon equipped.");
}

canvas.addEventListener("contextmenu", (event) => {
  event.preventDefault();
  // A mouse already fired on button-down; a long press on touch reaches the context menu without one.
  if (performance.now() - (state.firedOnDownAt ?? -Infinity) < 600) return;
  if (!state.map || !state.viewport || state.modal || state.outcome !== "active") return;
  const bounds = canvas.getBoundingClientRect();
  const position = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  fireByHand(screenToGridExact(position, state.viewport.cellSize, state.viewport.origin));
});

// Throw the armed charge to a spot on the ground, within range and on walkable ground.
function throwArmedBomb(target) {
  const { unitId, slot } = state.armedBomb;
  const unit = state.units.find((item) => item.id === unitId);
  const entry = unit?.equipment[slot];
  if (!unit || unit.disabled || !entry || entry.definition.action !== "time-bomb" || entry.charges === 0) {
    state.armedBomb = null;
    return;
  }
  const tile = { x: Math.round(target.x), y: Math.round(target.y) };
  if (Math.hypot(tile.x - unit.position.x, tile.y - unit.position.y) > THROW_RANGE) {
    setStatus(`Too far: a charge can be thrown ${THROW_RANGE} tiles.`);
    return;
  }
  if (!isWalkable(state.grid, tile.x, tile.y)) {
    setStatus("It cannot land there.");
    return;
  }
  state.armedBomb = null;
  plantBomb(unit, entry, state.bombs, tile);
  audio.play("tick");
  setStatus(
    `${unit.definition.name} throws a ${entry.definition.name}: ${entry.definition.effect.fuse} seconds. ` +
      `Keep everyone ${entry.definition.effect.radius} tiles from it.`,
  );
  renderInterface();
}
// Escape first cancels what is half done (an armed charge, then the queued orders) before it deselects anyone.
window.addEventListener(
  "keydown",
  (event) => {
    if (event.key !== "Escape") return;
    if (state.armedBomb) {
      state.armedBomb = null;
      setStatus("Charge put away.");
    } else if (selectedOperators().some((unit) => unit.pending?.length > 0)) {
      for (const unit of selectedOperators()) unit.pending = [];
      setStatus("Queued orders cleared.");
    } else {
      return;
    }
    event.stopPropagation();
  },
  true,
);

canvas.addEventListener("click", (event) => {
  if (drag.suppressClick) {
    drag.suppressClick = false;
    return;
  }
  if (!state.map || !state.viewport) return;
  const bounds = canvas.getBoundingClientRect();
  const position = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  if (state.armedBomb) {
    throwArmedBomb(screenToGrid(position, state.viewport.cellSize, state.viewport.origin));
    return;
  }
  const unit = hitUnit(position);
  if (unit) {
    if (isVehicle(unit) && !unit.disabled && !isSquadVehicle(unit)) goEnterVehicle(unit, event.shiftKey);
    else if (unit.side !== "team") {
      if (isAttackable(unit)) issueAttack(unit.id, event.shiftKey);
    }
    else if (event.ctrlKey || event.shiftKey || event.metaKey) toggleSelect(unit.id);
    else selectUnit(unit.id);
    return;
  }
  const destination = screenToGrid(position, state.viewport.cellSize, state.viewport.origin);
  // Clicking the ground where an enemy fell picks up its gear: an operator walks over.
  const dropped = lootableAt(state.drops, destination, 0.9);
  if (dropped && selectedOperators().length > 0) {
    goLoot(dropped, event.shiftKey);
    return;
  }
  if (
    destination.x >= 0 &&
    destination.y >= 0 &&
    destination.x < state.map.dimensions.width &&
    destination.y < state.map.dimensions.height
  ) {
    issueMove(destination, event.shiftKey);
  }
});

// Number keys: 1 to 4 pick an operator, Shift+number adds or removes them from the selection, 0 switches between
// the one you have and the whole squad, and Alt+1 to 8 press that inventory slot for the selected operator (for
// the whole selected group when there are several).
function numberKeyShortcut(event) {
  const match = /^(?:Digit|Numpad)([0-9])$/.exec(event.code ?? "");
  if (!match || event.ctrlKey || event.metaKey || !state.map || state.modal) return false;
  const digit = Number(match[1]);
  const operators = state.units.filter((unit) => unit.side === "team");
  if (event.altKey) {
    const leader = selectedUnit();
    if (digit >= 1 && digit <= SLOTS_PER_OPERATIVE && leader && leader.side === "team") {
      if (event.shiftKey) dropFromSlot(leader, digit - 1);
      else pressSlot(leader, digit - 1);
    }
    return true;
  }
  if (digit === 0) {
    if (selectedOperators().length > 1) {
      const leader = selectedUnit();
      if (leader) selectUnit(leader.id);
    } else {
      selectAll();
    }
    return true;
  }
  const unit = operators[digit - 1];
  if (!unit || unit.disabled) return true;
  if (event.shiftKey) toggleSelect(unit.id);
  else selectUnit(unit.id);
  return true;
}

canvas.addEventListener("keydown", (event) => {
  if (numberKeyShortcut(event)) {
    event.preventDefault();
    return;
  }
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
  } else if (action === "loot") {
    event.preventDefault();
    lootAction();
  } else if (action === "vehicle") {
    event.preventDefault();
    toggleVehicle();
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
document.querySelector("#select-all-hub").addEventListener("click", selectAll);

// Tabs: a tablist whose buttons show one panel (`aria-controls`).
function wireTabs(tablist, onSelect) {
  const tabs = [...tablist.querySelectorAll('[role="tab"]')];
  const select = (chosen, focus = false) => {
    for (const tab of tabs) {
      const on = tab === chosen;
      tab.setAttribute("aria-selected", String(on));
      tab.tabIndex = on ? 0 : -1;
      const panel = tab.getAttribute("aria-controls") && document.getElementById(tab.getAttribute("aria-controls"));
      if (panel) panel.hidden = !on;
    }
    if (focus) chosen.focus();
    onSelect?.(chosen);
  };
  for (const tab of tabs) {
    tab.addEventListener("click", () => select(tab));
    tab.addEventListener("keydown", (event) => {
      const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
      if (!step) return;
      event.preventDefault();
      select(tabs[(tabs.indexOf(tab) + step + tabs.length) % tabs.length], true);
    });
  }
}
wireTabs(document.querySelector("#mission-panel > .tabs"));
actionButton.addEventListener("click", performInteraction);
repairButton.addEventListener("click", useRepairKit);
document.querySelector("#loot-button").addEventListener("click", lootAction);
document.querySelector("#vehicle-button").addEventListener("click", toggleVehicle);
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
// The next operation along that is open: the first after this one that has been unlocked and is not yet won.
function nextOperation() {
  const open = (index) =>
    isUnlocked(state.progress, state.missionList, index) && !isCompleted(state.progress, state.missionList[index].id);
  for (let index = state.missionIndex + 1; index < state.missionList.length; index += 1) if (open(index)) return index;
  return -1;
}

document.querySelector("#next-button").addEventListener("click", () => {
  outcomeDialog.close();
  loadGame(nextOperation())
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
    selection() {
      return [...(state.selectedIds ?? [])];
    },
    queue(id) {
      const unit = state.units.find((item) => item.id === id);
      return { steps: unit.path.length, waypoints: (unit.waypoints ?? []).length, pending: (unit.pending ?? []).length };
    },
    rounds(id, slot) {
      return state.units.find((item) => item.id === id).equipment[slot]?.charges ?? null;
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
    setFunds(amount) {
      state.campaign = { ...state.campaign, funds: amount };
      updateFundsReadout();
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
    following(id) {
      return state.units.find((item) => item.id === id).followId ?? null;
    },
    held(id) {
      const unit = state.units.find((item) => item.id === id);
      return heldWeapon(unit, state.elapsed)?.definition.name ?? null;
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
    screenPointAt(x, y) {
      const point = gridToScreen({ x, y }, state.viewport.cellSize, state.viewport.origin, state.grid[y]?.[x]?.elevation ?? 0);
      const bounds = canvas.getBoundingClientRect();
      return { x: bounds.left + point.x, y: bounds.top + point.y };
    },
    placeUnit(id, x, y) {
      const unit = state.units.find((item) => item.id === id);
      unit.position = { x, y };
      unit.path = [];
    },
    effects() {
      return state.effects.map((effect) => effect.type);
    },
    musicStatus() {
      return music.status();
    },
    moveSelected(x, y) {
      issueMove({ x, y });
    },
    drugOf(id, name) {
      return { ...state.units.find((item) => item.id === id).drugs[name] };
    },
    props() {
      return state.props.map((prop) => ({ id: prop.id, kind: prop.kind, state: prop.state, position: { ...prop.position } }));
    },
    hurtProp(id, amount, type) {
      const change = damageProp(state.props.find((prop) => prop.id === id), amount, type);
      if (change) announceProp(change);
    },
    advanceHours(hours) {
      passHours(hours);
      renderResearch();
    },
    advanceMusic(seconds) {
      music.advance(seconds);
    },
    giveItem(id, itemId) {
      const unit = state.units.find((item) => item.id === id);
      const definition = state.catalog.find((item) => item.id === itemId);
      unit.equipment.push({ definition, charges: definition.charges });
      renderInterface();
    },
    drops() {
      return state.drops.map((drop) => ({ id: drop.id, item: drop.equipment[0].definition.id, x: drop.position.x, y: drop.position.y }));
    },
    riders() {
      return state.units.filter((unit) => unit.side === "team" && unit.inVehicle).map((unit) => unit.id);
    },
    positionOf(id) {
      return { ...state.units.find((item) => item.id === id).position };
    },
    bombs() {
      return state.bombs.map((bomb) => ({ ...bomb.at, left: bomb.left }));
    },
    persuade(id, ownerId) {
      const unit = state.units.find((item) => item.id === id);
      unit.persuaded = true;
      unit.persuadedBy = ownerId;
    },
    persuadedBy(id) {
      return state.units.find((item) => item.id === id)?.persuadedBy ?? null;
    },
    markInProgress() {
      state.missionSeconds = 30;
    },
    completeAllOtherOperations() {
      state.progress = { completed: state.missionList.map((entry) => entry.id).filter((id) => id !== state.mission.id) };
    },
    completeObjectives() {
      for (const objective of state.objectives) objective.complete = true;
    },
  };
}
document.querySelector("#about-button").addEventListener("click", () => aboutDialog.showModal());
document.querySelector("#close-about").addEventListener("click", () => aboutDialog.close());

// The eight item squares: a picture per item, and a click selects or uses it.
// Right-click a slot (or Alt+Shift+1-8): the item leaves the slot and lies on the ground beside the operative, where it can
// be picked up again (FreeSynd).
function dropFromSlot(unit, slot) {
  const name = unit.equipment[slot]?.definition.name;
  if (state.armedBomb?.unitId === unit.id) state.armedBomb = null;
  const drop = dropItem(unit, slot, state.drops, state.grid);
  if (!drop) return;
  audio.play("select");
  setStatus(`${unit.definition.name} dropped the ${name}. Press F or click it to pick it up.`);
  renderInterface();
}

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
    const active =
      (definition.action === "disable-pulse" && unit.activeSlot === slot) ||
      (definition.action === "persuade" && Boolean(unit.persuading));
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
    const onLabel = definition.action === "persuade" ? "switched on" : "selected weapon";
    const detail = active ? onLabel : spent ? "used up" : slotHint(definition);
    square.setAttribute("aria-label", `${label} slot ${slot + 1}: ${definition.name}, ${detail}`);
    square.setAttribute("aria-pressed", String(active));
    square.title = `${definition.name}: ${definition.description} Right-click to drop it.`;
    square.disabled = unit.disabled;
    square.addEventListener("click", () => pressSlot(unit, slot));
    square.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      dropFromSlot(unit, slot);
    });
    row.append(square);
  }
  return row;
}

function slotHint(definition) {
  switch (definition.action) {
    case "disable-pulse":
      return "weapon, click to select";
    case "persuade":
      return "click to switch on";
    case "time-bomb":
      return "click to plant";
    case "shield":
      return "click to raise";
    case "scan":
      return "click to scan";
    case "key":
      return "carried: opens locked gates";
    case "restore-vitality":
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
    // With several operatives selected (and this one among them), the choice applies to all of
    // them: each takes up their own copy of the same weapon, or puts it away together.
    const squad = selectedOperators();
    if (squad.length > 1 && squad.some((member) => member.id === unit.id)) {
      if (unit.activeSlot === slot) {
        clearWeaponForAll(squad, definition.id);
        setStatus(`${squad.length} operators: weapons put away. Select one to fire.`);
      } else {
        const { selected, substituted, missing } = selectWeaponForAll(squad, definition.id);
        unit.activeSlot = slot; // the operative clicked keeps the exact copy they clicked
        setStatus(
          `${selected.length + substituted.length} operators: ${definition.name} selected.` +
            (substituted.length > 0 ? ` ${substituted.length} took the most similar weapon they carry.` : "") +
            (missing.length > 0 ? ` ${missing.length} have nothing loaded.` : ""),
        );
      }
      audio.play("select");
      renderInterface();
      return;
    }
    unit.activeSlot = unit.activeSlot === slot ? null : slot;
    setStatus(
      unit.activeSlot === slot
        ? `${unit.definition.name}: ${definition.name} selected. It will be the only weapon that fires.`
        : `${unit.definition.name}: weapon put away. Select one to fire.`,
    );
    audio.play("select");
    renderInterface();
  } else if (definition.action === "time-bomb") {
    if (entry.charges === 0) {
      setStatus("That charge is used up.");
      return;
    }
    // The first click arms the charge: click the ground to throw it there. Clicking the slot again drops it underfoot.
    if (state.armedBomb?.unitId !== unit.id || state.armedBomb.slot !== slot) {
      state.armedBomb = { unitId: unit.id, slot };
      audio.play("select");
      setStatus(
        `${unit.definition.name}: click the ground within ${THROW_RANGE} tiles to throw the ${definition.name}, ` +
          "click its slot again to drop it here, Esc to cancel.",
      );
      return;
    }
    state.armedBomb = null;
    plantBomb(unit, entry, state.bombs);
    audio.play("tick");
    setStatus(
      `${unit.definition.name} plants a ${definition.name}: ${definition.effect.fuse} seconds. ` +
        `Get everyone out of ${definition.effect.radius} tiles.`,
    );
    renderInterface();
  } else if (definition.action === "shield") {
    if (!raiseShield(unit)) {
      setStatus(entry.charges === 0 ? "That shield is spent." : `${unit.definition.name} already has a shield up.`);
      return;
    }
    audio.play("shield-up");
    setStatus(`${unit.definition.name}: ${definition.name} up for ${definition.effect.duration} seconds.`);
    renderInterface();
  } else if (definition.action === "scan") {
    if (!useScanner(unit)) {
      setStatus(entry.charges === 0 ? "That scanner is spent." : `${unit.definition.name} is already scanning.`);
      return;
    }
    audio.play("scan");
    setStatus(
      `${unit.definition.name}: ${definition.name} on for ${definition.effect.duration} seconds. ` +
        "Everyone nearby shows on the map.",
    );
    renderInterface();
  } else if (definition.action === "persuade") {
    // Like weapons, with several operators selected the switch applies to all of them that carry one.
    const squad = selectedOperators();
    const group = squad.length > 1 && squad.some((member) => member.id === unit.id) ? squad : [unit];
    const turnOn = !unit.persuading;
    const carriers = group.filter((member) => member.equipment.some((item) => item.definition.action === "persuade"));
    for (const member of carriers) member.persuading = turnOn;
    setStatus(
      turnOn
        ? `${carriers.length > 1 ? `${carriers.length} operators` : unit.definition.name}: ${definition.name} on. ` +
            "Stand near people to win them over."
        : `${carriers.length > 1 ? `${carriers.length} operators` : unit.definition.name}: ${definition.name} off.`,
    );
    audio.play("select");
    renderInterface();
  } else if (definition.action === "restore-vitality") {
    useRepairOn(unit, entry);
  } else {
    setStatus(`${definition.name} is worn: ${definition.description}`);
  }
}

// A drug slider shows the dose set; its tooltip explains what is actually in force and what the body has adapted to.
function paintDrug(slider, unit) {
  const name = slider.dataset.drug;
  const drug = unit.drugs?.[name];
  if (!drug) return;
  if (document.activeElement !== slider) slider.value = String(drug.amount);
  const times = drugMultiplier(unit.drugs, name);
  slider.title =
    `${DRUG_LABELS[name]}: ${DRUG_HINTS[name]} Dose ${drug.amount}, in force ${drug.effect}, tolerance ${drug.dependency}: ` +
    `x${times.toFixed(2)}. A high dose fades as the body adapts.`;
}

// The operatives a change on this operative's own controls applies to: everyone selected when this
// one is among several selected, otherwise just this one.
function controlGroup(unit) {
  const squad = selectedOperators();
  return squad.length > 1 && squad.some((member) => member.id === unit.id) ? squad : [unit];
}

// Moving a slider sets it for every selected operator when this one is among them (like weapons).
function setDrugForGroup(unit, name, value) {
  for (const member of controlGroup(unit)) {
    if (member.drugs && !member.disabled) member.drugs = setDrug(member.drugs, name, value);
  }
  for (const slider of document.querySelectorAll(`.drug input[data-drug="${name}"]`)) {
    const owner = state.units.find((candidate) => candidate.id === slider.dataset.unit);
    if (owner && controlGroup(unit).includes(owner) && slider !== document.activeElement) paintDrug(slider, owner);
  }
}

// The drugs change every step, so update the sliders in place instead of
// rebuilding the roster (which would swallow clicks on its buttons).
function updateMeters() {
  for (const slider of document.querySelectorAll(".drug input")) {
    const owner = state.units.find((candidate) => candidate.id === slider.dataset.unit);
    if (owner) paintDrug(slider, owner);
  }
}

// The vehicle the selected squad could use right now: the one they are in (to leave), or the nearest one a
// selected operator is next to (to enter).
function vehicleCandidate() {
  const squad = selectedOperators();
  const riding = squad.find((unit) => unit.inVehicle);
  if (riding) return { vehicle: state.units.find((unit) => unit.id === riding.inVehicle), leaving: true };
  let best = null;
  for (const unit of state.units) {
    if (!isVehicle(unit)) continue;
    for (const operator of squad) {
      if (!canEnter(operator, unit)) continue;
      const distance = Math.hypot(operator.position.x - unit.position.x, operator.position.y - unit.position.y);
      if (!best || distance < best.distance) best = { vehicle: unit, leaving: false, distance };
    }
  }
  return best;
}

// Left-click a vehicle: the nearest selected operator walks to it and gets in (FreeSynd: a click on a car boards it).
function goEnterVehicle(vehicle, queue = false) {
  const squad = selectedOperators().filter((unit) => !unit.inVehicle);
  if (squad.length === 0) {
    setStatus("Select an operator first, then click the vehicle to get in.");
    return;
  }
  // Everyone selected heads for the vehicle (FreeSynd: a click on a car sends the whole selection in).
  for (const unit of squad) {
    if (queue && isBusy(unit)) queueAction(unit, { type: "enter", id: vehicle.id }, `get into the ${vehicle.definition.name}`);
    else sendEnter(unit, vehicle);
  }
  if (squad.length > 1) setStatus(`${squad.length} operators are heading for the ${vehicle.definition.name}.`);
}

function sendEnter(nearest, vehicle, keepPending = false) {
  const gap = Math.hypot(nearest.position.x - vehicle.position.x, nearest.position.y - vehicle.position.y);
  if (gap <= ENTER_RANGE && !canEnter(nearest, vehicle)) {
    setStatus(`No room in the ${vehicle.definition.name}.`);
    return;
  }
  const steps = orderMove(nearest, { x: Math.round(vehicle.position.x), y: Math.round(vehicle.position.y) }, false, keepPending);
  nearest.enterTargetId = vehicle.id;
  if (steps === 0 && !canEnter(nearest, vehicle)) {
    nearest.enterTargetId = null;
    setStatus("No safe route to that vehicle.");
    return;
  }
  audio.play("move");
  setStatus(`${nearest.definition.name} is heading for the ${vehicle.definition.name}.`);
  renderInterface();
}

// Operators who were sent to a vehicle get in once they are close enough.
function boardWaitingOperators() {
  for (const operator of state.units) {
    if (!operator.enterTargetId || operator.inVehicle || operator.disabled) continue;
    const vehicle = state.units.find((unit) => unit.id === operator.enterTargetId);
    if (!vehicle || vehicle.disabled) {
      operator.enterTargetId = null;
      continue;
    }
    if (!canEnter(operator, vehicle)) {
      if (operator.path.length === 0) operator.enterTargetId = null;
      continue;
    }
    operator.enterTargetId = null;
    const { entered, thrownOut } = enterVehicle(vehicle, [operator], state.units, state.grid);
    if (entered.length > 0) {
      setStatus(
        `${operator.definition.name} got into the ${vehicle.definition.name}` +
          (thrownOut ? `; ${thrownOut.definition.name} was thrown out.` : ". Click a road to drive, V to get out."),
      );
      audio.play("move");
      renderInterface();
    }
  }
}

function toggleVehicle() {
  const candidate = vehicleCandidate();
  if (!candidate) {
    setStatus("No vehicle within reach. Walk up to one and press V.");
    return;
  }
  const { vehicle, leaving } = candidate;
  if (leaving) {
    const out = leaveVehicle(vehicle, state.units, state.grid);
    setStatus(`${out.length} left the ${vehicle.definition.name}.`);
    audio.play("select");
  } else {
    const { entered, thrownOut } = enterVehicle(vehicle, selectedOperators(), state.units, state.grid);
    if (entered.length === 0) {
      setStatus(`No room in the ${vehicle.definition.name}.`);
      return;
    }
    // Selected operators who were further off walk over and get in too.
    for (const unit of selectedOperators()) if (!unit.inVehicle && !unit.disabled) sendEnter(unit, vehicle);
    setStatus(
      `${entered.length} got into the ${vehicle.definition.name}` +
        (thrownOut ? `; ${thrownOut.definition.name} was thrown out.` : ". Click a road to drive, V to get out."),
    );
    audio.play("move");
  }
  renderInterface();
}

// The Enter/Leave vehicle button follows what is within reach (refreshed a few times a second).
function updateVehicleButton() {
  const ride = vehicleCandidate();
  document.querySelector("#vehicle-button").disabled = !ride;
  document.querySelector("#vehicle-label").textContent = ride?.leaving ? "Leave vehicle" : ride ? "Take vehicle" : "Enter vehicle";
}

function renderInterface() {
  if (!state.mission) return;
  objectiveList.replaceChildren(
    ...state.objectives.map((objective) => {
      const item = document.createElement("li");
      item.textContent = objective.description;
      if (objective.type === "hold" && !objective.complete) {
        item.textContent += ` (${Math.floor(objective.progress ?? 0)} / ${objective.holdSeconds} s)`;
      }
      item.classList.toggle("complete", objective.complete);
      const now = objective === currentObjective(state.objectives);
      item.classList.toggle("current", now && Boolean(state.mission.sequence));
      item.classList.toggle("waiting", Boolean(state.mission.sequence) && objective.required && !objective.complete && !now);
      item.setAttribute(
        "aria-label",
        `${objective.complete ? "Complete" : now && state.mission.sequence ? "Current" : "Pending"}: ${objective.description}`,
      );
      return item;
    }),
  );
  const completed = state.objectives.filter((objective) => objective.complete).length;
  objectiveCount.textContent = `${completed} / ${state.objectives.length}`;

  const selectAllButton = document.querySelector("#select-all-button");
  const everyoneSelected = activeOperators().length > 1 && selectedOperators().length === activeOperators().length;
  document.querySelector("#select-all-hub").setAttribute("aria-pressed", String(everyoneSelected));
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
      health.textContent = `${unit.health}/${maxHealth(unit)}`;
      name.append(" ", health);
      const position = document.createElement("span");
      position.className = "operator-position";
      position.textContent = `${pad(unit.position.x)}:${pad(unit.position.y)}`;
      button.append(glyph, name, position);

            const chemistry = document.createElement("div");
      chemistry.className = "drugs";
      for (const name of DRUG_NAMES) {
        const row = document.createElement("label");
        row.className = `drug drug-${name}`;
        const text = document.createElement("span");
        text.textContent = DRUG_LABELS[name].slice(0, 3);
        const slider = document.createElement("input");
        slider.type = "range";
        slider.min = "0";
        slider.max = "100";
        slider.step = "5";
        slider.dataset.unit = unit.id;
        slider.dataset.drug = name;
        slider.disabled = unit.disabled;
        slider.setAttribute("aria-label", `${DRUG_LABELS[name]} of ${label}`);
        slider.addEventListener("input", () => setDrugForGroup(unit, name, Number(slider.value)));
        row.append(text, slider);
        chemistry.append(row);
        paintDrug(slider, unit);
      }
      item.append(checkbox, button, slotRow(unit, label), chemistry);
      return item;
    }),
  );

  const threats = state.units.filter((unit) => unit.side === "opposition" && !unit.persuaded);
  enemyCount.textContent = String(threats.filter((unit) => !unit.disabled).length);
  threatsElement.replaceChildren(
    ...threats.map((unit) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.disabled = String(unit.disabled);
      button.addEventListener("click", () => issueAttack(unit.id));
      const name = document.createElement("span");
      // Numbered within its own kind: Enemy Agent 3, Guard 2.
      const sameKind = threats.filter((other) => other.definition === unit.definition);
      name.textContent = `${unit.definition.name} ${sameKind.indexOf(unit) + 1}`;
      const vitality = document.createElement("span");
      vitality.className = "vitality";
      vitality.textContent = unit.disabled
        ? "DISABLED"
        : `${unit.health}/${maxHealth(unit)}`;
      button.append(name, vitality);
      return button;
    }),
  );

  const unit = selectedUnit();
  const interaction = nearbyInteraction();
  actionButton.disabled = interaction === null;
  const prop = interaction ? state.map.zones.find((zone) => zone.id === interaction.targetZone)?.prop : null;
  actionLabel.textContent = prop === "server" ? "Download data" : interaction ? "Restore nearby relay" : "Restore relay";
  const repairKit = equipmentWithAction(unit, "restore-vitality");
  const canRepair = Boolean(
    unit &&
    !unit.disabled &&
    unit.health < maxHealth(unit) &&
    repairKit &&
    repairKit.charges !== 0,
  );
  repairButton.disabled = !canRepair;
  const lootButton = document.querySelector("#loot-button");
  const nearBody = findLoot(selectedOperators(), state.drops);
  const bodies = state.drops.length;
  updateVehicleButton();
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
    ? `${unit.definition.name} · integrity ${unit.health}/${maxHealth(unit)}` +
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
