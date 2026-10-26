<!-- SPDX-License-Identifier: GPL-2.0-or-later -->

# Privacy

OpenSynd collects nothing **today**. This describes the game as it is now: single-player, nothing sent anywhere.

The planned online modes ([ROADMAP_MULTIPLAYER.md](ROADMAP_MULTIPLAYER.md)) will need a game server with accounts, and this
page will be updated before any of them ships to say exactly what the server keeps (a display name, a password hash, scores and
replays, and nothing more), how to delete your account, and that single-player never needs it.

- **No accounts, no telemetry, no analytics, no advertising and no third-party scripts, fonts or images.** The page makes
  requests only to the site it came from, and a browser test checks that.
- **Everything you do is kept in your own browser** (local storage): your campaign, settings, saves and the operation in
  progress. It never leaves your computer unless you export a save file yourself.
- **Clearing your browser's site data erases it.** "New game" in the game erases the campaign too.
- **Server logs:** whoever hosts a copy of the game sees the usual web server request log (address, time and file asked for).
  The project's own site keeps no more than the web server's default logs.
- **Speech:** the optional spoken lines use your browser's built-in speech. Depending on the browser this may use an online voice
  service of its own; switch "Spoken cues" off in the settings if you do not want that.

If this ever changes (for example an optional, off-by-default crash report), it will be documented here first, need your
consent and be removable on its own.
