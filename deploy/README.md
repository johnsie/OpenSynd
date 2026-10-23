<!-- SPDX-License-Identifier: GPL-2.0-or-later -->

# Putting the game on the web server

The game is a static website. A GitLab pipeline (`.gitlab-ci.yml` at the top of the repository) checks it, builds it and
publishes it to the web server, where Apache serves it at **https://opensyn.outiva.com**. The real HTTPS certificate is on
the haproxy server; Apache here only has a self-signed one.

```
browser --https--> haproxy (real certificate) --https, not verified--> Apache on the web server --> /var/www/opensyn.outiva.com/current
```

## Once only: set up Apache

Copy this `deploy` folder to the web server (or clone the repository there) and run, as root:

```sh
sudo sh deploy/setup-apache.sh
```

It works on Debian/Ubuntu and Red Hat style systems, can be run again safely, and:

- installs Apache and its TLS module if they are missing and turns on the modules the site uses;
- creates `/var/www/opensyn.outiva.com` (`releases/` and a `current` link), owned by the GitLab runner's user
  (`gitlab-runner` by default; run it with `RUNNER_USER=someone` if yours is different);
- makes a self-signed certificate for `opensyn.outiva.com` (ten years) in `/etc/ssl/opensyn.outiva.com/` (Debian) or
  `/etc/pki/tls/opensyn.outiva.com/` (Red Hat);
- installs the virtual host from `deploy/apache/` (ports 80 and 443), checks the configuration and reloads Apache.

The Apache settings were tested here with a private Apache on spare ports: the home page, the JavaScript modules (served as
`text/javascript`), the JSON files and the music load, compression works, and a missing page gives a 404.

### haproxy

Point the `opensyn.outiva.com` backend at this server's port 443 and tell haproxy not to check the self-signed certificate,
for example:

```
backend opensyn
    server web1 <this-server>:443 ssl verify none
```

(or use port 80 with no `ssl` if you would rather keep that hop plain).

## Every push: the pipeline

`.gitlab-ci.yml` has three stages:

1. **check**: the content, style and provenance checks and the unit tests.
2. **build**: builds the site into `web/dist`.
3. **deploy**: `deploy/deploy.sh` copies the build into `releases/<commit>` and switches the `current` link to it in one
   step, so visitors never see a half-copied site. The newest four releases are kept (roll back by pointing `current` at an
   older folder).

Pushes to the project's default branch deploy by themselves. Any other branch can be deployed with the manual **deploy**
button on its pipeline.

The runner needs: the **shell executor**, Node.js 20 or newer, Python 3, and the right to write in
`/var/www/opensyn.outiva.com` (the set-up script gives that to the runner's user). Nothing else is installed: the game has no
build dependencies. If your runner uses tags, add `tags: [the-tag]` under a `default:` block in `.gitlab-ci.yml`.

## Notes

- The address is spelled `opensyn.outiva.com` (no "d"), as given.
- Nothing here needs secrets. The runner deploys by copying files on the same machine.
