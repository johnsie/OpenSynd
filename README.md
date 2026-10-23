<!-- SPDX-License-Identifier: GPL-2.0-or-later -->

# OpenSynd (working name)

**A small squad-tactics game that runs in your web browser.** You lead four cybernetic operatives through the streets of
a dark, pressured, near-future world, taking one district at a time from the people who run it.

> **Please note:** this is a **hobby project made for my own personal use**. It is not a product, it is not finished,
> and it is not meant to be taken too seriously. Things will be rough, odd or broken, and I change my mind a lot. You are
> welcome to look around, but there is no support, no promise of updates and no guarantee that it works for you.

## What it is

You play a small field team in a city where the essential services (power, communications, transport) have been taken
over by private bosses. Each mission drops your four operatives into a district. You reconnect a relay, download some
records, take down a warden, hold a position or just get out alive, while enemy agents, guards and police patrol around
you and ordinary people go about their day.

The game is real-time but you can pause at any moment to think. You give orders with the mouse: walk here, shoot that,
pick that up, get in that car.

## What you can do

- **Fight your way through 50 districts.** The world map has 50 territories, each with its own mission. Winning one opens
  the ones next to it. Take them all and the campaign is over.
- **Command four operatives at once.** Select one, a few or everybody and give them orders together. Queue up a route,
  a pick-up and a ride in a van in one go.
- **Use a big toolbox.** Pistols, machine pistols, scatter guns, flamethrowers, beam weapons, scanners, shields,
  time bombs, and a device that persuades bystanders and even enemy agents to follow you.
- **Build your operatives up.** Fit cybernetic body parts (legs, arms, chest, heart, eyes, brain) and dose them with three
  drugs that make them faster, steadier or quicker to reload.
- **Run a little empire between missions.** Held territories pay tax, but squeeze them too hard and they revolt. Spend
  the money on research, new gear, hiring replacements, and intelligence about the next job.
- **Lose people for good.** Fallen operatives stay dead (you can switch that off). Enemy agents you persuade and get out
  alive can join your roster.
- **Steal from the fallen.** Anyone who is shot down drops what they were carrying, scattered on the ground for you to
  pick up. Take a weapon from the police and use it yourself.
