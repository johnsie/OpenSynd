<!-- SPDX-License-Identifier: GPL-2.0-or-later -->

# NeuroReign save format

NeuroReign saves are UTF-8 JSON documents intended to remain readable, editable,
and portable between compatible builds. They are player-owned data: the web
client stores one optional slot in browser-local storage and transmits nothing.

## Version 3

Every document contains:

- `format`: the literal `opensynd-save`;
- `formatVersion`: the integer `10` (see Compatibility for how older versions are read);
- `createdAt`: a normalized UTC ISO 8601 timestamp;
- `missionId`: the active open-content mission identifier;
- `selectedId` and `cursor`: current input state;
- `units`: every mission unit's identifier, position, remaining route, health,
  cooldown, target, disabled state, carried items,
  looted items and persuasion state. Optional fields read as defaults when
  missing: `drugs` (the three dose records, neutral), `escaped` (false),
  `scriptIndex` and `scriptDone` (the start of a scripted person's steps). The `levels`, `stamina` and `focus`
  fields of earlier versions are no longer written; they are ignored when read; and
- `objectives`: every mission objective's identifier and completion state.

Imports must match the active mission exactly. Unknown, duplicate, or missing
unit and objective identifiers are rejected. Coordinates must be finite and in
map bounds; route coordinates must also be whole, walkable grid positions.

## Compatibility

Readers must reject unsupported versions rather than guess their meaning. A
future incompatible change increments `formatVersion` and supplies an explicit,
tested migration from each supported older version. New optional fields may be
ignored by version 1 readers, but existing fields cannot change meaning within
the version.

Version 1 saves are migrated by initializing each unit with full health and no
active combat target. Version 2 saves are migrated by adding newly introduced
mission units at their authored starting positions. Both migrations are
deterministic and covered by tests.

The current browser client limits imported files to 256 KiB. Exported saves do
not include code, content-pack assets, unit definitions, or legacy game data.

Fields added without a version bump (`drugs`, `escaped`, `scriptIndex`, `scriptDone`) are optional and repaired to
safe defaults when absent or damaged. Campaign progress (funds, research, roster, upgrades, territories, intelligence)
is kept in a separate browser-local record, never in a mission save, and is repaired field by field when read.
