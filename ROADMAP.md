# OpenSynd Roadmap

## Purpose

Create **OpenSynd**, a browser-native, community-maintainable game derived from
the FreeSynd codebase while removing every runtime dependency on proprietary
*Syndicate* data and avoiding use of protected branding or creative expression.

OpenSynd is the project's final name, decided by the project owner. An initial exact-name web
search found no obvious collision, but no formal trademark search or legal review has been done, and the
project does not claim the name is registered or cleared.

This roadmap treats legal provenance, reproducible builds, and user freedom as
release requirements. It is a project plan, not legal advice; an IP lawyer
should review the name, clean-room policy, and first public release.

## Implementation status

Phase 0 began on 2026-10-22. The repository now has contribution, asset, and
name and trademark policies; an initial IP audit; a machine-readable asset provenance
registry; automated CI checks for unregistered assets and unknown source
licenses; and regression coverage for the independently replaced CRC-32 code.

All 13 current files under `data/` and `icon/` are conservatively classified:
seven are excluded from OpenSynd and six are quarantined pending evidence or
replacement. No legacy asset is currently approved for an OpenSynd release.

The remaining Phase 0 gates are the complete file-by-file source audit,
resolution or replacement of third-party components with unclear notices,
an optional formal trademark search, and qualified legal review.

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
deterministically by `tools/generate_maps.py`: a grid of city blocks, a
runoff channel crossed by four bridges, three plaza intersections for the
relays and gate panel, and a fenced compound with one gate. The generator
verifies that every objective is reachable and that the exit is sealed until
the gate opens. The browser client has a scrolling, zoomable camera that draws
only visible tiles (about 60 fps fully zoomed out), drag-to-pan, a minimap, and
remappable camera keys. Arrow keys pan the view smoothly while held; the grid
cursor moves with I/J/K/L (remappable) and Enter issues the move. Pushing the mouse
to the edge of the map also pans the view, faster the closer it gets; this edge
scrolling is a setting, ignores touch and pen, and pauses while a dialog is open.

Security watchers now patrol deterministic routes built from mission waypoints
(`patrol` in the mission schema). A patrolling watcher holds position while it
has a target in pulse range and resumes afterwards. Every operator has two adjustable training bars, Legs (saved as `speed`) and Brain, each from 1 to
5 with 3 as the baseline in the unit data. Legs scales walking pace from 0.6x
to 1.4x; Brain scales the pulse cooldown from 1.3x to 0.7x (shorter is
faster). The rules are pure (`web/src/stats.js`), covered by tests, and saved
in format version 5 with a tested migration from version 4.

The developer pack now has two operations. First Light (128 x 128 Signal Yard,
two relays) leads to Quiet Hours (96 x 96 Audit Yard, three relays, eight
patrolling watchers). Missions carry their own story, success headline and
debrief text; the success screen offers "Next operation", each operation has its
own local save slot, and `tools/generate_maps.py` builds and verifies both maps.
Each mission has a golden full-playthrough test.
The title screen is an operations list: each operation shows its objective and
watcher counts and whether it is available, completed or locked. Finishing an
operation is remembered in this browser (`web/src/progress.js`, a tolerant,
tested record), unlocks the next, and an Operations button in the header reopens
the list at any time; a Settings button clears completed operations.

The free Legs and Brain training bars were removed (principle 8): an operative's pace and reload now
come from the bought upgrades and the drugs.
Leaving an operation in progress (switching operations or resetting) asks for
confirmation first.

The first slice of the Phase 4 economy is playable. Funds accrue at six per
minute of play time (the old one-time achievements are gone: First signal, First contact,
Scavenger, Clear the streets, Whole squad, Quick work, Ghost), are shown in the
header, and persist in this browser (`web/src/campaign.js`).
The Research lab, opened from the title screen or the outcome screen, spends
funds on cyborg heart levels (Stamina), cyborg brain levels (Brain) and new
items (heavy pulse emitter, stim injector, shadow cloak), and fills each
operative's eight loadout slots with researched items. Armed watchers use their
weapons; a disabled watcher's gear can be looted by an operator standing next to
it (F, or clicking the body), up to the eight-slot limit, and gear kept after a
successful operation counts as researched. Still to do: funding allocation across
tracks over time, more items and enemy types, and a campaign map.

The interface now fills the screen like a heads-up display: the map takes the whole
page with the squad as a compact 2 x 2 block of cards at the top left, the
minimap at the bottom left, the action buttons in a bar at the bottom centre, and
a slim sidebar for the brief, objectives and threats, so nothing needs scrolling
at ordinary laptop sizes. Each operative shows eight picture slots; clicking a
weapon square selects it as the only weapon that fires (click again for
automatic choice), consumables are used by clicking, and worn gear explains
itself. Weapons have limited rounds (24 for the pulse emitter, 10 for the heavy
emitter, restocked each operation), every shot spends one from the weapon that
fires, a weapon with no rounds cannot fire, and an operative can carry several
of the same weapon, each with its own magazine. The Research & Armoury screen
lays research, each operative's eight slots and a shop side by side: items have
prices, a swapped item is bought back at half price, and the shop only sells
researched items. A weapon is held only while it is selected (a watcher holds its weapon while
alert or fighting): the character is drawn with both hands on a pistol (slim slide,
tilted grip, trigger guard, sights) or a rifle (scope, magazine, foregrip), with
both arms solved onto the weapon each frame while the legs keep walking, using
armed variants of each character rendered from the same animation frames. Firing is shown: a muzzle flash
at the weapon, a short recoil kick, and a thin aim line to the locked target. An
operative also draws the weapon while firing at a locked target, so a gun never
fires from empty hands.

With several operatives selected, choosing a weapon chooses the same weapon for all of
them: each takes up their own copy (in whatever slot they carry it, the fullest if they
carry several; the one clicked keeps the exact copy), anyone without it keeps their own
choice and is counted in the message, and clicking the chosen weapon again puts it away
for everyone who had it selected.

Right-clicking fires by hand: each selected operator fires the selected weapon (or the
longest-ranged loaded one if none is selected) in the direction of the pointer. The shot
is a real ray (`castShot`/`fireManual` in `web/src/simulation.js`) that stops at the first
standing enemy within 0.65 tiles of its path or at the first tile that cannot be walked
on (a wall, a building, a closed gate), so buildings block shots and a miss simply
flies to the end of the weapon's range. A shot needs the weapon recharged and a round
left; it spends the round, starts the recharge (scaled by effective Brain), turns the
operator toward the aim and shows a muzzle flash, recoil and, for a miss, a tracer. The
crosshair over a standing watcher is red when a selected operator's weapon reaches it
and white when it is out of range, and updates as units move.

The Civic Pulse Emitter (the pistol) now reaches 13 tiles (it was 3.25, then 6.5); watchers
keep their own 3.25-tile weapon, so a squad can open fire well before they can answer.
Shots no longer draw lines (the aim line, tracer and pulse beam are gone). A shot shows a
muzzle flash and recoil; a hit shows a flash with a ring and sparks at the target's chest
and throws the target back a few pixels and back again (`knockbackOffset` in
`web/src/effects.js`, drawing only, so saves and replays are unaffected); a miss puffs
sparks where it ends. Reduced motion removes the knockback.

Buildings and walls now give cover (`hasLineOfSight` in `web/src/simulation.js`). A watcher
cannot spot an operator it has no clear line to, cannot fire through a building, and an
operator ordered to pursue a watcher keeps closing until the line is clear before standing
to shoot. Fences, gates and water are see-through, so chain-link gives no cover, and a
watcher already chasing someone within four tiles keeps hold of them round a corner. The
balance bot now rewards patience: Quiet Hours is won 25% of runs when rushing, 88% steadily
and 100% carefully.

Operations are no longer all about relays. Objectives now have several types: interact (restore a
relay, operate a panel, download from a server), disable (named targets, shown with a pulsing
TARGET marker until they fall), hold (keep an able operator in a zone for a set time; progress
drains at twice the rate when the zone is left, and shows in the objective list and as a green
fill on the zone), reach a zone, and extract. The third operation, Dead Drop on the new Freight
Depot map, mixes download, disable the Site Warden (a tougher guard, a soldier like the rest, who carries a heavy
emitter you can loot), hold the central uplink beacon for 20 seconds while every watcher
converges, and extract through an open east side (no gate this time). Props are chosen per zone
(`prop`: relay pylon, console, vault server rack, uplink beacon). Hold progress is not kept in
saves (it restarts from zero when a save is loaded). The balance bot plays all three types; Dead
Drop wins 67% rushing, 98% steady and 97% careful.

