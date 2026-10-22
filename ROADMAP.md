# OpenSynd Roadmap

## Purpose

Create **OpenSynd**, a browser-native, community-maintainable game derived from
the FreeSynd codebase while removing every runtime dependency on proprietary
*Syndicate* data and avoiding use of protected branding or creative expression.

OpenSynd is the working project name. An initial exact-name web search found no
obvious collision, but that is not trademark clearance. The name remains
provisional until the searches and legal review in Phase 0 are complete.

This roadmap treats legal provenance, reproducible builds, and user freedom as
release requirements. It is a project plan, not legal advice; an IP lawyer
should review the name, clean-room policy, and first public release.

## Implementation status

Phase 0 began on 2026-10-22. The repository now has contribution, asset, and
working-name policies; an initial IP audit; a machine-readable asset provenance
registry; automated CI checks for unregistered assets and unknown source
licenses; and regression coverage for the independently replaced CRC-32 code.

All 13 current files under `data/` and `icon/` are conservatively classified:
seven are excluded from OpenSynd and six are quarantined pending evidence or
replacement. No legacy asset is currently approved for an OpenSynd release.

The remaining Phase 0 gates are the complete file-by-file source audit,
resolution or replacement of third-party components with unclear notices,
formal name clearance, and qualified legal review.

The current source audit classifies 203 source and test files: 194 as
GPL-2.0-or-later, four as BSL-1.0, two as MIT, and three as unresolved. The
unclear CRC-32 component and two unlicensed build helpers have been replaced
with GPL-2.0-or-later implementations.

Phase 1 has also begun: versioned schemas now cover content packs, maps, units,
and missions. A CC0 geometric developer pack defines the original “First Light”
test mission without raster art or proprietary data, and CI validates its
references, bounds, identifiers, and licenses.

Phase 2 now has a dependency-free browser prototype under `web/`. It loads the
developer pack, renders Signal Yard with Canvas 2D procedural geometry, supports
pointer and keyboard selection, finds routes around blocked tiles, moves two
operators in real time, pauses, tracks relay and extraction objectives, and
shows licenses and build provenance. Movement now runs in a renderer-independent
30 Hz fixed-step simulation with deterministic replay fixtures. Automated tests
cover map composition, pathfinding, isometric transforms, mission-zone
boundaries, fixed-step timing, repeatable movement, and save validation. Players
can use a browser-local save slot or export and import human-readable,
versioned JSON; imported state is validated before use and never sent to a
service. The same fixed-step layer now resolves deterministic disabling-pulse
combat, cooldowns, damage, watcher retaliation, and unit shutdown. Combat state
is covered by replay fixtures and tested save migrations. The developer mission
now fields four operators, requires deliberate
relay interaction rather than completing objectives on contact, and includes a
touch/pointer direction pad with movement and contextual action controls. Save
format version 3 preserves older progress while adding the expanded squad at
authored starting positions.

The prototype also stores versioned settings (volume, mute, captions, reduced
motion, text size) locally, plays six procedurally synthesized sound cues with
on-screen captions, and has a browser end-to-end smoke test that passes in
Chromium and Firefox. npm packages are tracked in
`provenance/dependencies.json` and checked in CI; the only one so far is the
dev-only `playwright-core` (Apache-2.0).

Phase 3 work now includes a service gate that blocks the exit until its control
panel is used, a pure `mission.js` rules module (arrival and interaction
objectives, extraction gating, gate state), and a golden full-playthrough test
that pins fixed-step counts for every leg. Units are drawn from 8-direction
sprite sheets rendered from a CC0 Quaternius model, all registered as
`quarantined` until a named reviewer approves them.

Level 1 ("First Light") now runs on a 128 × 128 tile map (16,384 tiles) generated
deterministically by `tools/generate_signal_yard.py`: a grid of city blocks, a
runoff channel crossed by four bridges, three plaza intersections for the
relays and gate panel, and a fenced compound with one gate. The generator
verifies that every objective is reachable and that the exit is sealed until
the gate opens. The browser client has a scrolling, zoomable camera that draws
only visible tiles (about 60 fps fully zoomed out), drag-to-pan, a minimap, and
remappable camera keys. Arrow keys pan the view smoothly while held; the grid
cursor moves with I/J/K/L (remappable) and Enter issues the move.

