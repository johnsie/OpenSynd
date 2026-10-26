#!/bin/sh
# SPDX-License-Identifier: GPL-2.0-or-later
#
# Put the game on the web server by hand, from this computer, with nothing but SSH (no GitLab token): builds the site offering the game
# server, copies it and the server's code over, then runs deploy/remote-install.sh there as root (you are asked for the sudo password,
# then for a Keycloak administrator). Usage, from the top of the repository:  sh deploy/install-on-host.sh [user@]host
set -eu
H=${1:-192.168.10.181}
SITE=${SITE:-neuroreign.outiva.com}

(cd web && OPENSYND_SERVER="https://$SITE" node build.mjs)
ssh "$H" 'rm -rf ~/neuroreign-upload && mkdir -p ~/neuroreign-upload/web'
scp -qr deploy "$H":neuroreign-upload/
scp -qr web/dist "$H":neuroreign-upload/
scp -qr web/server web/src web/content "$H":neuroreign-upload/web/
ssh -t "$H" "sudo SITE=$SITE bash neuroreign-upload/deploy/remote-install.sh"
