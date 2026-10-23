// SPDX-License-Identifier: GPL-2.0-or-later

import { normalizeBindings } from "./input.js";

export const SETTINGS_FORMAT = "opensynd-settings";
export const SETTINGS_VERSION = 1;
export const SETTINGS_KEY = "opensynd.settings.v1";

export const DEFAULT_SETTINGS = Object.freeze({
  volume: 0.6,
  muted: false,
  music: true,
  musicVolume: 0.35,
  victoryTheme: "march",
  spoken: true,
  captions: true,
  reducedMotion: "system",
  textScale: 1,
  edgeScroll: true,
  keyBindings: normalizeBindings({}),
});

const VICTORY_THEME_IDS = ["march", "brass", "band"];
const REDUCED_MOTION_VALUES = ["system", "on", "off"];

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

// Unknown or malformed fields fall back to defaults so a damaged settings
// record can never prevent the game from starting.
export function normalizeSettings(raw) {
  const source = raw !== null && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const settings = { ...DEFAULT_SETTINGS };
  if (Number.isFinite(source.volume)) settings.volume = clamp(source.volume, 0, 1);
  if (typeof source.muted === "boolean") settings.muted = source.muted;
  if (typeof source.music === "boolean") settings.music = source.music;
  if (Number.isFinite(source.musicVolume)) settings.musicVolume = clamp(source.musicVolume, 0, 1);
  if (VICTORY_THEME_IDS.includes(source.victoryTheme)) settings.victoryTheme = source.victoryTheme;
  if (typeof source.spoken === "boolean") settings.spoken = source.spoken;
  if (typeof source.captions === "boolean") settings.captions = source.captions;
  if (REDUCED_MOTION_VALUES.includes(source.reducedMotion)) {
    settings.reducedMotion = source.reducedMotion;
  }
  if (typeof source.edgeScroll === "boolean") settings.edgeScroll = source.edgeScroll;
  if (Number.isFinite(source.textScale)) settings.textScale = clamp(source.textScale, 0.75, 2);
  settings.keyBindings = normalizeBindings(source.keyBindings);
  return settings;
}

export function serializeSettings(settings) {
  return JSON.stringify(
    {
      format: SETTINGS_FORMAT,
      formatVersion: SETTINGS_VERSION,
      settings: normalizeSettings(settings),
    },
    null,
    2,
  );
}

export function parseSettings(text) {
  let record;
  try {
    record = JSON.parse(text);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
  if (record?.format !== SETTINGS_FORMAT || record.formatVersion !== SETTINGS_VERSION) {
    return { ...DEFAULT_SETTINGS };
  }
  return normalizeSettings(record.settings);
}

export function prefersReducedMotion(settings, systemPrefers) {
  if (settings.reducedMotion === "on") return true;
  if (settings.reducedMotion === "off") return false;
  return Boolean(systemPrefers);
}