Security watchers now patrol deterministic routes built from mission waypoints
(`patrol` in the mission schema). A patrolling watcher holds position while it
has a target in pulse range and resumes afterwards. Every operator has two adjustable training bars, Legs (saved as `speed`) and Brain, each from 1 to
5 with 3 as the baseline in the unit data. Legs scales walking pace from 0.6x
to 1.4x; Brain scales the pulse cooldown from 1.3x to 0.7x (shorter is
faster). The rules are pure (`web/src/stats.js`), covered by tests, and saved
in format version 5 with a tested migration from version 4.

Operators can be picked individually: each roster entry has a selection checkbox,
Ctrl/Shift-click adds or removes an operator, and each entry carries its own
Legs and Brain controls. Orders (moves, pulses, interactions, training from the
Training panel) apply to everyone selected.

Watchers also notice operators within sight (awareness x 0.1 tiles), chase them
over real streets at 85% of an operator's speed so a fleeing squad keeps its
lead, stop within pulse range, and walk back to their route once they lose
sight. The behaviour is stateless and deterministic, so it needs no extra save
fields.
Save format version 4 stores
each unit's place along its route, with a tested migration from version 3.

The prototype also has an original generative score (`web/src/music.js`): a
four-chord loop in A minor with bass, pad and a delayed arpeggio, synthesized in
the browser with its own on/off and volume settings, so no audio asset needs
provenance.

A dependency-free style check (`tools/check_style.py`) enforces SPDX headers,
final newlines, no tabs or trailing whitespace, a line-length limit, and no
stray `console.log` in game or test code. It runs in CI alongside syntax
checks; a full linter would add transitive dependencies that each need a
provenance record, so it remains an open decision.

## Non-negotiable principles

1. **No original game data.** Development, tests, demos, releases, screenshots,
   and CI must work without files copied or extracted from *Syndicate*.
2. **Original identity.** Use a new project and game name, logo, setting,
   characters, maps, story, dialogue, factions, interface treatment, and audio.
3. **Mechanics, not expression.** High-level ideas such as squad tactics,
   territory control, research, and cybernetic upgrades may inform the design;
   do not trace or closely reproduce original maps, sprites, missions, writing,
   audiovisual presentation, or distinctive names.
4. **Source is the product.** Everything required to build, test, modify, and
   host the game must be available in the repository under documented free and
   open-source terms.
5. **Provenance before inclusion.** No code or asset enters a release until its
   origin, author, license, and required attribution have been recorded.
6. **No open-washing.** Do not accept `NC`, `ND`, source-available, personal-use,
   or ambiguous licenses. They do not provide the freedoms required here.
7. **Legal gates block releases.** Missing provenance is a release blocker, not
   documentation debt.

## Game objectives and creative direction

OpenSynd is a real-time, pause-capable squad tactics game about restoring civic
autonomy in a near-future city. The player leads a small field team working with
district communities to reconnect essential services, expose systems of
control, and replace remote private administration with durable local
governance.

The campaign is won through a balance of **access**, **public trust**, and
managed **pressure**, culminating in a final operation shaped by the alliances
the player formed. Capturing territory or eliminating every opponent is not a
victory condition by itself. Missions emphasize infrastructure restoration,
evidence recovery, rescue, protection, surveillance disruption, negotiation,
and safe extraction. Civilian harm, broken services, and abandoned commitments
have persistent strategic consequences.

The intended visual identity is a living municipal diagram under stress:
three-quarter isometric spaces, clean geometric architecture, strong
silhouettes, restrained charcoal and mineral surfaces, and functional cyan,
amber, coral, and green signals. It should use crisp vector-like forms and
selective atmospheric effects rather than copying the original game's pixels,
palette, proportions, or interface. Restored districts visibly and audibly
return to life.

The interface should resemble a modular civic operations console with clear
typography, map annotations, visible uncertainty, and an action timeline. It
must support scalable text, remappable input, reduced motion, captions,
contrast themes, and non-colour status indicators from the first playable
build. The fuller game loop, tone, audiovisual brief, and creative boundaries
are defined in `docs/design/GAME_VISION.md`.

