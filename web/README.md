<!-- SPDX-License-Identifier: GPL-2.0-or-later -->

# OpenSynd browser prototype

This dependency-free browser client is the first playable OpenSynd vertical
slice. It loads the original CC0 geometric developer pack and does not use
legacy FreeSynd or *Syndicate* assets.

## Run checks and build

```sh
npm test
npm run build
```

Serve `dist/` with any static HTTP server. Opening `index.html` directly will
not work reliably because browsers restrict local `fetch()` calls.

## Current controls

- Click an operator on the map or in the squad panel to select; Shift-click or Ctrl-click adds one, **A** selects
  all. Keys **1-4** pick an operator, **Shift+number** toggles one, **0** swaps between one and everyone, and
  **Alt+1-8** press an inventory slot.
- Click ground to walk (squad in formation); **Shift+click** adds a leg to the route. Click a vehicle to get in
  (**V** also takes or leaves one) and click a road to drive. Click an enemy to close in and fight.
- Nobody fires without a weapon selected: click one in the operator's inventory. **Right-click** fires; hold the
  button to keep firing. Weapons: pulse, machine pistol, scatter, flame, beam, rotary, coil, long rifle; items:
  repair kit, cloak, Persuader, scanner, shield, delay charge.
- Sliders under each operator set Adrenaline, Perception and Intelligence doses; Legs and Brain are training bars.
- A Delay Charge is armed by its slot: click the ground within six tiles to throw it, click the slot again to drop it, Esc cancels.
- **E** interacts, **F** loots, **R** repairs, **Space** pauses; every key can be rebound in Settings.
- Between operations (Operations, then Research & Armoury): fit body parts, buy and sell gear, choose the squad
  from the roster, fund research, set tax and buy a survey for each territory. Fallen operatives are lost for good
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
