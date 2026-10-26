<!-- SPDX-License-Identifier: GPL-2.0-or-later -->

# OpenSynd Roadmap 2.0: more game

[ROADMAP.md](ROADMAP.md) got the game to FreeSynd's rules: every feature row in it is done. This roadmap is about what
makes it **better to play**. It is a wish list in a sensible order, not a promise, for a hobby project that is allowed to
change its mind.

## How to read it

- Every item says **what you will see**, **why it is fun**, **how big it is** (S a day, M a few days, L a week or more) and
  **how we will know it works**.
- **FreeSynd first.** Principle 8 still applies: where FreeSynd's source defines a rule or value, FreeSynd wins. Items marked
  *check FreeSynd* must read its source before any design is final. Items marked *new* are in areas FreeSynd leaves open.
- The art direction stays: a pressured, gritty city with muted clothes and adult proportions; intense music only when an
  enemy agent has seen the squad.
- Nothing here needs a server, an account or a paid service. Everything is playable offline in the browser, and every change
  ships as a hot update that does not disturb open games.

## What the game is like now (so the list below starts from the truth)

50 operations on a world map of 50 territories; four operatives with eight item slots, body parts, three drugs and research
at FreeSynd's prices; FreeSynd's weapons and the persuader; police that warn before they shoot; cars, an elevated train, doors,
windows, fire; queued orders; an operation that resumes after a reload; a mission editor with map painting. What it lacks is
**variety inside an operation** (most are "walk here, press E, leave"), **enemies that think**, and **reasons to replay**.

---

## Theme A. Enemies that think

The best fights come from opponents who respond. Today enemies see you, chase and shoot; that is all.

**A1. Alert levels (M, *check FreeSynd*).** Enemies and police move through *calm, suspicious, alerted, hunting*. A broken
window, a gunshot, a dead body found, a persuaded follower seen: each raises it for those who notice. You see it as a small
icon over their head (the "?" and "!" already exist) and a changed patrol. *Test:* a seeded scenario where a shot raises
guards within hearing range and not those behind a wall.

**A2. Enemies use the map (M, new).** They take doorways, go round a closed door, flank when the squad is pinned, and back
off to a wounded ally. No cheating: they see what they see. *Test:* an enemy with a blocked direct route chooses the other
way; two enemies do not stand on the same tile.

**A3. Enemy agents fight like agents (M, *check FreeSynd*).** They use their drugs and medikits when hurt, throw their time
bombs sooner when they have the advantage, and pick up gear from their fallen. *Test:* a wounded enemy agent with a medikit
uses it before running out of health.

**A4. Reinforcements by road and rail (L, new).** Some operations bring more enemies in a car or off the train. You hear the
train horn first. A good player can shut it down (hold the station, shoot the driver) or use it. *Test:* a scripted car arrives
at a set time, the passengers get out and take up their routes.

**A5. Police that escalate (M, new).** Kill a bystander in the open and a patrol car arrives with more officers; keep doing it
and a heavier unit follows. Persuaded police stay yours. *Test:* the number of officers on the map grows after each witnessed
killing and stops when nobody saw it.

## Theme B. Operations with more to them

Fifty operations should not all play the same. The objective types exist; most missions only use three of them.

**B1. Objective variety pass (M).** Purges (clear every enemy agent) and defections (persuade someone and bring them out) are already in, nine operations each. Re-cut the rest of the generated operations so each of the five shapes has real variants:
*escort* a persuaded VIP to the exit; *assassinate* a target who moves between safe houses; *steal* a vehicle and drive it out;
*sabotage* three transformers in a set order; *defend* a position through three waves; *hostage* where a careless shot costs the
operation. The generator already knows the objective types. *Test:* each variant is winnable by the balance bot at the two
easier policies, and a script checks that every operation uses at least two kinds of objective.

