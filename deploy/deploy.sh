#!/bin/sh
# SPDX-License-Identifier: GPL-2.0-or-later
#
# Publish a built copy of the game: copy web/dist into a new release folder next to the others and switch the
# "current" link to it in one step, so visitors never see a half-copied site. Run by the GitLab CI deploy job on the web
# server's runner. Usage: deploy/deploy.sh <built-folder> <release-name>
set -eu

SOURCE=${1:?usage: deploy.sh <built-folder> <release-name>}
RELEASE=${2:?usage: deploy.sh <built-folder> <release-name>}
DOCROOT=${DOCROOT:-/var/www/neuroreign.outiva.com}
KEEP=${KEEP:-12}

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

# Keep the newest CI releases. Manual installs use descriptive release names and may be owned by a different account, so leave
# those alone instead of letting retention cleanup turn an otherwise successful deployment into a failed job.
cd "$DOCROOT/releases"
kept=0
ls -1t | while read -r old; do
  [ -d "./$old" ] || continue
  case "$old" in
    [0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]) ;;
    *) continue ;;
  esac
  kept=$((kept + 1))
  if [ "$kept" -gt "$KEEP" ] && ! rm -rf "./$old"; then
    echo "warning: could not remove old CI release $old" >&2
  fi
done
