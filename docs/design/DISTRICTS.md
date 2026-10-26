<!-- SPDX-License-Identifier: GPL-2.0-or-later -->

# Districts: how the maps are made

Every territory's operation is played on a district of its own: 50 operations, 50 different maps. The three hand-made operations
(First Light, Quiet Hours, Dead Drop) have hand-laid maps; the other 47 are generated, in a style chosen for the place.

## The pipeline

```
python3 tools/generate_campaign.py     # maps and operations for the generated territories
python3 tools/generate_variants.py     # the uprising and defence operations for every territory
rm -rf web/content && cp -r open-content/packs/developer/. web/content/
python3 tools/validate_content.py && python3 tools/check_web_sync.py
cd web && npm test && node tools/balance.mjs 6      # the bot must still be able to win
```

- `tools/generate_campaign.py` picks the style (`STYLE_OF`), the size and shape (`layout_for`), places the entry, relays, console,
  server, uplink and exit (`place_zones`), and writes each mission. A layout that fails its checks (the exit walled off, no room for a
  zone) is thrown away and laid out again with the next seed (`make_map`).
- `tools/generate_maps.py` builds a map from a layout: the downtown grid, or a styled district, then the parts every district has
  (pads under the relays, the compound and its gate, the scenery). Its `verify` proves every zone can be reached.
- `tools/map_styles.py` holds the styles and the pieces they are made of.

## Size and shape

Districts are 128 to 176 tiles wide, growing with the campaign. A district is painted on a square canvas, then **cropped** to a height
between three quarters of its width and all of it (so most maps are not square), and has **corners or bays cut out** (`outline_for`;
tiles no region covers are simply not there). The squad enters on the west edge and leaves on the east; a four-tile avenue joins them.

## The styles

| Style | What it is | Used for |
| --- | --- | --- |
| downtown | the street grid of blocks, alleys, fences | a few territories |
| harbour | sea and piers, a container yard, warehouses, a quay | coasts |
| oldtown | brick houses cut from plots round a plaza, courtyards, gardens, terraces | the Mediterranean, Iberia, the Maghreb |
| industrial | sheds, tank farms, fenced yards, chimneys, pylons, pipes | industrial regions |
| park | lawns, paths, a lake, groves, a pavilion on a terrace | the north and green country |
| river | a wandering river with bridges and quays | river basins |
| desert | sand, a dry riverbed, walled compounds, a stepped ruin, an oasis | deserts |
| highrise | wide streets between tall towers, podiums, roofs | big cities |
| tundra | snow, a frozen lake, sheds, tanks, containers, pines | the far north and south |
| jungle | swamp pools and boardwalks, stilt houses, a temple platform | rainforests |
| outskirts | scrub, a raised roadway with mesh fences, pylons, pipelines, yards | open plains |

## The pieces

Ground: pavement, street, lawn, mud, scrub, sand, snow, gravel, cobbled plaza, dock planks, hazard-striped paving, rooftop tiles.
Raised ground: terraces with a kerb, flights of steps, footpath ramps, walkable roofs (`terrace`, `roof_house`).
Buildings: boxes and also L, U, T, cross, H, stepped, podium and ring shapes (`Painter.shaped`), and buildings with a **way in**: a
forecourt cut into the facade with a door that opens and a hall behind it (`Painter.entrance`). Facades also get painted doors and
lamps in the renderer. Scenery: trees, shrubs, street lights, bins, wrecks, barrels, skylights, vents, dome antennas, lattice pylons,
pipe runs, fenced gardens.

Each piece is plain map data (regions, doors, props) plus, for a few, a drawing routine in `web/src/structures.js`, a ground texture in
`web/src/textures.js`, or a minimap colour in `web/src/app.js`. Nothing is an image asset.

## Adding a style

Write `style_<name>(p, layout)` in `tools/map_styles.py` using `Painter`, add it to `STYLES` and a palette to `PALETTES`, and name it in
`STYLE_OF`. Keep to the rules in the module's docstring (entry and exit yards open, an avenue across, buildings two tiles apart), put
anything that must stay inside the cropped map between `p.top` and `p.bottom`, then run the pipeline and `web/test/districts.test.js`.

Ideas still to do are in [ROADMAP_2.md](../../ROADMAP_2.md), Theme H.
