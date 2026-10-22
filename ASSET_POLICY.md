<!-- SPDX-License-Identifier: GPL-2.0-or-later -->

# OpenSynd Asset Policy

This policy applies to artwork, animation, audio, fonts, maps, level data,
localization, narrative text, and other non-code content distributed by the
project.

## Accepted licenses

New project-owned assets should use **CC0-1.0** whenever contributors are
comfortable making that dedication. **CC-BY-4.0** is also accepted when its
attribution requirements can be satisfied. Fonts may use **OFL-1.1**.

Other licenses require review before the file is added. CC-BY-SA material is
not accepted by default because combining and adapting it can complicate the
licensing of a game bundle. Creative Commons licenses must not be used for
software.

The following are not accepted:

- licenses containing NonCommercial or NoDerivatives restrictions;
- personal-use, educational-use-only, or source-available terms;
- material copied from a commercial game, film, recording, or website;
- material with no identifiable source or license;
- public-domain claims that cannot be supported by a reliable provenance trail;
- generated assets whose inputs, service terms, or contributor rights cannot
  be documented under the project's generated-content policy.

## Intake requirements

Before a media asset is used, add one record to `provenance/assets.json`
containing:

- its repository path and SHA-256 digest;
- title or stable asset identifier;
- creator and copyright holder;
- source URL, or `created-for-opensynd` for an original contribution;
- SPDX license identifier;
- required attribution;
- editable source path;
- reviewer and review date;
- a note describing modifications and any reference material.

Structured maps, missions, and unit definitions use the equivalent provenance
fields in their content-pack manifest and are checked by
`tools/validate_content.py`; they are not duplicated in the media asset
registry.

Set `status` to `approved` only after review. `quarantined` files remain solely
for audit and migration work. `excluded` files must not enter an OpenSynd build,
test fixture, screenshot, demo, or release.

## Original-IP exclusion rule

OpenSynd may implement independently designed squad tactics, research,
territory control, cybernetic upgrades, and other general mechanics. It must not
copy or closely reproduce *Syndicate*'s audiovisual or literary expression,
including its sprites, maps, missions, dialogue, music, sound effects,
cinematics, logos, interface artwork, factions, or distinctive character and
equipment names.

The official development pack must be created from original written briefs. It
must remain sufficient to build and test the project without proprietary data.

## Attribution and source form

Attribution must survive packaging and appear in the in-game credits and
distributed notices. Runtime exports do not replace editable source: a rendered
PNG should normally be accompanied by its layered source, and music by its
score, stems, or project file.

When an asset is modified, retain the original credit and record the change.
Do not remove notices embedded by a license unless the license expressly permits
it.