**B2. Optional objectives and rewards (S).** A side goal per operation (a rival's gear crate, a captured agent, "no civilians
hurt") that pays in FreeSynd's currency (money, a research boost, a recruit) when done. *Test:* completing it changes the
debrief and the funds exactly once.

**B3. Timed events (S).** A power cut at minute three that closes doors; a convoy that leaves at minute five. Shown on a small
clock in the objective list. *Test:* an event fires at its time and only once, and survives a save and resume.

**B4. Infiltrate by train (M, new).** Some operations start on the train and drop you at a platform in the middle of the city;
others let you leave by train as the exit. Uses the boarding already built. *Test:* a mission starting with the squad aboard
puts them off at the first station.

**B5. A short tutorial operation (M).** Operation 0: five minutes that teach selecting, walking, shooting, looting, queuing,
the persuader and a car, with the status line doing the talking and nothing to read in advance. Skippable. *Test:* a bot that
follows the prompts finishes it.

**B6. Hand-made centrepieces (L, ongoing).** Replace one generated operation in five with a hand-built one with its own map
dressing and a memorable set piece: a train hijack, a rooftop uplink, a car-park shootout. The mission editor and map painter
are the tools. *Test:* validated by the editor's checks and the balance bot.

## Theme C. The squad as characters

**C1. Operatives with names and a little history (S, new).** Each agent has a callsign, a short line of background, and a
service record (operations, kills, times down). It shows on their card and in the debrief. *Test:* the record survives resume and
a new game wipes it.

**C2. Stances and orders (M, new).** *Hold fire*, *fire at will*, *stay close*, *scout ahead*. One click per operative or for the
squad. Today operatives choose targets themselves; this puts you in charge. *Test:* a "hold fire" operative with an enemy in
range does not shoot, a "fire at will" one does.

**C3. Wounds that matter (M, *check FreeSynd*).** An operative who is "down" is not always dead: a medikit or a healer can bring
them back within a short time. The permadeath option stays. *Test:* a downed operative revived inside the window gets up with a
fraction of health; after the window they are lost.

**C4. Formation presets (S).** Line, column, wedge, with the leader's facing. FreeSynd's two-by-two stays the default. *Test:*
each preset gives distinct, walkable tiles around the destination.

**C5. Recruits with strengths (M, new).** Captured enemy agents keep a trait or two from their old life ("steady aim", "fast on
foot") that shows when they join. A reason to persuade the right agent. *Test:* the trait changes the stat it names and nothing
else.

## Theme D. The city lives

The streets are the stage; make them react.

**D1. Crowds with minds (M).** Civilians flee in the direction away from danger, hide in doorways, stop to watch, and drift back
when it is quiet. Panic spreads along the street, not through walls. *Test:* panic travels at a set speed along open ground
and is stopped by a closed door.

**D2. Day, night and weather (M, new).** The same map at dusk or in rain: lit windows, reflections, narrower sight at night
(awareness shrinks), fewer civilians out late. An operation has a time of day. *Test:* sight range at night is shorter by the
stated factor; the renderer draws without errors in each weather.

**D3. Traffic that responds (M).** Cars stop for a gunfight, swerve round a body, and honk. A car chase: a stolen car pursued by
police cars that box you in. *Test:* a pursued vehicle is followed and the pursuers give up after a set time.

**D4. Roadblocks and barriers (S).** Police close a street with cars and tape; a road-closed marker shows on the minimap.
*Test:* cars route round it, the squad can walk through the tape, officers there react to drawn weapons.

**D5. News and notoriety (M, new).** Heavy-handed operations raise a city-wide *notoriety* that makes police arrive sooner next
time and territories grumble; quiet ones lower it. The hook that makes how you play matter beyond the debrief. *Test:*
notoriety changes by the stated amounts for kills, witnessed shootings and clean exits, and shows on the world map.

## Theme E. The campaign has a shape

Fifty operations in an order you choose are good; a story and a rival give it pull.

**E1. A rival syndicate that fights back (L, new).** The territories you hold can be attacked. A held district can be lost if you
neglect it (low mood, no defence), and winning it back is an operation. The existing revolt rule is the seed. *Test:* a seeded
campaign loses a territory on the stated trigger and offers the recapture operation.

**E2. Research with consequences (M, *check FreeSynd*).** Finished research can be *stolen* or *leaked*: enemies you meet start
to carry what you have unlocked (this already exists in part). Add the reverse: capturing their gear speeds up the matching
research. *Test:* the speed-up is the stated fraction and applies once per item.

**E3. A world with events (S).** Between operations a short news line: a strike in one territory, a rival's new weapon, tax
trouble. Some give a choice. *Test:* events are seeded, saved, and never repeat within a campaign.

**E4. An ending worth reaching (S).** Today there is a summary screen. Add a short sequence tied to how you played (the notoriety,
how many operatives survived) and a "play again with what you learnt" option. *Test:* the ending text depends on the stored
campaign facts and nothing else.

## Theme F. Feel

Small things that make shooting, driving and moving satisfying.

**F1. Hit feedback (S).** Per-weapon muzzle flashes and shell casings, impact sparks on walls, screen shake scaled by the
explosion, a short "hit stop" on a kill. Switchable and off with reduced motion. *Test:* each effect is drawn for its weapon;
reduced motion draws none of the shaking.

**F2. Directional audio (S).** Louder when close, panned left or right by where it happens. *Test:* the gain falls with distance
and the pan has the right sign.

**F3. A better minimap and map marks (M).** Zoom, ping a spot for the squad, mark a door or a target, and a clearer legend.
*Test:* a mark is drawn on both the map and the minimap and is saved.

**F4. Controller and touch (L).** The game is mouse and keyboard; add gamepad and a touch scheme (tap to move, two-finger pan,
a radial menu for items) so it works on a tablet. *Test:* every action is reachable without a mouse in a browser test.

**F5. Photo mode and replay (M).** Pause, move the camera freely, take a clean screenshot; a short replay of the last twenty
seconds after a mission ends. *Test:* a replay re-simulates from the stored seed and positions.

## Theme G. Making and sharing

**G1. Load your own missions (M).** Drop a mission or map file into the game (or a pack folder) and play it without
rebuilding. The editor's output goes straight in. This is the one gap left from the first roadmap. *Test:* a downloaded mission
loads, validates and plays; a broken one is refused with a sentence saying why.

**G2. Campaign packs (M).** A pack with its own map of territories and missions, switchable from the title screen, with its
own progress. *Test:* two packs keep separate campaigns.

**G3. A shared mission list (S, optional).** A plain text file of links to mission files that a person can host anywhere; the
game lists them. No account, no server of ours. *Test:* a list loads, entries show their title and author, nothing is fetched
until you choose to.

---

## A sensible order

1. **Quick wins that change the feel:** C2 stances, F1 hit feedback, F2 directional audio, B2 side objectives, B3 timed events, B5 the tutorial.
2. **Make fights smarter:** A1 alert levels, A2 tactics, A3 agents that use their kit, then A5 police escalation.
3. **Make operations varied:** B1 variants, B4 the train as a way in or out, A4 reinforcements, B6 a first few hand-made centrepieces.
4. **Make the city and campaign matter:** D1 crowds, D5 notoriety, E1 a rival, E3 events, E4 the ending.
5. **Reach more people:** G1 loading missions, then F4 touch and gamepad, G2 packs.
6. **Weather and polish when everything else sits well:** D2 day and night, D3 car chases, F3 map marks, F5 photo mode.

## How each item gets done

Same habits as before: read FreeSynd's source for the rule first; write the rule as pure code with tests that fail without it; add a
browser test that plays it; update this file and the README in plain words; commit and push; and let the hot update carry it to
anyone playing. The balance bot is run after anything that changes enemies, so no operation becomes unwinnable. Anything that
adds a sprite or a sound goes through the provenance register like the rest.

## What is deliberately not here

Accounts, a store, real-money anything, and any art, sound, text or map from the original game. This is
a fan game that runs from a folder of files. Multiplayer (a server is welcome) is planned separately in [ROADMAP_MULTIPLAYER.md](ROADMAP_MULTIPLAYER.md).
