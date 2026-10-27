<!-- SPDX-License-Identifier: GPL-2.0-or-later -->

# NeuroReign: technical notes

The plain-language overview is in the [main README](../README.md). This file is for anyone who wants to build, test or
change the game. It is a hobby project, so expect rough edges.

The browser client is dependency-free ES modules on a Canvas 2D renderer with a fixed-step (30 Hz) simulation. It loads
the CC0 developer content pack (`open-content/packs/developer/`, copied to `web/content/`) and does not use
legacy FreeSynd assets or assets from other games.

## Where things are

| Path | What lives there |
|------|------------------|
| `web/src/` | the game: `app.js` (interface and wiring), `simulation.js`, `engine.js`, `campaign.js`, `mission.js`, `vehicles.js`, `inventory.js`, `upgrades.js`, `drugs.js`, `strategy.js`, `save.js`, `worldmap.js` and friends |
| `web/test/` | Node unit tests (`node:test`), run by `npm test` |
| `web/e2e/smoke.mjs` | the browser end-to-end run (Playwright, Firefox; Chromium when installed) |
| `web/tools/` | `render-sprites.mjs` and `render.html` (character sprites), `balance.mjs` (the balance bot) |
| `open-content/` | the content pack (maps, units, equipment, vehicles, missions, territories) and its JSON schemas |
| `tools/` | Python checks and generators: `validate_content.py`, `generate_maps.py`, `generate_campaign.py`, `check_style.py`, `check_provenance.py`, `check_web_sync.py` |
| `docs/design/` | the game vision and the save-file format |
| `ROADMAP.md` | the plan, feature by feature, with a status table |
| `provenance/assets.json` | where every shipped asset came from |

## Everyday commands

```sh
cd web
npm test                  # syntax checks and the unit tests
npm run e2e               # builds, then drives a real browser through the game
E2E_JOBS=3 npm run e2e    # opt into parallel scenarios on a machine with ample memory
node tools/balance.mjs 20 # the balance bot: 20 runs per policy; add a name to pick one operation
cd ..
python3 tools/validate_content.py && python3 tools/check_web_sync.py && python3 tools/check_style.py
```

After changing anything in `open-content/packs/developer/` copy it to the site:
`rm -rf web/content && cp -r open-content/packs/developer/. web/content/`. The campaign's 44 generated missions and
their maps come from `python3 tools/generate_campaign.py`; the hand-made maps come from `tools/generate_maps.py`.

## Building and serving

```sh
cd web && npm run build   # writes web/dist
```

Serve `web/dist/` with any static HTTP server (for example `python3 -m http.server -d dist 8080`). Opening `index.html`
directly will not work reliably because browsers restrict local `fetch()` calls.

## Controls (full list)

- Click an operator on the map or in the squad panel to select; Shift-click or Ctrl-click adds one, **A** selects
  all. Keys **1-4** pick an operator, **Shift+number** toggles one, **0** swaps between one and everyone, and
  **Alt+1-8** press an inventory slot. **Right-click** a slot (or **Alt+Shift+1-8**) drops that item on the ground
  beside the operative to be picked up again.
- Click ground to walk (squad in formation); **Shift+click** adds a leg to the route. Click a vehicle to get in
  (**V** also takes or leaves one) and click a road to drive. Click an enemy to close in and fight.
- Nobody fires without a weapon selected: click one in the operator's inventory. **Right-click** fires; hold the
  button to keep firing. Weapons: pulse, machine pistol, scatter, flame, beam, rotary, coil, long rifle; items:
  repair kit, Persuader, scanner, shield, delay charge.
- Three coloured sliders under each operator set Adrenaline (orange), Perception (cyan) and Intelligence (violet) doses.
  The round button where the four squad cards meet (or **A**) selects everyone.
