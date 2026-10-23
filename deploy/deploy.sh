#!/bin/sh
# SPDX-License-Identifier: GPL-2.0-or-later
#
# Publish a built copy of the game: copy web/dist into a new release folder next to the others and switch the
# "current" link to it in one step, so visitors never see a half-copied site. Run by the GitLab CI deploy job on the web
# server's runner. Usage: deploy/deploy.sh <built-folder> <release-name>
set -eu

SOURCE=${1:?usage: deploy.sh <built-folder> <release-name>}
RELEASE=${2:?usage: deploy.sh <built-folder> <release-name>}
DOCROOT=${DOCROOT:-/var/www/opensynd.outiva.com}
KEEP=${KEEP:-4}

[ -f "$SOURCE/index.html" ] || { echo "no index.html in $SOURCE: was the game built?" >&2; exit 1; }
[ -d "$DOCROOT" ] || { echo "$DOCROOT does not exist: run deploy/setup-apache.sh on the server first" >&2; exit 1; }

TARGET="$DOCROOT/releases/$RELEASE"
rm -rf "$TARGET"
mkdir -p "$TARGET"
cp -a "$SOURCE"/. "$TARGET"/
chmod -R a+rX "$TARGET"

# Switch the link atomically (a new link, then a rename over the old one).
ln -sfn "$TARGET" "$DOCROOT/current.new"
mv -T "$DOCROOT/current.new" "$DOCROOT/current"
echo "deployed $RELEASE to $DOCROOT/current"

# Keep only the newest few releases.
cd "$DOCROOT/releases"
ls -1t | tail -n +"$((KEEP + 1))" | while read -r old; do
  [ "$old" = "$RELEASE" ] || rm -rf "./$old"
done
