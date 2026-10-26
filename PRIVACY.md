<!-- SPDX-License-Identifier: GPL-2.0-or-later -->

# Privacy

Single-player collects nothing: nothing is sent anywhere and no account is needed. The online modes (daily operation, co-op,
rival companies) talk to a game server, and only if you sign in to one.

**What a game server keeps about you, and nothing more:**

- if you sign in with Outiva: the identifier Outiva gives your account (not your email or password) and a display name made from your
  username; if you use a password here instead: your display name and a salted scrypt hash of your password (never the password itself);
- your funds, the territories you hold and the raids you took part in;
- your scores, the daily chores you completed, and the recorded replays of your daily and raid operations;
- who your friends are, and any report you made or that was made about you (with the reason given);
- while you play: the operation you are in and your connection. Things you say in a lobby are passed on and not stored.

It keeps no email address, no real name and no tracking. **To delete your account** use the account deletion request
(`DELETE /api/account`, with your password); it removes your account, sessions, friends, territories and scores. Muting someone is
kept only in your own browser. Whoever runs a server can see all of the above for that server, so only sign in to servers you
trust; you can run your own ([docs/SELF_HOSTING.md](docs/SELF_HOSTING.md)).

- **No telemetry, no analytics, no advertising and no third-party scripts, fonts or images.** The page makes
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
