<!-- SPDX-License-Identifier: GPL-2.0-or-later -->

# Format versions and compatibility policy

Everything OpenSynd writes or reads has an explicit version, so a new release never silently misreads an old file.

| Thing | Where | Version field | Policy |
| --- | --- | --- | --- |
| Operation save (and the autosave, which is the same document) | browser storage, exported `.json` | `formatVersion` (now 10) | Every older version is migrated by a tested step (`web/src/save.js`, `migrateSaveSnapshot`); a version the reader does not know is refused, never guessed. Older local slots are still found (`LEGACY_LOCAL_SAVE_KEYS`). |
| Campaign record (funds, roster, research, territories) | browser storage | none: repaired field by field when read | New fields get safe defaults; damaged or unknown fields are dropped; a read never throws. |
| Settings | browser storage | none: repaired field by field | Same as the campaign record. |
| Content pack (missions, maps, units, equipment, vehicles) | `open-content/`, `web/content/` | `formatVersion` (now 1) in every file, JSON schemas in `open-content/schemas/` | A change that old content cannot satisfy raises `formatVersion` and ships a conversion note in `ROADMAP.md`; additive optional fields do not. `tools/validate_content.py` checks every file. |
| Release files | `SHA256SUMS`, `sbom.cdx.json`, `asset-bom.json` | CycloneDX `specVersion`; `asset-bom.json` has a stable shape | Described in `docs/RELEASING.md`. |

## Rules for changing a format

1. **Prefer an optional field with a default** that old data satisfies: no version change, and a test that data without the field
   still loads.
2. **If meaning changes or a field becomes required**, raise the version and add a migration from the previous version, with a test
   that builds a document of the old shape and loads it. Never edit an old migration: add a new step.
3. **Never remove the ability to read an older save** without announcing it in the release notes first.
4. **Refuse, do not guess.** A document with a newer version than the game knows is rejected with a clear message (the player
   can update the game: see hot updates in `deploy/README.md`).
5. **Content from other people is data, not code.** It is validated against the schema and bounds before use and never executed.

## Where the tests are

- Save migrations: `web/test/save.test.js` (one test per migrated change).
- Content: `tools/validate_content.py` (CI) and `web/test/mission.test.js`, `web/test/objectives.test.js`.
- Campaign and settings repair: `web/test/campaign.test.js`, `web/test/settings.test.js`.
