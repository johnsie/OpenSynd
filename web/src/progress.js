// SPDX-License-Identifier: GPL-2.0-or-later

import { SETTINGS_KEY } from "./settings.js";

// Which operations the player has completed, kept in this browser only.
export const PROGRESS_KEY = "opensynd.progress.v1";

export function emptyProgress() {
  return { completed: [] };
}

// Damaged or foreign data is ignored rather than trusted.
export function parseProgress(text) {
  try {
    const value = JSON.parse(text);
    if (value && Array.isArray(value.completed)) {
      const completed = value.completed.filter((id) => typeof id === "string" && id.length > 0 && id.length < 120);
      return { completed: [...new Set(completed)] };
    }
  } catch {
    // Fall through to an empty record.
  }
  return emptyProgress();
}

export function serializeProgress(progress) {
  return JSON.stringify({ completed: progress.completed }, null, 2);
}

export function isCompleted(progress, missionId) {
  return progress.completed.includes(missionId);
}

export function markCompleted(progress, missionId) {
  return isCompleted(progress, missionId)
    ? progress
    : { completed: [...progress.completed, missionId] };
}

// Operations form a graph of territories (FreeSynd's neighbours): winning one opens the ones it lists in `unlocks`. When no
// operation lists any, they open as a simple chain, each after the one before. Entries may be plain ids (always a chain).
export function prerequisites(entries, index) {
  const list = entries.map((entry) => (typeof entry === "string" ? { id: entry } : entry));
  const graph = list.some((entry) => Array.isArray(entry.unlocks) && entry.unlocks.length > 0);
  if (!graph) return index <= 0 ? [] : [list[index - 1].id];
  return index <= 0 ? [] : list.filter((entry) => entry.unlocks?.includes(list[index].id)).map((entry) => entry.id);
}

// The first operation is always open; the others open when one that unlocks them has been completed.
export function isUnlocked(progress, entries, index) {
  if (index <= 0) return true;
  return prerequisites(entries, index).some((id) => isCompleted(progress, id));
}

// A new game forgets the campaign (funds, upgrades, roster, territories, research), the operations won and every saved
// game kept in this browser; the settings (sound, keys) stay. Returns how many entries it removed.
export function clearGameStorage(storage) {
  const doomed = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key?.startsWith("opensynd.") && key !== SETTINGS_KEY) doomed.push(key);
  }
  for (const key of doomed) storage.removeItem(key);
  return doomed.length;
}