- Shift+click queues orders after the current route: walk on, pick up dropped gear, get into a vehicle. Esc clears the queue.
- A Delay Charge is armed by its slot: click the ground within six tiles to throw it, click the slot again to drop it, Esc cancels.
- **E** interacts, **F** picks up gear in reach, **R** repairs, **Space** pauses; every key can be rebound in Settings.
- The side panel has Mission, Enemies and Save tabs. Between operations (Operations, then Research & Armoury: a Squad tab
  and a Research tab): click names in the roster to pick operatives (several at once buys for all of them), fit body
  parts, buy and sell gear, fund research, set tax and buy a survey for each territory. Fallen operatives are lost for good
  unless you switch that off; persuade enemy agents and get them out alive to recruit them.
- Save to a private browser-local slot, or export and import a readable, versioned JSON save file.
- `editor.html` is a mission editor: move, add and delete units and vehicles, edit objectives, check the draft and
  download the mission JSON.

The renderer uses Canvas 2D and procedural shapes. Simulation helpers live in
`src/engine.js` and have dependency-free Node tests.

Save data is not transmitted to a server. Imported files are size-limited and
validated against the active mission, map bounds, unit IDs, objective IDs, and
walkable route tiles before they can change game state.
The versioning and compatibility contract is documented in
[`docs/design/SAVE_FORMAT.md`](../docs/design/SAVE_FORMAT.md).


## Character sprites

Units are drawn from sprite sheets in `public/assets/sprites/`, rendered by
`tools/render-sprites.mjs` (three.js in headless Chromium, 8 facings, idle and
walk) from one CC0 Quaternius model kept unmodified in `art-source/`: the animated
human, used for both the operatives and the opposition (who wear the same
uniform with a crimson beret). The operatives wear
one shared khaki trench coat over a dark uniform; only skin tone differs. The
coat, visor, beret, belt, shoulder boards, boots and cybernetic left forearm
are generated parts attached to the skeleton in
`tools/render.html`, not imported art. The walk is the CC0 clip with arm, torso
and head swing damped toward the idle pose for a stiff, serious march. They carry no agency or organisation
marks. Regenerate with:

```
CHROMIUM_PATH=/usr/bin/google-chrome node tools/render-sprites.mjs
```

Each character also has armed variants (`<name>-pulse`, `<name>-heavy-pulse`) holding the weapon in both
hands: the weapon is attached to the chest and both arms are solved onto its grips every frame while the
legs keep animating. The game uses the armed sheet only while a weapon is selected (watchers use theirs
while alert or fighting). After rendering, run `python3 tools/optimize-sprites.py` to reduce the sheets to
a 128-colour palette (about 12 MB down to 2 MB).

Every file is listed in `provenance/assets.json` and stays `quarantined` until a
named reviewer approves it. If the sheets fail to load, units fall back to
vector shapes.


## Rules taken from FreeSynd's source

Where FreeSynd's behaviour differed from an earlier NeuroReign rule, FreeSynd's won (ROADMAP principle 8), with values,
names and art kept original. Examples: persuasion by points, a two-second police warning, permadeath, tax-funded income,
the three drugs, accuracy as a random miss inside a cone, chest regeneration from tier 2, death drops, no seat limit in
vehicles, and city cars that never run anyone down. The roadmap lists each one.

## Content and licences

Code is GPL-2.0-or-later; the shipped content is CC0-1.0 (see `LICENSES/`, `ASSET_POLICY.md` and `provenance/`). The old
C++ FreeSynd engine under `src/` and `data/` is left in the repository for reference and is not used by the browser game.

## Hot updates

`src/update.js` holds the logic (and `test/update.test.js` tests it). The game resolves every content, art and music URL against
the folder its own code was loaded from (`releaseBase(import.meta.url)` in `app.js`). With `PIN_RELEASES=1` the build rewrites
`index.html` to load `r/<revision>/app.js` and `r/<revision>/styles.css`, and the server keeps each release under `/r/<revision>/`
(see `deploy/`), so an open game never mixes its code with newer content. It polls the site's own `build-meta.json` every minute;
a different revision shows the "new version" note, and `canApplyQuietly` decides when it may reload by itself (not during an
operation or with the research screen open, and only if the tab is hidden or has been idle for 20 s). Browser tests use `?e2e` to
poll every second and intercept `build-meta.json`.
