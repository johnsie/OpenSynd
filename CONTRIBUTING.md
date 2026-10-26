<!-- SPDX-License-Identifier: GPL-2.0-or-later -->

# Contributing to OpenSynd

OpenSynd is being built as a free and open-source game that does not require or
redistribute data from other games. Contributions must be both technically
useful and legally redistributable.

## Before contributing

- Do not commit, upload, trace, sample, transcribe, or attach proprietary game
  data, screenshots, maps, music, dialogue, or extracted resources.
- Do not use proprietary material as a direct input to asset-generation tools.
- Do not reproduce distinctive names, characters, missions, maps, story, user
  interface artwork, or other creative expression from other games.
- Open an issue before adding a dependency, changing a file format, or importing
  third-party material.
- Keep source files in the preferred form for modification. For example, submit
  the layered image or music project alongside its exported runtime asset.

## Code

New code derived from or linked into the legacy engine must use:

    SPDX-License-Identifier: GPL-2.0-or-later

Do not change the notices or licensing of existing files. The exact licensing
of the inherited tree is still being audited. A new standalone component may
use a different OSI-approved license only after maintainers document the
compatibility and architectural reason.

Dependencies must use an OSI-approved license compatible with the applicable
GNU GPL terms. Commit lockfiles and record required notices.

## Assets and content

Read [ASSET_POLICY.md](ASSET_POLICY.md) before creating or importing art,
music, sound, fonts, maps, narrative text, or other content. Every asset must be
added to `provenance/assets.json`. The provenance check rejects unregistered or
modified files.

The preferred licenses are CC0-1.0 and CC-BY-4.0. Do not submit material under
NonCommercial, NoDerivatives, personal-use, source-available, or unclear terms.

## Developer Certificate of Origin

Every commit must include a `Signed-off-by` trailer, certifying the Developer
Certificate of Origin 1.1: <https://developercertificate.org/>.

Use Git's sign-off option:

```sh
git commit --signoff
```

Signing off means that you created the contribution, have the right to submit
it under the stated license, or received it from a source that grants that
right. It is not a copyright assignment.

## Checks

Run the provenance check before opening a pull request:

```sh
python3 tools/check_provenance.py
python3 tools/check_source_licenses.py
python3 tools/validate_content.py
python3 tools/check_web_sync.py
```

For legacy C++ changes, also configure and build the existing CMake project.
New web components will gain their own test command when Phase 2 begins.

## Review

Maintainers may quarantine a contribution while ownership or licensing is
investigated. Missing provenance blocks a release. Technical acceptance does
not override the asset policy or the original-IP exclusion rules.

