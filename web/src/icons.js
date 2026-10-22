// SPDX-License-Identifier: GPL-2.0-or-later

// Original item icons, drawn as simple vector shapes on a 32 x 32 grid. They use the
// current text colour, so the interface can tint them. The markup is built only from
// the constants below, never from content or player data.
const SHAPES = Object.freeze({
  pulse: '<path d="M4 12h17v6h-7l-2 8h-5l2-8H4z"/><circle cx="25" cy="15" r="3"/>',
  "heavy-pulse":
    '<path d="M2 13h21v5H13l-2 7H7l2-7H2z"/><rect x="23" y="12" width="5" height="7"/>' +
    '<circle cx="29" cy="15.5" r="2"/><path d="M12 9h6v3h-6z"/>',
  medkit:
    '<rect x="4" y="9" width="24" height="17" rx="3"/><path d="M12 9V6h8v3"/>' +
    '<path d="M16 13v9M11.5 17.5h9" class="cut"/>',
  syringe:
    '<path d="M8 24l12-12 3 3-12 12H8z"/><path d="M19 9l4-4 4 4-4 4"/>' +
    '<path d="M6 26l-3 3M13 17l2 2"/>',
  cloak:
    '<path d="M16 3c-5 0-8 4-8 9v16h6v-6h4v6h6V12c0-5-3-9-8-9z"/><circle cx="16" cy="12" r="3" class="cut"/>',
  box: '<rect x="5" y="8" width="22" height="18" rx="2"/><path d="M5 14h22"/>',
});

export const ICON_NAMES = Object.freeze(Object.keys(SHAPES).filter((name) => name !== "box"));

export function hasIcon(name) {
  return ICON_NAMES.includes(name);
}

// SVG markup for an icon; an unknown name gets a plain box.
export function iconMarkup(name, size = 32) {
  const shape = SHAPES[hasIcon(name) ? name : "box"];
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="${size}" height="${size}" ` +
    `fill="currentColor" fill-opacity="0.25" stroke="currentColor" stroke-width="1.6" ` +
    `stroke-linejoin="round" stroke-linecap="round" aria-hidden="true" focusable="false">${shape}</svg>`
  );
}