## Proposed licensing policy

The exact license expression for inherited FreeSynd files must be established
by an audit before implementation. Many source headers say GPL version 2 “or
later,” while top-level wording is less precise. Until the audit is complete,
preserve every existing notice and do not claim that the project has been
relicensed.

Recommended policy after review:

| Material | Preferred license | Notes |
| --- | --- | --- |
| Derived engine and web client code | Existing applicable GPL terms | Do not relicense inherited code without authority. New files should use the project-wide expression confirmed by the audit. |
| Standalone tools with no derived code | Same GPL expression by default | A different OSI-approved license requires a documented architectural and compatibility reason. |
| Original art, music, sound, writing, and maps | CC0-1.0 preferred; CC-BY-4.0 accepted | CC0 minimizes downstream attribution failures. CC BY requires durable credit metadata. |
| Fonts | OFL-1.1, CC0-1.0, or another reviewed free license | Preserve reserved-font-name and redistribution requirements where applicable. |
| Documentation | CC-BY-4.0 | Code samples remain under their file-level software license. |
| Third-party code | GPL-compatible OSI-approved licenses only | Pin versions and record license texts and notices. |

CC licenses should not be used for software. CC-BY-SA assets require individual
compatibility and distribution review before acceptance; they are not part of
the default asset policy. Public-domain claims without a reliable provenance
trail also require review.

## Required repository controls

Add these before accepting new implementation or art contributions:

- `LICENSES/` containing the exact text of every accepted license.
- SPDX identifiers in source files and `.reuse/dep5` for files that cannot
  reasonably carry headers.
- `CONTRIBUTING.md` covering provenance, sign-off, generated content, and the
  ban on proprietary reference material in commits and issues.
- `ASSET_POLICY.md` with accepted licenses and an asset intake checklist.
- `TRADEMARKS.md` stating what, if anything, is a project mark and clarifying
  that the project is unaffiliated with the original game's rightsholders.
- `AUTHORS`, `NOTICE`, and a generated in-game credits screen.
- Dependency lockfiles, software and asset bills of materials, and automated
  license-policy checks in CI.
- A Developer Certificate of Origin sign-off workflow. Use a contributor
  license agreement only if counsel identifies a concrete need; do not collect
  broad copyright assignments by default.

Every accepted asset record should contain:

- repository path and stable asset ID;
- title, creator, and copyright holder;
- source URL or a statement that it was created specifically for the project;
- SPDX license identifier and a copy of the applicable license;
- date acquired and identity of the person who verified it;
- attribution text and modification history;
- editable source form, such as layered image, score, or project file;
- confirmation that no proprietary asset was traced, sampled, or used as a
  direct generative input.

## Phase 0 — Governance and IP baseline

**Target:** weeks 1–3

### Work

- Inventory every file in the current repository by copyright holder, license,
  origin, and whether it depends on original game data.
- Distinguish original FreeSynd code, bundled third-party code, freely licensed
  project assets, and files whose provenance is unclear.
- Resolve whether the combined codebase is GPL-2.0-only or
  GPL-2.0-or-later. Record the decision and evidence; do not infer permission
  merely from the presence of a GPL text.
- Produce an “original-IP exclusion list” covering names, logos, characters,
  factions, mission text, map layouts, sprites, sounds, music, cinematics, and
  other recognizable expression.
- Use OpenSynd as the working name. Search relevant trademark registers and the
  web, assess possible confusion with *Syndicate* and FreeSynd, and obtain legal
  review for the intended markets before adopting it as the permanent name.
- Adopt the repository controls above and publish the decision-making and
  security-reporting processes.
- Create a clean-room rule: contributors implementing replacement formats and
  content work only from project-owned specifications and original work, not
  from extracted proprietary assets committed or shared through project tools.

### Exit gate

- Every existing file is classified as `keep`, `replace`, `quarantine`, or
  `remove-from-distribution`.
- The code license expression and contribution policy are documented.
- CI fails on an unknown license or unregistered asset.
- Counsel or a designated legal reviewer has signed off on the public-project
  posture. Unresolved files stay quarantined.

