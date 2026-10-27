#!/bin/sh
# SPDX-License-Identifier: GPL-2.0-or-later
#
# Copy what the game server needs (its code, the game's rules and the content) to /opt/opensynd/app, restart it and verify its
# content fingerprint. Run by every GitLab deploy after deploy/setup-server.sh has been run once. The public site is switched only
# after this succeeds, so a client and server from different commits are never deliberately published together.
set -eu
APP=${APP:-/opt/opensynd/app}
HASH_FILE=${1:-web/dist/content/hash.json}
SYSTEMCTL=$(command -v systemctl)
[ -f "$HASH_FILE" ] || { echo "$HASH_FILE does not exist: build the website before deploying the server" >&2; exit 1; }
EXPECTED=$(node -e 'const fs = require("node:fs"); process.stdout.write(JSON.parse(fs.readFileSync(process.argv[1])).hash)' "$HASH_FILE")
if ! sudo -n -l "$SYSTEMCTL" restart opensynd-server >/dev/null 2>&1; then
  echo "gitlab-runner cannot restart opensynd-server: run sudo RUNNER_USER=gitlab-runner sh deploy/setup-server.sh once" >&2
  exit 1
fi
if ! mkdir -p "$APP/web"; then
  echo "cannot write $APP: run sudo RUNNER_USER=gitlab-runner sh deploy/setup-server.sh on the host once" >&2
  exit 1
fi
rm -rf "$APP/web.new"
mkdir -p "$APP/web.new"
cp -a web/server web/src web/content "$APP/web.new"/
ACTUAL=$(cd "$APP/web.new" && node --input-type=module -e 'import { contentHash } from "./server/content-hash.js"; process.stdout.write(contentHash("./content"));')
[ "$ACTUAL" = "$EXPECTED" ] || { echo "server content $ACTUAL does not match website content $EXPECTED" >&2; exit 1; }
rm -rf "$APP/web.old"
[ -d "$APP/web" ] && mv "$APP/web" "$APP/web.old"
mv "$APP/web.new" "$APP/web"
if sudo -n "$SYSTEMCTL" restart opensynd-server && node deploy/check-server.mjs "$EXPECTED"; then
  rm -rf "$APP/web.old"
  echo "game server deployed with content $EXPECTED"
  exit 0
fi

echo "new game server failed its health check; restoring the previous copy" >&2
rm -rf "$APP/web.failed"
mv "$APP/web" "$APP/web.failed"
if [ -d "$APP/web.old" ]; then
  mv "$APP/web.old" "$APP/web"
  sudo -n "$SYSTEMCTL" restart opensynd-server || true
fi
exit 1
