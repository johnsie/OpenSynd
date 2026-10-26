#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-2.0-or-later
#
# Once only, on the machine that runs Keycloak (accounts.outiva.com): register OpenSynd as a client of the "outiva" realm so that
# "Sign in with Outiva" works. It is a public client (authorisation code with PKCE, no secret), like Outiva's other web games.
# Run as root; it asks for a Keycloak administrator. Safe to run again (it updates the client).
set -euo pipefail

KCADM=${KCADM:-/opt/keycloak/bin/kcadm.sh}
KEYCLOAK_SERVER=${KEYCLOAK_SERVER:-http://127.0.0.1:8180}
ORIGIN=${ORIGIN:-https://opensynd.outiva.com}
CLIENT=${CLIENT:-opensynd-web}

[ -x "$KCADM" ] || { echo "Cannot execute $KCADM. Set KCADM to the path of kcadm.sh." >&2; exit 1; }
[ "$(id -u)" -eq 0 ] || { echo "Run this with sudo." >&2; exit 1; }

read -r -p "Keycloak administrator username: " admin_username
config_file=$(mktemp)
trap 'rm -f "$config_file"' EXIT
"$KCADM" config credentials --config "$config_file" --server "$KEYCLOAK_SERVER" --realm master --user "$admin_username"

uuid=$("$KCADM" get clients --config "$config_file" -r outiva -q "clientId=$CLIENT" --fields id | python3 -c \
  'import json, sys; found = json.load(sys.stdin); print(found[0]["id"] if found else "")')

settings=(
  -s "clientId=$CLIENT" -s "name=OpenSynd" -s enabled=true -s publicClient=true -s protocol=openid-connect
  -s standardFlowEnabled=true -s implicitFlowEnabled=false -s directAccessGrantsEnabled=false -s serviceAccountsEnabled=false
  -s "rootUrl=$ORIGIN" -s "baseUrl=$ORIGIN/" -s "redirectUris=[\"$ORIGIN/\"]" -s "webOrigins=[\"$ORIGIN\"]"
  -s 'attributes={"pkce.code.challenge.method":"S256"}'
  -s 'defaultClientScopes=["web-origins","acr","roles","profile","email"]'
)
if [ -n "$uuid" ]; then
  "$KCADM" update "clients/$uuid" --config "$config_file" -r outiva "${settings[@]}"
  echo "Updated $CLIENT"
else
  "$KCADM" create clients --config "$config_file" -r outiva "${settings[@]}"
  echo "Created $CLIENT"
fi
