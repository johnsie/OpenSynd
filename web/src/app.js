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
  isTrain,
  isVehicle,
  leaveVehicle,
  newVehicleState,
  settleTrain,
  signalAt,
  startTrain,
  trainCars,
  vehicleDefinition,
} from "./vehicles.js";
import { createOverlay, createTileSprites } from "./textures.js";
import { renderWorldMap } from "./worldmap.js";
import { continueNote, continueTarget } from "./menu.js";
import {
  announceProp as coreAnnounceProp,
  breakWindowAt as coreBreakWindowAt,
  collectFallenGear as coreCollectFallenGear,
  completeObjectivesAt as coreCompleteObjectivesAt,
  countDisabled as coreCountDisabled,
  handleCombatEvents as coreHandleCombatEvents,
  knockBack as coreKnockBack,
  lootNow as coreLootNow,
  syncWorldGates,
} from "./core/step.js";
import { applyCommand } from "./core/apply.js";
import { applyServerMessage, equipmentLookup, orientPlayerUnits } from "./core/sync.js";
import { createOnlinePlay } from "./online-play.js";
import { createWorld } from "./core/create.js";
import { commands } from "./commands.js";
import {
  interactionCandidate as coreInteractionCandidate,
  isAttackable,
  isBusy as coreIsBusy,
  isFollowable,
  orderMove as coreOrderMove,
  vehicleCandidate as coreVehicleCandidate,
} from "./core/orders.js";
import { stepWorld } from "./core/world.js";
import { markerFor } from "./minimap.js";
import { VARIANT_LABELS, operationPath, territoryAlert, variantFor } from "./operations.js";
import { createTutorial, currentStep, observeTutorial, pointerFor, skipStep, tutorialProgress } from "./tutorial.js";
import { DRUG_HINTS, DRUG_LABELS, DRUG_NAMES, adrenalineSpeed, advanceDrugs, drugMultiplier, newDrugs, setDrug } from "./drugs.js";
import { advanceProps, damageProp, newProp, propsNear } from "./props.js";
import {
  FENCE_SURFACE,
  WALL_SURFACE,
  drawBeacon,
  drawTrain,
  drawScenery,
  drawSignal,
  drawConsole,
  drawFenceTile,
  drawPylonTile,
  drawPipeTile,
  drawGateTile,
  drawRelay,
  drawVehicle,
  drawServer,
  drawWallTile,
} from "./structures.js";
import { deathKind, deathLook } from "./death.js";
import { applyTranslations, pickLanguage } from "./i18n.js";
import { CHECK_SECONDS, canApplyQuietly, releaseBase, watchForUpdates } from "./update.js";
import { windowKey, windowShot, windowsInBlast } from "./windows.js";
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
  researchCatalog,
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
  cleanCompanyName,
  companyFromAccount,
  defendInCampaign,
  setCompany,
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
  partResearchItems,
  tierUnlocked,
} from "./upgrades.js";
import { newStats } from "./opstats.js";
import {
  distanceBetween,
  clearWeaponForAll,
  collectFallen,
  dropItem,
  findLoot,
  freeSlots,
  pickLooter,
  makeDrop,
  inLootReach,
  lootBody,
  lootableAt,
  lootableBody,
  nearestLootable,
  raiseWeapon,
  selectWeaponForAll,
  setPersuader,
} from "./inventory.js";
import {
  advanceCombat,
  advancePursuit,
  advanceTails,
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
  investigateNoise,
  worldChance,
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
  clearGameStorage,
  COMPANY_KEY,
} from "./progress.js";
import { createMusic } from "./music.js";
import { createAudio, setVictoryTheme, shotCue, shotVolume } from "./audio.js";
import { comeBack, signInAddress } from "./outiva-signin.js";
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
const menuDialog = document.querySelector("#menu-dialog");
const companyDialog = document.querySelector("#company-dialog");
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
// Chance for how things look only (the spin of a puff of smoke). It never affects a result, so it is not seeded; anything that does
// affect a result uses the simulation's seeded streams instead, so a recorded operation replays the same everywhere.
const visualChance = Math.random;
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

// Everything the game loads (content, art, music) comes from the folder this code came from, so a running game stays on its own
// release while the site moves on to a newer one (see update.js).
const BASE = releaseBase(import.meta.url);
const assetUrl = (path) => new URL(path, BASE).href;

const music = createMusic({
  getSettings: () => settings,
  AudioContextClass: window.AudioContext ?? window.webkitAudioContext,
  trackUrl: assetUrl("assets/music/the-core.mp3"),
  alertTrackUrl: assetUrl("assets/music/electric-stream.mp3"),
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
  setVictoryTheme(settings.victoryTheme);
  applyLanguage();
  music.refresh();
  applyTextScale();
}

// The language of the fixed interface: the chosen one, or the browser's own if it is one we have.
function applyLanguage() {
  const language = settings.language === "auto" ? pickLanguage(navigator.languages ?? [navigator.language]) : settings.language;
  applyTranslations(document, language);
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
  victoryTheme: document.querySelector("#setting-victory"),
  spoken: document.querySelector("#setting-spoken"),
  language: document.querySelector("#setting-language"),
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
  settingControls.victoryTheme.value = settings.victoryTheme;
  settingControls.spoken.checked = settings.spoken;
  settingControls.language.value = settings.language;
  settingControls.captions.checked = settings.captions;
  settingControls.edgeScroll.checked = settings.edgeScroll;
  settingControls.reducedMotion.value = settings.reducedMotion;
  settingControls.textScale.value = settings.textScale;
  settingsDialog.showModal();
}

document.querySelector("#setting-victory-play").addEventListener("click", () => {
  setVictoryTheme(settings.victoryTheme);
  audio.play("victory");
});
document.querySelector("#settings-button").addEventListener("click", showSettings);
document.querySelector("#close-settings").addEventListener("click", () => settingsDialog.close());
document.querySelector("#settings-form").addEventListener("input", () => {
  updateSettings({
    volume: Number(settingControls.volume.value),
    muted: settingControls.muted.checked,
    music: settingControls.music.checked,
    musicVolume: Number(settingControls.musicVolume.value),
    victoryTheme: settingControls.victoryTheme.value,
    spoken: settingControls.spoken.checked,
    language: settingControls.language.value,
    captions: settingControls.captions.checked,
    edgeScroll: settingControls.edgeScroll.checked,
    reducedMotion: settingControls.reducedMotion.value,
    textScale: Number(settingControls.textScale.value),
  });
});
applyTextScale();
setVictoryTheme(settings.victoryTheme);
applyLanguage();

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
            image.src = assetUrl(`assets/sprites/${sheet.file}`);
          }),
      ),
    );
    sprites.manifest = manifest;
  } catch {
    sprites.manifest = null;
  }
}

const state = {
  targeted: {},
  armoury: { operator: 0, slot: 0, selected: [] },
  campaign: emptyCampaign(),
  options: { instantMoves: reduceMotion }, // a player who asked for reduced motion has routes completed at once
  catalog: [],
  opStats: newStats(0),
  shownFunds: -1,
  campaignTimer: 0,
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
  const response = await fetch(assetUrl(path));
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

// `options.variant` forces which of the territory's operations to load ("uprising", "defence", or null for the main one); left out,
// the territory's state decides (a revolt gets the uprising, a takeover attempt the defence).
async function loadGame(index = state.missionIndex, options = {}) {
  await loadSprites();
  const pack = await readJson("content/pack.json");
  const tutorialRun = Boolean(state.tutorial); // the training operation sits outside the campaign's list
  const remote = options.remote ?? null; // an operation the server is running: built here the same way, then kept up to date by it
  if (pack.territories && !state.territories) state.territories = (await readJson(`content/${pack.territories}`)).territories;
  let missionPath = tutorialRun ? pack.tutorial : remote ? remote.mission : pack.missions[index];
  let variant = remote ? (remote.variant ?? null) : null;
  state.territoryId = null;
  if (!tutorialRun && !remote) {
    const main = await readJson(`content/${missionPath}`);
    state.territoryId = main.id;
    const known = state.campaignLoaded ? state.campaign : parseCampaign(readStored(CAMPAIGN_KEY));
    const wanted = options.variant === undefined ? variantFor(known.territories[main.id]) : options.variant;
    const path = operationPath(state.territories?.find((territory) => territory.mission === missionPath), wanted);
    if (wanted && path) {
      variant = wanted;
      missionPath = path;
    }
  }
  state.variant = variant;
  const rawMission = remote?.data ?? (await readJson(`content/${missionPath}`)); // a raid is made on the spot and sent whole
  // The squad is chosen from the roster: its members take the mission's starting places in order.
  state.rawTeam = rawMission.team;
  const mission = remote?.variant === "war" ? rawMission : { ...rawMission, team: squadTeam(rawMission.team) };
  const baseMap = await readJson(`content/${mission.map}`);
  // An operation may add zones of its own to its map's (the landing area an uprising or defence falls back to).
  const map = mission.zones?.length ? { ...baseMap, zones: [...baseMap.zones, ...mission.zones] } : baseMap;
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
    // The company name outlives the campaign (a new game, a damaged save): it is kept on its own.
    if (!state.campaign.company) state.campaign = setCompany(state.campaign, readStored(COMPANY_KEY) ?? "");
    state.campaignLoaded = true;
  }
  const definitionsById = new Map(state.catalog.map((definition) => [definition.id, definition]));
  updateFundsReadout();

  // The operation itself is made by the game core, the same way a server would make it; the page adds what it needs to draw it.
  const world = createWorld({
    mission,
    map,
    content: { units: unitDefinitions, vehicles: vehicleDefinitions, equipment: equipmentDefinitions },
    campaign: state.campaign,
    seed: remote ? remote.seed : 1,
    options: { instantMoves: reduceMotion && !remote, harmless: tutorialRun },
  });
  Object.assign(state, world);
  if (remote) {
    applyServerMessage(state, remote, equipmentLookup(equipmentDefinitions));
    const owners = {};
    for (const member of remote.team ?? []) for (const id of member.squad) owners[id] = member.name;
    const mine = remote.team?.find((member) => member.squad.some((id) => remote.squad.includes(id)));
    state.online = {
      room: remote.room,
      squad: remote.squad,
      mode: options.mode ?? "solo",
      owners,
      team: remote.team ?? [],
      coalition: mine?.coalition ?? null,
    };
    orientPlayerUnits(state, state.online.coalition);
  }
  markRailBridges(map, state.grid);
  state.deathsSeeded = false;
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
  state.fundsAtStart = state.campaign.funds;
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
          path,
          name: entry.name,
          owner: state.territories?.find((territory) => territory.mission === path)?.owner ?? "A rival company",
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
  if (tutorialRun) {
    state.tutorial = createTutorial();
    state.tutorialFlags = { looted: false, queued: false };
    renderTutorial();
  }
  describeMission(mission, map, index);
  renderMissionList();
  setStatus("Local map established. Select a relay route.");
  updateLoadButton();
  renderInterface();
}

// How far a door has slid open (0 to 1): it moves toward its state over a quarter of a second, so it opens and shuts in view.
const DOOR_SLIDE_SECONDS = 0.25;
const doorSlides = new Map();
function doorSlide(tile) {
  const now = performance.now();
  const target = tile.door.open ? 1 : 0;
  const slide = doorSlides.get(tile) ?? { value: target, time: now };
  if (reduceMotion) slide.value = target;
  const step = (now - slide.time) / 1000 / DOOR_SLIDE_SECONDS;
  slide.value = target > slide.value ? Math.min(target, slide.value + step) : Math.max(target, slide.value - step);
  slide.time = now;
  doorSlides.set(tile, slide);
  return slide.value;
}

function syncGates() {
  syncWorldGates(state, worldHooks);
}

// Show the loaded mission's name and story wherever the page mentions it.
function describeMission(mission, map, index) {
  const number = String(index + 1).padStart(2, "0");
  const kind = state.variant ? ` · ${VARIANT_LABELS[state.variant]}` : "";
  const label = state.tutorial ? "TRAINING" : state.online ? "ONLINE" : `OPERATION ${number}${kind}`;
  document.querySelector("#operation-eyebrow").textContent = label;
  document.querySelector("#operation-title").textContent = mission.name;
  document.querySelector("#brief-title").textContent = mission.name;
  document.querySelector("#title-heading").textContent = `NeuroReign: ${mission.name}`;
  document.querySelector("#title-story").textContent = mission.story ?? mission.briefing;
  document.title = `NeuroReign — ${mission.name}`;
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
      const locked = tier < MAX_TIER && !tierUnlocked(campaign.items, part, tier + 1);
      fit.textContent = tier >= MAX_TIER
        ? "Fully upgraded"
        : locked ? `Tier ${tier + 1} needs research` : `Fit tier ${tier + 1} · ${upgradePrice(part, tier + 1)} funds`;
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

  renderResearchDial("#research-dial", false);
  renderResearchDial("#parts-dial", true);
  document.querySelector("#research-items").replaceChildren(
    ...state.catalog.filter((item) => !item.missionItem).map((item) => researchRow(item)),
  );
  document.querySelector("#parts-items").replaceChildren(...partResearchItems().map((item) => researchRow(item)));

  renderRoster();
  renderArmoury();
}

// One line of the research lists: the item's name, its progress and what can be done with it (start, pause, resume).
function researchRow(item) {
  const campaign = state.campaign;
  const row = document.createElement("div");
  row.className = "research-row";
  const name = document.createElement("span");
  name.textContent = item.name;
  const control = document.createElement("span");
  const researching = (item.researchCost ?? 0) > 0 && !isItemAvailable(campaign, item);
  if (researching) {
    const catalog = researchCatalog(state.catalog);
    const blockers = researchBlockers(campaign, item, state.catalog);
    const percent = Math.round(campaign.research.progress[item.id] ?? 0);
    const active = campaign.research.active.some((entry) => entry.id === item.id);
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
      const needed = blockers.map((id) => catalog.find((entry) => entry.id === id)?.name ?? id);
      button.textContent = `Needs ${needed.join(", ")}`;
      button.disabled = true;
    } else if (active) {
      button.textContent = "Researching · pause";
      button.setAttribute("aria-label", `Pause research on ${item.name}`);
      button.addEventListener("click", () => {
        state.campaign = suspendResearch(state.campaign, item.id);
        persistCampaign();
        renderResearch();
      });
    } else {
      button.textContent = percent > 0 ? "Resume" : `Research · ${item.researchCost} funds a day`;
      button.setAttribute("aria-label", `Research ${item.name}, ${item.researchCost} funds a day at the lowest funding level`);
      button.addEventListener("click", () => {
        state.campaign = startResearch(state.campaign, item, state.catalog);
        persistCampaign();
        renderResearch();
      });
    }
    control.append(button);
  } else {
    control.className = "state";
    control.textContent = item.kind === "part" ? "RESEARCHED" : researchStatus(item);
  }
  row.title = item.description;
  row.append(name, control);
  return row;
}

