#!/bin/sh
# SPDX-License-Identifier: GPL-2.0-or-later
#
# One-time set-up of the web server for https://opensynd.outiva.com. Run it on the server as root:
#
#     sudo sh deploy/setup-apache.sh
#
# It works on Debian/Ubuntu (apache2) and Red Hat style systems (httpd) and can be run again safely. It
#   - makes sure Apache and its TLS module are installed and the needed modules are on,
#   - creates the document root the GitLab runner publishes into (owned by the runner's user),
#   - makes a self-signed certificate (haproxy on another server holds the real one),
#   - installs the virtual host from deploy/apache/ and reloads Apache.
set -eu

HOST=${HOST:-opensynd.outiva.com}
DOCROOT=${DOCROOT:-/var/www/$HOST}
RUNNER_USER=${RUNNER_USER:-gitlab-runner}
HERE=$(cd "$(dirname "$0")" && pwd)

[ "$(id -u)" -eq 0 ] || { echo "run this as root (sudo)" >&2; exit 1; }

if command -v apache2 >/dev/null 2>&1 || [ -d /etc/apache2 ]; then
  FLAVOUR=debian
elif command -v httpd >/dev/null 2>&1 || [ -d /etc/httpd ]; then
  FLAVOUR=redhat
else
  if command -v apt-get >/dev/null 2>&1; then
    apt-get update && apt-get install -y apache2 openssl
    FLAVOUR=debian
  elif command -v dnf >/dev/null 2>&1; then
    dnf install -y httpd mod_ssl openssl
    FLAVOUR=redhat
  else
    echo "no Apache found and no apt-get or dnf to install it" >&2
    exit 1
  fi
fi

if [ "$FLAVOUR" = debian ]; then
  CONF_DIR=/etc/apache2
  CERT_FILE=/etc/ssl/certs/opensynd-origin.crt
  KEY_FILE=/etc/ssl/private/opensynd-origin.key
  LOG_DIR='${APACHE_LOG_DIR}'
  WEB_GROUP=www-data
  a2enmod ssl headers deflate mime >/dev/null
else
  CONF_DIR=/etc/httpd
  CERT_FILE=/etc/pki/tls/certs/opensynd-origin.crt
  KEY_FILE=/etc/pki/tls/private/opensynd-origin.key
  LOG_DIR=logs
  WEB_GROUP=apache
  rpm -q mod_ssl >/dev/null 2>&1 || dnf install -y mod_ssl
fi

# --- document root: releases/<name> folders and a "current" link, written by the runner's user
id "$RUNNER_USER" >/dev/null 2>&1 || { echo "user $RUNNER_USER does not exist: set RUNNER_USER=<the runner's user>" >&2; exit 1; }
mkdir -p "$DOCROOT/releases"
if [ ! -e "$DOCROOT/current" ]; then
  mkdir -p "$DOCROOT/releases/placeholder"
  printf '%s\n' '<!doctype html><title>OpenSynd</title><p>Nothing deployed yet.</p>' > "$DOCROOT/releases/placeholder/index.html"
  ln -sfn "$DOCROOT/releases/placeholder" "$DOCROOT/current"
fi
chown -R "$RUNNER_USER:$WEB_GROUP" "$DOCROOT"
chmod -R u+rwX,g+rX,o+rX "$DOCROOT"
if command -v restorecon >/dev/null 2>&1; then
  # SELinux: let Apache read the site, and the runner replace it.
  chcon -R -t httpd_sys_content_t "$DOCROOT" 2>/dev/null || true
fi

# --- self-signed origin certificate (valid ten years; haproxy does the public TLS and does not verify this one)
if [ ! -s "$CERT_FILE" ] || [ ! -s "$KEY_FILE" ]; then
  openssl req -x509 -nodes -newkey rsa:2048 -days 3650 \
    -keyout "$KEY_FILE" -out "$CERT_FILE" \
    -subj "/CN=$HOST" -addext "subjectAltName=DNS:$HOST"
  chmod 644 "$CERT_FILE"
  if [ "$FLAVOUR" = debian ] && getent group ssl-cert >/dev/null; then
    chown root:ssl-cert "$KEY_FILE"; chmod 640 "$KEY_FILE"
  else
    chmod 600 "$KEY_FILE"
  fi
fi

# --- the virtual host
fill() {
  sed -e "s|@DOCROOT@|$DOCROOT|g" -e "s|@CERT@|$CERT_FILE|g" -e "s|@KEY@|$KEY_FILE|g" \
      -e "s|@ERROR_LOG@|$LOG_DIR/$HOST-error.log|g" -e "s|@ACCESS_LOG@|$LOG_DIR/$HOST-access.log|g" \
      -e "s|@COMMON@|$CONF_DIR/$HOST-common.inc|g" "$1"
}
fill "$HERE/apache/opensynd-common.conf" > "$CONF_DIR/$HOST-common.inc"
if [ "$FLAVOUR" = debian ]; then
  fill "$HERE/apache/opensynd.outiva.com.conf" > "$CONF_DIR/sites-available/$HOST.conf"
  a2ensite "$HOST.conf" >/dev/null
  apache2ctl configtest
  systemctl enable apache2 >/dev/null 2>&1 || true
  systemctl reload apache2 || systemctl restart apache2
else
  fill "$HERE/apache/opensynd.outiva.com.conf" > "$CONF_DIR/conf.d/$HOST.conf"
  httpd -t
  systemctl enable httpd >/dev/null 2>&1 || true
  systemctl reload httpd || systemctl restart httpd
  command -v firewall-cmd >/dev/null 2>&1 && { firewall-cmd --permanent --add-service=http --add-service=https >/dev/null 2>&1 && firewall-cmd --reload >/dev/null 2>&1 || true; }
fi

echo "Apache is ready for https://$HOST (self-signed on this server; haproxy should forward to port 443 without verifying)."
echo "The runner user $RUNNER_USER publishes into $DOCROOT/releases and switches $DOCROOT/current."