Buildings are drawn as single structures rather than stacks of tile cubes
(`web/src/buildings.js` for the rules, `drawBuilding` in `web/src/app.js`): one block per
`utility-building` region with solid walls, a dark base plinth, a ledge at every floor and
one large window per two tiles per floor (dark glass, a few warm lit rooms chosen from the
building's id so each always looks the same). The roof is a flat, lighter surface inside a
raised parapet with a thin neon strip along the near edge, vents and a stair house sized to
the roof, and sometimes an antenna with a blinking beacon. Buildings and units are drawn
together back to front (`drawOrder`), so operatives pass behind towers; a hidden operative
keeps a faint ring. 

The rest of the map is drawn to match. Ground is textured rather than outlined tiles
(`web/src/textures.js`): pavement is lighter paving laid in single-tile slabs, roads are dark,
fine-grained asphalt with a pale kerb, neon edge lines, an amber and cyan centre divider and
lane chevrons (`drawRoad`), the channel has water ripples, bridges are grating and relay pads
are hazard-striped. Ground sprites are painted once per zoom size and reused; building walls
and roofs get a repeating panel and gravel overlay. Streets are separate from buildings: each
block holds two to four separate buildings with two-tile alleys, and the generator adds low
walls and chain-link fences along the pavement and across some alley mouths
(`web/src/structures.js`; they block movement, never a street, and `verify()` still proves every
objective and patrol point reachable). Relays are pylons with glowing rings that pulse amber
and turn green with a beam once restored, the gate panel is a console with a screen, the
service gate is a barrier of red light bars that clears when opened, and the exit is a
chevron landing pad. Everything is procedural, so there are no model or texture assets and nothing new to
record in `provenance/assets.json`. Walkability, pathing, shots and the minimap are
unchanged.

Attacking is a pursuit: the pointer becomes a circular crosshair over a watcher
that is still standing, and clicking it (or its Threats button) sends the selected
armed operators after it. Each one follows the watcher, re-routing as it moves, until
it is within range of the weapon it would fire (the selected weapon, if any, so a
pistol closes in further than a rifle), then stands and shoots; if the watcher backs
out of range it is followed again. The pursuit ends when the watcher falls, the
operative runs out of rounds, or they are given another order (`advancePursuit` in
`web/src/simulation.js`, with tests).

Watchers see further and chase harder: sight is 0.16 tiles per point of awareness (14.4
tiles at awareness 90, up from 9), an alert watcher keeps a squad in mind to twice that
distance before giving up, watchers chase at their full pace (speed 4.2, about 93% of an
operator's), a spotted squad draws neighbours within 14 tiles who then see 1.35 times
further, and an alert watcher shows a red "!" over its head. The shadow cloak still
shortens sight to 60%.

Difficulty is measured, not guessed: `npm run balance` (web/tools/balance.mjs)
plays every mission headlessly with a simple squad bot through the real game rules
(patrols, chasing, combat, rounds, fatigue) under three tactics (rush, steady, careful)
with seeded variation. The first pass showed both operations far too easy (about 98%
wins, no operator ever lost), so watchers were toughened (75 vitality, 12 attack,
3.25 range, 1.0 s cooldown), a spotted squad now calls watchers within 14 tiles who then
see further, and guards were posted at the objectives (First Light has 8
watchers, Quiet Hours 14, with heavy-pulse guards at the gate). Current bot results:
After the longer sight and harder chase, First Light is a manageable opener (steady 100%
with one operator lost on average, rush 60%) and Quiet Hours is clearly harder (rush 57%,
steady 77%, careful 93%, two to three operators lost on average).
The bot does not use training, research or purchases, so human play should be easier
than these numbers with a well-built squad.

Save format version 8 stores each unit's items (with consumable charges) and what
it has looted, with a tested migration from version 7, so looted gear and spent
stims survive a save and load.

The Stamina and Focus fatigue meters, and the stim injector that refilled them, were removed (principle 8:
FreeSynd has no such mechanic). Heart and Brain now do what FreeSynd's parts do: a small accuracy bonus, and for
Brain the persuasion points. Older saves load and drop the stored levels and meters.

The game screen is split into tabs: the side panel shows Mission (brief, objectives, active order), Enemies (the
threat list with a live count) or Save, and the squad block shows, for every operator, eight big item squares with the three
coloured drug sliders under them (Adrenaline orange, Perception cyan, Intelligence violet). The Research & Armoury
screen has two tabs: Squad (the roster, an operative picker, and for that operative the armoury slots, body parts and shop) and
Research.

Operators can be picked individually: each roster entry has a selection checkbox,
Ctrl/Shift-click adds or removes an operator, and each entry carries its own
drug sliders. Orders (moves, pulses, interactions) apply to everyone selected.

Watchers also notice operators within sight (awareness x 0.1 tiles), chase them
over real streets at 85% of an operator's speed so a fleeing squad keeps its
lead, stop within pulse range, and walk back to their route once they lose
sight. The behaviour is stateless and deterministic, so it needs no extra save
fields.
Save format version 4 stores
each unit's place along its route, with a tested migration from version 3.

The game's score is a recorded track, "The Core (music) [futuristic]" by p0ss from OpenGameArt
(dark industrial cyberpunk techno, 175 BPM, about 3.5 minutes, looped), used under GPL-3.0 (it is
also offered under CC-BY-SA 3.0) and credited on the About screen; the full licence text is in
`LICENSES/GPL-3.0.txt`. It was re-encoded to 128 kbps (3.3 MB) and is registered in
`provenance/assets.json` as quarantined: copyleft audio is outside the usual approved set (CC0,
CC-BY, OFL), so a maintainer must either accept GPL-3.0 or CC-BY-SA music for the project or swap
in a CC0 track. It has its own on/off and volume settings. If the file cannot be played, the game
falls back to the original generative score in `web/src/music.js`: a four-chord loop in A minor
with bass, pad and a delayed arpeggio, synthesized in the browser, so no audio asset is needed.
While an enemy agent (a watcher; police on alert do not count) has seen the squad and for six
seconds afterwards, an intense track ("Electric Stream", 180 BPM, CC0
by Alexander Ehlers) crossfades in over about a second from the start of the track and the calm
score fades out; it returns to calm when the alert is over (`setAlert` in `web/src/music.js`,
`updateAlertMusic` in `web/src/app.js`). Operatives' numbers are drawn in gold above their heads.
Other tracks found in the same search for later: "Cypherfunk" (also p0ss, GPL 3.0) was not
available at its page, and tricksntraps' CC0 "Free Cyberpunk Pack 2" would be a clean replacement
or a second track for different operations.

A dependency-free style check (`tools/check_style.py`) enforces SPDX headers,
final newlines, no tabs or trailing whitespace, a line-length limit, and no
stray `console.log` in game or test code. It runs in CI alongside syntax
checks; a full linter would add transitive dependencies that each need a
provenance record, so it remains an open decision.

## What FreeSynd's source teaches us

A detailed read of the FreeSynd source (`src/`, `data/ref/`, `TODO.txt`) for gameplay ideas. For every feature
below the entry says (a) **how FreeSynd does it**, as exactly as the code shows, (b) **where OpenSynd stands**, and
(c) **the OpenSynd design**: the rules, the data (content schema) changes, the interface, sound and art needs,
tests, and how to know it is done. Entries are numbered so work can be planned and referred to (F1, F2, ...).

**Legal and design rules for all of it.** The code is GPL, so reading it to learn how a rule works is fine and we
reimplement in our own structure with our own tests. FreeSynd's data tables (`data/ref/weapons.dat`, `research.dat`),
sprites, sounds, text and mission files are legacy data and stay quarantined: we describe their numbers by ratio and
role, and every value in an OpenSynd design below is a starting value to be balanced with the bot
(`npm run balance`), not a copy. Names are original (Machine Pistol, not Uzi). Content goes in the CC0 pack as JSON
with schemas, validators and sync checks, exactly like today's content.

**Legend.** *have* = in OpenSynd; *partly* = a version exists; *new* = not yet. **Units.** FreeSynd measures space
in 256ths of a tile and time in milliseconds; OpenSynd uses tiles and seconds.

**Contents.** A Weapons and items (F1-F16). B Upgrades and drugs (F17-F19). C Research (F20). D Missions and
objectives (F21-F25). E Agents and the campaign (F26-F32). F Controls and interface (F33-F39). G The world (F40-F47).
H Behaviour already mapped. I Priorities.

**Status of this list** (kept current as features land; *done* means built, tested in `npm test`, and checked in the
browser e2e run).

| # | Feature | Status |
|---|---------|--------|
| F1 | Scatter Emitter (pellet fan) | done: pellets land by distance; no random spread |
| F2 | Incinerator (burning) | done: damage over time, pierces; no flammable scenery yet |
| F3 | Beam Projector | done: pierces everything on its line |
| F4 | Scanner | done: ring marks on the view and map, minimap shows only sight range otherwise |
| F5 | Clearance Key and locked gates | done: the key opens a gate while its carrier is near |
| F6 | Energy shield | have: blocks fire for its duration |
| F7 | Time bomb | done: clear line, chain reactions, shots set it off, vehicles shield occupants, thrown six tiles to a clicked spot; from tier 3 every fourth generated enemy agent carries one, plants it when the squad is close and backs away |
| F8 | Damage types | done: bullet, burn, beam and explosion; scenery reacts to each |
| F9 | Accuracy, spread, fire rate | done: seeded accuracy roll (base by kind, upgrade and drug terms, weapon accuracy, 6 degree cone), spread through pellets, hold-to-fire; no reaction delay |
| F10 | Weight and capacity | done: slowdown beyond capacity, Arms raise it |
| F11 | Ammo and reload cost | done: refills are billed after each operation |
| F12 | Discovery boosts research | done: unresearched gear brought home gives its open research +25 percent, once per item; it no longer unlocks it |
| F13 | Enemies armed from your progress | done: every other enemy agent carries a researched weapon, dearest first |
| F14 | Hit reactions | done: a flinch that stops action and persuasion |
| F15 | Everything is lethal | have |
| F16 | Medikit | have |
| F17 | Six body upgrades, three tiers | done: per operative, 1x/5x/10x prices; enemy agents are fitted with the best tier of each part the living squad has |
| F18 | The three IPA drugs | done: three sliders with the dose, effect and tolerance drift; the training bars and fatigue meters are gone |
| F19 | Followers move at their owner's pace | done |
| F20 | Funded, time-based research with chains | done: ten funding levels, one item at a time, chains |
| F21 | Objective types and sequences | done: seven new types, sequence mode, failure rules |
| F22 | Scripted people | done: walk, wait, trigger, say, escape, enter a vehicle, drive it to a point and leave it |
| F23 | Carried key items | done: Clearance Key, take-item objective |
| F24 | Minimap signal at the current objective | done |
| F25 | Fuller debrief | done: shots and hits (accuracy) overall and per operator, kills by kind, objectives, losses, recruits, discoveries, followers, resupply bill and the change in funds |
| F26 | Roster with permanent death | done: eight places, four deploy, switch to turn it off |
| F27 | Captured enemy agents become recruits | done |
| F28 | The campaign clock | done: four seconds a game hour, runs during operations |
| F29 | Persuasion points | done: points by toughness, Brain tiers lower the cost |
| F30 | Territories, tax and mood | done: daily tax, mood ladder, revolt, and an unlock graph (`unlocks` on a mission) |
| F31 | Buying mission intelligence | done: two levels per operation, each with a price and the briefing lines it reveals |
| F32 | Equipment screen | done: stats panel, roster, upgrades, buy and sell |
| F33 | Queued orders | done: Shift+click queues walks, pickups and getting into a vehicle in order; a step that cannot be done is skipped with a message; Esc clears. Shift+right-click a slot queues a drop, Shift+click a road queues a drive, Shift+V queues getting out. Shift+click on a civilian or follower queues a follow step |
| F34 | What a click means | done: click a vehicle to get in, a drop to collect it, hold to fire |
| F35 | Squad formation | have |
| F36 | Selection and hotkeys | done: 1-4, 0, Shift+number, Alt+1-8 |
| F37 | The HUD | done: objective highlight, ammo badges, the drug sliders, and the portrait of anyone the police are warning flashes red for the two seconds before they shoot |
| F38 | Voice and sound cues | done: weapon and effect sounds, a victory march (three themes to pick in the settings), outcome stingers, door, breaking glass, a train horn, a roar of flame when someone burns to death, the scanner ping, and spoken lines read by the browser's own speech ("Agent selected", "Put down your weapon", "Mission completed", "Mission failed"; switch them off in the settings), all captioned |
| F39 | Doors | done: `door` objects open while a living person is beside them, can be locked with a key, block sight and shots when closed and are planned through by routes; from the second tier the generated maps close some alley mouths with doors (63 of them); the bars slide up over a quarter of a second as a door opens and drop as it shuts (instant with reduced motion) |
| F40 | Windows | done: shots and blasts break the windows on a building's visible walls (shattered panes drawn dark and cracked, a glass sound); guards and enemy agents within 14 tiles who have not seen the squad go to look. Cosmetic: not saved |
| F41 | Flammable scenery | done: trees and billboards burn ten seconds and spread; fire ignites people beside it |
| F42 | Street lights, traffic lights | done: lights and bins break; signals at every crossing, cars stop on red |
| F43 | Vehicles: lanes, collisions, kinds, trains | done: six kinds, run-over damage, queuing, signals, cars keep to their lane, and a freight train on an elevated railway (a viaduct as high as the buildings) that waits at stations and turns round at the end of the line |
| F44 | Mission editor | done: `editor.html` moves, adds and deletes placements, edits objectives, adds patrol route points and edits scripts (checked and explained as you type them), checks the draft and downloads JSON |
| F45 | Campaign scale: 50 territories, 50 main missions | done in outline: 50 territories each with a main mission (6 hand-made, 44 generated by `tools/generate_campaign.py`: own map, five mission shapes, five difficulty tiers, a neighbour unlock graph), a 50-marker world map with Open/All/Done list; the generated missions are tuned with the balance bot (enemies 5+2 at the first tier up to 16+6 at the last; steady and careful play win most of them, rush play fails the late ones), the campaign ends with a summary when the last is won; the world map zooms (wheel, buttons, drag) and `docs/design/CAMPAIGN.md` lists every mission with its tier, enemies and what opens it |

---

### A. Weapons and items

FreeSynd has 14 items, one record each in `weapons.dat`: name, icons, purchase cost, rounds, price per round, range,
rank (how good the AI thinks it is), animation, rounds used per shot, time for a shot, reload time, damage range
(blast radius), shot cone angle, accuracy, projectile speed, damage per shot, impacts per round, weight and (for
automatics) a fire rate. Five items are available at the start: the Persuadatron, Pistol, Shotgun, Scanner and
MediKit. Weapon behaviour is one of a small set of **shot properties** (point to point, point to many points,
reaches instantly or needs time, damages an area on arrival, can shoot with no target, uses ammunition, is automatic,
targets only the owner, can only target people): the pistol and long range are point to point and instant; the
shotgun and minigun are point to many points; the gauss gun needs flight time and damages an area on arrival; the
laser is instant with area damage; the flamer is a flying stream; the time bomb needs no target and self-destructs;
the scanner, medikit, access card and shield target only their owner. This split is a good design: weapons are
combinations of a few orthogonal properties, so OpenSynd's equipment schema should say the same things as data
(`fire` mode, `spread`, `area`, `projectile`, `automatic`, `selfOnly`) instead of one-off code per weapon.

#### F1. Spread weapon ("Scatter Emitter", FreeSynd's shotgun)

*FreeSynd.* Point to many points: each round makes 6 impacts. For each impact the aimed point is turned randomly
inside a cone (45 degrees for the shotgun, scaled by a random 69 to 100 percent), clipped to the map, and a line
of fire is traced from the shooter to it, stopping at the first tile or object in the way and at the weapon's range.
Impacts are counted per target and damage is the number of impacts times the damage per pellet, so a target at point
blank takes most of the pellets and a distant one takes few. Short range (about four fifths of the pistol's), cheap
rounds, one of the first weapons available, weight 7 against the pistol's 1.
*OpenSynd.* *New.* **Design:** equipment field `spread: { pellets: 6, cone: 40 }` (degrees). A shot traces `pellets`
rays inside the cone around the aim line (reuse `castShot`), each stopped by solid tiles, vehicles and the first
person in its way within range; damage is `pellets hit x attack`, reported as one damage event with a `hits`
count so the sound, spark and knockback fire once per target. Values to start from: range 6, attack 4 per pellet,
cooldown 1.1 s, 12 rounds, weight 7, price 60, available from the start in place of nothing (the opening kit stays
the pistol, so make it a cheap first research instead). **Interface:** the aim line draws as a cone while the weapon
is selected. **Sound:** a deep blast with a pump-action click (`shot-scatter`). **Tests:** hits scale with distance
(a target at 1 tile takes more pellets than at 5); a wall stops pellets behind it; two targets side by side both
take damage; the cone is symmetrical over many seeded shots. **Done when** a close-range fight clearly favours it
and a long-range one does not.

#### F2. Flamer ("Incinerator")

*FreeSynd.* Burn damage, fuel is cheap and plentiful (1000 units, 10 per shot), range about 0.9 of the pistol's,
weight 15. It fires a short-lived flame projectile (speed 1000) every 70 ms while the fire button is held (it is
automatic). While firing, the impact point **circles around the aimed target** through eight offsets every 180 ms,
so the flame sweeps an area rather than a line. A flame that reaches something sets it burning: people hit by
burn damage take a "burning walk" hit reaction (they stagger about alight for a few seconds, then die with a burning
death unless they have a good Chest upgrade, which makes them die normally and drop their gear); trees are
destroyed by burn, laser or explosion damage and burn for ten seconds; the stream also lights up whatever stands in
its path. Burning is its own damage type, so resistance and death animations differ.
*OpenSynd.* *New.* **Design:** `damageType: "burn"`, `automatic: true`, a stream of short projectiles that sweep
a small circle around the aim point. A burning unit takes damage over time for 4 seconds (stacking refreshes, does
not multiply), runs without orders in a random direction (civilians scatter, enemies keep their aim but at a wide
spread), spreads fire to units within half a tile and to flammable props (F42), and dies "burning" (a distinct
effect). Starting values: range 4, 6 burn damage per tick, tick every 0.07 s while firing, 100 fuel, 5 fuel per tick,
weight 15. **Sound:** a continuous roar (looped, not per-shot). **Art:** flame sprites along the stream, a burning
unit overlay. **Tests:** burning damage over time ends after its duration; two flames do not double the damage;
fire spreads to a neighbour in range; a flammable prop burns for ten seconds and stops blocking; a unit with the
Chest upgrade (F17) survives. **Done when** it clears a street of civilians, which also makes it expensive in
penalties (F8, F27).

#### F3. Beam weapon ("Beam Projector", FreeSynd's laser)

*FreeSynd.* Instant, perfectly accurate, long range (about three times the pistol), high damage per shot (16 times
a pistol round) with a small **area damage at the end of the beam** (a radius of about two tiles), very few and very
expensive charges (5, each costing 2000 to refill), weight 10. Laser damage is its own type: a person killed by it
leaves nothing (our own agents leave a special dead-agent graphic), and laser destroys trees and street lights.
*OpenSynd.* *New.* **Design:** `fire: "beam"`, `damageType: "beam"`, instant ray with `area: { radius: 1.2 }` at
the end point, attack 30, range 12, 5 charges, refill cost per charge high (F11). Beam kills do not drop gear (F8).
**Sound:** a rising whine then a sharp tearing crack. **Art:** a bright line drawn for 0.15 s from the muzzle to the
end point (the one place a shot line is shown, as an effect, since the user asked for no aim lines; the beam is the
shot). **Tests:** the area at the end hurts a second person beside the target; a wall stops the beam and the area
detonates at the wall; a killed enemy leaves no loot. **Done when** it is the obvious tool for a distant, armoured
target and its price makes the refill a decision.

#### F4. Scanner

*FreeSynd.* No shot; held by any agent of the squad it changes the **minimap zoom**: without a scanner the minimap
shows a small area (zoom x3) centred on the selected agent; with one it shows a wide area (zoom x1). The minimap also
blinks a signal at the current objective's target or the evacuation zone.
*OpenSynd.* *New.* **Design:** the minimap normally shows only terrain, the squad, and enemies currently in line of
sight (today it shows everyone, which gives away every patrol). An operator carrying the **Area Scanner** widens
the radius and also reveals people and vehicles through walls within that radius, drawn as faint dots coloured by
type. Starting values: normal radius 18 tiles, scanner radius 45; drains nothing. **Interface:** minimap draws a
circle for the radius; the scanner has a slot icon. **Tests:** an enemy behind a building is not shown without the
scanner and is with it; radius changes when the carrier is disabled. **Done when** stealthy play without a scanner
is meaningfully blind and the scanner is worth a slot.

#### F5. Access card ("Clearance Key") and locked doors

*FreeSynd.* A self-targeted item: it does nothing by itself, but a door or gate that requires a card opens for an
agent holding one, and the code only counts it when the holder has the top Brain upgrade (`hasAccessCard`). Doors
otherwise open automatically for any living person standing next to them (F40).
*OpenSynd.* *New.* **Design:** content marks a gate or door `lock: "clearance"`; it opens for any operator who has
the Clearance Key in a slot and the Brain upgrade tier the key needs; otherwise it stays closed (and shows a red
lock). Replaces some "interact with a panel" gates with a key hunt (take the key from a guard, F23). **Tests:** a
keyholder walks through; a non-holder is blocked; the key does nothing in the hands of someone without the upgrade.

#### F6. Energy shield as a pool you switch on and off

*FreeSynd.* A selectable item with 200 energy, one point spent per 75 ms **while the shield is on**, so it lasts
about 15 seconds of use; it is switched on by selecting it and off by putting it away, so it can be saved for the
dangerous moments, and because it is the selected item the wearer cannot hold a weapon while it is up. What the
code actually implements is a flag (`pd_smShieldProtected`): while it is set, **enemy shooters refuse to fire at the
wearer** (their fire action fails against a shielded target), so they stop and look for another target or wait.
It does *not* absorb damage in the source (the damage function is a stub), so a squad-mate's stray shot or a blast
still hurts. The pool is refilled between missions at a small price per unit.
*OpenSynd.* *partly* (Deflector Shield: two timed uses of 8 s, blocks bullets). **Design:** change it to an energy
pool (`energy: 100`) drained at 6 per second while raised, switched on and off freely, with the wearer unable to fire
while it is up. It keeps today's absorption of bullets and adds FreeSynd's rule: enemies refuse to fire at a shielded
target and look for another (so a shield buys time, not safety). Blasts still hurt. **Tests:** energy drains only while on; switching off keeps the remainder; enemies
hold fire; a raised shield blocks the wearer's own shots. **Done when** a squad can hide a wounded operator behind a
shield for the length of a reload.

#### F7. Time bomb: planting, fuse, chain reactions

*FreeSynd.* Dropping a time bomb from the inventory **plants and activates it** where the agent stands (a 15 second
fuse; a tick sound every 0.8 s); it explodes with an area of about two tiles (64 damage, four times what a person
can take) and a ring of flames drawn in waves. The blast reaches every living person, static object, vehicle and
**other bomb** within range **only if there is clear line from the centre** (walls and buildings shield), and
people inside vehicles are safe. A bomb on the ground explodes if it is hit by a bullet, a laser or another blast, so
shooting a bomb detonates it and blasts chain. Enemy agents are given a bomb too.
*OpenSynd.* *have* the Delay Charge (6 s fuse, falloff damage). **New:** blast needs a clear line from the centre
(use `hasLineOfSight`), occupants of vehicles are shielded until the vehicle goes, a bomb or a charge on the ground
explodes when hit by a shot or another blast, enemy agents sometimes carry and plant one, and a bomb can be thrown
or dropped at a point (not only where the operator stands). **Tests:** a wall protects someone behind it; two bombs
set each other off; a shot sets one off; a car occupant survives a blast that wrecks nothing.

#### F8. Damage types, resistances and ways to die

*FreeSynd.* Six damage types: **bullet, laser, burn, explosion, collision** (cars and doors) **and persuasion**.
The type decides how someone dies and what is left: a bullet kill drops all their weapons where they fall; a laser
kill leaves nothing (and our dead agents a distinct image); explosion and burn kills die burning (unless the victim
has the second Chest upgrade and someone else did it, in which case they die normally and drop their gear); a
persuasion "hit" is a reaction, not damage (they stop and are converted). Statics react to specific types only:
trees to laser, burn and explosion; windows to bullets and explosions; street lights to laser and explosion
(F42-F44). `getRealDamage` is a stub, so armour and resistance are an unfinished idea in the source.
*OpenSynd.* *partly* (events carry weapon names, no damage types). **Design:** add `damageType` to every weapon
event; death style and loot rules follow it; resistances become data per unit (`resist: { burn: 0.5 }`) fed by
Chest tiers (F17); statics declare which types affect them. **Tests:** loot drops only on bullet or burn kills in
the chosen rules; a resistant unit takes less burn damage; a window breaks to a bullet but not to a flame.

#### F9. Accuracy, spread, reaction time and rate of fire

*FreeSynd.* Every shot is aimed at where the player clicked, clipped to the weapon's range, then perturbed by the
shooter's **accuracy**: `accuracy = weaponAccuracy x (1 - mod) + (1 - weaponAccuracy)`, where the shooter's `mod`
starts from a base for the type (agents 0.5, enemy agents 0.5, guards 0.45, police 0.4, civilians and criminals
0.2) and, for the squad, adds a bonus of 0.006 per upgrade tier on each of Eyes, Brain, Arms, Heart and Legs, then
**subtracts** a term for low perception and **adds** one for low adrenaline (`0.4 x (2 - multiplier)`, so a
maxed-out drug lowers accuracy through adrenaline but raises it through perception). The weapon's own cone then
limits how far a shot may miss, and one part of the miss is random and independent of everything. A shot waits a
**reaction time** of 200 ms plus the weapon's reload before the next is allowed, and automatic weapons fire
continuously at their fire rate until the button is released or the ammunition runs out.
*OpenSynd.* *partly* (cooldown scaled by Brain; every shot hits exactly where aimed). **Design:** add a small
random miss: `miss = cone x (1 - accuracy)`, accuracy from weapon, unit type and upgrade tiers (F17) and the three
drug levels (F18); a shot that misses a person lands nearby on the ground (existing `puff` effect). Fixed seeds keep
tests deterministic (the simulation already has a clock; give it a seeded random generator in its state, as
`createFixedClock` does for time). **Tests:** with seed S an unupgraded shooter misses a known fraction of shots
at 8 tiles; upgrades and drugs shift it the stated amount; replays stay identical. **Done when** the debrief's
accuracy figure (F25) is meaningful.

#### F10. Weight and carrying capacity

*FreeSynd.* Every item has a weight. Capacity is the sum of what the Legs and Arms upgrades allow (5 with no
upgrade; each upgrade tier doubles that part: `5 << (version + 1)`), so a fully upgraded agent can carry several times
as much. Carrying more than capacity **halves walking speed**; more than twice capacity leaves them at a crawl
(a fixed very low speed). The minigun weighs 25, the flamer 15, the shotgun 7, a pistol 1. Persuaded followers walk
at a speed that follows their owner (F19).
*OpenSynd.* *new.* **Design:** `weight` on each equipment item (pistol 1, machine pistol 4, scatter 7, flamer 15,
rotary 25, rifle 5, bomb 5, shield 8); capacity = 6 + 6 per Legs tier + 6 per Arms tier; over capacity -35 percent
speed, over twice -65 percent. **Interface:** the inventory shows total/capacity and turns amber/red; the armoury
warns before purchase. **Tests:** speed multiplier by weight; capacity by tier; dropping an item restores speed.

#### F11. Ammunition and reloading cost money

*FreeSynd.* Weapons are bought once and refilled for money: each weapon has a rounds capacity and a price per round
(the pistol is free, the gauss and laser cost thousands per round, the shotgun and flamer a coin). The select screen
has a Reload button whose price is `(capacity - rounds left) x price per round`, and a weapon that is not yet
researched cannot be reloaded. Weapons carried home are kept for the next mission (the agent keeps their gear) and
the **pistol is refilled for free** after each mission.
*OpenSynd.* *partly* (rounds exist; refills are free at mission start). **Design:** a per-round price in content,
a Reload button in the armoury charging the difference, free pistol refills, and inventories that persist across
missions (F26). **Tests:** cost arithmetic; reloading is refused when funds are short; pistol refills free.

#### F12. Weapon "discovery" boosts research

*FreeSynd.* After a mission each weapon the squad carried that is **not yet available** is "submitted to research"
exactly once: if a research for it is currently open it gets a **25 percent bonus** (finishing at once if that
brings it to 100), and a message tells the player. A weapon can only boost its own research once.
*OpenSynd.* *partly* (looting a weapon makes it usable at once, which bypasses research). **Design:** replace the
instant unlock with the boost: looted gear can be used in the mission (as today) but only becomes purchasable after
research, and bringing it home gives `+25 percent` to its open research, once per item. **Tests:** boost applies
once; completing by boost unlocks and opens the next in the chain (F20); use in the mission still works.

#### F13. Enemies armed from the player's progress

*FreeSynd.* At mission start every enemy agent without a weapon gets one of **the two best weapons the player has
researched** (the best with about 78 percent probability, the second otherwise, ranked by the `rank` value in the
data) and a time bomb if the player has researched one.
*OpenSynd.* *new.* **Design:** an option "enemies match your arsenal" (default on for the campaign, off for fixed
missions): enemy agents and guards draw their weapons from the player's available set by rank, so the arms race
tracks progress and old missions stay hard for a well-armed squad. Rank is a number in content. **Tests:** with
only the pistol researched, nobody carries more than a pistol; with the rifle researched some do; seeded.

#### F14. Hit reactions

*FreeSynd.* A hit makes the target flinch (a recoil animation that also turns them toward the shooter); a
person being hit **cannot be persuaded** until it ends; killed people play a death by damage type; a burning person
walks about alight; a car hit by an agent ejects its driver.
*OpenSynd.* *partly* (knockback, ejection). **New:** recoil turns the target to face the shooter; persuasion
fails during a hit reaction; burning walk (F2).

#### F15. Everything is lethal

Health is deliberately low relative to damage: an agent has 16 health, a pistol round does 2, so eight hits kill; a
laser round does 32 and a gauss round or bomb 64, so one is enough. OpenSynd's ratios (vitality 100, pistol 12) are
already in this spirit; new weapons should keep it (a beam or bomb kills an unarmoured person at once, a pistol takes
about eight rounds).

#### F16. Medikit

*FreeSynd.* One-use, self only: restores the user to full health and takes as long as a shot to apply.
*OpenSynd.* *done:* the Field Repair Kit restores the user to full integrity, one use, only when hurt (an equipment item may still
restore a fixed amount with `restoreVitality`).

---

### B. Upgrades ("mods") and the IPA drugs

#### F17. Six body upgrades, three tiers each

*FreeSynd.* Six body parts: **Legs, Arms, Chest, Heart, Eyes, Brain**, each with versions 1, 2 and 3. Version 1
(a basic replacement part) is available from the start and is bought and fitted in the equipment screen; versions 2
and 3 ("plasteel" then "cybermesh" for the limbs and chest; enhanced and latest for eyes; neuro and cerebral for the
brain) must be **researched** (version 3 only after version 2). Purchase prices climb steeply: roughly 1x, 5x and
10x of the base part price (a leg is 6000, 30000, 60000; an arm 5000, 25000, 50000; the chest is the dearest at
8000, 40000, 80000; heart, eyes and brain are 4500, 22500, 45000). What each part does in the code:

- **Legs.** Walking speed is multiplied by `(version + 5) / 4`-style steps (about a quarter faster per tier) and the
  carrying capacity grows (F10). A legs upgrade also adds `0.006 x (version + 1)` to accuracy.
- **Arms.** Capacity grows (F10) and accuracy gains the same small bonus. (FreeSynd's intended arms effect, a
  steadier or faster weapon hand, is not wired in; the TODO list says weapon-range and accuracy modifiers are still
  to come.)
- **Chest.** From the second version the agent **regenerates health** one point every four seconds after being hit (the
  regeneration timer starts on a hit and stops when full health returns; read from the source: the timer only starts at
  the second version); from version 2 a fallen agent **explodes** on
  a suicide command (area damage around them and their weapons are destroyed) instead of just shooting themselves,
  and when killed by fire or a blast they die normally and **keep their weapons** (they drop them) rather than
  burning. This is the survivability part.
- **Heart.** Only the same small accuracy bonus is coded. A stamina or recovery role is not implemented in the
  source. (OpenSynd now follows this: Heart is a small aim bonus.)
- **Eyes.** The same small accuracy bonus. Sight range is a fixed seven tiles for everyone; Eyes do not extend it
  in the source (the TODO suggests they might).
- **Brain.** The accuracy bonus, a **big cut in the persuasion points needed** (F29: with no brain upgrade a guard
  needs 4 points, with version 1 two, with version 2 or 3 one; police 8, then 4, 3, 2; an enemy agent 32, then 16, 11,
  8) and, at version 3, the ability to use an **access card** (F5).
- **Enemy agents** are given the *highest available version* of every part at the start of each mission (legs twice),
  so they scale with the player's research as their weapons do (F13).
- The squad's accuracy bonus is capped (the comments say 0.59 from upgrades alone and 0.99 with drugs).

*OpenSynd.* *partly*: we have **Heart** (stamina) and **Brain** (focus and pulse speed) as research, and Legs and
Brain as training bars with a points budget. **Design:** make the six parts first-class, per operator, with three
tiers each, researched (tier 2 and 3) and bought and fitted per operator in the Armoury, with effects scaled to our
game: Legs +20 percent speed per tier and capacity; Arms +capacity, +accuracy, and a faster weapon cooldown (-6
percent per tier); Chest regenerates a sixteenth of the agent's health every 4 s from tier 2 after a hit (built), survives blasts and keeps gear from tier 2, and
explodes on command at tier 2 (a deliberate last stand); Heart cuts stamina drain and recovers faster (what we have
now); Eyes +accuracy and, from tier 2, a longer sight against cloaked units (it cuts the Shadow Cloak's effect), with
detection of cloaked units at tier 3; Brain as now plus the persuasion cost reduction and access-card use at tier 3. The existing training bars
become the drug sliders (F18). **Content:** a `mods` content type (`kind`, `tier`, `price`, `researchCost`, an
`effects` object). **Interface:** a portrait with six slots, greyed for unresearched tiers, in the Armoury.
**Tests:** every effect has a numeric test (speed per tier, capacity, regeneration rate, tier-2 blast survival and
gear drop, access card with and without tier 3, persuasion cost); the balance bot gets a loadout policy.
**Done when** an operator with three tiers of everything is a visibly different (and expensive) unit.

#### F18. The three drugs (IPA) and how they fade

*FreeSynd.* Every agent has **Intelligence, Perception and Adrenaline** sliders (0 to 100 percent, 50 neutral) that
the player drags **during play**; dragging one on a selected agent sets it for the whole selected group. Each
slider has three values, the **amount** (where you set it), the **effect** (what is actually in force) and the
**dependency** (the agent's tolerance mark). Rules from `ipastim.cpp`: every second the *effect* moves one notch
toward the amount; once they match, *both* move back toward the dependency; every 4.5 seconds the *dependency* moves
one notch toward the amount. So a high dose takes effect quickly, then wears off as the body adapts, and the
tolerance mark keeps creeping up, so a drug held high for long enough stops working and the agent then falls below
neutral when they come down. The multiplier the rest of the game reads is `1 + magnitude` above neutral (up to x2) or
`1 / (1 + magnitude)` below (down to x0.5), where `magnitude = |effect - dependency|`. What reads it: **Adrenaline**
multiplies walking speed (so up to double speed) and *lowers* accuracy as it rises; **Perception** raises
accuracy; **Intelligence** is stored and drawn but nothing reads it yet (the TODO says it should affect reaction,
sight and health recovery). Persuaded followers move at a speed set by the owner's adrenaline (F19).
*OpenSynd.* *partly*: Legs (speed) and Brain (pulse speed) bars with stamina and focus meters that drain and
recover. **Design:** model the three drugs exactly as above with our time scale (effect step every 1 s, dependency
every 4.5 s) and bind them to: Adrenaline -> speed and reaction (and a worse aim), Perception -> accuracy and sight
range, Intelligence -> weapon cooldown and persuasion success speed. The existing Legs and Brain bars become the
aliases for Adrenaline and Intelligence so saves and the training budget still make sense (budget points set the
starting amount, and the dependency mark starts at neutral). **Interface:** each portrait gets three thin sliders
that can be dragged (applied to the whole selected group, matching how weapon selection works), the effect shown as
a darker bar chasing the amount and a tick for the dependency. **Tests:** the drift is exactly the described
sequence over a fixed time; the multiplier is 0.5-2 at the extremes and 1 at neutral; a long high dose ends below
neutral; group dragging updates every selected operator. **Done when** pushing everything to maximum is a short burst
of power that costs you afterward.

#### F19. Followers move at their owner's pace

*FreeSynd.* A persuaded person's speed is `their own speed x ownerBoost / 2`, where the owner's boost is 4
when the owner's adrenaline multiplier is above 1, 1 when below, and 2 otherwise. A hyped-up owner drags a faster
flock; a sluggish one a slower. *OpenSynd.* *partly* (followers run at 1.5x their own pace). **New:** tie follower
speed to the owner's current speed multiplier.

---

### C. Research

#### F20. Research as a funded, time-based process with chains

*FreeSynd.* Research is not a purchase. Each research has a **minimum funding** and runs in **game hours**; the
player sets its **funding level on a ten step dial** (1, 2, 4, 6, 10, 15, 30, 50, 75, 100 times the minimum), which
sets how fast it progresses (from 0.42 to 4.17 percent per game hour, so a minimum-funded research takes ten days
and a 100-times-funded one under a day). Each game hour costs `funding / 24`, drawn from the player's money; a
research the player cannot afford slows to what money allows. A **projected finish time** is recalculated whenever
the dial changes. Only **one research is active at a time**; starting another **suspends** the current one (its
progress is kept). Weapon research is organised in four **categories and chains**: *Assault* (Flamer, then Long
Range, then Time Bomb), *Automatic* (Uzi, then Minigun), *Heavy* (Laser, then Gauss Gun) and *Misc* (Access Card, then
Energy Shield). At the start only the first item of each chain is open (plus version 2 of each body part), finishing
one **opens the next** in its chain and removes the finished item. Body-part research is version 2, then version 3,
cost doubling. The weapon-discovery bonus (F12) adds 25 percent. Costs are in money, so research and tax revenue
(F28) trade off against buying gear.
*OpenSynd.* *partly* (instant, fixed price per item; a Research and Armoury screen with tracks for Heart and Brain and
items). **Design:** replace instant research with a **research queue on the campaign clock** (F30): each research
has `minFunding`, `chain` (category and next), `tier`; one active at a time, others suspended with progress kept; a
funding dial of ten steps; a progress bar with percent, projected finish and the money spent per day; funds are
drawn daily (the campaign already earns funds continuously: keep it, but spend it at research time). Starting chains (each item opens the next):
**Automatic** Machine Pistol -> Rotary Cannon; **Heavy** Beam Projector -> Coil Gun; **Assault** Incinerator ->
Longshot Rifle -> Delay Charge, with the Scatter Emitter as a cheap first research; **Misc** Persuader and Clearance Key ->
Deflector Shield; body parts tier 2 then tier 3. Existing saves
migrate by marking what the player already bought as researched. **Interface:** the Research screen becomes a list
per category with the dial, "Suspend" and "Start", and a summary line "Research costs 640 a day: 12 days of funds".
**Tests:** progress per hour at each dial step; cost per hour; suspend and resume keep progress; finishing opens the
next in the chain; money shortage slows progress; the 25 percent bonus (F12) can finish a research. **Done when**
choosing what to research (and how hard to fund it) is a real decision against buying and upgrading.

---

### D. Missions and objectives

#### F21. Sequential objectives, and the objective types

*FreeSynd.* A mission has up to five **objectives that run strictly in order**: only the *current* objective is
evaluated; the first time it is looked at it is "started" (which sends the minimap a signal, F24), each turn it is
evaluated, and when it completes the next becomes current; when the last completes the mission is a **success**;
**if any objective fails the mission fails at once**. Every objective carries a message shown to the player.
The types in the code (`objectivedesc.*`, with the data codes from `leveldata.h` in brackets):

- **Persuade** (1): a named person must be persuaded; fails if they die.
- **Assassinate** (2): a named person must be killed; **fails if they escape the map** (a flag the ped gets when a
  scripted route takes them off the edge, F22); completes when they die.
- **Protect** (3): a named person must stay alive (fails if they die); some missions also need them to **reach a
  destination** (a script type "protected target reached destination").
- **Acquire equipment** (5): take a named weapon or item (fails if it is destroyed).
- **Combat sweep** (0x0a, 0x0b): eliminate **every member of a group**: all enemy agents, or all police (the
  message differs, "eliminate agents", "eliminate police"); the evaluation counts living members of the group.
- **Destroy vehicle** (0x0e): a named vehicle must be destroyed; completes when it is dead.
- **Use vehicle** (0x0f): a named vehicle must be taken over (an agent drives it); fails if it is destroyed first.
- **Evacuate** (0x10): bring *all agents and a list of persuaded or protected people* into a marked red zone;
  completes when every one of them that is still alive is in it.
- **Action** (0): listed for non-agent scripted triggers; its purpose is unclear in the source.

*OpenSynd.* *partly*: **interact, disable (named targets), hold, reach-zone, extract**, all required in any order
except extraction last. **Design:** add a `sequence` mode to missions (default stays "any order"): objectives
listed in order, only the current one active and shown first, the rest dimmed; and `failOn` rules per objective.
New objective types in content (extend `objective.type` and the validator and the schema):
`persuade` (`targets: [placement ids]`, completes when persuaded, fails if all die), `assassinate` (`targets`,
completes on disable, **fails when a target reaches its `escapeZone`**), `protect` (`targets`, `until`: "end" or a
`destination` zone; fails if one is disabled), `take-item` (`item`: a named item placed on the map or carried by a
named enemy; completes when any operator holds it), `eliminate` (`group`: "enemy-agents", "guards", "police",
"criminals"; completes when none are alive), `destroy-vehicle` (`targets`: vehicle ids), `use-vehicle` (`targets`;
completes when an operator drives it; fails if destroyed) and `evacuate` (`zone`, `bring`: "squad" and
"followers" and/or named ids; completes when everyone alive is inside). Hold, interact and extract stay as they are.
**Interface:** the objective list shows the current objective highlighted and a final one for extraction; a failed
objective ends the mission with its own debrief line. **Tests:** one test per type for completion and for failure,
a sequential mission refuses to complete out of order, and an existing "any order" mission is unchanged.
**Done when** a mission can be written whose first job is to find a key, second to persuade a VIP, third to escort
them out, and each fails in the way its text says.

#### F22. Scripted non-player behaviour in missions

*FreeSynd.* The mission data gives people and vehicles **scenarios**, chains of steps stored per ped:
`walk or drive to a point`; `take a vehicle and go to a point`; `walk to a point only when one of our agents comes
within range (a trigger, 6 tiles by default)`; `repeat from the start` (a patrol loop, as our `patrol`); `the
assassination target has escaped` (a run for the exit, F21); `the protected target reached its destination`; `a
train stops and waits`. Triggers make enemies stand still until the squad approaches, then run to a position
(ambushes and reinforcements). Each person also has a default action when nothing is happening.
*OpenSynd.* *partly*: placements have `patrol` (waypoints and loop). **Design:** add a general `script` list to any
placement: steps `walk {to}`, `wait {seconds}`, `drive {vehicle, to}`, `enter {vehicle}`, `exit`, `trigger {within,
of: "squad"}` (the script blocks until an operator is within the distance, then continues), `escape {zone}` (run to the
edge and leave the map: used by the assassination rule), `say {text}` (a caption and voice line) and `loop`. `patrol` stays as
sugar for `walk` steps plus `loop`. **Interface:** none new except that triggered groups wait visibly (they stand
and do not patrol). **Tests:** a trigger fires on the first operator in range and not for a civilian; a script
loop repeats; an escaping target that leaves the map fails an assassinate objective; scripts survive a save and
load (store the step index). **Done when** an ambush mission can be written without code.

#### F23. Mission-critical items carried by enemies

*FreeSynd.* Weapons are map objects with owners; an enemy who dies drops what they hold (bullet kills), and a
"take weapon" objective can point at one such item. Persuaded followers will go and fetch dropped weapons (done, see H). *OpenSynd.* *partly* (loot from disabled enemies). **New:** content can say an enemy carries a named
key item (`carries: ["item.briefcase"]`); killing them drops it as a pickup with a glow; `take-item` completes on
pickup. This is how the Clearance Key (F5) and the objective items travel.

#### F24. The minimap signal at the current objective

*FreeSynd.* When an objective starts, the minimap draws a blinking **signal** at its target's position (a person,
vehicle or weapon) or at the evacuation zone, and clears it when the objective ends. Without a scanner the minimap is
a tight zoom around the selected agent, so the signal is the guide to the target.
*OpenSynd.* *new* (zones are drawn on the minimap permanently; nothing points at the current one). **Design:**
mark the current objective's zone or target with a pulsing ring and an arrow at the minimap edge when it is off the
visible part (F4), and a short "objective updated" line in the status bar and a sound when the next one starts (F21).
**Tests:** the signal follows the current objective and clears on completion; moving targets update it.

#### F25. A real debrief

*FreeSynd.* After a mission the debrief shows: the mission result (complete, failed, aborted), **agents used**, the
**time** taken (days and hours of game time), **enemy agents killed, criminals killed, civilians killed, police
killed, guards killed**, **people convinced** (persuaded and still with you), **enemy agents captured** (persuaded
and brought out; they become recruits, F27), and **shooting accuracy** as hits over shots (every round fired by a
squad member counts as a shot; a hit counts when a shot lands on a person, and persuadotron uses count as shots).
It also announces **new weapons found** (F12). A comment in the code notes civilian and police deaths were meant to
reduce a country's happiness (F31) and persuaded civilians were meant to earn money.
*OpenSynd.* *partly*: the debrief shows time, operators and enemies disabled, bystanders killed, achievements.
**New:** count shots and hits per operator, kills by type (enemy agents, guards, criminals, civilians, police),
persuaded and brought out, captured enemy agents, weapons found (and research boosted), money earned and lost this
mission (research and funds spent, bystander penalties), and a per-operator line (shots, accuracy, kills,
persuaded). **Tests:** counters per event type; accuracy arithmetic; zero shots shows "no shots".
**Done when** the debrief answers "how did each operator do?".

---

### E. Agents, the roster and the campaign

#### F26. A roster with permanent death

*FreeSynd.* The player runs a **roster of up to 18 agents** (the "cryo chamber"), **eight at the start**, which
alternate man and woman (or are all women with an option), each with a **surname** from a list of about 40 and a
pistol. **Four** go on each mission (the squad slots). Agents **keep their weapons and upgrades** between missions
(whatever they carried out is transferred back to them, and the pistol is topped up), and **an agent who dies is
deleted for good**: their slot empties, and the only source of new agents is capture (F27). A squad can therefore
run out, and every death costs the player what they had invested in that person.
*OpenSynd.* *new* (a fixed squad of four operators who are restored every mission). **Design:** a persistent
`roster` in the campaign record: id, surname, portrait, upgrades (F17), inventory (F11), kill count, missions flown,
status (alive, dead, in reserve). A pre-mission "Squad" step picks four from the roster. Death is permanent by
default with an optional **"insurance"** difficulty setting (a fallen operator is revived for a price) for players who
want a softer game. New recruits: captured enemy agents (F27) and, as a fallback so a campaign cannot dead-end, an
expensive "hire a replacement" button. **Save:** the roster and its inventories (a save version bump with migration:
old saves become a roster of the four existing operators). **Tests:** death removes the operator; inventories persist
across missions; a campaign with an empty roster ends in a clear game-over; a squad of fewer than four plays.
**Done when** an operator with three upgrades and a stolen rifle is someone the player does not want to lose.

#### F27. Captured enemy agents become recruits

*FreeSynd.* At the end of a **successful** mission, every enemy agent who is still alive and **persuaded** is
counted as "captured": a new agent is created in the roster **with their weapons and body upgrades** (these are the
top-tier parts enemy agents were given, F17). Persuaded civilians, police and guards only count as "convinced" in the
statistics (a comment says money per persuaded person was planned). If the mission fails nothing is kept.
*OpenSynd.* *new*, and it gives the Persuader its purpose. **Design:** on success, each enemy agent (not guards or
police) persuaded and alive at extraction joins the roster with their carried weapons and a set of upgrades
that matches what their placement had (content: `upgrades: {legs: 3, ...}` on enemy-agent placements). The debrief
announces "Recruited: <surname>". Guards and police are converted for the mission only. **Tests:** only survivors
who were persuaded and present at a successful extraction are recruited; their gear transfers; a failed mission
recruits nobody; the roster cap (F26) is respected.

#### F28. The campaign clock

*FreeSynd.* One **game hour is four real seconds** (a game day is 96 seconds), the clock always runs (including during
missions), and the date is shown as `HH:DDD:YYYY NC` (a year counter starting in year 85 of a new calendar, 365-day
years). **Research progresses hourly and is paid hourly; tax is collected and population and mood update once per
day** (F30). Whole days passing at once are processed day by day so nothing is skipped.
*OpenSynd.* *partly* (funds accrue per real second during a mission only). **Design:** a campaign clock with the same
shape and our own calendar (a made-up year count), run from the operation and the between-missions screens, paused on
the title and in dialogs. Missions advance it by their duration so a long operation costs research time and income
loses its "per second of play" shortcut: income becomes tax (F30). **Tests:** hours and days arithmetic; daily hooks run
once per day even after a long step; the clock pauses when paused.

#### F29. Persuasion points

*FreeSynd.* An agent has a running **persuasion total** (`totalPersuasionPoints`). The Persuadatron persuades anyone
in range (about one tile in the real game's range value, 100 units in the data file) for whom the agent has **enough
points**, and each person persuaded **adds points to the agent's total**. Civilians and criminals need nothing (any
agent can persuade them); guards, police and enemy agents need points that **fall as the Brain upgrade rises**:
guards 4, 2, 1, 1 (no upgrade, tier 1, 2, 3), police 8, 4, 3, 2, enemy agents 32, 16, 11, 8. What each person
persuaded adds is set by a `switch` that **falls through** (a civilian adds 1; a police officer adds 4 + the
agent's 32 + 1; a guard adds 3 + 4 + 32 + 1), so harder people are worth far more points; this looks like a coding
slip, the intent being "the tougher the person, the more they count". A person **mid-hit-reaction cannot be
persuaded** (F14). A persuaded person: joins the owner's group, becomes **immune to panic**, replaces its behaviour
with the follower behaviour, and shares the owner's enemies; if the owner dies their people are passed to another
living agent and the points are re-assigned (done in OpenSynd, see H). The Persuadatron has no ammunition and is
used by selecting it: every agent holding one persuades everyone in range every frame it is selected.
*OpenSynd.* *partly:* our Persuader has counts rather than points, a charge pool, and fixed thresholds (3 civilians
for a guard, 6 for police, 4 police for an enemy agent). **Design:** convert to **points**: each persuaded person is
worth points by type (civilian and criminal 1, guard 3, police 6, enemy agent 12), a person needs a points total
(guard 4, police 8, enemy agent 32 with no Brain upgrade, falling with Brain tiers F17), so upgrades and persuading
different people both open harder targets; keep our charges as the ammunition. The current counts convert to points on
migration (a civilian is 1 point, so six civilians reach police). **Interface:** a points meter on the portrait.
**Tests:** thresholds by tier; points per type; migration; the "no persuasion during a hit" rule.

#### F30. Territories, population, tax and mood (the strategic layer)

*FreeSynd.* The world map is **50 territories ("blocks")**, each with a name, a default and a current
**population** (a few million), a **tax rate** (starts at 30 percent), a **mood**, a status (unavailable, available,
finished, rebel), the **mission** played there, a list of **neighbouring territories it unlocks**, and a rival
**syndicate** owner (a colour) while it is not yours. Playing a mission on an available territory and winning marks it
finished and unlocks its neighbours.

- **Population drifts** every day by 100 to 300 people, up with 60 percent chance and down with 40, kept between 2000
  above and 1000 below its default.
- **Tax income** every day: `((population / 1,000,000 + 1) x 1375 x taxRate) / 1000`, for finished territories only.
- **Mood** is a six step ladder: very happy, happy, content, unhappy, discontent, rebel. At **30 percent tax or
  less** the mood *improves one step every 15 days*; above 30 it *worsens* on a timer that depends on the rate:
  between 30 and 90 percent the wait is `(100 - tax) x 12 / 100` days (plus or minus one day), with a small plateau
  between content and unhappy, and above 90 percent it worsens every one or two days. Changing the tax resets the
  direction when it crosses 30 percent. A territory that falls past discontent becomes **rebel** and its mission is
  available again as a revolt to put down; rebels pay no tax.
- The tax rate is changed on the map with + and - (10 at a time with Page keys); the change applies the next day;
  the map shows population, tax income and mood for the selected territory.
- A comment says civilians and police killed in a territory's mission should make its people unhappier, and
  persuaded civilians should earn money; neither is coded.

*OpenSynd.* *partly:* five operations on a flat world map (the target is **50 territories and 50 main missions**, F45);
the unlock graph, tax and mood are built. **Design:** give each map region (already positioned by longitude and latitude) a
`territory` record: population, default population, tax, mood, status, neighbours it unlocks (replacing "locked until
the one before is done" with a graph), owner (a named rival syndicate). Implement the daily tick,
the revenue formula (our own constants), the mood ladder and the rebel revolt as a fresh operation on the same map.
Make bystander deaths feed the mood: each civilian or police death in an operation lowers that territory's mood by a
step at the end of the day and costs the funds penalty we already have; persuaded civilians earn a small bonus (the
unfinished FreeSynd idea). **Interface:** the world map region card shows population, tax slider, income per day, mood
face and a "next change in N days" line; the Research screen shows today's income against today's research cost.
**Tests:** revenue arithmetic; mood step timing at 20, 50 and 95 percent; crossing 30 percent resets the timer; rebel
creates a revolt mission; neighbours unlock. **Done when** setting taxes is a pull between money now and unrest later.

#### F31. Buying mission intelligence

*FreeSynd.* Before a mission the briefing screen offers two kinds of purchase per mission, each with a price and
several levels: **information** (each level adds more briefing text about the target and the opposition) and
**enhancement** (each level adds detail to the briefing map; at the **last** level the map shows the **enemies**).
Levels are stored per territory and persist.
*OpenSynd.* *new* (the briefing is fixed text). **Design:** content per mission lists `intel: [{price, text}]` levels
and `survey: [{price, reveals}]` levels (reveal objective zones, then patrol routes, then individual enemy positions
and vehicle spawns on a preview map). The preview map is the real map drawn small, so no extra art is needed.
The player decides what to spend before deploying; unspent money funds research. **Tests:** prices debit funds;
levels persist per mission; the preview shows exactly what has been bought.

#### F32. The equipment screen and the inventory

*FreeSynd.* Each agent has **eight item squares** (`kMaxHoldedWeapons`); the equipment screen lists what is
available to buy, shows the selected item's cost, rounds, price per round, range, damage and weight, and lets the
player **buy** (money is debited), **sell** (the item's full purchase price is returned), **reload** (F11) and
**fit or replace body parts** (F17) per agent, with a price on everything. Only researched items are listed, plus the
agent's own gear that is not yet researched (it can be carried but not reloaded).
*OpenSynd.* *have* the Research and Armoury with eight squares per operator, purchase, sale and loadouts. **New:**
reload costs (F11), body parts (F17), weight (F10), the item stats panel with every field, and keeping unresearched
captured gear usable but not refillable (F12).

---

#### F45. Campaign scale: 50 territories and 50 main missions

*Target (decided by the project owner).* **There are 50 territories to conquer, and 50 main missions: generally one per
territory.** This is the size of the finished campaign, and every system above (the unlock graph F30, tax and mood F30,
research chains F20, intelligence F31, the roster F26) is built to carry it. FreeSynd's world is likewise 50 territories
("blocks") with a mission each; the *shape* (a graph of territories on a world map, each opened by winning its
neighbour) is a mechanic, while the territories, names, maps and missions here are original.
*OpenSynd.* *open:* five operations on five regions (Northern Europe, and four more). **Design:**
- **Territory records.** 50 `region` records (own names, longitude and latitude on the existing world map, a default
  population of a few million, a rival owner from a short list of invented syndicates) in a content file of their own
  (`territories.json` in the pack), separate from the missions, so the map and the campaign can be checked without
  loading 50 missions. Validated: exactly 50, unique ids, every one reachable from the start by the `unlocks` graph, no
  two within a marker's width of each other.
- **One main mission per territory.** Each territory names its `mission`; the validator reports territories without
  one and missions that belong to no territory. A few territories may carry a second, optional operation (a revolt
  after it goes rebel, or a side job), but the campaign is **won by finishing the 50 main missions**; finishing all of
  them ends the campaign with an ending text, and a campaign summary (days taken, funds earned, operatives lost) is
  shown.
- **A difficulty ramp across the 50.** The graph has a few starting territories and widens: roughly 4 easy openers, 12
  early, 18 middle, 12 late, 4 final, with enemy numbers, armament tiers (F13), body-part tiers (F17), guard and police
  presence, and objective variety (F21) rising along it. A table in the pack lists, for every mission, its tier,
  objective types, enemy count and the research it expects the player to have, so balance can be reviewed at a glance.
- **Producing 50 missions without 50 hand-made maps.** Maps come from the generator (`tools/generate_maps.py`) with
  per-mission parameters (size, layout seed, compound and gate, channel, number of blocks) plus a small set of
  authored landmarks, so each territory looks different and plays differently; a mission is a short data file
  (objectives, placements, scripts, intel levels, briefing and debrief text), which the mission editor (F44) writes
  and checks. Mission text is original and written to a style sheet kept beside the table.
- **Saving and progress.** The campaign record already keeps territories, tax and intel per territory; it must keep
  working for 50 (the record stays small: a few numbers per territory). The title screen's list becomes a world map
  with all 50 markers (zoom and pan), a filter (available, finished, rebel), and the operations list groups by region.
- **The balance bot** runs every mission whose objective types it understands and reports a win rate per policy, so
  a regression anywhere in the 50 shows up in `npm run balance`; the missions it cannot play are listed.
**Tests:** the content validator's checks above (count is 50, every territory has a mission, graph reachability, unique
names); a campaign save with all 50 territories round-trips; unlocking follows the graph; finishing the last mission
shows the ending once. **Done when** a player can play from the first territory to the last, every step opened by the
previous ones, and the world map shows a 50-territory conquest in progress.

### F. Controls and interface

#### F33. Queued orders with Ctrl

*FreeSynd.* Every order is a **list of actions**: a plain order **replaces** the list; the same order given while
**Ctrl is held** (`addAction` is true) is **appended**. Walking to points, following someone, picking up a weapon,
dropping an item, entering or leaving a vehicle and driving to a point can all be queued, so a squad can be told in one
sweep to walk to A, pick up that rifle, walk to B and get into the van. Dropping a time bomb from the inventory while
queued plants it at that point in the route.
*OpenSynd.* *new* (an order replaces the last). **Design:** `unit.orders` becomes a list; Shift (our key, Ctrl is used
for multi-select in browsers on some systems) appends; the path is drawn as a faint line through the queued points
with numbers; Escape clears the queue. Orders are data (`{type: "move" | "follow" | "pickup" | "drop" | "enter" |
"leave" | "drive", target}`) so saves can store them. **Tests:** queue order; replace on a plain order; a failed step
(target dead, route blocked) skips to the next with a status message.

#### F34. What a click means

*FreeSynd.* **Left click** acts on what is under the pointer: a **weapon** on the ground sends the selected agents to
pick it up; a **person** makes them follow and attack (they stop when in range of their weapon with a clear line,
at about two thirds of its range); a **vehicle** gets them in or out; **ground** walks them (in squad formation).
**Right click** shoots at the clicked point or target; **holding** it keeps firing automatic weapons, and releasing
stops. Clicking the **minimap** sends the squad there (no shooting or object use through it).
*OpenSynd.* *partly* (move, follow-and-fight, right-click fire, loot by clicking ground, V for vehicles). **New:**
click a vehicle to enter or leave it (with V as the key); click a dropped weapon to fetch it; **hold** the right button
for automatic weapons (F9); stop distance of two thirds of the selected weapon's range (we use nine tenths today).
**Tests:** click targets resolve in the stated priority; the follow stop distance.

#### F35. Squad formation

*FreeSynd.* When several agents are sent to one point they stand in a **two by two grid** at the destination (each
agent has a slot offset inside the tile), so four agents do not pile on one spot.
*OpenSynd.* *have* (formation tiles around the destination). Keep.

#### F36. Selection and hotkeys

*FreeSynd.* Number keys **1 to 4** select an agent, **0** toggles between one agent and the whole squad, **Ctrl plus
a number** adds or removes an agent from the selection; the first selected agent is the **leader** (the one whose
weapon choice and position the group copies; if the leader is deselected another is chosen). **F5 to F12** pick the
carried item in each of the eight inventory squares for the leader and, with Ctrl, for the whole group; choosing a
weapon for the group deselects weapons of the same category on the others. **P** pauses. **F1** and **F2** toggle
music and sound.
*OpenSynd.* *partly* (A selects all; clicking portraits selects; weapon selection for the group). **New:** 1-4 and 0,
Shift plus number for toggling, a **leader**, and **F5-F12 (or 5-8, 1-4 rows)** slot hotkeys; the slot keys are
rebindable like the rest. **Tests:** every key's effect; leader reassignment on deselect.

#### F37. The HUD

*FreeSynd.* Per agent: portrait and health, a **row of up to eight carried items** with ammo bars, and the three
drug sliders. A weapon selector shows what the leader holds. The minimap sits in the corner. Mission text (the
current objective) and warnings (an agent is being targeted by police) come as short messages.
*OpenSynd.* *have* most of this. **New:** the drug sliders (F18) on the portraits, ammo bars on each item square,
the current-objective banner (F21), and a "being targeted" warning sound and flash when police begin their warning
(the police warning voice, F38).

#### F38. Voice and sound cues

*FreeSynd.* Besides per-weapon samples (pistol, shotgun, uzi, minigun, laser, gauss, long range, flame, persuade,
explosions, time bomb tick, door, breaking glass, flaming death), the game has **voices**: "agent selected",
**"put down your weapon"** (the police warning, played once when police begin to warn), mission completed and mission
failed announcements, and a "tracking pong" for the scanner.
*OpenSynd.* *partly* (synthesized weapon and effect sounds). **New:** door open/close, glass breaking, flaming
death, a scanner ping, spoken or caption-and-tone cues (selected, mission complete, mission failed, the police
warning). Voices can be synthesized or text-to-speech free of licence (or captions only) and always captioned.

---

### G. The world: things that can be touched

#### F39. Doors

*FreeSynd.* **Doors** and **large doors** (gates) are map objects with four states: closed, opening, open, closing. A
door **opens when a living person stands on either side of it** (checked along the door's axis) and **closes again
when nobody is there**; while closed it blocks movement and sight and is a blocker for shots; while open it does
not. The person walking through is held for the moment it takes. Some doors are locked (F5).
*OpenSynd.* *partly* (gates opened by a panel). **Design:** a `door` map object with the same four states and an
optional `lock`; open for anyone (people and cars alike) who stands next to it unless locked; blocks sight, shots
and blasts while closed. Buildings gain doors (entrances) that civilians use, giving indoor spaces later. **Tests:**
open on approach, close after leaving, block `hasLineOfSight` while closed, locked doors refuse non-holders.

#### F40. Windows

*FreeSynd.* **Windows** have health; **bullets and explosions break them** (a breaking animation, then a damaged
state) and a broken window **no longer blocks** shots or sight; **animated windows** (lit, flickering) are purely
decoration and do not block. A "glass breaking" sound plays.
*OpenSynd.* *new* (building windows are drawn, not objects). **Design:** ground-floor windows along building faces
are breakable props: a bullet breaks one, an enemy can then see or shoot through it, glass sound and fragments,
and a short-lived "alarm" that makes nearby enemy agents investigate. **Tests:** breaks to a bullet and not a flame;
no longer blocks sight; the alarm radius.

#### F41. Trees and flammable props

*FreeSynd.* **Trees** are hurt **only by laser, burn or explosion**; when destroyed they **burn for ten seconds** and
stop blocking; they have a damaged sprite. Street furniture (bins, phone boxes, post boxes) has burning and damaged
animations and the TODO list wants them destructible; **advertisement boards** are drawn specially.
*OpenSynd.* *new* (props are decoration). **Design:** vegetation and furniture props with health, material and
`flammable`; fire (F2) and beam or blast damage burn them for ten seconds; burning props light nearby units. Billboards
are tall props that fall when a blast hits them (a cover change). **Tests:** burn timing; fire spreading to a
neighbouring flammable prop; non-flammable ignores flame.

#### F42. Street lights, traffic lights and neon

*FreeSynd.* **Semaphores** (hanging street lights and traffic signals) sway and cycle a state; a **laser or an
explosion** brings one down (it falls to the ground and stops). **Neon signs** are decoration with an animation.
*OpenSynd.* *new.* **Design:** traffic lights that cars obey at crossings (they stop on red, giving the player a
rhythm to exploit and ambush), street lights that can be shot to darken an area (reducing enemy sight at night, a
stealth tool), and neon signs as light sources that matter for a night-vision/sight rule if we add one. **Tests:**
cars stop on red; a broken light stops cycling.

#### F43. Vehicles: lanes, collisions, kinds and trains

*FreeSynd.* Vehicles come in kinds: large armored, regular car ("grey vehicle"), fire engine, small armored, police
car, medical van, and **trains** (a head plus bodies that move as one). Cars drive only on tiles walkable by cars and
**keep to the direction of traffic** (the pathfinder forbids driving the wrong way into a lane). Peds in a car do not
panic. A shot car ejects a driver who is not ours; a destroyed car burns as a wreck for ten seconds, drops everyone
and explodes with an area of two tiles; destroyed cars also exist from the start as **burnt wrecks** in the
scenery. **Collision damage** is its own type (cars and doors hurt people). Vehicle health, speed, capacity,
damage and blast radius per kind are on the original TODO list. Passengers (persuaded followers) get in with the owner
and are dropped with them.
*OpenSynd.* *have* cars on roads with drivers, hits, explosions, wrecks, taking and driving (done, see H).
**New:** **lane direction** (one-way streets and two-lane traffic so cars do not drive through each other), **run-over
damage** (a moving car at speed hurts people it overlaps, civilians jump aside), the **fire engine** and **small
armored car** kinds, **trains** on a track with stations that wait (a hazard and a set piece), and **burnt wreck
scenery** placed by content. **Tests:** no head-on overlap on a two-way street; run-over damage scales with speed;
a train stops at a station and waits.

#### F44. Content and map editors

*FreeSynd.* `src/editor` is a **data browser**: it lists missions, searches them (for example by which ped types
appear) and previews fonts and animations; it is not a map editor. The TODO list names a mission editor and map editor
as wanted.
*OpenSynd.* *new.* **Design:** an in-browser editor that loads a content pack, shows a map, and lets a creator place
zones, enemies (with patrols and scripts F22), vehicles, props and objectives by clicking, validates against the
schemas live, and exports the JSON. Built on the renderer that already draws maps; the generator and validator remain
the source of truth in CI. **Done when** a person can build and share a mission without touching a text editor.

---

### H. Behaviour already mapped

The ped types and behaviours (agent, enemy agent, guard, police, civilian, criminal, persuaded followers, vehicles) are
documented in "People and behaviours, mapped from FreeSynd" and "Vehicles" above and are *have*. Differences worth
fixing from this read: FreeSynd's police warning is **two seconds** (ours 0.8 s) and speaks a line (F38); enemy
agents wait their reaction time while *walking*, not frozen; police scout continuously only after a weapon appears
anywhere (we match); an enemy will not shoot a shielded target (F6).

### I. Where the biggest wins are

Ordered by what each adds per unit of work given what exists. Items in the same row are best built together.

1. **Objective types, the sequential chain, scripted people and the minimap signal** (F21, F22, F23, F24): they reuse
   zones, vehicles, persuasion and followers, and make every mission differ.
2. **The missing weapons and their rules** (F1 scatter, F2 flame, F3 beam, F4 scanner, F5 key) **with weight, spread
   and reload cost** (F9, F10, F11) and **damage types** (F8), so weapon choice and loadout carry weight.
3. **Funded research with chains and the discovery bonus** (F20, F12), which the campaign clock (F28) drives.
4. **The persistent roster, permadeath and captured recruits** (F26, F27, F29 points), giving the Persuader a payoff
   and stakes to every mission.
5. **The strategic layer: territories, tax and mood, plus bought intelligence** (F30, F31) on the existing world map.
6. **Body upgrades and the three drugs** (F17, F18, F19): the largest character-building system, built on F8-F10.
7. **A fuller debrief** (F25) and **touchable scenery** (F39 doors, F40 windows, F41 flammables, F42 lights, F43
   traffic and run-over damage).
8. **Queued orders, hotkeys, hold-to-fire** (F33, F34, F36, F37).
9. **The mission editor** (F44), once the mission format has stabilised.
10. **Campaign scale** (F45): 50 territories and 50 main missions, built on the editor, the generator and the graph.

## Rules brought in from FreeSynd's source (principle 8)

- **Death drops:** a person shot down drops everything they carry, scattered on the ground around them, each item
  separately and available to pick up (F, or click it); one killed by a beam, or by fire or a blast without the second
  chest, loses it all. Operatives drop theirs too; police, guards and criminals carry a weapon (`carries` in their unit
  file: a machine pistol, a heavy emitter, a civic emitter) that drops with them, and each item shows its own icon on the
  ground.
- **Several researches at once:** up to six items can be researched together, each at its own funding level (paused or
  resumed one by one). The source in this repository keeps one current research and suspends it when another starts, so
  this follows what you told me about FreeSynd rather than that code.
- **Extraction needs everyone:** the operation ends only when every operative still standing is in the extraction zone (a
  vehicle driven into it brings its riders); those who have fallen no longer have to be there.
- **Dropping items:** right-click a weapon or item slot (or Alt+Shift+1-8) and it lies on the ground beside the operative,
  freeing the slot, to be picked up again by anyone.
- **Chest regeneration:** tier 2 and 3 chests heal a sixteenth of the operative's health every four seconds after a hit.
- **FreeSynd's economy, exactly:** a new campaign starts with 30000 funds. Weapon prices and ammunition prices (per round) are FreeSynd's (`data/ref/weapons.dat`): pistol 0, shotgun 250 (2 a round), Uzi 750 (2), minigun 10000 (10), laser 35000 (2000), flamer 1000 (1), long range 1000 (2), scanner 500, medikit 500, time bomb 25000 (7500 each), energy shield 8000 (15), persuader 5000 (no ammunition: it never runs out), gauss gun 50000 (15000); our weapons take the price of their FreeSynd counterpart (the two items FreeSynd has no match for, the heavy pulse emitter and the shadow cloak, are gone: the shotgun replaced the first wherever it was carried). Body parts cost its 6000/5000/8000/4500 for tier 1, five times that for tier 2 and ten times for tier 3. Selling returns the full price. Tax is `((whole millions + 1) x 1375 x rate) / 1000` a day (165 for a three-million territory at 30 percent). Research uses FreeSynd's ten funding multiples (1, 2, 4, 6, 10, 15, 30, 50, 75, 100 times the item's minimum funding a day) and its progress per hour (0.416 to 4.166 percent), with FreeSynd's minimum fundings from `research.dat`. FreeSynd's starting weapons are available from the start: pistol, shotgun, persuader, scanner and medikit. Nothing is paid or charged for bystanders or persuaded followers, and the achievements (which FreeSynd does not have) are gone. Weapons research follows FreeSynd's chains: Uzi (machine pistol) then minigun (rotary cannon); laser (beam projector) then gauss gun (coil gun); flamer (incinerator), then long range (longshot rifle), then time bomb (delay charge); access card (clearance key) then energy shield (deflector shield). Body parts have a research tab of their own: tier 1 is on sale from the start, tier 2 and then tier 3 of each part are researched at FreeSynd's fundings (legs and arms 4440 and 8880, chest 6000 and 12000, heart, eyes and brain 3480 and 6960). (Hiring an operative and buying mission intelligence have no value in FreeSynd's source and keep our small prices.)
- **Left click follows (F34):** a left click on a civilian or a persuaded follower sends the selected operatives after them: they stay about a tile away, set off again when the person moves, never fire, and stop when the person is down. The operator readout says "following <name>". Police, watchers and criminals are engaged by a left click as before; shooting is the right click. The crosshair is the pointer over every person (red in range, white out of range).
& old-school olive-drab or khaki fatigues, bareheaded, with webbing, pouches and a pack, carrying a rifle.
- **Deaths look like FreeSynd's:** a shot person recoils, falls and lies; a laser vaporizes (nothing left of an enemy, a scorch mark for ours); fire or a blast without a version 2 chest sets them running about burning for a second, then they collapse and smoulder for seven seconds before lying charred.
- **No run-overs by the city:** only vehicles driven by operatives knock people down (never civilians, guards, police or enemy agents at the wheel), and those they kill drop what they carried, as with a bullet (FreeSynd treats a collision like one); the city's own cars wait for people on
  foot to get out of the way.
- **No seat limit:** every operative can ride in the same vehicle, and clicking a vehicle sends the whole selection to it.
- **One weapon for the selection:** choosing a weapon with several operatives selected raises it for each of them, or the
  most similar weapon they carry.

## Art direction

The world is a **pressured, gritty one**: ordinary people (civilians, and so police and guards) wear worn, muted clothes in
grey, olive, brown and faded teal, with faint trim; bright neon belongs to the squad, enemy agents' tech and the interface, not
to bystanders. Women and men are drawn as adults (adult proportions, a small head, long legs). Intense music is for enemy
agents only: guards, police and criminals seeing the squad do not bring it in.

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
8. **FreeSynd's gameplay rules win.** Where a FreeSynd feature or rule (behaviours,
   weapon and item rules, research, persuasion, campaign and strategic rules,
   controls) conflicts with an existing OpenSynd feature or rule, FreeSynd's
   takes priority and the OpenSynd one is changed or removed, with the tests,
   saves and balance updated to match. This covers mechanics only: principles
   1-7 still apply, so values, names, art, audio and text stay our own.

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
- OpenSynd is the final name (the owner's decision). If the project ever grows beyond a hobby, search relevant trademark
  registers and the web, assess possible confusion with *Syndicate* and FreeSynd, and obtain legal review for the intended
  markets; until then the project does not claim the name is registered or cleared.
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
- **World map mission selection.** Choosing an operation happens on an original
  world map: each mission is a region on the map that the player clicks, replacing
  the plain list. Regions show their state (locked, open, completed), a hover or
  focus card gives the name, objective types and number of watchers, and the map is
  fully usable by keyboard and screen reader (regions are also listed as buttons).
  It is drawn procedurally with original geography, so it needs no map assets.
  Implemented: the operation screen is a flat atlas of the Earth (`web/src/atlas.js`: simplified
  original coastlines of the continents and main islands on an equirectangular projection, with
  graticule, equator and tropics, ocean and continent labels), filling the left of the screen with
  the brief, operations list, a collapsible "How to play" and the buttons on the right, so
  nothing scrolls. Each mission file says where it is with `region` (a place name, longitude and
  latitude): First Light is in Northern Europe, Quiet Hours in Eastern North America, Dead Drop
  in Southern Brazil. Regions show locked, available or completed, the route between them
  lights up as operations are done, a hover or focus card gives the details, and the regions are
  keyboard and screen-reader operable (the list stays as the accessible alternative).
- **Street life.** The city is populated with civilians (men and women, with
  cyberpunk street styling: women in dark clothes, black tights and skirts, men in
  neon-trimmed jackets, never trench coats, which belong to the squad) who walk the
  streets and flee gunfire, and with cyberpunk police who patrol and open fire on any
  operator they see with a weapon drawn. Killing a civilian costs funds (more for a
  police officer) and is recorded for achievements and the debrief.
  Implemented: both are in every operation (`bystanders` in the mission files, 18 per map),
  drawn from original sprite sheets rendered by `web/tools/render-sprites.mjs` (men with a
  neon-trimmed jacket, mohawk and cyber eye; women in dark glamour with a short skirt, glossy
  thigh-high heeled boots, a corset and a choker; police with visored helmets and light bars).
  Civilians walk the streets and run from gunfire within ten tiles for six seconds. Police
  patrol, ignore an operator whose weapon is away, and chase and shoot one who has a weapon
  out (selected or just fired) in line of sight, stopping when it is put away. A police hit does 6 damage, half a watcher's 12. Killing a
  civilian or a police officer costs no funds (as in FreeSynd) and is shown in the debrief.

Every weapon sounds like itself (`web/src/audio.js`, all synthesized from filtered noise and sweeps, so
no sound assets): a sharp pistol crack, a light snappy machine-pistol burst, a buzzing rotary-cannon
chatter, a deep rifle boom, a coil gun's rising whine then crack and thump, and a long-range rifle's
ringing crack with a fading echo. Equipment says which with its `sound` field. There are also a hit
thud, a bullet pinging off a shield, a shield rising, the Delay Charge's tick each second and its
rolling explosion, and the Persuader's hum. Fire is quieter the further it is from the view, rapid
fire is throttled per sound so a firefight does not drown the mix, and every sound has a caption.

Operatives fire only a weapon they have selected: with nothing selected they hold fire (right-click,
pursuit and the crosshair all say so), and once a selected weapon runs dry they carry on with the
next loaded one. At the start of the campaign only the pistol (Civic Pulse Emitter) is available;
everything else is researched in the lab first: the Machine Pistol (fast, light, 60 rounds), the
Rotary Cannon (a hail of light hits, 90 rounds), the Coil Gun (six slow rounds that each pass
through everything along their line), the Longshot Rifle (15 tiles of reach), the Delay Charge
(a time bomb: select it to plant it where you stand, six seconds later it blasts everyone within
3.2 tiles for up to 55, friend or not, which costs funds if bystanders die) and the Deflector Shield
(two uses of eight seconds in which every bullet aimed at the wearer is stopped; blasts still
hurt). Weapon names are original, not real product names, to keep the content legally clean.

**People and behaviours, mapped from FreeSynd.** The cast follows FreeSynd's ped types (Agent, Civilian,
Police, Guard, Criminal), with what FreeSynd calls "enemy agents" as our former watchers:

| Type | Side | Speed (FreeSynd base) | Behaviour |
|---|---|---|---|
| Field Operator (agent) | squad | 256 | the player's squad; persuading, regenerating chest mods are research items |
| Enemy Agent | enemy | 256 | "player hostile": spots the squad, waits 0.4 s, chases and shoots, goes back on patrol when it loses them |
| Guard | enemy | 192 | the same behaviour, slower (0.75x), weaker, reacts in 0.3 s; always armed, helmeted and armoured |
| Police | police | 160 | patrol until anyone draws a weapon, then alert; scout every 0.2 s for an armed non-police unit within 8 tiles; warn it for 0.8 s; follow and shoot until it puts its weapon away; wait 1.5 s; re-engage or return to patrol. Police shoot any armed non-police unit (enemy agents, criminals and persuaded followers with weapons out too) |
| Civilian | street | 128 | panic: every 0.5 s look for anyone with a weapon out within 6 tiles and run 2.6 tiles away at nearly double speed, look again, resume wandering when nobody armed is near; persuaded civilians never panic |
| Criminal | street | 128 | wanders armed (always drawn armed), ignores everyone until attacked, then goes after whoever attacked it |

Persuasion follows FreeSynd's persuaded behaviour: a persuaded unit follows its owner; when the owner draws a weapon
a follower with none looks for a fallen enemy's weapon within 3 tiles, takes it and arms; armed followers fire only
while the owner has a weapon out; when an operator goes down their followers and persuasion counts pass to another
living operator. The requirements are our own scale of FreeSynd's points: criminals and civilians need nothing, a
guard needs three persuaded civilians, police six, enemy agents four police (criminals count as civilians).
Differences from FreeSynd: shots are not randomised by accuracy (fixed damage instead), distances are scaled to our
tiles, and "weapon out" is a selected, loaded weapon for operators and an engaged enemy for the rest.

**Vehicles** (`web/src/vehicles.js`, mapped from FreeSynd's vehicle model: types, drivers and passengers, hit and
explode, ejected drivers, enter and drive). A vehicle is a unit with the role "vehicle", so it can be shot, caught in
a blast, drawn in depth order and saved like anyone else. Four kinds are in the pack: City Car, Patrol Car (flashing
light bar), Armored Car (300 health, big blast) and Ambulance (FreeSynd's fire engine, small armored car, medic
van and trains are not built yet). Cars drive their route along the road tiles (streets and bridges) at 5 to 7.5
tiles a second with an AI driver (a civilian, police officer, guard or criminal) riding inside; civilians in a car
do not panic. Shooting a car throws its driver out (a civilian runs from the car); when a car's health runs out it
drops everyone inside, explodes for up to 45 to 60 damage within 2.4 to 3.2 tiles (hurting friend and foe, and
setting off neighbouring cars), and burns as a wreck for 12 seconds. The squad can take any car: stand next to it
and press V (or "Take vehicle"); the first operator in drives, an AI driver is thrown out, other operators and
their persuaded followers near enough get in as passengers while there are seats. While inside, clicking a road
drives it there, enemies see and shoot at the car instead of the hidden operators, and V gets everyone out.
Two parked cars wait near each operation's start. Not saved: who is inside which car (a loaded game starts the
squad on foot).

The Persuader is a shop item (research 80, price 90, 30 charges, range 3.5 tiles). Click it in
an operator's inventory to switch it on (with several operators selected, it switches on for
every one who carries it); magenta waves roll out from an operator who has it on. Each second
or so it wins over the nearest person in range who it is allowed to persuade: any civilian;
a police officer only once that operator has persuaded six civilians; an enemy agent only once
they have persuaded four police (`persuadeCheck`, `advancePersuasion` in
`web/src/simulation.js`). The counts belong to the persuading operator and are saved (save
format 9). A persuaded person follows their persuader through the streets, shows a green ring
and link diamond, is no longer hostile or shot at, and, if armed (police, enemy agents), opens
fire on enemies of the squad by themselves. Persuaded civilians stop fleeing gunfire. Police
ignore a switched-on Persuader (it is not a weapon). The crosshair now shows over civilians and
police as well as watchers, and clicking them pursues like any target. Enemy agents are always
drawn armed (the weapon they carry, a pistol if none), and the floating health bars over units
are gone (health stays in the squad cards and threat list). Police are drawn in a peaked cap
with a badge, long covered sleeves with cuff stripes, armour and shoulder light strips.
- **Mission variety.** No two operations in a row may be won the same way, and
  restoring relays is only one kind of job. The objective types to build and mix
  across the campaign are: interact (restore a relay, download from a server,
  throw a switch), disable a named target (a warden or other key opponent),
  hold a position against pressure for a set time, reach a place, protect or
  escort someone, stay unspotted or finish with the whole squad intact as a
  bonus condition, and extract. Every new operation should use at least one
  objective type the previous one did not, on a different map layout, with its
  own look for its props (relay pylon, server rack, uplink beacon). The
  content-pack schema and validator must describe each objective type, and each
  needs unit tests, an e2e check and a balance-bot policy.
- **Research economy.** Money (funds) is earned for research in two ways:
  continuously during game time while an operation is being played, and from
  achievements earned inside the game (for example first disabling a watcher,
  restoring a relay, finishing with the whole squad intact, finishing
  unspotted, or finishing quickly). Between missions the player chooses how to
  spend it: cyborg heart research (Stamina: tires slower, recovers faster),
  cyborg brain research (Brain: mental strain builds slower, clears faster), and
  new weapons and items.
- **Inventory.** Each operative holds up to eight weapons or items. Loadouts are
  chosen between missions, persist across the campaign, and only contain
  researched or captured items.
- **Looting.** A disabled opponent drops its weapons and items. One of the
  player's operatives can walk to the body and loot it, within that operative's
  eight-slot limit. Items kept after a successful operation join the campaign
  and count as researched; a failed operation loses them.
- **Item effects.** New items change play rather than numbers alone: a heavier
  pulse emitter with more reach, a stimulant that restores stamina and focus, a
  cloak that shortens watchers' sight, and enemy-carried gear. Opponents that
  carry weapons use them.
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