// The funding dials for the research under way: several can run at once, each with ten levels (faster and dearer) and its
// own projected finish.
function renderResearchDial(selector, parts) {
  const dial = document.querySelector(selector);
  const { active, progress } = state.campaign.research;
  const catalog = researchCatalog(state.catalog);
  const rows = active
    .map((entry) => ({ entry, item: catalog.find((candidate) => candidate.id === entry.id) }))
    .filter(({ item }) => item && (item.kind === "part") === parts);
  if (rows.length === 0) {
    dial.textContent =
      "Nothing is being researched. Choose items below (several at once if you like); it runs while operations are under way.";
    return;
  }
  dial.replaceChildren(
    ...rows.map(({ entry, item }) => {
      const row = document.createElement("div");
      row.className = "dial-row";
      const label = document.createElement("label");
      label.textContent = `Funding for ${item.name}: level `;
      const range = document.createElement("input");
      range.type = "range";
      range.min = "1";
      range.max = String(RESEARCH_LEVELS);
      range.value = String(entry.level);
      range.setAttribute("aria-label", `Research funding level for ${item.name}, 1 to ${RESEARCH_LEVELS}`);
      const summary = document.createElement("span");
      const describe = (chosen) => {
        const hours = researchHoursLeft(progress[item.id] ?? 0, chosen);
        summary.textContent =
          ` ${chosen} · ${RESEARCH_RATES[chosen - 1]}% an hour · ${researchHourlyCost(item, chosen).toFixed(1)} funds an hour · ` +
          `about ${hours} game hours (${(hours / 24).toFixed(1)} days) to go`;
      };
      describe(entry.level);
      range.addEventListener("input", () => describe(Number(range.value)));
      range.addEventListener("change", () => {
        state.campaign = setResearchLevel(state.campaign, Number(range.value), item.id);
        persistCampaign();
        renderResearch();
      });
      label.append(range);
      row.append(label, summary);
      return row;
    }),
  );
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
    const buyable = targets.filter((target) =>
      canBuy(campaign, target.id, choice.slot, item, state.catalog, defaultsFor(target)));
    const net = netCost(campaign, placement.id, choice.slot, item, state.catalog, defaults);
    if (targets.length > 1) {
      const total = buyable.reduce(
        (sum, target) => sum + netCost(campaign, target.id, choice.slot, item, state.catalog, defaultsFor(target)),
        0,
      );
      buy.textContent = `Buy for ${targets.length} · ${total} funds`;
      buy.setAttribute("aria-label", `Buy ${item.name} for ${targets.length} operators, ${total} funds`);
    } else {
      buy.textContent = `Buy · ${net} funds`;
      buy.setAttribute(
        "aria-label",
        `Buy ${item.name} for Operator ${choice.operator + 1} slot ${choice.slot + 1}, ${net} funds`,
      );
    }
    buy.disabled = !available || buyable.length === 0;
    buy.addEventListener("click", () => {
      // Each picked operative gets it in the first free slot; full or unaffordable operatives are left out.
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
// Before an operation starts, what was bought, fitted or changed in the squad has to be on the operatives when it begins:
// the operation is set up again from the saved loadouts.
researchDialog.addEventListener("close", () => {
  if (titleDialog.open && state.missionList?.length) loadGame(state.missionIndex).catch(showFatalError);
});

const confirmDialog = document.querySelector("#confirm-dialog");

// An in-page confirmation (native confirm() blocks and cannot be styled or tested reliably).
function confirmLeave(message, { heading = "Leave this operation?", accept = "Leave operation", cancel = "Keep playing" } = {}) {
  document.querySelector("#confirm-text").textContent = message;
  document.querySelector("#confirm-heading").textContent = heading;
  document.querySelector("#confirm-accept").textContent = accept;
  document.querySelector("#confirm-cancel").textContent = cancel;
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
  const alert = territoryAlert(territory, dayOf(state.campaign), entry.owner);
  const title = document.createElement("p");
  title.textContent = `${entry.name}: ${people} · ` + (alert ? alert.label : held ? "held" : "not yet taken");
  const alertLine = document.createElement("p");
  alertLine.className = "mood bad";
  alertLine.hidden = !alert;
  alertLine.textContent = alert?.detail ?? "";
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
  panel.replaceChildren(title, ...(alert ? [alertLine] : []), taxRow, mood, survey, ...lines);
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
    alerts: Object.fromEntries(
      state.missionList
        .map((entry) => [entry.id, territoryAlert(state.campaign.territories[entry.id], dayOf(state.campaign), entry.owner)])
        .filter(([, alert]) => alert),
    ),
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
      const alert = territoryAlert(state.campaign.territories[entry.id], dayOf(state.campaign), entry.owner);
      status.textContent = alert ? alert.label : done ? "COMPLETED" : unlocked ? "AVAILABLE" : "LOCKED";
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
    if (isTrain(unit)) settleTrain(unit);
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

// The railway's supports: not a solid wall but scaffolding, steel posts at the corners and crossed braces between them, with the
// ground showing through, and a thin deck under the rails.
function drawScaffold(top, base, cellSize, tile) {
  const halfW = cellSize.width / 2;
  const halfH = cellSize.height / 2;
  const drop = base.y - top.y;
  const corners = [
    [top.x - halfW, top.y, base.x - halfW, base.y],
    [top.x, top.y + halfH, base.x, base.y + halfH],
    [top.x + halfW, top.y, base.x + halfW, base.y],
  ];
  // The shadow of the deck on the ground below.
  context.fillStyle = "rgba(0, 0, 0, .22)";
  context.beginPath();
  context.moveTo(base.x, base.y - halfH);
  context.lineTo(base.x + halfW, base.y);
  context.lineTo(base.x, base.y + halfH);
  context.lineTo(base.x - halfW, base.y);
  context.closePath();
  context.fill();
  context.lineCap = "round";
  // Crossed braces on the two faces that face the camera.
  context.strokeStyle = "rgba(140, 156, 168, .55)";
  context.lineWidth = 1.5;
  context.beginPath();
  for (const [from, to] of [[corners[0], corners[1]], [corners[1], corners[2]]]) {
    context.moveTo(from[0], from[1] + drop * 0.08);
    context.lineTo(to[2], to[3] - drop * 0.06);
    context.moveTo(to[0], to[1] + drop * 0.08);
    context.lineTo(from[2], from[3] - drop * 0.06);
  }
  // A cross beam part of the way down.
  const midY = drop * 0.5;
  context.moveTo(corners[0][0], corners[0][1] + midY);
  context.lineTo(corners[1][0], corners[1][1] + midY);
  context.lineTo(corners[2][0], corners[2][1] + midY);
  context.stroke();
  // The posts at the three corners, the nearest the thickest.
  context.strokeStyle = "#7d8a95";
  corners.forEach(([x0, y0, x1, y1], index) => {
    context.lineWidth = index === 1 ? 3.5 : 2.5;
    context.beginPath();
    context.moveTo(x0, y0);
    context.lineTo(x1, y1);
    context.stroke();
  });
  // The thin deck edge under the rails.
  context.strokeStyle = shade(tile.color, -10);
  context.lineWidth = 3;
  context.beginPath();
  context.moveTo(corners[0][0], corners[0][1] + 1);
  context.lineTo(corners[1][0], corners[1][1] + 1);
  context.lineTo(corners[2][0], corners[2][1] + 1);
  context.stroke();
  context.lineCap = "butt";
}

// Where a street runs under the railway, the track carries on over it: the street tile stays a street (people and cars pass
// underneath) and is marked with the height of the viaduct, so its track and scaffolding are drawn over it.
function markRailBridges(map, grid) {
  const lines = (map.regions ?? []).filter((region) => region.surface === "rail").sort((a, b) => a.y - b.y || a.x - b.x);
  for (let index = 0; index + 1 < lines.length; index += 1) {
    const here = lines[index];
    const next = lines[index + 1];
    if (here.y !== next.y || next.x - (here.x + here.width) > 8) continue;
    for (let x = here.x + here.width; x < next.x; x += 1) {
      const tile = grid[here.y]?.[x];
      if (tile) tile.railOver = { height: here.elevation, first: x === here.x + here.width, last: x === next.x - 1 };
    }
  }
}

// The track over a street is a bridge: the deck and a steel truss under it span the street, and the posts stand only at the two
// kerbs, so cars and people pass through freely underneath.
function drawRailOver(tile, cellSize, origin) {
  const { height, first, last } = tile.railOver;
  const base = gridToScreen(tile, cellSize, origin, 0);
  const top = { x: base.x, y: base.y - height * cellSize.height * 0.28 };
  const deck = { ...tile, surface: "rail", color: "#3a3f44", elevation: height };
  const halfW = cellSize.width / 2;
  const halfH = cellSize.height / 2;
  const truss = cellSize.height * 0.55;
  context.lineCap = "round";
  // The truss under the deck on the two faces that face the camera: a lower chord and crossing diagonals.
  const nodes = [[top.x - halfW, top.y], [top.x, top.y + halfH], [top.x + halfW, top.y]];
  context.strokeStyle = "rgba(140, 156, 168, .85)";
  context.lineWidth = 1.6;
  context.beginPath();
  for (let face = 0; face < 2; face += 1) {
    const [x0, y0] = nodes[face];
    const [x1, y1] = nodes[face + 1];
    const mx = (x0 + x1) / 2;
    const my = (y0 + y1) / 2 + truss;
    context.moveTo(x0, y0 + 2);
    context.lineTo(mx, my);
    context.lineTo(x1, y1 + 2);
    context.moveTo(x0, y0 + truss * 0.45);
    context.lineTo(x1, y1 + truss * 0.45);
    context.moveTo(mx, (y0 + y1) / 2 + 2);
    context.lineTo(mx, my);
  }
  context.stroke();
  // Posts at the kerbs only: the west edge of the first tile, the east edge of the last.
  context.strokeStyle = "#7d8a95";
  context.lineWidth = 3;
  const down = base.y - top.y;
  const posts = [];
  if (first) posts.push([top.x - halfW, top.y], [top.x, top.y - halfH]);
  if (last) posts.push([top.x, top.y + halfH], [top.x + halfW, top.y]);
  context.beginPath();
  for (const [x, y] of posts) {
    context.moveTo(x, y);
    context.lineTo(x, y + down);
  }
  context.stroke();
  context.lineCap = "butt";
  const { image, offsetX, offsetY } = tileSprites(deck, cellSize.width, cellSize.height);
  context.drawImage(image, top.x + offsetX, top.y + offsetY);
}

function drawTile(tile, viewport) {
  const { cellSize, origin } = viewport;
  const prop = tile.surface === FENCE_SURFACE || tile.surface === WALL_SURFACE;
  const elevation = prop ? 0 : tile.elevation;
  const elevationHeight = elevation * cellSize.height * 0.28;
  const baseCenter = gridToScreen(tile, cellSize, origin, 0);
  const topCenter = { x: baseCenter.x, y: baseCenter.y - elevationHeight };

  if (elevationHeight > 0 && (tile.surface === "rail" || tile.surface === "platform")) {
    drawScaffold(topCenter, baseCenter, cellSize, tile);
  } else if (elevationHeight > 0) {
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
    const slide = tile.door ? doorSlide(tile) : tile.walkable;
    drawGateTile(context, project, { ...tile, gateAlong }, cellSize.height, slide, performance.now());
    return;
  }
  if (tile.surface === FENCE_SURFACE) drawFenceTile(context, project, tile, cellSize.height);
  else if (tile.surface === WALL_SURFACE) drawWallTile(context, project, tile, cellSize.height, shade(tile.color, 0));
  else if (tile.surface === "pylon") drawPylonTile(context, project, tile, cellSize.height);
  else if (tile.surface === "pipe") drawPipeTile(context, project, tile, cellSize.height);
  else drawRoad(tile, topCenter, cellSize);
  if (tile.railOver) drawRailOver(tile, cellSize, origin);
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
    const smashed = [];
    for (let floor = 1; floor < floors; floor += 1) {
      for (let bay = 0; bay < bays; bay += 1) {
        const u0 = (bay + 0.22) / bays;
        const u1 = (bay + 0.78) / bays;
        const z0 = floor * floorHeight + floorHeight * 0.18;
        const z1 = floor * floorHeight + floorHeight * 0.74;
        const pane = strip(wall, u0, u1, z0, z1);
        if (state.windowsBroken.has(windowKey(building.id, index, floor, bay))) smashed.push(pane);
        else (random() < style.lit * 0.6 ? lit : glass).push(pane);
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
    fillAll(smashed, "#07090b");
    // A pair of doors at street level with a lamp on a bracket over them, so a building looks used (the entrances you can walk into are
    // real doors in the map; these are the way in for people who are not there).
    if (across >= 5) {
      const doorBay = Math.floor(random() * bays);
      const centre = (doorBay + 0.5) / bays;
      const half = Math.min(0.1, 0.8 / across);
      const leaf = (a, b) => strip(wall, a, b, floorHeight * 0.02, floorHeight * 0.8);
      context.fillStyle = "#0c0f12";
      quad(leaf(centre - half, centre + half));
      context.fill();
      context.strokeStyle = "rgba(230, 215, 170, .55)";
      context.lineWidth = 1;
      quad(leaf(centre - half, centre + half));
      context.stroke();
      const seam = [onWall(wall.from, wall.to, centre, floorHeight * 0.02), onWall(wall.from, wall.to, centre, floorHeight * 0.8)];
      context.beginPath();
      context.moveTo(seam[0].x, seam[0].y);
      context.lineTo(seam[1].x, seam[1].y);
      context.stroke();
      const lamp = onWall(wall.from, wall.to, centre, floorHeight * 0.95);
      const glow = context.createRadialGradient(lamp.x, lamp.y, 0, lamp.x, lamp.y, cellSize.height * 0.9);
      glow.addColorStop(0, "rgba(255, 238, 180, .42)");
      glow.addColorStop(1, "rgba(255, 238, 180, 0)");
      context.fillStyle = glow;
      context.fillRect(lamp.x - cellSize.height, lamp.y - cellSize.height, cellSize.height * 2, cellSize.height * 2);
      context.fillStyle = "#fff3c4";
      context.fillRect(lamp.x - 4, lamp.y - 1, 8, 3);
    }
    context.strokeStyle = "rgba(200, 220, 230, .55)";
    context.lineWidth = 1;
    context.beginPath();
    for (const [a, b, c, d] of smashed) {
      context.moveTo(a.x, a.y);
      context.lineTo((c.x + d.x) / 2, (c.y + d.y) / 2);
      context.moveTo(b.x, b.y);
      context.lineTo((a.x + d.x) / 2, (a.y + d.y) / 2);
      context.moveTo(c.x, c.y);
      context.lineTo((a.x + b.x) / 2, (a.y + b.y) / 2);
    }
    context.stroke();
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

// A label over the square an open "hold" objective is played in, drawn over everything so it can always be found: how long is
// left, a progress bar, and whether to step in.
// In the tutorial, a bouncing arrow over everything the current step wants clicked or walked to (the inventory and roster ones
// are page elements: see markTutorialTargets).
function drawTutorialPointer(viewport) {
  if (!state.tutorial) return;
  const { cellSize, origin } = viewport;
  const bounce = reduceMotion ? 0 : Math.abs(Math.sin(state.elapsed * 4)) * 10;
  for (const point of pointerFor(state.tutorial, seeTutorial())) {
    let position = null;
    if (point.unit) position = state.units.find((item) => item.id === point.unit)?.position;
    else if (point.zone) position = zoneCentre(point.zone);
    else if (point.tile) position = point.tile;
    if (!position) continue;
    const tile = state.grid[Math.round(position.y)]?.[Math.round(position.x)];
    const spot = gridToScreen(position, cellSize, origin, tile?.elevation ?? 0);
    const x = spot.x;
    const y = spot.y - (point.unit ? cellSize.height * 2.6 : cellSize.height * 1.2) - bounce;
    context.save();
    context.fillStyle = "#ffd166";
    context.strokeStyle = "rgba(0, 0, 0, 0.85)";
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x - 11, y - 18);
    context.lineTo(x - 4, y - 18);
    context.lineTo(x - 4, y - 32);
    context.lineTo(x + 4, y - 32);
    context.lineTo(x + 4, y - 18);
    context.lineTo(x + 11, y - 18);
    context.closePath();
    context.fill();
    context.stroke();
    context.restore();
  }
}

// The same arrows for what is on the page: an operator's card, an inventory square. The class is put back after every redraw.
function markTutorialTargets() {
  for (const element of document.querySelectorAll(".tutorial-point")) element.classList.remove("tutorial-point");
  if (!state.tutorial || !state.mission) return;
  for (const point of pointerFor(state.tutorial, seeTutorial())) {
    if (point.roster) {
      document.querySelector(`.roster-item[data-unit="${point.roster}"] .roster-select`)?.classList.add("tutorial-point");
    } else if (point.button) {
      document.querySelector(point.button)?.classList.add("tutorial-point");
    } else if (point.slotAction) {
      for (const slot of document.querySelectorAll(`.slot[data-action="${point.slotAction}"]`)) slot.classList.add("tutorial-point");
    }
  }
}

function drawHoldLabels(viewport) {
  const { cellSize, origin } = viewport;
  for (const objective of state.objectives) {
    if (objective.type !== "hold" || objective.complete) continue;
    const zone = state.map.zones.find((item) => item.id === objective.targetZone);
    if (!zone) continue;
    const progress = objective.progress ?? 0;
    const tile = state.grid[zone.position.y]?.[zone.position.x];
    const centre = gridToScreen(
      { x: zone.position.x + (zone.width - 1) / 2, y: zone.position.y + (zone.height - 1) / 2 },
      cellSize,
      origin,
      tile?.elevation ?? 0,
    );
    const width = Math.max(110, cellSize.width * 1.8);
    const top = centre.y - cellSize.height * 2.2;
    const pulse = reduceMotion ? 1 : 0.75 + 0.25 * Math.sin(state.elapsed * 5);
    context.fillStyle = `rgba(10, 18, 22, ${0.85})`;
    context.fillRect(centre.x - width / 2, top - 22, width, 36);
    context.strokeStyle = `rgba(225, 179, 90, ${pulse})`;
    context.lineWidth = 2;
    context.strokeRect(centre.x - width / 2, top - 22, width, 36);
    context.font = "700 12px ui-sans-serif, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "alphabetic";
    context.fillStyle = "#f3d9a0";
    context.fillText(progress > 0 ? `HOLD  ${Math.floor(progress)} / ${objective.holdSeconds} s` : "HOLD THIS SQUARE", centre.x, top - 7);
    context.fillStyle = "rgba(255, 255, 255, .15)";
    context.fillRect(centre.x - width / 2 + 6, top, width - 12, 6);
    context.fillStyle = "#79d59b";
    context.fillRect(centre.x - width / 2 + 6, top, (width - 12) * Math.min(1, progress / objective.holdSeconds), 6);
    // A line down to the square itself.
    context.strokeStyle = `rgba(225, 179, 90, .6)`;
    context.beginPath();
    context.moveTo(centre.x, top + 14);
    context.lineTo(centre.x, centre.y);
    context.stroke();
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
  // Someone who has fallen is not holding a weapon (it lies with the rest of their gear).
  if (unit.disabled) return sheets[key] || null;
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
  context.globalAlpha *= unit.lookAlpha ?? (unit.disabled ? 0.55 : 1);
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

// Flames while burning (a living unit on fire too), the rising smoke of a smouldering body and the flash of a laser death.
function drawDeathEffects(unit, dying, size) {
  const flames = dying ? dying.flames : unit.burning ? 0.8 : 0;
  if (flames > 0) {
    const low = dying && dying.fall > 0;
    for (let tongue = 0; tongue < 4; tongue += 1) {
      const sway = reduceMotion ? 0 : Math.sin(state.elapsed * 14 + tongue * 1.7);
      const lift = size * (low ? 0.2 : 0.4 + tongue * 0.45) + (reduceMotion ? 0 : Math.abs(sway) * size * 0.3);
      context.fillStyle = `rgba(${255 - tongue * 12}, ${130 + tongue * 40}, 50, ${0.8 * flames})`;
      context.beginPath();
      context.ellipse((tongue - 1.5) * size * 0.4 + sway * size * 0.15, size * 0.8 - lift, size * 0.28, size * 0.5, 0, 0, Math.PI * 2);
      context.fill();
    }
  }
  if (dying && dying.smoke > 0) {
    for (let puff = 0; puff < 3; puff += 1) {
      const rise = reduceMotion ? 0.5 : (state.elapsed * 0.5 + puff / 3) % 1;
      context.fillStyle = `rgba(70, 72, 76, ${0.45 * dying.smoke * (1 - rise)})`;
      context.beginPath();
      context.arc(Math.sin(puff * 2 + rise * 3) * size * 0.4, size * 0.6 - rise * size * 3, size * (0.3 + rise * 0.5), 0, Math.PI * 2);
      context.fill();
    }
  }
  if (dying && dying.flash > 0) {
    context.fillStyle = `rgba(210, 250, 255, ${0.8 * dying.flash})`;
    context.beginPath();
    context.ellipse(0, -size * 0.3, size * (0.8 + (1 - dying.flash)), size * 2.2 * dying.flash + size * 0.4, 0, 0, Math.PI * 2);
    context.fill();
  }
}

// What a laser leaves of one of ours: a scorch mark on the ground.
function drawScorch(center, size) {
  context.fillStyle = "rgba(10, 10, 12, .55)";
  context.beginPath();
  context.ellipse(center.x, center.y, size * 1.1, size * 0.45, 0, 0, Math.PI * 2);
  context.fill();
}

// How large a person is drawn against the tile (and against vehicles and buildings): the sprites are scaled down from their frames.
const UNIT_SCALE = 0.72;

// Operatives inside a car are not drawn, so their numbers (the same gold as above anyone on foot) ride above it, in order.
function drawRiderNumbers(vehicle, viewport) {
  const riders = state.units
    .filter((unit) => unit.inVehicle === vehicle.id && unit.number)
    .sort((left, right) => left.number - right.number);
  if (riders.length === 0) return;
  const { cellSize, origin } = viewport;
  const tile = state.grid[Math.round(vehicle.position.y)]?.[Math.round(vehicle.position.x)];
  const spot = gridToScreen(vehicle.position, cellSize, origin, tile?.elevation ?? 0);
  const fontSize = Math.max(14, cellSize.height * 0.62);
  const gap = fontSize * 0.95;
  context.save();
  context.font = `800 ${fontSize}px ui-sans-serif, sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "alphabetic";
  context.lineWidth = 4;
  riders.forEach((rider, index) => {
    const x = spot.x + (index - (riders.length - 1) / 2) * gap;
    const y = spot.y - cellSize.height * 1.5;
    context.strokeStyle = "rgba(0, 0, 0, .9)";
    context.strokeText(String(rider.number), x, y);
    context.fillStyle = rider.disabled ? "rgba(225, 179, 90, .45)" : "#f2c14e";
    context.fillText(String(rider.number), x, y);
  });
  context.restore();
}

function drawUnit(unit, viewport) {
  if (unit.escaped) return;
  if (unit.inVehicle) return;
  if (isTrain(unit)) {
    const project = propProjector(viewport, unit.vehicle.train?.elevation ?? 0);
    drawTrain(context, project, unit, trainCars(unit), viewport.cellSize.height, performance.now());
    return;
  }
  if (isVehicle(unit)) {
    const controlled = Boolean(unit.vehicle.controlledBy) && state.selectedIds.includes(unit.vehicle.controlledBy);
    drawVehicle(context, propProjector(viewport, 0), unit, viewport.cellSize.height, performance.now(), { controlled });
    drawRiderNumbers(unit, viewport);
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
  const kind = unit.disabled ? deathKind(unit) : null;
  const dying = kind ? deathLook(kind, state.elapsed - (unit.diedAt ?? state.elapsed), unit.side === "team") : null;
  if (dying && !dying.drawn) {
    if (dying.ash) drawScorch(center, size);
    return;
  }
  // Someone on fire runs about in a direction of their own until they fall.
  const heading = (unit.id.length * 2.4 + unit.id.charCodeAt(unit.id.length - 1)) % (Math.PI * 2);
  const runBy = (dying?.run ?? 0) * size;
  const runOffset = { x: Math.cos(heading) * runBy * 2.4, y: Math.sin(heading) * runBy * 1.2 };
  unit.lookAlpha = dying ? (dying.fall > 0 || kind === "laser" ? dying.fade * 0.75 : dying.fade) : undefined;

  const bob = spriteSheetFor(unit)
    ? 0
    : walkBob(state.elapsed, unit.path.length > 0 && !unit.disabled, reduceMotion);
  context.save();
  const kick = recoilOffset(state.elapsed, unit.firedAt, unit.facing, 3.5, reduceMotion);
  const thrown = knockbackOffset(state.elapsed, unit.hitAt, unit.hitDirection, size * 0.9, reduceMotion);
  context.translate(center.x + kick.x + thrown.x + runOffset.x, center.y - size * 0.8 + bob + kick.y + thrown.y + runOffset.y);
  // People are drawn smaller than the 128 pixel sprite frames suggest, shrunk about their feet with everything that goes with them.
  context.translate(0, size * 1.05);
  context.scale(UNIT_SCALE, UNIT_SCALE);
  context.translate(0, -size * 1.05);
  context.fillStyle = "rgba(0, 0, 0, .35)";
  context.beginPath();
  context.ellipse(0, size * 1.05, size * 0.9, size * 0.35, 0, 0, Math.PI * 2);
  context.fill();
  if (dying?.blood > 0) {
    // A pool of blood spreads out under the body where they fell (the body lies to the side it fell toward).
    const side = unit.id.length % 2 ? 1 : -1;
    for (const [grow, tone] of [[1, "rgba(110, 10, 16, .95)"], [0.6, "rgba(176, 22, 30, .8)"]]) {
      context.fillStyle = tone;
      context.beginPath();
      const across = size * (0.4 + dying.blood * 1.3) * grow;
      const down = size * (0.18 + dying.blood * 0.5) * grow;
      context.ellipse(side * size * 1.0, size * 1.05, across, down, 0.15 * side, 0, Math.PI * 2);
      context.fill();
    }
  }

  const picked = state.selectedIds.includes(unit.id) && !unit.disabled;
  if (unit.id === state.selectedId || picked) {
    context.strokeStyle = "#42d6d0";
    context.lineWidth = 2;
    context.beginPath();
    context.arc(0, 0, size * 1.35, 0, Math.PI * 2);
    context.stroke();
  }

  const sheet = spriteSheetFor(unit);
  // The body is turned about the feet as it falls, squashed as it is vaporized and darkened once charred.
  context.save();
  if (dying) {
    const feet = size * 1.05;
    context.translate(0, feet);
    context.rotate((dying.fall * Math.PI) / 2 * (unit.id.length % 2 ? 1 : -1));
    context.scale(1, dying.squash);
    context.translate(0, -feet);
    if (dying.charred && "filter" in context) context.filter = "brightness(0.3)";
  }
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

  context.restore();
  drawDeathEffects(unit, dying, size);

  if (unit.number) {
    // The operative's number in gold above their head (dimmer once they are down).
    context.font = `800 ${Math.max(14, size * 1.5) / UNIT_SCALE}px ui-sans-serif, sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "alphabetic";
    context.lineWidth = 4;
    context.strokeStyle = "rgba(0, 0, 0, .9)";
    context.strokeText(String(unit.number), 0, -size * 5.6);
    context.fillStyle = unit.disabled ? "rgba(225, 179, 90, .45)" : "#f2c14e";
    context.fillText(String(unit.number), 0, -size * 5.6);
  }
  if (unit.missionGiver && !unit.disabled) {
    const pulse = reduceMotion ? 1 : 0.82 + 0.18 * Math.sin(state.elapsed * 4);
    const top = -size * 4.1;
    context.font = `900 ${Math.max(18, size * 1.8) / UNIT_SCALE}px ui-sans-serif, sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "alphabetic";
    context.lineWidth = 5;
    context.strokeStyle = "rgba(3, 8, 10, .92)";
    context.strokeText("?", 0, top);
    context.fillStyle = `rgba(225, 179, 90, ${pulse})`;
    context.fillText("?", 0, top);
    context.font = `700 ${Math.max(9, size * 0.72) / UNIT_SCALE}px ui-sans-serif, sans-serif`;
    context.lineWidth = 3;
    context.strokeText(unit.missionGiver.name, 0, top - size * 1.35);
    context.fillStyle = "#f4d18d";
    context.fillText(unit.missionGiver.name, 0, top - size * 1.35);
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
    context.font = `800 ${Math.max(20, size * 2.2) / UNIT_SCALE}px ui-sans-serif, sans-serif`;
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
    context.font = `700 ${Math.max(9, size * 0.7) / UNIT_SCALE}px ui-sans-serif, sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "alphabetic";
    context.strokeStyle = "rgba(0, 0, 0, 0.85)";
    context.lineWidth = 3;
    context.strokeText("TARGET", 0, top - size * 0.4);
    context.fillStyle = "#f6c6ef";
    context.fillText("TARGET", 0, top - size * 0.4);
  }
  if (unit.disabled && unit.side === "team") {
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

  drawBombs(viewport);
  const boxes = new Map();
  const order = drawOrder([...(state.buildings ?? []), ...(state.structures ?? [])], state.units);
  for (const entry of order) {
    if (entry.kind !== "building") drawUnit(entry.item, viewport);
    else if (entry.item.structure) drawStructure(entry.item, viewport);
    else boxes.set(entry.item, drawBuilding(entry.item, viewport, size));
  }
  drawHiddenOperatives(order, boxes, viewport);
  drawPickups(viewport); // over the figures, so gear lying beside someone is never hidden behind them
  drawEffects(viewport);
  drawHoldLabels(viewport);
  drawTutorialPointer(viewport);
  drawMinimap(viewport);
}

const minimap = document.querySelector("#minimap");
const miniContext = minimap.getContext("2d");
// How far from the squad the minimap still shows other people.
const MINI_SIGHT = 16;
const MINI_COLORS = {
  "runoff-channel": "#1f5568",
  "signal-grate": "#7a96a0",
  rail: "#5a5f64",
  "utility-building": "#12171b",
  "service-fence": "#6b7a84",
  "service-wall": "#6b7a84",
  "relay-pad": "#e1b35a",
  lawn: "#2f4d36",
  mud: "#3b4b2e",
  sand: "#8a7550",
  snow: "#aab5bb",
  gravel: "#45484b",
  plaza: "#5a5348",
  kerb: "#6a655a",
  rooftop: "#2c2e2b",
  chevron: "#8a6a2a",
  pylon: "#2a2f33",
  pipe: "#7a4a22",
  scrub: "#6f5a2c",
  "steps-x": "#8a8478",
  "steps-y": "#8a8478",
  dock: "#5a4a38",
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
      Boolean(unit.missionGiver) ||
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
    const marker = markerFor(unit, isVehicle(unit));
    miniContext.fillStyle = unit.missionGiver ? "#e1b35a" : marker.fill;
    if (marker.shape === "dot") {
      miniContext.beginPath();
      miniContext.arc(point.x, point.y, marker.radius, 0, Math.PI * 2);
      miniContext.fill();
      if (marker.centre) {
        miniContext.fillStyle = marker.centre;
        miniContext.beginPath();
        miniContext.arc(point.x, point.y, marker.radius * 0.45, 0, Math.PI * 2);
        miniContext.fill();
      }
    } else {
      const size = marker.size;
      miniContext.fillRect(Math.round(point.x) - Math.floor(size / 2), Math.round(point.y) - Math.floor(size / 2), size, size);
    }
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
    const side = Math.max(20, cellSize.width * 0.4);
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

// The game core reports what happens through these; here they become the status line, sound and effects (see core/hooks.js).
const worldHooks = {
  message: (text) => setStatus(text),
  sound(name, where = {}) {
    const cue = name === "shot" ? shotCue(where.weapon) : name;
    if (!where.at) {
      audio.play(cue);
      return;
    }
    // Sounds further from the view are quieter.
    const away = Math.hypot(where.at.x - state.camera.x, where.at.y - state.camera.y);
    audio.play(cue, { volume: shotVolume(away, Boolean(where.friendly)) });
  },
  effect(kind, data = {}) {
    // How a puff or an impact spins is only for show, so it is not part of the game's own chances.
    addEffect(state.effects, kind, kind === "puff" || kind === "impact" ? { ...data, spin: visualChance() * 3 } : data);
  },
  changed: () => renderInterface(),
  selectionChanged: () => pruneSelection(),
  looted() {
    if (state.tutorialFlags) state.tutorialFlags.looted = true;
  },
  queued() {
    if (state.tutorialFlags) state.tutorialFlags.queued = true;
  },
  penalise(amount) {
    state.campaign = penalise(state.campaign, amount);
    updateFundsReadout();
    persistCampaign();
  },
};

// Throw a unit that was just hit back, away from whoever hit it (drawn only; the unit stays put).
function knockBack(victim, shooter) {
  coreKnockBack(state, victim, shooter);
}

// Keep the record of who has been put out of action, and charge for bystanders.
function countDisabled(down) {
  coreCountDisabled(state, worldHooks, down);
}

// Scenery that caught fire or broke: a puff of debris and a line in the status.
function announceProp(event) {
  coreAnnounceProp(state, worldHooks, event);
}

// A shot that ends against a building's visible wall breaks a window; the noise draws guards and enemy agents to look.
function breakWindowAt(from, to) {
  coreBreakWindowAt(state, worldHooks, from, to, worldChance());
}

// Effects, counters and messages for shots, from automatic combat and from shots fired by hand.
function handleCombatEvents(combatEvents) {
  coreHandleCombatEvents(state, worldHooks, combatEvents, worldChance);
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

// ---- Orders. The player's clicks and keys become commands (see commands.js) for the game core (core/apply.js), the same way a
// server or a replay would give them; what comes back is only for the interface (the cursor, which squares are armed).
const selectedIds = () => selectedOperators().map((unit) => unit.id);
const give = (command) => {
  if (state.online) {
    onlinePlay?.give(command); // the server carries it out, and the news comes back in its updates
    return { ok: true, moved: command.type === "move" };
  }
  return applyCommand(state, worldHooks, command);
};
// A point the pointer chose may lie outside the map; the core wants one inside it.
const insideMap = (point) => ({
  x: Math.min(state.map.dimensions.width, Math.max(0, point.x)),
  y: Math.min(state.map.dimensions.height, Math.max(0, point.y)),
});

function orderMove(unit, destination, queue = false, keepPending = false) {
  return coreOrderMove(state, worldHooks, unit, destination, queue, keepPending);
}

function isBusy(unit) {
  return coreIsBusy(state, unit);
}

function issueMove(destination, queue = false) {
  const ids = selectedIds();
  if (ids.length > 0 && give(commands.move(ids, destination, queue)).moved) state.cursor = { ...destination };
}

// Clicking a watcher sends the selected armed operators after it.
function issueAttack(targetId, queue = false) {
  const ids = selectedIds();
  if (ids.length === 0) return;
  give(commands.attack(ids, targetId, queue));
  canvas.focus();
}

// Left-click on someone: the selected operatives walk after them and stay beside them (no shooting).
function issueFollow(targetId, queue = false) {
  const ids = selectedIds();
  if (ids.length === 0) return;
  give(commands.follow(ids, targetId, queue));
  canvas.focus();
}

function fireByHand(aim, held = false) {
  const ids = selectedIds();
  if (ids.length === 0) {
    if (!held) setStatus("Select an operator first, then right-click to fire.");
    return;
  }
  give(commands.fire(ids, insideMap(aim), held));
}

// F: pick up what is within reach, otherwise send the nearest selected operator to the closest body that still carries gear.
function lootAction() {
  const ids = selectedIds();
  if (ids.length === 0) setStatus("There is nothing to pick up. Gear lies where an armed person falls.");
  else give(commands.loot(ids));
}

// Send the selected operator with the fewest items to gear on the ground; they loot it on arrival.
function goLoot(body, queue = false) {
  const ids = selectedIds();
  if (ids.length > 0) give(commands.loot(ids, body.id, queue));
}

function performInteraction() {
  const ids = selectedIds();
  if (ids.length === 0) setStatus("Nothing to use is within reach.");
  else give(commands.interact(ids));
}

// The operator who can interact right now and what with.
function interactionCandidate() {
  return coreInteractionCandidate(state, selectedOperators());
}

function nearbyInteraction() {
  return interactionCandidate();
}

// The vehicle the selected squad could use right now: the one they are in (to leave), or the nearest one to enter.
function vehicleCandidate() {
  return coreVehicleCandidate(state, selectedOperators());
}

// Left-click a vehicle: the selected operators walk to it and get in.
function goEnterVehicle(vehicle, queue = false) {
  const ids = selectedIds();
  if (ids.length === 0) setStatus("Select an operator first, then click the vehicle to get in.");
  else give(commands.board(ids, vehicle.id, queue));
}

// V: take the vehicle within reach, or leave the one the squad is in.
function toggleVehicle(queue = false) {
  const ids = selectedIds();
  if (ids.length === 0) setStatus("No vehicle within reach. Walk up to one and press V.");
  else give(commands.vehicle(ids, queue));
}

// The operators an item square is for: the selected group if this operator is one of them, else just this one.
function idsFor(unit) {
  const ids = selectedIds();
  return ids.includes(unit.id) ? ids : [unit.id];
}

// Press an item square: weapons are selected (press again to put away), consumables are used, worn gear explains itself.
function pressSlot(unit, slot) {
  const entry = unit.equipment[slot];
  if (!entry || unit.disabled) return;
  if (entry.definition.action === "time-bomb" && entry.charges !== 0) {
    // The first press arms the charge (the next click on the ground throws it); pressing its square again drops it underfoot.
    const armed = state.armedBomb?.unitId === unit.id && state.armedBomb.slot === slot;
    if (state.online) {
      // The server cannot see which square the player has picked: arming is kept here, throwing or planting is the order.
      if (armed) give(commands.useItem(idsFor(unit), unit.id, slot, { plant: true }));
      else setStatus(`${unit.definition.name}: click the ground to throw the charge, or click its square again to drop it here.`);
      state.armedBomb = armed ? null : { unitId: unit.id, slot };
      return;
    }
    const result = give(commands.useItem(idsFor(unit), unit.id, slot, { plant: armed }));
    state.armedBomb = result.arm ? { unitId: unit.id, slot } : null;
    return;
  }
  give(commands.useItem(idsFor(unit), unit.id, slot));
}

// Throw the armed charge to a spot on the ground, within range and on walkable ground.
function throwArmedBomb(target) {
  const { unitId, slot } = state.armedBomb;
  const unit = state.units.find((item) => item.id === unitId);
  const entry = unit?.equipment[slot];
  if (!unit || unit.disabled || !entry || entry.definition.action !== "time-bomb" || entry.charges === 0) {
    state.armedBomb = null;
    return;
  }
  const result = give(commands.useItem([unit.id], unit.id, slot, { at: insideMap(target) }));
  if (result.thrown || state.online) state.armedBomb = null;
}

function dropFromSlot(unit, slot, queue = false) {
  give(commands.dropItem(idsFor(unit), unit.id, slot, queue));
}

// The field repair kit of the selected operator, if they carry one.
function useRepairKit() {
  const unit = selectedUnit();
  const slot = unit ? unit.equipment.findIndex((item) => item.definition.action === "restore-vitality") : -1;
  if (slot === -1 || unit.equipment[slot].charges === 0 || unit.disabled) setStatus("No field repair kit is available.");
  else give(commands.useItem([unit.id], unit.id, slot));
}

function simulationStep(deltaSeconds) {
  // A weapon held down by the pointer keeps firing: the pointer's place on the screen becomes a place on the map for the core.
  const held = state.holdFireScreen && state.viewport && state.outcome === "active";
  state.holdFire = held
    ? { unitIds: selectedIds(), at: insideMap(screenToGridExact(state.holdFireScreen, state.viewport.cellSize, state.viewport.origin)) }
    : null;
  stepWorld(state, deltaSeconds, worldHooks);
  updateAlertMusic(deltaSeconds);
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

function paidChores(chores) {
  return chores.length > 0 ? chores.map((chore) => `${chore.title} (+${chore.reward})`).join(", ") : "none new";
}

// What the ending of an operation that ran on the server says. Nothing from the campaign applies: the daily operation can be tried again
// (the best score counts and each chore pays once a day), and a raid has a price and a result.
function onlineEnding(won) {
  const daily = state.dailyResult;
  const raid = state.raidResult;
  if (daily) {
    return won
      ? { heading: "Today's operation is done", text: "Your score is on the board. Chores you completed are paid, once a day each." }
      : {
          heading: "Your squad was lost",
          text: "Nothing is lost but the attempt. You can try today's operation again from the Daily screen: your best score counts.",
        };
  }
  if (raid) {
    return won
      ? { heading: `${raid.name} is yours`, text: "Its income is yours now, until somebody takes it from you." }
      : {
          heading: "The raid failed",
          text: `The defences of ${raid.name} held. The raid cost ${raid.cost} funds; you can try again once its shield ends.`,
        };
  }
  return won ? {} : { heading: "Your squad was lost", text: "The operation failed. You can start another from the menu." };
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
  document.querySelector("#outcome-text").textContent = finale
    ? `${debrief?.success ?? ""} That was the last of the ${state.missionList.length} territories: ` +
      "no rival company holds a district any more."
    : won
    ? debrief?.success ?? "The operation is complete."
    : reason ?? debrief?.failure ?? "Every operator has been disabled. Regroup and try a different approach.";
  if (state.online) {
    // An operation on the server is not a campaign one: no regrouping, no armoury, nothing to review on the map.
    const online = onlineEnding(won);
    if (online.heading) document.querySelector("#outcome-heading").textContent = online.heading;
    if (online.text) document.querySelector("#outcome-text").textContent = reason ? `${reason} ${online.text}` : online.text;
  }
  document.querySelector("#outcome-research").hidden = Boolean(state.online);
  document.querySelector("#outcome-close").textContent = state.online ? "Back to the menu" : "Review the map";
  const hasNext = won && !state.online && nextOperation() !== -1;
  document.querySelector("#next-button").hidden = !hasNext;
  document.querySelector("#replay-button").hidden = Boolean(state.online);
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
    ...(state.online && state.dailyResult
      ? [
          ["Score", String(state.dailyResult.score)],
          ...(state.dailyResult.rank ? [["Place today", `${state.dailyResult.rank} of ${state.dailyResult.players}`]] : []),
          ["Chores paid", paidChores(state.dailyResult.chores)],
          ["Streak", `${state.dailyResult.streak} day${state.dailyResult.streak === 1 ? "" : "s"}`],
          ["Funds on the server", String(state.dailyResult.funds)],
        ]
      : []),
    ...(state.online && state.raidResult
      ? [
          ["Territory", state.raidResult.name],
          ["Result", state.raidResult.captured ? "Taken: it is yours now" : "Held by its defenders"],
          ["Raid cost", `${state.raidResult.cost} funds`],
          ["Funds on the server", String(state.raidResult.funds)],
        ]
      : []),
    ...(state.online ? [] : [["Funds", fundsChange(state.fundsAtStart ?? state.campaign.funds, state.campaign.funds)]]),
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
  if (!state.online) clearAutosave(); // an operation on the server is not the player's own saved game
  state.modal = true;
  outcomeDialog.showModal();
}

function persistCampaign() {
  if (state.tutorial) return; // the training campaign is a scratch copy
  try {
    localStorage.setItem(CAMPAIGN_KEY, serializeCampaign(state.campaign));
    if (state.campaign.company) localStorage.setItem(COMPANY_KEY, state.campaign.company); // remembered whatever happens to the campaign
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
      setStatus(`${territory?.name ?? "A territory"} is in revolt. It pays no tax until you take it back: play its uprising.`);
      audio.play("alert");
    } else if (event.type === "takeover") {
      const territory = state.missionList.find((entry) => entry.id === event.id);
      setStatus(
        `${territory?.owner ?? "A rival company"} is moving to take over ${territory?.name ?? "a territory"}. ` +
          "Play its defence before the deadline or lose it.",
      );
      audio.play("alert");
    } else if (event.type === "takeover-lost") {
      const territory = state.missionList.find((entry) => entry.id === event.id);
      setStatus(`${territory?.owner ?? "A rival company"} has taken ${territory?.name ?? "a territory"}. It must be taken again.`);
      audio.play("alert");
    }
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
  if (state.tutorial) {
    finishTutorial(outcome); // training counts for nothing: no funds, no progress, no territory
    return;
  }
  state.opStats.outcome = outcome;
  state.opStats.seconds = state.missionSeconds;
  // Refilling what the squad used up is paid for; it can leave the funds at zero but never below.
  state.opStats.resupply = resupplyCost(
    state.units.filter((unit) => unit.side === "team").flatMap((unit) => unit.equipment ?? []),
  );
  state.campaign = penalise(state.campaign, state.opStats.resupply);
  if (outcome === "success") {
    // Only a territory's main operation counts as an operation won; the uprising and the defence are about keeping the territory.
    if (!state.variant) {
      state.progress = markCompleted(state.progress, state.mission.id);
      saveProgress();
      renderMissionList();
    }
    keepLoot();
    settleRoster();
    state.campaign =
      state.variant === "defence"
        ? defendInCampaign(state.campaign, state.territoryId)
        : winTerritory(state.campaign, state.territoryId);
    if (state.variant) renderMissionList();
  }
  persistCampaign();
  showOutcome(outcome);
}

// When each person went down, so their death can be drawn from the start. People already down when the operation is
// loaded are simply lying there.
function stampDeaths() {
  const seeding = !state.deathsSeeded;
  state.deathsSeeded = true;
  for (const unit of state.units) {
    if (!unit.disabled || unit.diedAt !== undefined || unit.kind === "drop" || isVehicle(unit)) continue;
    unit.diedAt = seeding ? -1000 : state.elapsed;
    if (!seeding && deathKind(unit) === "burn") {
      const away = Math.hypot(unit.position.x - state.camera.x, unit.position.y - state.camera.y);
      audio.play("flame-death", { volume: shotVolume(away, unit.side === "team") });
    }
  }
}

function update(deltaSeconds) {
  if (state.online) {
    updateOnline(deltaSeconds);
    return;
  }
  if (state.paused || state.modal) {
    state.clock.accumulator = 0;
    return;
  }
  stampDeaths();
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
    if (state.campaignTimer >= 5) persistCampaign();
    state.autosaveClock = (state.autosaveClock ?? 0) + deltaSeconds;
    if (state.autosaveClock >= AUTOSAVE_SECONDS) {
      state.autosaveClock = 0;
      writeAutosave();
    }
    if (state.campaign.funds !== state.shownFunds) updateFundsReadout();
  }
  interfaceTick(deltaSeconds);
  consumeFixedSteps(state.clock, deltaSeconds, simulationStep);
  checkOutcome();
}

// What the page does each frame whoever is running the operation: the meters, the walking animation, the effects.
function interfaceTick(deltaSeconds) {
  state.meterClock = (state.meterClock ?? 0) + deltaSeconds;
  if (state.meterClock >= 0.2) {
    state.meterClock = 0;
    updateMeters();
    if (state.tutorial) tickTutorial();
    if (Object.values(state.targeted).some((until) => until > state.elapsed - 0.3 && until < state.elapsed + 0.3)) renderInterface();
    if (state.mission) updateVehicleButton();
    if (state.objectives.some((objective) => objective.type === "hold" && !objective.complete && objective.progress > 0)) {
      renderInterface();
    }
  }
  for (const unit of state.units) {
    unit.walkPhase += deltaSeconds * legsPace(unit.upgrades) * adrenalineSpeed(unit.drugs);
  }
  advanceEffects(state.effects, deltaSeconds);
}

// An operation the server is running: nothing is stepped here. The server's updates are applied as they arrive (see online-play.js);
// each frame people are shown walking between them and a held weapon is kept pointed.
function updateOnline(deltaSeconds) {
  stampDeaths();
  const held = state.holdFireScreen && state.viewport && state.outcome === "active";
  const aim = held ? insideMap(screenToGridExact(state.holdFireScreen, state.viewport.cellSize, state.viewport.origin)) : null;
  onlinePlay.frame(selectedIds(), aim);
  interfaceTick(deltaSeconds);
  updateAlertMusic(deltaSeconds);
}

function completeObjectivesAt(position) {
  return coreCompleteObjectivesAt(state, worldHooks, position);
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
  const began = performance.now();
  update(delta);
  draw();
  // How long the game's own work took this frame (kept for the last few seconds: the performance check reads it).
  (state.frameWork ??= []).push(performance.now() - began);
  if (state.frameWork.length > 240) state.frameWork.shift();
  requestAnimationFrame(frame);
}

function selectedUnit() {
  return state.units.find((unit) => unit.id === state.selectedId) ?? null;
}

// Online, other players' agents are on the squad's side but not the player's to command.
const controlled = (unit) => !state.online || state.online.squad.includes(unit.id);

function activeOperators() {
  return state.units.filter((unit) => unit.side === "team" && !unit.disabled && controlled(unit));
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
  if (!requested || requested.side !== "team" || requested.disabled || !controlled(requested)) {
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
  if (!requested || requested.side !== "team" || requested.disabled || !controlled(requested)) {
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

// Anyone who has just been put down drops what they carried, scattered around where they fell (FreeSynd), unless a
// beam, or fire or a blast without a strong chest, took it with them.
function collectFallenGear() {
  coreCollectFallenGear(state, worldHooks);
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
  coreLootNow(state, worldHooks, operator, body);
}

// The unit under a screen point. Characters are tall, so the target is a generous box around the
// whole figure, from a little below the feet to above the head, and the nearest one wins.
function hitUnit(position) {
  if (!state.viewport) return null;
  const { cellSize, origin } = state.viewport;
  const halfWidth = Math.max(18, cellSize.height * 0.8) * UNIT_SCALE;
  const above = Math.max(46, cellSize.height * 2.3) * UNIT_SCALE;
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
    state.holdFireScreen = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
    state.firedOnDownAt = performance.now();
    fireByHand(screenToGridExact(state.holdFireScreen, state.viewport.cellSize, state.viewport.origin));
    return;
  }
  if (!state.map || event.button !== 0) return;
  Object.assign(drag, { pointerId: event.pointerId, lastX: event.clientX, lastY: event.clientY, moved: 0, active: false });
});
canvas.addEventListener("pointermove", (event) => {
  if (state.holdFireScreen && state.viewport) {
    const bounds = canvas.getBoundingClientRect();
    state.holdFireScreen = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
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
    if (event.button === 2 || type === "pointercancel") state.holdFireScreen = null;
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
  state.holdFireScreen = null;
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

function pointerKindAt(position) {
  const squad = selectedOperators();
  if (squad.length === 0 || !state.viewport) return null;
  let unit = hitUnit(position);
  const underPointer = screenToGridExact(position, state.viewport.cellSize, state.viewport.origin);
  const gearHere = lootableAt(state.drops, underPointer, 1);
  if (unit && gearHere && !unit.disabled && !isVehicle(unit)) {
    const toGear = Math.hypot(gearHere.position.x - underPointer.x, gearHere.position.y - underPointer.y);
    const toUnit = Math.hypot(unit.position.x - underPointer.x, unit.position.y - underPointer.y);
    if (toGear < toUnit) unit = null;
  }
  // The crosshair marks every person under the pointer (right-click shoots them); white when out of range of everyone selected.
  if (unit && (isAttackable(unit) || isFollowable(unit)) && !unit.disabled && !isVehicle(unit)) {
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

canvas.addEventListener("contextmenu", (event) => {
  event.preventDefault();
  // A mouse already fired on button-down; a long press on touch reaches the context menu without one.
  if (performance.now() - (state.firedOnDownAt ?? -Infinity) < 600) return;
  if (!state.map || !state.viewport || state.modal || state.outcome !== "active") return;
  const bounds = canvas.getBoundingClientRect();
  const position = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  fireByHand(screenToGridExact(position, state.viewport.cellSize, state.viewport.origin));
});

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
  let unit = hitUnit(position);
  // Gear lying on the ground wins over a tall figure standing beside it: the click is for whichever is nearer the pointer.
  const ground = screenToGrid(position, state.viewport.cellSize, state.viewport.origin);
  const exactGround = screenToGridExact(position, state.viewport.cellSize, state.viewport.origin);
  const lying = lootableAt(state.drops, exactGround, 1);
  if (unit && lying && !unit.disabled && !isVehicle(unit) && selectedOperators().length > 0) {
    const toGear = Math.hypot(lying.position.x - exactGround.x, lying.position.y - exactGround.y);
    const toUnit = Math.hypot(unit.position.x - exactGround.x, unit.position.y - exactGround.y);
    if (toGear < toUnit) unit = null;
  }
  if (unit) {
    if (isTrain(unit)) {
      if (unit.vehicle.train?.waiting > 0) goEnterVehicle(unit, event.shiftKey);
      else setStatus("The train is not at a station. Wait on the platform: it stops there, and you can board then.");
    }
    else if (isVehicle(unit) && !unit.disabled && !isSquadVehicle(unit)) goEnterVehicle(unit, event.shiftKey);
    else if (unit.side !== "team") {
      // FreeSynd: a left click on a person follows them; shooting is the right click. Watchers and criminals are still engaged.
      if (isFollowable(unit)) issueFollow(unit.id, event.shiftKey);
      else if (isAttackable(unit)) issueAttack(unit.id, event.shiftKey);
    }
    else if (event.ctrlKey || event.shiftKey || event.metaKey) toggleSelect(unit.id);
    else selectUnit(unit.id);
    return;
  }
  const destination = ground;
  // Clicking the ground where an enemy fell picks up its gear: an operator walks over.
  const dropped = lying;
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
      if (event.shiftKey) dropFromSlot(leader, digit - 1, true);
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
    toggleVehicle(event.shiftKey);
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
  if (state.online) {
    setStatus("An operation on the server cannot be paused.");
    return;
  }
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
  clearAutosave();
  loadGame(state.missionIndex, { variant: state.variant }).catch(showFatalError); // the same operation from the start
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
// The map shows the operation the chosen territory needs now: if it has fallen into revolt or come under attack since it was loaded
// (the clock runs during operations), load the one it needs instead.
async function refreshOperation() {
  const entry = state.missionList[state.missionIndex];
  if (state.tutorial || !entry || operationInProgress()) return;
  if (variantFor(state.campaign.territories[entry.id]) !== (state.variant ?? null)) await loadGame(state.missionIndex);
}

document.querySelector("#operations-button").addEventListener("click", async () => {
  if (state.tutorial) {
    leaveTutorial().catch(showFatalError);
    return;
  }
  if (state.online) {
    const leave = state.outcome !== "active" || (await confirmLeave("Leaving ends your operation on the server."));
    if (leave) leaveOnline().catch(showFatalError);
    return;
  }
  await refreshOperation().catch(showFatalError);
  state.modal = true;
  titleDialog.showModal();
});
async function startNewGame() {
  const sure = await confirmLeave(
    "This wipes your campaign: funds, upgrades, the roster, territories, research, the operations you have won and every saved " +
      "game in this browser. Your settings are kept. There is no undo.",
    { heading: "Start a new game?", accept: "Start a new game", cancel: "Keep this game" },
  );
  if (!sure) return;
  try {
    clearGameStorage(localStorage);
  } catch {
    // Storage blocked: reloading still starts from what is in memory being dropped.
  }
  location.reload();
}

// The main menu comes first: what kind of game, the settings, the editor. The world map is the Campaign choice.
function currentContinueTarget() {
  return continueTarget({ hasAutosave: Boolean(readAutosave()), completedCount: state.progress?.completed.length ?? 0 });
}

// The tutorial: a small operation of its own, run on a scratch copy of the campaign so nothing in it counts. The prompts come from
// tutorial.js; this part shows them and reports what the game sees.
const TUTORIAL_KEY = "opensynd.tutorial.v1";
const tutorialPanel = document.querySelector("#tutorial-panel");
const tutorialDoneDialog = document.querySelector("#tutorial-done-dialog");

function tutorialDone() {
  return readStored(TUTORIAL_KEY) === "done";
}

function zoneCentre(id) {
  const zone = state.map.zones.find((item) => item.id === id);
  return zone ? { x: zone.position.x + (zone.width - 1) / 2, y: zone.position.y + (zone.height - 1) / 2 } : null;
}

function nearZone(unit, id, reach) {
  const centre = zoneCentre(id);
  return Boolean(unit && centre && Math.hypot(unit.position.x - centre.x, unit.position.y - centre.y) <= reach);
}

function seeTutorial() {
  const team = state.units.filter((unit) => unit.side === "team" && !unit.disabled);
  const find = (id) => state.units.find((unit) => unit.id === id);
  return {
    selectedIds: [...(state.selectedIds ?? [])],
    allSelected: team.length > 1 && team.every((unit) => state.selectedIds?.includes(unit.id)),
    onWalkPad: team.some((unit) => nearZone(unit, "walk-pad", 1.8)),
    weaponOut: team.some((unit) => Boolean(heldWeapon(unit))),
    targetDown: find("practice-target")?.disabled === true,
    looted: Boolean(state.tutorialFlags?.looted),
    queued: Boolean(state.tutorialFlags?.queued),
    persuaded: find("civilian-1")?.persuaded === true,
    inCar: team.some((unit) => unit.inVehicle === "training-car"),
    carAtDrivePad: nearZone(find("training-car"), "drive-pad", 2.2),
    gateOpen: state.objectives.find((objective) => objective.id === "open-gate")?.complete === true,
    won: state.outcome === "success",
  };
}

function renderTutorial() {
  markTutorialTargets();
  const step = state.tutorial ? currentStep(state.tutorial) : null;
  tutorialPanel.hidden = !step;
  if (!step) return;
  const { number, total } = tutorialProgress(state.tutorial);
  document.querySelector("#tutorial-count").textContent = `${number} / ${total}`;
  document.querySelector("#tutorial-text").textContent = step.text;
}

function tickTutorial() {
  const next = observeTutorial(state.tutorial, seeTutorial());
  if (next === state.tutorial) return;
  state.tutorial = next;
  audio.play("objective");
  renderTutorial();
}

async function startTutorial() {
  if (state.tutorial) return;
  const kept = state.campaign;
  state.savedCampaign = kept;
  state.campaign = emptyCampaign();
  state.tutorial = createTutorial();
  state.tutorialFlags = { looted: false, queued: false };
  try {
    await loadGame(state.missionIndex);
  } catch (error) {
    state.campaign = kept;
    state.savedCampaign = null;
    state.tutorial = null;
    throw error;
  }
  menuDialog.close();
  if (titleDialog.open) titleDialog.close();
  state.modal = false;
  renderTutorial();
  canvas.focus(); // the keys (1, 2, F, V, E) only work with the map focused
  setStatus("Training: follow the prompts at the bottom of the screen.");
}

function finishTutorial(outcome) {
  const won = outcome === "success";
  if (won) {
    try {
      localStorage.setItem(TUTORIAL_KEY, "done");
    } catch {
      // The training can be done again; nothing is lost.
    }
  }
  state.tutorial = { ...state.tutorial, finished: true };
  renderTutorial();
  document.querySelector("#tutorial-done-heading").textContent = won ? "Training complete" : "Training stopped";
  document.querySelector("#tutorial-done-text").textContent = won
    ? "You know enough to run an operation. Nothing in the training counted: your campaign is as you left it."
    : "Your operatives went down. Nothing in the training counted. Try again whenever you like.";
  state.modal = true;
  tutorialDoneDialog.showModal();
}

async function leaveTutorial() {
  if (!state.tutorial) return;
  state.tutorial = null;
  state.tutorialFlags = null;
  state.campaign = state.savedCampaign ?? state.campaign;
  state.savedCampaign = null;
  if (tutorialDoneDialog.open) tutorialDoneDialog.close();
  renderTutorial();
  await loadGame(state.missionIndex); // back to the operation that was chosen before
  showMainMenu();
}

document.querySelector("#menu-tutorial").addEventListener("click", () => startTutorial().catch(showFatalError));
document.querySelector("#tutorial-leave").addEventListener("click", () => leaveTutorial().catch(showFatalError));
document.querySelector("#tutorial-skip-step").addEventListener("click", () => {
  state.tutorial = skipStep(state.tutorial);
  renderTutorial();
});
document.querySelector("#tutorial-finish").addEventListener("click", () => leaveTutorial().catch(showFatalError));
document.querySelector("#tutorial-again").addEventListener("click", () => {
  tutorialDoneDialog.close();
  state.modal = false;
  canvas.focus();
  loadGame(state.missionIndex).catch(showFatalError); // the tutorial run is still set, so it reloads the training
});
tutorialDoneDialog.addEventListener("cancel", (event) => event.preventDefault());

// ---- Playing on a game server. Nothing here runs unless a server has been named (a `server` address in the page's link, kept for next
// time); the game is the same without one. The play itself is in online-play.js.
const SERVER_KEY = "opensynd.server.v1";
let onlinePlay = null;
let serverIsUp = false;
const signinDialog = document.querySelector("#signin-dialog");

function serverSettings() {
  let kept = {};
  try {
    kept = JSON.parse(localStorage.getItem(SERVER_KEY) ?? "{}");
  } catch {
    // Nothing kept, or damaged: start over.
  }
  const built = document.querySelector('meta[name="opensynd-server"]')?.content;
  if (built && kept.url === undefined) kept = { url: built, token: null };
  const named = new URLSearchParams(location.search).get("server");
  if (named !== null) kept = named ? { url: named.replace(/\/+$/, ""), token: kept.url === named ? kept.token : null } : {};
  return kept;
}

function keepServerSettings(settings) {
  try {
    if (settings.url) localStorage.setItem(SERVER_KEY, JSON.stringify(settings));
    else localStorage.removeItem(SERVER_KEY);
  } catch {
    // The sign-in just lasts until the page is closed.
  }
}

// The connection is made the first time it is wanted, once the game's own content has been read.
async function setUpOnline() {
  const settings = serverSettings();
  if (!settings.url || !state.catalogPaths) return false;
  if (!onlinePlay) {
    onlinePlay = createOnlinePlay({ state, hooks: worldHooks, equipment: new Map(state.catalogPaths) });
    onlinePlay.onEnd((message) => {
      state.outcome = message.outcome === "success" ? "success" : "failure";
      state.dailyResult = message.daily ?? null;
      state.raidResult = message.raid ?? null;
      showOutcome(state.outcome);
    });
    onlinePlay.onStart((start) => {
      enterOnlineOperation(start, start.variant === "war" ? "war" : start.team?.length > 1 ? "coop" : "solo").catch(showFatalError);
    });
    onlinePlay.onClose(() => {
      if (!state.online) return;
      setStatus("The connection to the server was lost.");
      leaveOnline().catch(showFatalError);
    });
    keepServerSettings(settings);
  }
  const fingerprint = await readJson("content/hash.json").catch(() => ({ hash: "" }));
  onlinePlay.configure({ server: settings.url, content: fingerprint.hash, token: settings.token ?? null });
  return true;
}

// The Online part of the menu: shown when a server has been named and answers; says who is signed in.
// Outiva sign-in. Coming back from Outiva with a code signs the player in; otherwise, once per visit, a quiet attempt signs in someone
// who is already signed in to Outiva. Signing out here stops that until the player chooses Outiva again.
let outivaSettings = null;
const OUTIVA_OFF = "opensynd.outiva.off.v1";
const OUTIVA_TRIED = "opensynd.outiva.tried.v1";

async function goToOutiva(silent) {
  try {
    sessionStorage.setItem(OUTIVA_TRIED, "1");
    if (!silent) localStorage.removeItem(OUTIVA_OFF);
  } catch {
    // Without storage the quiet attempt could repeat; it is not made when storage cannot be used (see below).
  }
  location.assign(await signInAddress(outivaSettings, { silent, location, storage: sessionStorage }));
}

async function signInWithOutiva() {
  let back = null;
  let quiet = true;
  try {
    back = comeBack({ location, storage: sessionStorage });
    quiet = sessionStorage.getItem(OUTIVA_TRIED) === null && localStorage.getItem(OUTIVA_OFF) === null;
  } catch {
    quiet = false; // no storage: a quiet attempt could never be remembered, so none is made
  }
  if (back) {
    const query = new URLSearchParams(location.search);
    for (const name of ["code", "state", "session_state", "iss", "error", "error_description"]) query.delete(name);
    history.replaceState(null, "", `${location.pathname}${query.size > 0 ? `?${query}` : ""}${location.hash}`);
  }
  if (back?.code) {
    const result = await onlinePlay.oidcCode(back).catch(() => ({ ok: false }));
    if (result.ok) {
      keepServerSettings({ url: serverSettings().url, token: result.token });
      return result.account;
    }
    return null;
  }
  if (!back && quiet) {
    await goToOutiva(true);
    return new Promise(() => {}); // the page is leaving
  }
  return null;
}

// The name other players see is the player's company name (not their Outiva or sign-in name). When the two differ, the server is asked
// to change it; if the company name cannot be used (taken, or characters a name may not have) the account keeps its name, and says so.
const companyFailed = new Map(); // "account:company" -> why it could not be used, so a refusal is not asked again
let companyNote = "";
async function useCompanyName(account) {
  if (!state.campaign.company) {
    const restored = companyFromAccount(state.campaign, account.name);
    if (restored !== state.campaign) {
      state.campaign = restored; // signed in on a browser that does not know the company yet: the account does
      persistCampaign();
      showCompany();
    }
  }
  const company = state.campaign.company;
  const key = `${account.id}:${company}`;
  companyNote = "";
  if (!company || company === account.name) return account;
  if (!companyFailed.has(key)) {
    const result = await onlinePlay.rename(company).catch(() => ({ ok: false }));
    if (result.ok) return result.account;
    companyFailed.set(key, result.error ?? "the server did not answer");
  }
  companyNote = ` Your company name "${company}" could not be used online: ${companyFailed.get(key)}`;
  return account;
}

// Refreshes run one at a time: the page asks for one from several places as it starts, and a second one beginning while the first is
// still signing in (coming back from Outiva) would replace its connection with one that has no account yet.
let onlineRefreshing = Promise.resolve();
function refreshOnlineMenu() {
  onlineRefreshing = onlineRefreshing.catch(() => {}).then(refreshOnlineMenuNow);
  return onlineRefreshing;
}

async function refreshOnlineMenuNow() {
  const note = document.querySelector("#menu-online-note");
  const signin = document.querySelector("#menu-signin");
  const test = document.querySelector("#menu-online-test");
  signin.hidden = true;
  test.hidden = true;
  note.hidden = true;
  document.querySelector("#menu-daily").disabled = true;
  document.querySelector("#menu-coop").disabled = true;
  document.querySelector("#menu-world").disabled = true;
  document.querySelector("#menu-war").disabled = true;
  if (!(await setUpOnline())) return;
  note.hidden = false;
  note.textContent = "Looking for the server…";
  const health = await onlinePlay.health();
  serverIsUp = Boolean(health);
  if (!health) {
    note.textContent = "The server cannot be reached.";
    return;
  }
  const fingerprint = await readJson("content/hash.json").catch(() => ({ hash: "" }));
  if (health.content !== fingerprint.hash) {
    note.textContent = "This game and the server have different content. Reload the page to update.";
    return;
  }
  outivaSettings = health.oidc;
  let account = await onlinePlay.whoAmI();
  if (!account && health.oidc) account = await signInWithOutiva(health.oidc);
  if (account) account = await useCompanyName(account);
  note.textContent = account ? `Signed in as ${account.name}.${companyNote}` : "Not signed in.";
  document.querySelector("#menu-signin-label").textContent = account ? `Sign out (${account.name})` : "Sign in";
  document.querySelector("#menu-signin-note").hidden = Boolean(account);
  signin.hidden = false;
  test.hidden = false;
  const daily = document.querySelector("#menu-daily");
  daily.disabled = false;
  document.querySelector("#menu-coop").disabled = false;
  document.querySelector("#menu-world").disabled = false;
  document.querySelector("#menu-war").disabled = !account;
  document.querySelector("#menu-coop-note").textContent = account
    ? "Two to four players, one squad each."
    : "Two to four players, one squad each. Sign in to play.";
  document.querySelector("#menu-daily-note").textContent = account
    ? "The same operation for everyone, ranked."
    : "The same operation for everyone, ranked. Sign in to play.";
}

function showSignin() {
  document.querySelector("#signin-server").textContent = `Server: ${serverSettings().url}`;
  document.querySelector("#signin-error").hidden = true;
  document.querySelector("#signin-outiva").hidden = !outivaSettings;
  document.querySelector("#signin-password").value = "";
  signinDialog.showModal();
  document.querySelector("#signin-name").focus();
}

async function trySignin(create) {
  const name = document.querySelector("#signin-name").value.trim();
  const password = document.querySelector("#signin-password").value;
  const error = document.querySelector("#signin-error");
  const result = await (create ? onlinePlay.signUp(name, password) : onlinePlay.signIn(name, password));
  if (!result.ok) {
    error.textContent = result.error ?? "The server did not answer.";
    error.hidden = false;
    return;
  }
  keepServerSettings({ url: serverSettings().url, token: result.token });
  signinDialog.close();
  await refreshOnlineMenu();
}

// An operation that the server has begun: build it here, then let the server's updates drive it. If the player is already in it (they
// reconnected), it is just built again from how it stands now.
async function enterOnlineOperation(start, mode) {
  const resuming = Boolean(state.online);
  const kept = state.campaign;
  if (!resuming) {
    state.savedCampaign = kept;
    state.campaign = emptyCampaign(); // what happens on the server is not part of the player's own campaign
  }
  const note = document.querySelector("#menu-online-note");
  try {
    await loadGame(state.missionIndex, { remote: start, mode });
    onlinePlay.attach();
  } catch (error) {
    onlinePlay.stop();
    state.online = null;
    if (!resuming) {
      state.campaign = kept;
      state.savedCampaign = null;
    }
    note.hidden = false;
    note.textContent = error.message;
    return;
  }
  for (const dialog of [menuDialog, titleDialog, document.querySelector("#coop-dialog"), document.querySelector("#daily-dialog")]) {
    if (dialog.open) dialog.close();
  }
  if (outcomeDialog.open) outcomeDialog.close();
  state.modal = false;
  pauseButton.disabled = true;
  resetButton.disabled = true;
  canvas.focus();
  const coalition = state.online?.coalition ? `${state.online.coalition === "cyan" ? "Cyan" : "Ember"} Coalition` : null;
  setStatus(
    resuming
      ? "Back in the operation."
      : coalition
        ? `Joined ${coalition}.`
        : "Connected: this operation is running on the server.",
  );
}

async function startOnlineGame(mode = "solo") {
  if (state.online || !onlinePlay) return;
  const note = document.querySelector("#menu-online-note");
  note.hidden = false;
  note.textContent = "Connecting…";
  let start;
  try {
    start = await onlinePlay.start(mode);
  } catch (error) {
    onlinePlay.stop();
    note.textContent = error.message;
    return;
  }
  await enterOnlineOperation(start, mode);
}

// Back to the player's own game.
async function leaveOnline() {
  if (!state.online) return;
  onlinePlay.stop();
  state.online = null;
  state.campaign = state.savedCampaign ?? state.campaign;
  state.savedCampaign = null;
  if (outcomeDialog.open) outcomeDialog.close();
  pauseButton.disabled = false;
  resetButton.disabled = false;
  await loadGame(state.missionIndex);
  showMainMenu();
}

// The daily operation: what today's is, the chores, how the player is doing, and the boards.
let dailyPage = null;
let dailyRange = "today";

function renderDailyBoard() {
  const board = document.querySelector("#daily-board");
  const rows = dailyPage?.boards[dailyRange] ?? [];
  const me = onlinePlay?.account?.name;
  board.replaceChildren(
    ...(rows.length === 0
      ? [Object.assign(document.createElement("li"), { className: "none", textContent: "Nobody has won this one yet." })]
      : rows.map((row) => {
          const item = document.createElement("li");
          item.classList.toggle("me", row.name === me);
          for (const text of [`${row.rank}.`, row.name, String(row.score), formatDuration(row.seconds)]) {
            item.append(Object.assign(document.createElement("span"), { textContent: text }));
          }
          return item;
        })),
  );
  for (const button of document.querySelectorAll(".daily-tabs button")) {
    button.setAttribute("aria-pressed", String(button.dataset.range === dailyRange));
  }
}

async function showDaily() {
  const page = await onlinePlay.daily();
  if (!page) {
    document.querySelector("#menu-online-note").textContent = "The server did not answer.";
    return;
  }
  dailyPage = page;
  dailyRange = "today";
  document.querySelector("#daily-date").textContent = page.date;
  document.querySelector("#daily-operation").textContent = `${page.name}: ${page.title}`;
  const hours = Math.floor(page.resetsIn / 3600);
  const minutes = Math.floor((page.resetsIn % 3600) / 60);
  document.querySelector("#daily-resets").textContent = `The next one begins in ${hours} h ${minutes} min.`;
  document.querySelector("#daily-chores").replaceChildren(
    ...page.chores.map((chore) => {
      const item = document.createElement("li");
      item.classList.toggle("done", chore.done);
      const tick = Object.assign(document.createElement("span"), { textContent: chore.done ? "✓" : "○", className: "tick" });
      const words = document.createElement("span");
      words.textContent = `${chore.title}: ${chore.description}`;
      const reward = Object.assign(document.createElement("span"), { textContent: `${chore.reward} funds` });
      item.append(tick, words, reward);
      return item;
    }),
  );
  const you = page.you;
  document.querySelector("#daily-you").textContent = you
    ? `${you.best ? `Your best today: ${you.best.score}. ` : "You have not won today's yet. "}` +
      `Streak: ${you.streak} day${you.streak === 1 ? "" : "s"}. Funds on the server: ${you.funds}.`
    : "Sign in to play, to earn the chores and to be on the board.";
  document.querySelector("#daily-play").textContent = you ? "Play today's operation" : "Sign in to play";
  renderDailyBoard();
  dailyDialog.showModal();
}

const dailyDialog = document.querySelector("#daily-dialog");
document.querySelector("#menu-daily").addEventListener("click", () => showDaily().catch(showFatalError));
document.querySelector("#daily-close").addEventListener("click", () => dailyDialog.close());
for (const button of document.querySelectorAll(".daily-tabs button")) {
  button.addEventListener("click", () => {
    dailyRange = button.dataset.range;
    renderDailyBoard();
  });
}
document.querySelector("#daily-play").addEventListener("click", () => {
  dailyDialog.close();
  if (!onlinePlay.account) showSignin();
  else startOnlineGame("daily").catch(showFatalError);
});

// ---- The shared world: who holds what, raiding, and defending what is yours.
const worldDialog = document.querySelector("#world-dialog");

const shieldText = (seconds) => (seconds >= 3600 ? `${Math.round(seconds / 3600)} h` : `${Math.max(1, Math.ceil(seconds / 60))} min`);

function worldMessage(text) {
  document.querySelector("#world-message").textContent = text ?? "";
}

async function renderWorld() {
  const page = await onlinePlay.world();
  if (!page) {
    worldMessage("The server did not answer.");
    return;
  }
  const you = page.you;
  document.querySelector("#world-you").textContent =
    `Funds ${you.funds} · ${you.owned} held · pays ${you.incomePerHour} an hour` +
    (you.collected > 0 ? ` · ${you.collected} collected while you were away` : "") +
    ` · a raid costs ${page.raidCost}`;
  const rows = [...page.territories].sort(
    (a, b) => Number(b.mine) - Number(a.mine) || Number(b.canRaid) - Number(a.canRaid) || a.name.localeCompare(b.name),
  );
  document.querySelector("#world-list").replaceChildren(
    ...rows.map((territory) => {
      const item = document.createElement("li");
      item.classList.toggle("mine", territory.mine);
      const words = document.createElement("span");
      words.textContent = territory.name;
      const detail = document.createElement("small");
      const holder = territory.mine ? "yours" : `${territory.holder}${territory.player ? " (player)" : ""}`;
      detail.textContent =
        `${holder} · defence ${territory.defence}` +
        (territory.shieldedFor > 0 ? ` · shielded ${shieldText(territory.shieldedFor)}` : "") +
        ` · pays ${territory.income} an hour`;
      words.append(detail);
      item.append(words);
      if (territory.mine) {
        const next = territory.defence + 1;
        // An older game server does not send defenceUpgradeCost; its established price is still level × 500.
        const price = Number.isFinite(territory.defenceUpgradeCost) ? territory.defenceUpgradeCost : next * 500;
        const label = territory.defence >= page.maxDefence
          ? "Defence at maximum"
          : `Strengthen defence to level ${next} · ${price.toLocaleString()} funds`;
        const upgrade = Object.assign(document.createElement("button"), { type: "button", textContent: label });
        upgrade.disabled = territory.defence >= page.maxDefence;
        upgrade.addEventListener("click", async () => {
          const result = await onlinePlay.upgradeDefence(territory.id, next);
          worldMessage(result.error ?? `${territory.name} now has defence ${next}.`);
          await renderWorld();
        });
        item.append(upgrade);
      } else {
        const raid = Object.assign(document.createElement("button"), { type: "button", textContent: "Raid" });
        raid.disabled = !territory.canRaid;
        raid.title = territory.why ?? "";
        raid.addEventListener("click", () => startRaid(territory.id));
        item.append(raid);
      }
      return item;
    }),
  );
  const names = new Map(page.territories.map((territory) => [territory.id, territory.name]));
  document.querySelector("#world-log").replaceChildren(
    ...(page.raids.length === 0
      ? [Object.assign(document.createElement("li"), { textContent: "No raids yet." })]
      : page.raids.map((entry) => {
          const took = entry.outcome === "captured";
          return Object.assign(document.createElement("li"), {
            textContent: `${entry.attacker} ${took ? "took" : "failed to take"} ${names.get(entry.territory) ?? entry.territory}` +
              (entry.defender ? ` from ${entry.defender}` : ""),
          });
        })),
  );
}

async function showWorld() {
  if (!onlinePlay.account) return showSignin();
  worldMessage("");
  await renderWorld();
  worldDialog.showModal();
  return undefined;
}

async function startRaid(territory) {
  worldMessage("Connecting…");
  try {
    const start = await onlinePlay.raid(territory);
    worldDialog.close();
    await enterOnlineOperation(start, "raid");
  } catch (error) {
    onlinePlay.stop();
    worldMessage(error.message);
    await renderWorld().catch(() => {});
  }
}

document.querySelector("#menu-world").addEventListener("click", () => showWorld().catch(showFatalError));
document.querySelector("#world-close").addEventListener("click", () => worldDialog.close());

// ---- Co-op: the lobby. Games waiting for players are listed; a player opens one, takes a quick match or joins one, says they are ready,
// and the host begins. The operation itself then arrives like any other (see enterOnlineOperation).
const coopDialog = document.querySelector("#coop-dialog");
let coopTimer = null;
let coopWired = false;

function coopMessage(text) {
  document.querySelector("#coop-message").textContent = text ?? "";
}

function missionName(path) {
  return state.missionList.find((entry) => entry.path === path)?.name ?? path;
}

let friendNames = new Set();
const smallButton = (label, onclick) => Object.assign(document.createElement("button"), { type: "button", textContent: label, onclick });
const mutedKey = "opensynd.muted.v1";
const mutedNames = () => {
  try {
    return new Set(JSON.parse(localStorage.getItem(mutedKey) ?? "[]"));
  } catch {
    return new Set();
  }
};
const QUICK_SAYS = ["Hello", "Ready", "Good luck", "Well played", "Thanks", "Wait for me"];

async function showProfile(name) {
  const profile = await onlinePlay.profile(name);
  coopMessage(
    profile
      ? `${profile.name}: ${profile.territories} territories held, ${profile.raidsWon} raids won, ${profile.defended} defended, ` +
          `${profile.dailyWins} daily wins${profile.bestDaily === null ? "" : `, best daily ${profile.bestDaily}`}.`
      : `No profile for ${name}.`,
  );
}

async function friendAction(name, action) {
  const result = await onlinePlay.friendAction(name, action);
  coopMessage(result.error ?? "");
  await renderFriends();
}

async function renderFriends() {
  const lists = await onlinePlay.friends();
  if (!lists) return;
  friendNames = new Set(lists.friends);
  const button = (label, onClick) => smallButton(label, onClick);
  const row = (text, ...buttons) => {
    const item = document.createElement("li");
    item.append(Object.assign(document.createElement("span"), { textContent: text }), ...buttons);
    return item;
  };
  const rows = [
    ...lists.incoming.map((name) =>
      row(
        `${name} asks to be your friend`,
        button("Accept", () => friendAction(name, "accept")),
        button("Decline", () => friendAction(name, "remove")),
      ),
    ),
    ...lists.friends.map((name) =>
      row(
        `${name}${lists.online.includes(name) ? " · online" : ""}`,
        button("Profile", () => showProfile(name)),
        button("Remove", () => friendAction(name, "remove")),
      ),
    ),
    ...lists.outgoing.map((name) => row(`${name} · asked`, button("Cancel", () => friendAction(name, "remove")))),
  ];
  document.querySelector("#coop-friend-list").replaceChildren(
    ...(rows.length > 0 ? rows : [row("No friends yet. Add somebody by name.")]),
  );
}

function renderGames(allGames) {
  const list = document.querySelector("#coop-games");
  const withFriend = (game) => Number(game.players.some((p) => friendNames.has(p.name)));
  const games = [...allGames].sort((a, b) => withFriend(b) - withFriend(a));
  list.replaceChildren(
    ...(games.length === 0
      ? [Object.assign(document.createElement("li"), { textContent: "No games are open. Open one, or take a quick match." })]
      : games.map((game) => {
          const item = document.createElement("li");
          item.append(
            Object.assign(document.createElement("span"), { textContent: "" }),
            Object.assign(document.createElement("span"), {
              textContent:
                `${game.host}'s game: ${missionName(game.mission)} · ${game.players.length} of ${game.capacity}` +
                (game.players.some((p) => friendNames.has(p.name)) ? " · a friend is in it" : ""),
            }),
          );
          const join = Object.assign(document.createElement("button"), { type: "button", textContent: "Join" });
          join.disabled = game.players.length >= game.capacity;
          join.addEventListener("click", () => onlinePlay.client.joinGame(game.id));
          item.append(join);
          return item;
        })),
  );
}

function renderWaiting(game) {
  const me = onlinePlay.account?.name;
  const host = game.host === me;
  document.querySelector("#coop-lobby").hidden = true;
  document.querySelector("#coop-friends").hidden = true;
  document.querySelector("#coop-waiting").hidden = false;
  document.querySelector("#coop-waiting-heading").textContent = `${game.host}'s game: ${missionName(game.mission)}`;
  document.querySelector("#coop-players").replaceChildren(
    ...game.players.map((player) => {
      const item = document.createElement("li");
      item.append(
        Object.assign(document.createElement("span"), { textContent: player.ready ? "✓" : "○", className: "tick" }),
        Object.assign(document.createElement("span"), { textContent: player.name + (player.name === game.host ? " (host)" : "") }),
        Object.assign(document.createElement("span"), { textContent: player.ready ? "ready" : "not ready" }),
      );
      if (player.name !== me) {
        const small = smallButton;
        item.append(
          small("Profile", () => showProfile(player.name)),
          small(friendNames.has(player.name) ? "Friend ✓" : "Add friend", () => friendAction(player.name, "request")),
          small(mutedNames().has(player.name) ? "Unmute" : "Mute", () => {
            const muted = mutedNames();
            if (!muted.delete(player.name)) muted.add(player.name);
            try {
              localStorage.setItem(mutedKey, JSON.stringify([...muted]));
            } catch {
              // Muting then lasts only until the next page load.
            }
            renderWaiting(game);
          }),
          small("Report", async () => {
            const reason = window.prompt(`Why are you reporting ${player.name}?`);
            if (reason) coopMessage((await onlinePlay.report(player.name, reason)).error ?? "Thank you. The report has been sent.");
          }),
        );
      }
      return item;
    }),
  );
  const mine = game.players.find((player) => player.name === me);
  const ready = document.querySelector("#coop-ready");
  ready.hidden = host;
  ready.setAttribute("aria-pressed", String(Boolean(mine?.ready)));
  document.querySelector("#coop-begin").hidden = !host;
  document.querySelector("#coop-begin").disabled =
    game.players.length < 2 || game.players.some((player) => !player.ready && player.name !== game.host);
  coopMessage(game.quick ? "Waiting for another player…" : `${game.players.length} of ${game.capacity} players.`);
}

function showLobbyPanel() {
  document.querySelector("#coop-lobby").hidden = false;
  document.querySelector("#coop-friends").hidden = false;
  document.querySelector("#coop-waiting").hidden = true;
  document.querySelector("#coop-chat").replaceChildren();
  renderFriends().then(() => onlinePlay.client.lobby());
}

async function showCoop() {
  if (!onlinePlay.account) return showSignin();
  await onlinePlay.connect();
  if (!coopWired) {
    coopWired = true;
    const client = onlinePlay.client;
    client.on("lobby", (message) => renderGames(message.games));
    client.on("waiting", (message) => renderWaiting(message.game));
    client.on("closed", (message) => {
      coopMessage(message.reason);
      showLobbyPanel();
    });
    client.on("error", (message) => coopMessage(message.message));
    // What others say: in the game's list while waiting, and as a line on screen during an operation.
    onlinePlay.onChat(({ from, text }) => {
      if (mutedNames().has(from)) return;
      const chat = document.querySelector("#coop-chat");
      if (coopDialog.open) {
        chat.append(Object.assign(document.createElement("li"), { textContent: `${from}: ${text}` }));
        while (chat.children.length > 20) chat.firstChild.remove();
      } else {
        setStatus(`${from}: ${text}`);
      }
    });
    document.querySelector("#coop-quick-says").replaceChildren(
      ...QUICK_SAYS.map((text) =>
        Object.assign(document.createElement("button"), { type: "button", textContent: text, onclick: () => onlinePlay.say(text) }),
      ),
    );
  }
  coopMessage("");
  coopDialog.showModal();
  showLobbyPanel();
  clearInterval(coopTimer);
  coopTimer = setInterval(() => {
    if (coopDialog.open && !document.querySelector("#coop-lobby").hidden) onlinePlay.client.lobby();
  }, 3000);
  return undefined;
}

coopDialog.addEventListener("close", () => clearInterval(coopTimer));
document.querySelector("#menu-coop").addEventListener("click", () => showCoop().catch(showFatalError));
document.querySelector("#menu-war").addEventListener("click", () => startOnlineGame("war").catch(showFatalError));
document.querySelector("#coop-close").addEventListener("click", () => {
  if (!document.querySelector("#coop-waiting").hidden) onlinePlay.client.leaveGame();
  coopDialog.close();
});
document.querySelector("#coop-quick").addEventListener("click", () => onlinePlay.client.quickMatch());
document.querySelector("#coop-open").addEventListener("click", () => {
  onlinePlay.client.openGame({ capacity: Number(document.querySelector("#coop-capacity").value) });
});
document.querySelector("#coop-friend-add").addEventListener("click", () => {
  const input = document.querySelector("#coop-friend-name");
  if (input.value.trim()) friendAction(input.value.trim(), "request").then(() => (input.value = ""));
});
document.querySelector("#coop-leave").addEventListener("click", () => onlinePlay.client.leaveGame());
document.querySelector("#coop-ready").addEventListener("click", (event) => {
  onlinePlay.client.ready(event.currentTarget.getAttribute("aria-pressed") !== "true");
});
document.querySelector("#coop-begin").addEventListener("click", () => onlinePlay.client.begin());

document.querySelector("#menu-signin").addEventListener("click", async () => {
  if (!onlinePlay?.account) return showSignin();
  await onlinePlay.signOut();
  keepServerSettings({ url: serverSettings().url, token: null });
  try {
    localStorage.setItem(OUTIVA_OFF, "1"); // do not sign straight back in
  } catch {
    // The quiet sign-in then repeats next visit.
  }
  await refreshOnlineMenu();
});
document.querySelector("#menu-online-test").addEventListener("click", () => startOnlineGame("solo").catch(showFatalError));
document.querySelector("#signin-form").addEventListener("submit", (event) => {
  event.preventDefault();
  trySignin(false).catch(showFatalError);
});
document.querySelector("#signin-create").addEventListener("click", () => trySignin(true).catch(showFatalError));
document.querySelector("#signin-cancel").addEventListener("click", () => signinDialog.close());
document.querySelector("#signin-outiva").addEventListener("click", () => goToOutiva(false).catch(showFatalError));

// The company name is asked for the first time the player heads for the campaign, and can be changed from the menu.
function showCompany() {
  const company = state.campaign.company;
  document.querySelector("#menu-company-name").textContent = company;
  document.querySelector("#menu-company-edit").hidden = !company;
  document.querySelector("#menu-company-name").parentElement.hidden = !company;
  document.querySelector("#title-company").textContent = company;
}

// Resolves true once the company has a name; false if the player backs out. Opens the dialog synchronously.
function ensureCompany(rename = false) {
  if (state.campaign.company && !rename) return Promise.resolve(true);
  const input = document.querySelector("#company-name");
  const error = document.querySelector("#company-error");
  input.value = state.campaign.company;
  error.hidden = true;
  companyDialog.showModal();
  input.focus();
  input.select();
  return new Promise((resolve) => {
    const form = document.querySelector("#company-form");
    const finish = (named) => {
      form.removeEventListener("submit", onSubmit);
      cancel.removeEventListener("click", onCancel);
      companyDialog.removeEventListener("cancel", onCancel);
      if (companyDialog.open) companyDialog.close();
      resolve(named);
    };
    const onSubmit = (event) => {
      event.preventDefault();
      const name = cleanCompanyName(input.value);
      if (!name) {
        error.textContent = "Give the company a name.";
        error.hidden = false;
        return;
      }
      state.campaign = setCompany(state.campaign, name);
      persistCampaign();
      showCompany();
      refreshOnlineMenu().catch(() => {}); // online, the company name is also the player's name
      finish(true);
    };
    const onCancel = (event) => {
      event.preventDefault?.();
      finish(Boolean(state.campaign.company));
    };
    const cancel = document.querySelector("#company-cancel");
    form.addEventListener("submit", onSubmit);
    cancel.addEventListener("click", onCancel);
    companyDialog.addEventListener("cancel", onCancel);
  });
}

function showMainMenu() {
  showCompany();
  refreshOnlineMenu().catch(() => {});
  const tutorialNote = document.querySelector("#menu-tutorial-note");
  if (tutorialDone()) tutorialNote.textContent = "Done. Play the training again.";
  const target = currentContinueTarget();
  const saved = target === "operation" ? readAutosave() : null;
  const entry = saved ? state.missionList?.find((item) => item.id === (saved.territoryId ?? saved.missionId)) : null;
  const button = document.querySelector("#menu-continue");
  button.hidden = target === null;
  // One button per intention: nothing yet to continue means Start campaign; otherwise Continue and New campaign.
  document.querySelector("#menu-campaign").hidden = target !== null;
  document.querySelector("#menu-new-game").hidden = target === null;
  document.querySelector("#menu-continue-note").textContent = continueNote(target, {
    operationName: entry?.name,
    completedCount: state.progress?.completed.length ?? 0,
  });
  state.modal = true;
  if (!menuDialog.open) menuDialog.showModal();
  (button.hidden ? document.querySelector("#menu-campaign") : button).focus();
}

async function showCampaign() {
  await refreshOperation().catch(showFatalError);
  menuDialog.close();
  state.modal = true;
  if (!titleDialog.open) titleDialog.showModal();
}

// Escape must not drop the player onto a half-started game behind the menu.
menuDialog.addEventListener("cancel", (event) => event.preventDefault());
document.querySelector("#menu-campaign").addEventListener("click", async () => {
  if (await ensureCompany()) showCampaign();
});
document.querySelector("#menu-continue").addEventListener("click", async () => {
  if (currentContinueTarget() === "operation" && (await resumeAutosave())) return;
  if (await ensureCompany()) showCampaign();
});
document.querySelector("#menu-company-edit").addEventListener("click", () => ensureCompany(true));
document.querySelector("#menu-new-game").addEventListener("click", startNewGame);
document.querySelector("#menu-settings").addEventListener("click", showSettings);
document.querySelector("#menu-about").addEventListener("click", () => aboutDialog.showModal());
document.querySelector("#menu-button").addEventListener("click", () => {
  titleDialog.close();
  showMainMenu();
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
document.querySelector("#begin-button").addEventListener("click", () => {
  clearAutosave(); // starting afresh: what was saved is no longer wanted
  document.querySelector("#resume-box").hidden = true;
  titleDialog.close();
});
document.querySelector("#resume-button").addEventListener("click", () => resumeAutosave().catch(showFatalError));
document.querySelector("#resume-discard").addEventListener("click", () => {
  clearAutosave();
  document.querySelector("#resume-box").hidden = true;
});
document.querySelector("#replay-button").addEventListener("click", () => {
  clearAutosave();
  outcomeDialog.close();
  loadGame(state.missionIndex, { variant: state.variant }).catch(showFatalError); // the same operation again
});
// The next operation along that is open: the first after this one that has been unlocked and is not yet won.
function nextOperation() {
  const open = (index) =>
    isUnlocked(state.progress, state.missionList, index) && !isCompleted(state.progress, state.missionList[index].id);
  for (let index = state.missionIndex + 1; index < state.missionList.length; index += 1) if (open(index)) return index;
  return -1;
}

document.querySelector("#next-button").addEventListener("click", () => {
  clearAutosave();
  outcomeDialog.close();
  loadGame(nextOperation())
    .then(() => {
      state.modal = true;
      titleDialog.showModal();
    })
    .catch(showFatalError);
});
document.querySelector("#outcome-close").addEventListener("click", () => {
  if (state.online) leaveOnline().catch(showFatalError);
  else outcomeDialog.close();
});
showMainMenu();
// Browser tests add ?e2e to reach states that take too long to play out.
if (new URLSearchParams(location.search).has("e2e")) {
  window.opensyndTest = {
    camera() {
      return { x: state.camera.x, y: state.camera.y };
    },
    // How long redrawing the interface takes, in milliseconds, averaged over some goes (what each server update costs the page).
    interfaceCost(times = 50) {
      const start = performance.now();
      for (let count = 0; count < times; count += 1) renderInterface();
      return (performance.now() - start) / times;
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
    healthOf(id) {
      return state.units.find((unit) => unit.id === id)?.health;
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
    openTileNear(id, distance = 5) {
      const unit = state.units.find((item) => item.id === id);
      const from = { x: Math.round(unit.position.x), y: Math.round(unit.position.y) };
      for (let dx = -distance; dx <= distance; dx += 1) {
        for (let dy = -distance; dy <= distance; dy += 1) {
          const tile = { x: from.x + dx, y: from.y + dy };
          if (Math.hypot(dx, dy) >= distance - 1 && findPath(state.grid, from, tile).length > 0) return tile;
        }
      }
      return null;
    },
    online() {
      return {
        running: Boolean(state.online),
        steps: state.steps,
        squad: state.online?.squad ?? null,
        signedInAs: onlinePlay?.account?.name ?? null,
        serverIsUp,
        cost: onlinePlay ? { ...onlinePlay.stats } : null,
      };
    },
    tutorialStep() {
      const step = state.tutorial ? currentStep(state.tutorial) : null;
      return { running: Boolean(state.tutorial), step: step?.id ?? null, finished: Boolean(state.tutorial?.finished) };
    },
    // Let game time pass without waiting for it (the same steps the frames take, 0.05 s at a time).
    fastForward(seconds) {
      for (let passed = 0; passed < seconds; passed += 0.05) update(0.05);
    },
    holdStill(id) {
      const unit = state.units.find((item) => item.id === id);
      unit.vehicle.route = null; // a driven car with nowhere to go stays where it is
      unit.path = [];
    },
    selectWeapon(id) {
      const unit = state.units.find((item) => item.id === id);
      raiseWeapon(unit, unit.equipment.findIndex((item) => item.definition.action === "disable-pulse"));
    },
    arms(id) {
      const unit = state.units.find((item) => item.id === id);
      return { activeSlot: unit.activeSlot, persuading: Boolean(unit.persuading) };
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
    giveItem(id, itemId, charges) {
      const unit = state.units.find((item) => item.id === id);
      const definition = state.catalog.find((item) => item.id === itemId);
      unit.equipment.push({ definition, charges: charges ?? definition.charges });
      renderInterface();
    },
    trains() {
      return state.units.filter(isTrain).map((unit) => ({ id: unit.id, cars: trainCars(unit), waiting: unit.vehicle.train.waiting }));
    },
    frameWork() {
      const sorted = [...(state.frameWork ?? [])].sort((a, b) => a - b);
      const at = (share) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))] ?? 0;
      return { frames: sorted.length, median: at(0.5), p95: at(0.95), worst: sorted.at(-1) ?? 0 };
    },
    autosaveNow() {
      writeAutosave();
    },
    brokenWindows() {
      return state.windowsBroken.size;
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
      square.disabled = unit.disabled || !controlled(unit);
      square.setAttribute("aria-label", `${label} slot ${slot + 1}: empty`);
      square.title = "Empty slot. Buy gear in the Armoury before an operation.";
      row.append(square);
      continue;
    }
    const definition = entry.definition;
    square.dataset.action = definition.action ?? "";
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
    square.title = `${definition.name}: ${definition.description} Right-click to drop it (or click it once it is used up).`;
    square.disabled = unit.disabled || !controlled(unit);
    square.addEventListener("click", () => pressSlot(unit, slot));
    square.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      dropFromSlot(unit, slot, event.shiftKey);
    });
    row.append(square);
  }
  return row;
}

function slotHint(definition) {
  switch (definition.action) {
    case "disable-pulse":
      return "weapon, click to select (switches the Persuader off)";
    case "persuade":
      return "click to switch on (puts the weapon away)";
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

// The Enter/Leave vehicle button follows what is within reach (refreshed a few times a second).
function updateVehicleButton() {
  const ride = vehicleCandidate();
  document.querySelector("#vehicle-button").disabled = !ride;
  document.querySelector("#vehicle-label").textContent = ride?.leaving ? "Leave vehicle" : ride ? "Take vehicle" : "Enter vehicle";
}

const unitSerials = new WeakMap(); // which unit object a button was made for: a new game's units are new objects
let lastSerial = 0;
const serialOf = (unit) => {
  if (!unitSerials.has(unit)) {
    lastSerial += 1;
    unitSerials.set(unit, lastSerial);
  }
  return unitSerials.get(unit);
};
// Writing the text an element already has still makes the browser lay the page out again; an operation on a server changes the interface
// ten times a second, so only changes are written.
function setText(element, text) {
  if (element.textContent !== text) element.textContent = text;
}

let shownObjectivesKey = "";
let shownRosterKey = "";
let shownThreatsKey = "";

function renderInterface() {
  if (!state.mission) return;
  const warPoints = state.online?.mode === "war" ? (state.war?.points ?? []) : null;
  const warContracts = warPoints
    ? (state.war?.contracts ?? []).map((contract) => ({ ...contract, assignment: contract.assignments?.[state.online.coalition] }))
    : [];
  const objectivesKey = JSON.stringify([
    warPoints
      ? warPoints.map((point) => [point.id, point.owner, point.claiming, Math.floor(point.progress ?? 0)])
      : state.objectives.map((o) => [o.id, o.complete, o.type === "hold" ? Math.floor(o.progress ?? 0) : 0]),
    warContracts.map((contract) => [contract.contractId, contract.assignment?.status, Math.ceil(contract.assignment?.availableAt ?? 0)]),
    warContracts.some((contract) => contract.assignment?.status === "cooldown") ? Math.floor(state.elapsed) : null,
    currentObjective(state.objectives)?.id ?? null,
    state.mission.id,
  ]);
  if (objectivesKey !== shownObjectivesKey) {
    shownObjectivesKey = objectivesKey;
    if (warPoints) {
      const names = Object.fromEntries((state.war?.coalitions ?? []).map((coalition) => [coalition.id, coalition.name]));
      const pointItems = warPoints.map((point) => {
        const item = document.createElement("li");
        const owner = point.owner ? names[point.owner] : "Neutral";
        const capture = point.claiming ? ` · ${names[point.claiming]} ${Math.floor(point.progress)} / ${state.war.captureSeconds} s` : "";
        item.textContent = `${point.name}: ${owner}${capture}`;
        item.classList.toggle("complete", point.owner === state.online.coalition);
        return item;
      });
      const contractItems = warContracts.map((contract) => {
        const item = document.createElement("li");
        const status = contract.assignment?.status ?? "available";
        const point = warPoints.find((candidate) => candidate.id === contract.pointId);
        const suffix = status === "active"
          ? `ACTIVE · capture ${point?.name ?? "the relay"} · +${contract.reward}`
          : status === "cooldown"
            ? `complete · available again in ${Math.max(0, Math.ceil(contract.assignment.availableAt - state.elapsed))} s`
            : `available from ${contract.giver}`;
        item.textContent = `${contract.title}: ${suffix}`;
        item.classList.toggle("current", status === "active");
        item.classList.toggle("complete", status === "cooldown");
        return item;
      });
      objectiveList.replaceChildren(...pointItems, ...contractItems);
    } else objectiveList.replaceChildren(
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
  }
  if (warPoints) {
    const scores = Object.fromEntries((state.war?.coalitions ?? []).map((coalition) => [coalition.id, coalition.score]));
    setText(objectiveCount, `CYAN ${scores.cyan ?? 0} · ${scores.ember ?? 0} EMBER`);
  } else {
    const completed = state.objectives.filter((objective) => objective.complete).length;
    setText(objectiveCount, `${completed} / ${state.objectives.length}`);
  }

  const selectAllButton = document.querySelector("#select-all-button");
  const everyoneSelected = activeOperators().length > 1 && selectedOperators().length === activeOperators().length;
  document.querySelector("#select-all-hub").setAttribute("aria-pressed", String(everyoneSelected));
  setText(selectAllButton, `Select all (${bindingLabel(bindings.selectAll)})`);
  selectAllButton.setAttribute(
    "aria-pressed",
    String(activeOperators().length > 1 && selectedOperators().length === activeOperators().length),
  );
  const operators = state.units.filter((unit) => unit.side === "team" && !unit.warReserve);
  // The roster's buttons are only replaced when something they show (other than numbers) changes: an operation on a server changes
  // every tenth of a second, and a button replaced between the press and the release of a click would swallow it.
  const rosterKey = JSON.stringify([
    operators.map((unit) => [
      unit.id,
      serialOf(unit),
      unit.disabled,
      isSelected({ ids: state.selectedIds }, unit.id) && !unit.disabled,
      (state.targeted[unit.id] ?? 0) > state.elapsed && !unit.disabled,
      controlled(unit),
      state.online?.owners?.[unit.id] ?? null,
      unit.activeSlot,
      Boolean(unit.persuading),
      unit.equipment.map((entry) => (entry ? [entry.definition.name, entry.charges] : null)),
    ]),
    Boolean(state.online),
  ]);
  if (rosterKey === shownRosterKey && rosterElement.children.length === operators.length) {
    for (const unit of operators) {
      const item = rosterElement.querySelector(`[data-unit="${unit.id}"]`);
      if (!item) continue;
      const pad = (value) => Math.round(value).toString().padStart(2, "0");
      setText(item.querySelector(".hp"), `${unit.health}/${maxHealth(unit)}`);
      setText(item.querySelector(".operator-position"), `${pad(unit.position.x)}:${pad(unit.position.y)}`);
    }
  } else {
    shownRosterKey = rosterKey;
    rosterElement.replaceChildren(
      ...operators.map((unit, index) => {
        const label = `${unit.definition.name} ${index + 1}`;
        const picked = isSelected({ ids: state.selectedIds }, unit.id) && !unit.disabled;
        const item = document.createElement("div");
        item.className = "roster-item";
        item.dataset.unit = unit.id;
        item.classList.toggle("selected", picked);
        item.classList.toggle("down", unit.disabled);
        item.classList.toggle("targeted", (state.targeted[unit.id] ?? 0) > state.elapsed && !unit.disabled);

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = picked;
        checkbox.disabled = unit.disabled || !controlled(unit);
        checkbox.setAttribute("aria-label", `Include ${label} in the selection`);
        checkbox.addEventListener("change", () => toggleSelect(unit.id));

        const button = document.createElement("button");
        button.type = "button";
        button.className = "roster-select";
        button.disabled = unit.disabled || !controlled(unit);
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
        name.textContent = controlled(unit) ? `Op ${index + 1}` : `Op ${index + 1} · ${state.online.owners?.[unit.id] ?? "another player"}`;
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
          slider.disabled = Boolean(state.online); // drugs are set on the squad's own game, not on a server's
          slider.addEventListener("input", () => setDrugForGroup(unit, name, Number(slider.value)));
          row.append(text, slider);
          chemistry.append(row);
          paintDrug(slider, unit);
        }
        item.append(checkbox, button, slotRow(unit, label), chemistry);
        return item;
      }),
    );
  }

  const threats = state.units.filter((unit) => unit.side === "opposition" && !unit.persuaded && !unit.warReserve);
  setText(enemyCount, String(threats.filter((unit) => !unit.disabled).length));
  const threatsKey = JSON.stringify(threats.map((unit) => [unit.id, serialOf(unit), unit.disabled, unit.health]));
  if (threatsKey !== shownThreatsKey || threatsElement.children.length !== threats.length) {
    shownThreatsKey = threatsKey;
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
  }

  const unit = selectedUnit();
  const interaction = nearbyInteraction();
  actionButton.disabled = interaction === null;
  const prop = interaction?.objective ? state.map.zones.find((zone) => zone.id === interaction.objective.targetZone)?.prop : null;
  setText(
    actionLabel,
    interaction?.giver
      ? `Speak to ${interaction.giver.missionGiver.name}`
      : prop === "server"
        ? "Download data"
        : interaction
          ? "Restore nearby relay"
          : "Restore relay",
  );
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
  setText(
    document.querySelector("#loot-label"),
    nearBody
      ? `Pick up ${nearBody.body.equipment.length} item${nearBody.body.equipment.length > 1 ? "s" : ""}`
      : bodies > 0
        ? "Pick up (walk there)"
        : "Pick up gear",
  );
  setText(repairLabel, repairKit ? `Use repair kit (${repairKit.charges ?? "∞"})` : "No repair kit");
  let orders = " · awaiting order";
  const followed = unit?.tailId ? state.units.find((item) => item.id === unit.tailId) : null;
  if (followed) orders = ` · following ${followed.definition.name}`;
  else if (unit?.path.length) orders = ` · moving · ${unit.path.length} steps remain`;
  else if (unit?.targetId) orders = " · pulse target locked";
  setText(
    selectedReadout,
    unit
      ? `${unit.definition.name} · integrity ${unit.health}/${maxHealth(unit)}` +
          ` · at ${Math.round(unit.position.x)}, ${Math.round(unit.position.y)}${orders}`
      : "No operator selected.",
  );
  markTutorialTargets();
}

function setStatus(message) {
  statusMessage.textContent = message;
}

function showFatalError(error) {
  console.error(error);
  setStatus(`Prototype could not start: ${error.message}`);
}

// The release this page is running, shown in the footer, and the watch for a newer one.
const updateBanner = document.querySelector("#update-banner");
let waitingRevision = null;
let lastInput = performance.now();
for (const type of ["pointerdown", "pointermove", "keydown", "wheel"]) {
  window.addEventListener(type, () => (lastInput = performance.now()), { passive: true });
}

function operationActive() {
  const dialogOpen = menuDialog.open || titleDialog.open || outcomeDialog.open;
  return !state.tutorial && !state.online && !dialogOpen && state.outcome === "active" && Boolean(state.mission);
}

// The operation in progress is kept in the browser as it is played (every few seconds, and when the page is hidden or left), so
// a reload, a crash or a game update puts the player back where they were: the title screen offers to resume it, and an update
// resumes it by itself.
const AUTOSAVE_KEY = "opensynd.autosave.v1";
const RESUME_FLAG = "opensynd.resume";
const AUTOSAVE_SECONDS = 10;

function writeAutosave() {
  if (!operationActive()) return;
  try {
    const saved = {
      missionId: state.mission.id,
      territoryId: state.territoryId,
      variant: state.variant,
      savedAt: Date.now(),
      snapshot: createSaveSnapshot(state),
    };
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(saved));
  } catch {
    // Storage may be full or blocked: the game goes on without it.
  }
}

function readAutosave() {
  try {
    const saved = JSON.parse(localStorage.getItem(AUTOSAVE_KEY) ?? "null");
    return saved && typeof saved.missionId === "string" && saved.snapshot ? saved : null;
  } catch {
    return null;
  }
}

function clearAutosave() {
  try {
    localStorage.removeItem(AUTOSAVE_KEY);
  } catch {
    // Nothing to do.
  }
}

// Set the operation up again and put everyone back as they were saved. Returns whether it worked.
async function resumeAutosave() {
  const saved = readAutosave();
  const index = saved ? state.missionList.findIndex((entry) => entry.id === (saved.territoryId ?? saved.missionId)) : -1;
  if (!saved || index < 0) return false;
  await loadGame(index, { variant: saved.variant ?? null }); // the operation it was saved in, whatever the territory has become
  try {
    applySaveSnapshot(parseSaveSnapshot(JSON.stringify(saved.snapshot), saveContext()));
  } catch (error) {
    clearAutosave();
    setStatus(`The saved operation could not be restored: ${error.message}`);
    return false;
  }
  menuDialog.close();
  titleDialog.close();
  setStatus("Operation resumed where you left it.");
  return true;
}

// On the title screen: offer to resume (or, after an update, just do it).
async function offerResume() {
  let automatic = false;
  try {
    automatic = sessionStorage.getItem(RESUME_FLAG) === "1";
    sessionStorage.removeItem(RESUME_FLAG);
  } catch {
    // No session storage: just offer.
  }
  const saved = readAutosave();
  const entry = saved ? state.missionList.find((item) => item.id === (saved.territoryId ?? saved.missionId)) : null;
  if (!saved || !entry) return;
  if (automatic && (await resumeAutosave())) return;
  const minutes = Math.max(0, Math.round((Date.now() - saved.savedAt) / 60000));
  const ago = minutes === 0 ? "a moment" : `${minutes} minute${minutes === 1 ? "" : "s"}`;
  document.querySelector("#resume-text").textContent = `Your operation "${entry.name ?? saved.missionId}" was saved ${ago} ago.`;
  document.querySelector("#resume-box").hidden = false;
}

function applyUpdate() {
  persistCampaign();
  if (operationActive()) {
    writeAutosave();
    try {
      sessionStorage.setItem(RESUME_FLAG, "1");
    } catch {
      // The title screen will still offer to resume.
    }
  }
  location.reload();
}

fetch(assetUrl("build-meta.json"))
  .then((response) => response.json())
  .then((metadata) => {
    document.querySelector("#revision").textContent = `source: ${metadata.revision.slice(0, 12)}`;
    const quick = new URLSearchParams(location.search).has("e2e");
    watchForUpdates({
      running: metadata.revision,
      every: quick ? 1 : CHECK_SECONDS,
      fetchPublished: async () => {
        // The site's own copy (not this release's): whatever is published now.
        const response = await fetch(new URL("build-meta.json", document.baseURI), { cache: "no-store" });
        return response.ok ? (await response.json()).revision : null;
      },
      onWaiting: (revision) => {
        waitingRevision = revision;
        updateBanner.hidden = false;
      },
    });
  })
  .catch(() => {
    document.querySelector("#revision").textContent = "source: unavailable";
  });

window.addEventListener("pagehide", writeAutosave);
document.addEventListener("visibilitychange", () => document.hidden && writeAutosave());

// Between operations, out of sight or left alone: switch to the waiting release without anyone noticing.
setInterval(() => {
  const idleSeconds = (performance.now() - lastInput) / 1000;
  const busy = operationActive() || researchDialog.open;
  if (canApplyQuietly({ waiting: Boolean(waitingRevision), operationActive: busy, hidden: document.hidden, idleSeconds })) applyUpdate();
}, 1000);
document.querySelector("#update-later").addEventListener("click", () => {
  updateBanner.hidden = true;
});
document.querySelector("#update-now").addEventListener("click", () => applyUpdate()); // an operation in progress is saved and resumes

loadGame()
  .then(offerResume)
  .then(() => menuDialog.open && showMainMenu()) // the saved game and the wins are known now
  .catch(showFatalError);
requestAnimationFrame(frame);
