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
  persuader:
    '<circle cx="16" cy="16" r="3"/><path d="M9 16a7 7 0 0 1 14 0M5 16a11 11 0 0 1 22 0"/>' +
    '<path d="M9 16a7 7 0 0 0 14 0M5 16a11 11 0 0 0 22 0"/>',
  smg:
    '<path d="M3 12h19v5h-8l-1 3h-4l1-3H3z"/><path d="M22 13h5v3h-5z"/><path d="M9 17v8h4v-8" />' +
    '<path d="M17 17l1 3h-3z"/>',
  rotary:
    '<path d="M3 13h12v6H3z"/><path d="M15 12h12v2H15zM15 15h12v2H15zM15 18h12v2H15z"/><path d="M8 19v6h4v-6"/>' +
    '<circle cx="9" cy="16" r="1.5" class="cut"/>',
  coil:
    '<path d="M3 14h24v4H3z"/><path d="M8 11v10M12 11v10M16 11v10M20 11v10" class="cut"/>' +
    '<path d="M27 15h3v2h-3z"/><path d="M6 18v6h4v-6"/>',
  longshot:
    '<path d="M2 15h26v3H2z"/><path d="M5 12h8v3H5z"/><circle cx="9" cy="10" r="2"/>' +
    '<path d="M22 18l-2 6h-3l2-6M28 14h3v5h-3z"/>',
  bomb:
    '<circle cx="15" cy="18" r="9"/><path d="M20 10l4-5M23 4l2 1 1 2"/><path d="M12 14a5 5 0 0 1 4-2" class="cut"/>' +
    '<path d="M11 21h8M15 17v8" class="cut"/>',
  shield:
    '<path d="M16 3l11 4v8c0 7-5 12-11 14C10 27 5 22 5 15V7z"/><path d="M16 8v15M10 13h12" class="cut"/>',
  scatter:
    '<path d="M3 13h14v6H3z"/><path d="M17 11l10-4v18l-10-4z"/><path d="M8 19v6h4v-6"/><circle cx="29" cy="10" r="1"/>' +
    '<circle cx="29" cy="16" r="1"/><circle cx="29" cy="22" r="1"/>',
  flame:
    '<path d="M3 15h13v5H3z"/><path d="M16 16h4"/><path d="M21 17c0-4 3-5 3-9 3 2 6 5 6 9 0 4-3 7-6 7s-3-3-3-7z"/>' +
    '<path d="M25 22c-2-1-2-3 0-5 2 2 2 4 0 5z" class="cut"/><path d="M7 20v6h4v-6"/>',
  beam:
    '<path d="M3 13h15v6H3z"/><path d="M18 15h12v2H18z" class="cut"/><path d="M22 10l-2 5h4l-2 5M26 11l-1 4"/><path d="M7 19v6h4v-6"/>',
  scanner:
    '<rect x="9" y="4" width="14" height="24" rx="2"/><circle cx="16" cy="14" r="4"/><path d="M16 14l3-3"/>' +
    '<path d="M12 22h8M12 25h5"/><path d="M4 9a14 14 0 0 0 0 12M28 9a14 14 0 0 1 0 12"/>',
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
