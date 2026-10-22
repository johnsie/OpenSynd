<!-- SPDX-License-Identifier: GPL-2.0-or-later -->

# OpenSynd IP and Provenance Audit

**Status:** in progress  
**Started:** 2026-10-22  
**Scope:** inherited FreeSynd repository and the proposed OpenSynd web game

This is a working engineering audit, not a legal opinion. Unknown provenance is
treated as a blocker rather than assumed permission.

## Initial findings

| Area | Finding | Classification | Required action |
| --- | --- | --- | --- |
| Main C++ sources | Most inspected files contain GPL v2-or-later notices. | Keep pending audit | Inventory every file and reconcile this with the README's less precise “version 2” statement. Preserve all notices. |
| `COPYING` | Contains the GNU GPL version 2 license text. | Keep | Do not treat the license text alone as proof that every file has an “or later” grant. |
| UTF8-CPP headers | Carry a separate permissive notice by Nemanja Trifunovic. | Keep pending compatibility verification | Record exact files and SPDX expression; preserve notice. |
| `ConfigFile` | Carries an MIT-style notice by Richard J. Wagner. | Keep pending compatibility verification | Record exact files and preserve notice. |
| CRC32 implementation | The inherited “All rights reserved” implementation was replaced on 2026-10-22 with a small independently written GPL-2.0-or-later implementation preserving the public API. | Replaced/resolved | Keep the standard-vector regression test in CI. |
| XMIDI implementation | Project code says portions derive from the System Shock Hack Project under a BSD license. | Keep pending source verification | Identify the exact borrowed portions and preserve the complete upstream BSD notice. |
| `data/lang` | Contains game-facing names and text with no file-level provenance metadata. | Excluded from OpenSynd | Replace with original OpenSynd localization source. |
| `data/ref` | Encodes compatibility data for the original game, including expected-file checksums. | Excluded from OpenSynd | Define new schemas and independently authored data. Do not ship original-data validation in the web client. |
| `data/music`, cursor, and icons | No reliable license or authorship metadata was found in the repository files inspected. | Quarantine | Find documentary provenance or replace with original assets. |
| Original-data loaders | Runtime configuration and engine code explicitly load and validate the original game's `DATA` files. | Legacy-only | Keep outside the OpenSynd build; document behaviour, then replace with open formats. |
| Name `OpenSynd` | An initial exact-name general web search found no obvious collision. | Provisional | Complete register searches and legal confusion analysis before public branding. |

The automated source audit recognizes explicit GPL-2.0-or-later SPDX notices,
the legacy GPL v2-or-later boilerplate, MIT notices, and the Boost Software
License 1.0 notice used by the bundled UTF8-CPP headers. Three source files are
hash-pinned as unresolved in `provenance/source-licenses.json`; any change to
one of them requires renewed review. As of 2026-10-22, the scan covers 203
source and test files: 194 GPL-2.0-or-later, four BSL-1.0, two MIT, and three
unresolved.

## Initial file classification

- **Keep pending audit:** legacy source code and build files with apparent free
  software notices.
- **Quarantine:** `data/cursors`, `data/music`, and `icon` until evidence or
  replacements are available.
- **Exclude from OpenSynd:** `data/lang`, `data/ref`, original-data checks, and
  all external *Syndicate* data.
- **New work:** governance documents and provenance tooling added for OpenSynd;
  these contain explicit SPDX identifiers.
- **Unresolved source:** `src/SDLMain.m`, `src/cp437.h`, and
  `src/menus/widget.cpp`.

The asset-level records and hashes are maintained in
`provenance/assets.json`. Classification does not delete or relicense legacy
material; it controls whether that material may enter an OpenSynd artifact.

## Open questions

- Does every inherited FreeSynd contribution grant GPL-2.0-or-later, or are any
  files GPL-2.0-only?
- What are the authoritative licenses and origins of the cursor, icons, music,
  translations, reference data, and XMIDI-derived code?
- Who owns the FreeSynd name and visual branding?
- Does OpenSynd create a likelihood of confusion in any intended market?
- Are any historical commits or release archives known to contain proprietary
  game data?

## Release blockers

- No unregistered asset may enter a build.
- No quarantined or excluded file may enter an OpenSynd web artifact.
- The legacy license expression must be resolved before derived web code is
  publicly released.
- OpenSynd naming clearance must be completed before final branding.
- The first public release requires review by a qualified IP lawyer.

## Decision log

| Date | Decision | Evidence | Reviewer |
| --- | --- | --- | --- |
| 2026-10-22 | Treat all existing non-code assets as quarantined or excluded until provenance is established. | Repository inspection; no per-asset metadata found. | Pending maintainer review |
| 2026-10-22 | Use OpenSynd only as a working name. | Preliminary exact-name web search; formal register search not completed. | Pending legal review |
| 2026-10-22 | Replace the NetworkDLS CRC32 files rather than rely on an unclear notice. | Independent CRC-32/ISO-HDLC implementation and standard-vector regression test. | Engineering review pending |
| 2026-10-22 | Replace the unlicensed `embed` and `copy_but` build helpers. | New GPL-2.0-or-later implementations preserving their command-line contracts. | Engineering review pending |

