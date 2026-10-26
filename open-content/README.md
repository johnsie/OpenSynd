<!-- SPDX-License-Identifier: GPL-2.0-or-later -->

# OpenSynd Open Content

This directory contains the documented, engine-independent content formats for
OpenSynd. It must never contain data extracted or transcribed from other games.

## Layout

- `schemas/` contains JSON Schema draft 2020-12 descriptions of format version
  1.
- `packs/` contains redistributable content packs.
- `packs/developer/` is a deliberately simple CC0 pack used by tests and the
  first browser prototype.

A pack declares all of its maps, units, and missions in `pack.json`. References
are relative to the pack root and may not escape it. Undeclared JSON files are
rejected so content cannot enter a distribution without review.

Pack provenance is recorded directly in its manifest. A `development` pack can
be used by local prototypes and CI, but only an `approved` pack—with named
reviewer and review date—may enter a release.

## Map composition

Version 1 maps use an isometric diamond projection. A map is built from ordered
rectangular regions: the first region normally fills the ground, and later
regions override it. This compact representation is meant for the geometric
developer renderer, not as a final limitation on authored maps.

Named zones connect geometry to mission intent. Missions refer to zone IDs
rather than embedding map coordinates in objectives.

## Units and missions

Unit files contain simulation statistics, abilities, and a procedural
appearance. Shape, marker, and colour are all present so identity never depends
on colour alone.

Mission files select a map, place player and opposing units, and define ordered
objectives. Version 1 supports reach, interaction, protection, disablement, and
extraction objectives. Narrative consequences will be added in a later schema
version rather than as undocumented fields.

## Validation

Run:

```sh
python3 tools/validate_content.py
```

The dependency-free validator checks pack containment, references, identifiers,
licenses, map bounds, placements, zones, and objectives. The JSON Schemas exist
for editor integration and third-party tooling; the validator remains the
release gate used by CI.

## Licensing

The schemas and documentation are GPL-2.0-or-later. Each content pack declares
its own approved free-culture license. The developer pack is dedicated under
CC0-1.0; the complete legal text is in `LICENSES/CC0-1.0.txt`.

