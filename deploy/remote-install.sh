#!/bin/sh
# SPDX-License-Identifier: GPL-2.0-or-later
#
# The part of deploy/install-on-host.sh that runs on the web server, as root, from the uploaded folder: Apache for the site, the site
# itself, the game server, and (if you give a Keycloak administrator) the Outiva client. Safe to run again.
set -eu
HERE=$(cd "$(dirname "$0")/.." && pwd)
SITE=${SITE:-neuroreign.outiva.com}
RELEASE=${RELEASE:-manual-$(date +%Y%m%d%H%M%S)}
SERVER_DEPLOYER=${RUNNER_USER:-gitlab-runner}

a2enmod proxy proxy_http proxy_wstunnel rewrite headers >/dev/null 2>&1 || true
RUNNER_USER=${RUNNER_USER:-gitlab-runner} sh "$HERE/deploy/setup-apache.sh"

# Set up the service on every manual install: it is idempotent, and repairs ownership left by older installers so CI can deploy.
RUNNER_USER=$SERVER_DEPLOYER sh "$HERE/deploy/setup-server.sh"

# The game server's settings: the site's address (it was the old address before the rename).
if [ -f /etc/opensynd.env ]; then
  sed -i "s#^ORIGINS=.*#ORIGINS=https://$SITE#" /etc/opensynd.env
fi

# This machine cannot look up the public name of the identity service, but Keycloak is on it.
grep -q '^OIDC_INTERNAL=' /etc/opensynd.env || echo "OIDC_INTERNAL=http://127.0.0.1:8180" >> /etc/opensynd.env

(cd "$HERE" && sudo -u "$SERVER_DEPLOYER" sh deploy/deploy-server.sh)
sh "$HERE/deploy/deploy.sh" "$HERE/dist" "$RELEASE"

if [ "${KEYCLOAK:-yes}" = yes ]; then
  echo "Registering $SITE with Outiva sign-in (Keycloak administrator needed; Ctrl+C to skip)."
  ORIGIN="https://$SITE" bash "$HERE/deploy/configure-outiva-client.sh" || echo "Skipped or failed: run deploy/configure-outiva-client.sh later."
fi
echo "Done. Check https://$SITE/api/health"
