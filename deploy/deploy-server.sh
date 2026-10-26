#!/bin/sh
# SPDX-License-Identifier: GPL-2.0-or-later
#
# Copy what the game server needs (its code, the game's rules and the content) to /opt/opensynd/app and restart it. Run by the
# GitLab deploy job after deploy/setup-server.sh has been run once. The server's content must match the deployed site's, so both are
# deployed from the same commit.
set -eu
APP=${APP:-/opt/opensynd/app}
mkdir -p "$APP/web"
rm -rf "$APP/web.new"
mkdir -p "$APP/web.new"
cp -a web/server web/src web/content "$APP/web.new"/
rm -rf "$APP/web.old"
[ -d "$APP/web" ] && mv "$APP/web" "$APP/web.old"
mv "$APP/web.new" "$APP/web"
rm -rf "$APP/web.old"
sudo systemctl restart opensynd-server
echo "game server deployed"