- **Drive.** Take a car, drive it across the city, run people over (the city's own cars never do), or shoot a driver out
  of theirs.
- **Make your own missions and maps.** There is a mission editor in the browser: place people, set objectives and routes, and
  paint your own map from ground, streets, buildings and bridges.
- **Pick up where you left off.** The operation you are playing is saved as you go and offered again when you come back, even
  after a game update. The interface comes in English, Spanish and French.
- **Ride the train.** Cities have an elevated railway with a train you can board at a platform.

## For people who want to host or release it

See [docs/SELF_HOSTING.md](docs/SELF_HOSTING.md) and [docs/RELEASING.md](docs/RELEASING.md); how it is run is in
[GOVERNANCE.md](GOVERNANCE.md), security reports in [SECURITY.md](SECURITY.md) and what it does with your data in
[PRIVACY.md](PRIVACY.md).

## How to try it

You need a computer with a recent web browser and Node.js installed.

1. Open a terminal in the `web` folder and run `npm run build`.
2. Serve the `web/dist` folder with any simple web server (for example `python3 -m http.server -d dist 8080`).
3. Open `http://localhost:8080` in your browser.

The full list of controls, and anything more technical, is in **[web/TECHNICAL.md](web/TECHNICAL.md)**.

A few basics to get going: click one of your operatives to select them, click the ground to walk, click one of their
weapons to ready it, then **right-click** to fire. **Space** pauses. **A** selects everybody.

## Credits, and what comes from FreeSynd

**This game would not exist without [FreeSynd](http://freesynd.sourceforge.net/)** and the people who built it. FreeSynd is
a free, open-source re-creation of the engine of the classic game *Syndicate*, and this project began as a copy (a fork)
of its repository. Thank you to **the FreeSynd team**: Benoit Blancard, Stuart Binge, Anders Eurenius, Tarjei Knapstad,
Davor Ocelic, Joey Parrish, Joost Peters, Bruce Sutherland, Unavowed, Trent Waddington and Bohdan Stelmak, and to its
contributors, including Tomas Jakobsson, Mark (mentor66), Michael Schubeck, Ryan Cocks (who started the drug system),
Roland Haeder and Luboš Novák. The full list is in the [AUTHORS](AUTHORS) file. FreeSynd also builds on work by Tomasz
Lis (level files), Paul Chavent ("libsyndicate"), Richard J. Wagner (the config reader) and Nemanja Trifunovic (UTF8-CPP).

**To be clear: this is not FreeSynd, it is not "OpenSynd" as any official project, and the FreeSynd team has nothing to do
with it and has not seen or approved any of it.** "OpenSynd" is only my own working name for this personal browser game,
and any mistakes in it are mine, not theirs.

What I took from FreeSynd:

- **The repository itself.** The original C++ engine, its documentation and its licence (the GNU GPL) are still here
  under their original names. The browser game does not use that engine; I keep it for reference.
- **The rules of the game.** FreeSynd's source code is where I learned *how the game works*, and I rebuilt those rules
  from scratch in a web browser: how persuading people works (points, and how the brain upgrade lowers the cost), the six
  cybernetic body parts and what each does, the three drugs and how they build up and wear off, how accurate a shot is,
  how much weight an operative can carry, paying to refill ammunition, research that takes time and money, the map of
  territories with tax, mood and revolt, scripted bystanders, the behaviour of police, guards and traffic, dropped weapons,
  the chest that heals, vehicles with no seat limit, and a campaign of 50 territories. Where my first idea and FreeSynd's
  rule disagreed, I changed mine to match FreeSynd.
- **A way of working.** Reading how a game like this fits together, and the habit of keeping everything that matters in
  plain, open files, comes straight from that project.

What I did **not** take: none of the original game's graphics, sounds, music, maps, missions, writing, names or data
files. All of that here is made again (the source of every picture and sound is listed in [PROVENANCE.md](PROVENANCE.md) and [provenance/assets.json](provenance/assets.json)), and the numbers are my own or re-used under the terms of the GPL.

Other things I'm grateful for: the human model that all the characters are drawn from is by **Quaternius** (CC0), and
the music is **"Electric Stream"** by Alexander Ehlers (CC0) and **"The Core"** by p0ss. Everything else I made myself.

This is also an unofficial tribute to *Syndicate* by Bullfrog Productions. It is not affiliated with or endorsed by the
makers or owners of that game.

## Finding your way around the repository

- [web/TECHNICAL.md](web/TECHNICAL.md): how to build, test and change the game, and how the pieces fit together.
- [deploy/README.md](deploy/README.md): how the game is published to my web server by a GitLab pipeline.
- [ROADMAP.md](ROADMAP.md): the long plan, feature by feature, and how far each one has got.
- [docs/design/CAMPAIGN.md](docs/design/CAMPAIGN.md): all 50 territories and missions at a glance, with their difficulty.
- [docs/design/GAME_VISION.md](docs/design/GAME_VISION.md): what the game is trying to be.
- [PROVENANCE.md](PROVENANCE.md): where every picture, sound and model came from, with its licence, in plain words; the exact
  machine-checked record is [provenance/assets.json](provenance/assets.json).
- [ASSET_POLICY.md](ASSET_POLICY.md) and [TRADEMARKS.md](TRADEMARKS.md): the rules for art and names.
- The older file called `README` is the original FreeSynd engine's, kept for reference.

## Licence

The code is free software under the GNU General Public License (version 2 or later). The game content is dedicated to
the public domain (CC0). See [COPYING](COPYING) and the `LICENSES` folder.
