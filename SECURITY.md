<!-- SPDX-License-Identifier: GPL-2.0-or-later -->

# Security policy

OpenSynd is a hobby project. Today it is a static website that runs in your browser, with no accounts, no server code and no
database, so there is little to attack. A game server with accounts is planned ([the multiplayer design](docs/design/MULTIPLAYER.md));
when it exists it is in scope here too, and this policy will be extended to cover it. Reports are welcome.

## What counts

- A way to run script in someone else's browser through the game (for example through a crafted save file, mission file or
  imported content pack).
- A way for the game to send your data anywhere. It must never do that: see [PRIVACY.md](PRIVACY.md).
- A way to read or change another person's saved data in the browser.
- A mistake in the deployment files in `deploy/` that exposes the server.

## How to report

Please do not open a public issue for something that could harm players before it is fixed. Use the project's private
vulnerability reporting on the code host (GitLab: Security, then "New confidential issue"), or write to the project owner at
the contact listed in `AUTHORS`.

You can expect an acknowledgement within a week and a fix or a decision within a month. This is a volunteer project, so those
are targets, not promises. Reporters are thanked in the release notes unless they ask not to be.

## What we do about it

1. Reproduce the report and decide how serious it is.
2. Fix it on a private branch if it could harm players, and add a test that fails without the fix.
3. Publish the fix as a new release (see [docs/RELEASING.md](docs/RELEASING.md)) and say what was fixed.
4. Older releases stay available at their own web addresses, so a fix is announced; broken releases are not left to run silently.
   Games that are open pick up the fix at a quiet moment (see `deploy/README.md`, "Hot updates").

## Built-in protections

- The page sets a strict content security policy (no code from other sites, no inline script).
- Save files and content packs are validated before use, and are never executed.
- The build has no runtime dependencies at all, which keeps the supply chain short.
