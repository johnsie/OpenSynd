#!/bin/sh
# SPDX-License-Identifier: GPL-2.0-or-later
#
# Once only, as root: set up the game server as a service. It runs as its own user, keeps its database in /var/lib/opensynd, listens
# on 127.0.0.1:8791 (Apache passes /api and /ws to it, see deploy/apache/) and is restarted by deploy/deploy-server.sh. Safe to run again.
# Usage: sudo sh deploy/setup-server.sh   (RUNNER_USER=gitlab-runner is allowed to restart it)
set -eu
RUNNER_USER=${RUNNER_USER:-gitlab-runner}
HERE=$(cd "$(dirname "$0")" && pwd)

id opensynd >/dev/null 2>&1 || useradd --system --home /var/lib/opensynd --shell /usr/sbin/nologin opensynd
mkdir -p /opt/opensynd /var/lib/opensynd
chown "$RUNNER_USER" /opt/opensynd
chown opensynd /var/lib/opensynd
if [ ! -f /etc/opensynd.env ]; then
  {
    echo "PORT=8791"
    echo "HOST=127.0.0.1"
    echo "DATABASE=/var/lib/opensynd/opensynd.sqlite"
    echo "ORIGINS=https://neuroreign.outiva.com"
    echo "OPENSYND_ADMIN_TOKEN=$(head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n')"
  } > /etc/opensynd.env
  chmod 600 /etc/opensynd.env
fi
cp "$HERE/opensynd-server.service" /etc/systemd/system/opensynd-server.service
echo "$RUNNER_USER ALL=(root) NOPASSWD: /usr/bin/systemctl restart opensynd-server" > /etc/sudoers.d/opensynd-server
chmod 440 /etc/sudoers.d/opensynd-server
a2enmod proxy proxy_http proxy_wstunnel >/dev/null 2>&1 || true
systemctl daemon-reload
systemctl enable opensynd-server
echo "Set up. Run deploy/deploy-server.sh to put the code there and start it, then re-run deploy/setup-apache.sh to add the proxy."
echo "The moderation token is in /etc/opensynd.env."