## Phase 1 — Product identity and open content specification

**Target:** weeks 3–6

### Work

- Write a short original world bible and visual brief with explicit exclusions
  from the original game's distinctive expression.
- Define open, documented formats for maps, campaigns, missions, units,
  equipment, research, animation, localization, and audio metadata.
- Prefer readable JSON or another documented interchange format. Publish JSON
  Schema files, versioning rules, examples, and validators.
- Define a replaceable asset manifest containing dimensions, animation states,
  anchors, collision data, license fields, and attribution.
- Create a minimal CC0 “developer asset pack” from scratch: geometric tiles,
  silhouettes, simple effects, and test audio. It must be visually distinct and
  sufficient to run every automated and manual test.
- Create an accessibility baseline: remappable keyboard controls, scalable UI,
  contrast targets, captions, independent audio controls, reduced-motion
  support, and no information conveyed by colour alone.

### Exit gate

- A blank-room contributor can create and validate a map without proprietary
  tools or data.
- The developer pack passes provenance checks and can be rebuilt from included
  editable sources.
- OpenSynd is cleared as the permanent public name or is replaced before public
  branding begins.

## Phase 2 — Browser foundation

**Target:** weeks 5–10

Use a TypeScript browser client as the primary long-term implementation. Keep
the C++ application as a behavioural reference, but port rules deliberately
rather than mechanically. A short WebAssembly spike may be used to validate
old behaviour; it should not become the production architecture unless an ADR
shows that it satisfies maintainability, accessibility, and licensing goals.

### Work

- Establish the web workspace, reproducible build, unit tests, end-to-end tests,
  formatting, linting, and static analysis.
- Implement a deterministic fixed-step simulation separated from rendering.
- Add isometric camera transforms, tile rendering, sprite animation, selection,
  input mapping, and Web Audio.
- Load only the new open formats and manifest; do not add a browser-side loader
  for original *Syndicate* files.
- Store settings and saves locally using versioned browser storage, with JSON
  export/import so users retain control of their data.
- Add an always-available About/Licenses/Credits view and link the exact source
  revision used to build a hosted deployment.
- Produce source maps and unminified preferred source through the public build
  repository. Ensure the deployed JavaScript/Wasm can be reproduced from that
  revision.

### Exit gate

- A browser loads an original test map and allows a unit to move through it.
- Chromium and Firefox run the same deterministic simulation fixtures.
- A clean checkout builds offline after documented dependency acquisition.
- The distributed application includes required notices and a clear source link.

## Phase 3 — Legally clean vertical slice

**Target:** weeks 10–18

### Scope

- One original urban map and mission.
- A four-character player squad and one original opposing faction.
- Selection, movement, pathfinding, combat, damage, mission objectives, pause,
  restart, save, and load.
- A small original equipment set and one interactive vehicle or world object.
- Desktop controls plus a usable touch-control experiment.
- Original menus, HUD, sound effects, music, and narrative text.

### Engineering work

- Port or redesign only the rules needed for the slice.
- Add deterministic replay fixtures and golden tests for navigation, combat,
  save migration, and mission completion.
- Create content validators that reject missing licenses, attribution, source
  files, and unsupported manifest versions.
- Add performance budgets and test on a representative low-end device.

### Legal release gate

- Run a file-by-file provenance review of the distributable bundle.
- Perform visual and textual similarity review against the exclusion list.
- Confirm that no test fixture, cached file, issue attachment, release archive,
  or repository history contains proprietary game data.
- Generate and manually verify credits, notices, source offer/link, dependency
  inventory, and asset bill of materials.
- Obtain pre-release legal review. Label the build `alpha` only after approval.

## Phase 4 — Campaign systems and creator tools

**Target:** months 5–9

### Work

- Add the strategic map using an original geography and faction structure.
- Implement research, equipment purchasing, character upgrades, recruitment,
  economy, mission branching, and campaign persistence.
- Expand AI with independently specified behaviours and deterministic tests.
- Add vehicles, civilian simulation, status effects, and additional objective
  types only where they serve the new design.
