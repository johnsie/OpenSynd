// SPDX-License-Identifier: GPL-2.0-or-later

// What the Continue button on the main menu does. A saved operation is put back where it was; otherwise a campaign with
// anything won in it goes to the world map; a fresh browser has nothing to continue.
export function continueTarget({ hasAutosave, completedCount }) {
  if (hasAutosave) return "operation";
  if (completedCount > 0) return "campaign";
  return null;
}

// The line under the Continue button.
export function continueNote(target, { operationName = "", completedCount = 0 } = {}) {
  if (target === "operation") return operationName ? `Back into "${operationName}".` : "Back into your operation.";
  if (target === "campaign") return `${completedCount} operation${completedCount === 1 ? "" : "s"} won. Pick the next on the map.`;
  return "";
}
