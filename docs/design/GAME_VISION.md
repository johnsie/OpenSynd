<!-- SPDX-License-Identifier: GPL-2.0-or-later -->

# OpenSynd Game Vision

## Premise

OpenSynd is a real-time, pause-capable squad tactics game set in a dense
near-future city whose essential services have been enclosed by competing
private administrations. The player coordinates a small field team for the
Open Assembly, a public-interest network trying to return communications,
transport, medicine, energy, and local decision-making to the districts that
depend on them.

The setting and names in this document are original working material. They are
not intended to reproduce the world, factions, characters, missions, maps, or
presentation of *Syndicate*.

## Player objective

The campaign objective is to make the city governable by its inhabitants
again. The player must reconnect isolated districts, expose the systems used to
control them, and help local groups take durable control of infrastructure.

Progress is measured along three strategic axes:

- **Access:** which services, routes, safe houses, and information networks are
  available to residents and the player's team.
- **Trust:** whether district communities believe the Open Assembly is acting
  with them rather than replacing one remote authority with another.
- **Pressure:** how aggressively hostile administrations monitor and respond to
  the team.

A campaign is won by establishing a stable federation of autonomous districts,
publishing sufficient evidence to break the central administration's mandate,
and completing a final operation chosen by the alliances the player formed.
Territory alone is not victory. A district held through fear, destroyed
infrastructure, or abandoned civilians is a strategic failure even if its
mission target was reached.

## Mission objectives

Missions combine one required objective with optional civic outcomes. Supported
objective families should include:

- enter, observe, and leave a secured area without escalating;
- restore or reroute infrastructure;
- retrieve and authenticate evidence;
- escort, rescue, or protect people;
- interrupt surveillance or automated enforcement;
- negotiate access through a local intermediary;
- disable a dangerous system, lethally or non-lethally where appropriate;
- hold an area while a public service comes online; and
- extract the team after conditions in the district have changed.

Optional outcomes affect later missions. Avoiding civilian harm, keeping public
services intact, or exposing a hidden system can matter more than defeating
every opponent. Combat is sometimes necessary, but eliminating all enemies is
not the default objective.

Force is a tactical cost, not the strategic objective. The first vertical
slice uses explicitly non-random disabling pulses against watcher drones so the
player can protect a restoration route without turning elimination into the
win condition. Later equipment may create stronger trade-offs between speed,
infrastructure damage, public trust, and operator safety.

## Core play loop

1. **Read the district.** Review local needs, power relationships, risks, and
   incomplete intelligence.
2. **Choose an approach.** Select up to four operators, equipment, access
   routes, and a public commitment such as preserving a clinic or keeping a
   transit line running.
3. **Operate in real time.** Move as a group or split the team, pause to issue
   coordinated orders, use cover and infrastructure, and adapt when civilians
   and opposing units react.
4. **Extract and account.** Leave safely, then review not only mission success
   but casualties, disruption, evidence, trust, and promises kept.
5. **Invest in the commons.** Spend recovered capacity on equipment, research,
   safe routes, medical support, and district projects.
6. **Live with consequences.** District behaviour, available allies, patrols,
   prices, and future objectives change in response.

## Tactical principles

- Four operators should feel complementary without imposing fixed character
  classes. Equipment and training determine roles.
- Orders must be readable and reversible. Pausing and queued actions make
  coordination more important than rapid clicking.
- Civilian movement and public infrastructure are part of the simulation, not
  decorative obstacles.
- Detection, negotiation, rerouting, and withdrawal are first-class actions.
- Destruction changes the map and strategic layer; it is never free spectacle.
- Information should be uncertain but explainable. The game may hide facts,
  but it must not hide its rules.

## Campaign shape

The intended first campaign contains six to eight districts and approximately
twelve authored missions, with procedural variations limited to patrols,
incidents, and optional opportunities. Each district introduces a civic system
and a tactical complication. Choices create a small number of meaningful
branches rather than a combinatorial narrative that cannot be maintained.

The initial vertical slice represents one district, one operation, two
operator configurations, one opposing unit type, and three possible outcomes:
quiet restoration, contested restoration, or withdrawal.

## Intended look and feel

### Visual identity

OpenSynd should look like a living municipal diagram under stress: precise,
layered, luminous, and human rather than grim for its own sake.

- Use a three-quarter isometric camera with clean geometric architecture and
  strong silhouettes. Do not copy legacy tile dimensions, sprite proportions,
  animations, palettes, or interface layouts.
- Render environments as restrained charcoal and mineral surfaces interrupted
  by functional colour: cyan for public networks, amber for unstable systems,
  coral for immediate danger, and soft green for restored services.
- Give every faction a silhouette language before assigning colour. Shapes,
  markings, motion, and audio must remain understandable without colour vision.
- Prefer crisp vector-like forms, selective texture, pools of light, rain and
  haze used sparingly, and readable animation over nostalgic pixel imitation.
- Show the effect of decisions in the environment: lights return, transit
  resumes, barriers move, public messages change, and people reclaim spaces.

The first developer pack uses only flat colours and procedural geometric
tokens. This is an intentional art direction prototype, not placeholder legacy
art.

### Interface

The interface resembles an open civic operations console assembled from public
infrastructure feeds. It should feel capable but imperfect: modular panels,
clear typography, map annotations, signal traces, and visible uncertainty.

- Keep the playfield dominant and avoid ornamental chrome.
- Present objectives as commitments and observable conditions, not unexplained
  checkboxes.
- Use a compact timeline for queued squad actions.
- Make pause state, selection, target validity, and expected consequences
  unmistakable.
- Support scalable text, remappable input, reduced motion, captions, contrast
  themes, and redundant non-colour indicators from the first playable build.

The initial touch experiment mirrors the grid cursor, movement order, and
contextual interaction commands with large on-screen controls. It is a baseline
for device testing, not a substitute for later control remapping and gesture
research.

### Motion and effects

Movement should have weight without sluggishness. Operators communicate intent
through facing, posture, and concise anticipation frames. Effects should reveal
game state: interference breaks clean signal lines; restored systems settle
into stable rhythms; dangerous areas pulse rather than relying on tiny labels.

Camera shake, flashes, particles, and screen distortion must be adjustable or
disableable.

### Sound and music

The soundscape combines public machinery, distant human activity, radio
fragments, and restrained electronic music. Restored districts should sound
more inhabited, not merely more triumphant. Music reacts to detection,
coordination, and civic risk rather than treating continuous combat as the
default state.

All spoken information must have captions. Critical cues need visual
equivalents, and the player must be able to control dialogue, ambience, effects,
and music independently.

## Tone

The world is pressured but not hopeless. Institutions can fail, technology can
be abused, and violence has lasting costs, yet collective action produces
visible improvements. Writing should avoid parody, nihilism, and the assumption
that every resident is either an enemy or a resource.

## Boundaries

OpenSynd is not a recreation of *Syndicate* with renamed assets. The following
must be original: geography, missions, faction identities, characters,
equipment catalogue, narrative, audiovisual presentation, interface, and
content data. Similarity reviews should consider the total impression, not only
whether individual files were copied.