- Build a browser-based map and mission editor that exports the documented open
  formats.
- Add a content-pack installer with explicit license display and validation.
  Never fetch arbitrary third-party assets into official builds automatically.
- Document mod APIs and compatibility promises.

### Exit gate

- An original short campaign is playable from start to finish.
- A community member can create, validate, license, package, and share a mission
  using only open tools.
- Save and content formats have migration tests and published version policies.

## Phase 5 — Public beta and sustainable release

**Target:** months 9–12

### Work

- Complete accessibility, localization, performance, privacy, and security
  reviews.
- Keep the default deployment static and privacy-preserving: no account,
  telemetry, advertising, or third-party tracking. Any later telemetry must be
  off by default, documented, consent-based, and independently removable.
- Publish reproducible release instructions, checksums, signed tags, release
  artifacts, SBOMs, and asset BOMs.
- Provide a container-free static hosting path and document self-hosting.
- Establish maintainership, review, release, vulnerability response, and project
  succession policies so the project is not dependent on one person.
- Run the full legal gate again for every release candidate.

### Exit gate

- The game can be built, hosted, played, modified, and redistributed without
  proprietary data or services.
- Every shipped byte maps to documented source and licensing information.
- At least two maintainers can perform a release from the written procedure.

## Workstreams that run through every phase

### Legal and provenance

- Review every dependency and asset before merge.
- Repeat trademark screening before major public announcements.
- Keep takedown and provenance-challenge procedures public and responsive.
- Quarantine first and investigate when ownership is disputed.

### Open development

- Make roadmaps, issues, design decisions, and meeting notes public by default.
- Use small reviewable changes and record major choices as architecture decision
  records.
- Avoid mandatory proprietary SaaS in the build, contribution, or release path.
- Mirror release artifacts and ensure forks can replace all project services.

### Quality

- Test deterministic simulation independently of graphics.
- Maintain schema, save-format, browser, performance, and accessibility tests.
- Treat warnings from license, secret, dependency, and provenance scanners as
  release-blocking until triaged.

### Content production

- Commission or create assets from written briefs, with contributor warranties
  about originality and third-party materials.
- Require editable source files; rendered exports alone are insufficient.
- Review generative-AI submissions separately. Accept them only when the tools,
  inputs, applicable terms, provenance, and contributor rights satisfy a policy
  approved by counsel. Default to human-created assets until that policy exists.

## First 90 days

### Days 1–30

- Complete the code and asset audit.
- Adopt the contribution, asset, SPDX/REUSE, and naming policies.
- Quarantine proprietary-data readers from the new web distribution.
- Select the web stack through a small renderer/simulation proof of concept.
- Draft the original setting and asset specification.

### Days 31–60

- Publish schemas and validators for maps, sprites, and unit definitions.
- Build the CC0 developer pack and provenance registry.
- Implement the deterministic loop, isometric renderer, camera, and input.
- Add license, dependency, and reproducibility checks to CI.

### Days 61–90

- Implement selection, navigation, animation, collision, basic combat, and save
  export/import on one original test map.
- Add the in-game credits/license interface and source-revision link.
- Conduct the first similarity and provenance review.
- Publish a non-branded developer preview only if every legal gate passes.

## Definition of success

The project is successful when a person with no copy of *Syndicate* can clone
the repository, inspect every input, build the complete game with free tools,
play an original campaign in a modern browser, create a compatible content
pack, and redistribute modified versions while preserving the applicable free
licenses and attribution.

## Primary licensing references

- GNU GPL FAQ: <https://www.gnu.org/licenses/gpl-faq.html>
- GNU license compatibility guidance:
  <https://www.gnu.org/licenses/license-compatibility.html>
- Open Source Definition: <https://opensource.org/osd>
- Creative Commons FAQ: <https://creativecommons.org/faq/>
- Creative Commons free cultural works:
  <https://creativecommons.org/public-domain/freeworks/>
- SPDX License List: <https://spdx.org/licenses/>
- REUSE specification: <https://reuse.software/spec/>
- WIPO overview of IP and video games:
  <https://www.wipo.int/cooperation/en/docs/ip-video-games.pdf>

