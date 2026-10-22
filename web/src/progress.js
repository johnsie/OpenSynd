// SPDX-License-Identifier: GPL-2.0-or-later

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

// The first operation is always open; each later one opens when the one before it is done.
export function isUnlocked(progress, missionIds, index) {
  return index <= 0 || isCompleted(progress, missionIds[index - 1]);
}
