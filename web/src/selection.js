// SPDX-License-Identifier: GPL-2.0-or-later

// The set of selected operator ids, in the order they were picked. The primary
// operator is the one shown in readouts; saves store only the primary.
export function emptySelection() {
  return { primary: null, ids: [] };
}

export function selectOnly(id) {
  return { primary: id, ids: [id] };
}

export function selectMany(ids) {
  return { primary: ids[0] ?? null, ids: [...ids] };
}

// Add the id if absent, remove it if present; the last operator cannot be removed.
export function toggle(selection, id) {
  if (!selection.ids.includes(id)) {
    return { primary: id, ids: [...selection.ids, id] };
  }
  if (selection.ids.length === 1) return selection;
  const ids = selection.ids.filter((item) => item !== id);
  return { primary: selection.primary === id ? ids.at(-1) : selection.primary, ids };
}

// Drop ids that are no longer available (for example disabled operators).
export function prune(selection, availableIds) {
  const ids = selection.ids.filter((id) => availableIds.includes(id));
  if (ids.length === selection.ids.length) return selection;
  if (ids.length === 0) return selectMany(availableIds.slice(0, 1));
  return { primary: ids.includes(selection.primary) ? selection.primary : ids[0], ids };
}

export function isSelected(selection, id) {
  return selection.ids.includes(id);
}

export function isMulti(selection) {
  return selection.ids.length > 1;
}
