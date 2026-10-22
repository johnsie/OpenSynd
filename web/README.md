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

- Select either operator from the canvas or roster.
- Click a walkable tile to calculate and follow a route.
- Focus the canvas, move the targeting cursor with the arrow keys, and press
  Enter to issue a movement order.
- Move within range of a watcher, then select it on the map or from the
  keyboard-accessible Threats panel to engage a deterministic disabling pulse.
- Press Space while the canvas is focused to pause or resume.
- Use <kbd>E</kbd> or the Restore button while standing on a relay to reconnect
  it; restore both relays, then reach the extraction zone.
- Use the on-screen direction pad, Move button, and Restore button as a touch
  and pointer control alternative.
- Save to a private browser-local slot, or export and import a readable,
  versioned JSON save file.

The renderer uses Canvas 2D and procedural shapes. Simulation helpers live in
`src/engine.js` and have dependency-free Node tests.

Save data is not transmitted to a server. Imported files are size-limited and
validated against the active mission, map bounds, unit IDs, objective IDs, and
walkable route tiles before they can change game state.
The versioning and compatibility contract is documented in
[`docs/design/SAVE_FORMAT.md`](../docs/design/SAVE_FORMAT.md).

