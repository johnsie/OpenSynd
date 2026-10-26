<!-- SPDX-License-Identifier: GPL-2.0-or-later -->

# Putting the game on the web server

The game is a static website. A GitLab pipeline (`.gitlab-ci.yml` at the top of the repository) checks it, builds it and
publishes it to the web server, where Apache serves it at **https://neuroreign.outiva.com**. The real HTTPS certificate is on
the haproxy server; Apache here only has a self-signed one.

```
browser --https--> haproxy (real certificate) --https, not verified--> Apache on the web server --> /var/www/neuroreign.outiva.com/current
```

## Once only: set up Apache

Copy this `deploy` folder to the web server (or clone the repository there) and run, as root:

```sh
sudo sh deploy/setup-apache.sh
```

It works on Debian/Ubuntu and Red Hat style systems, can be run again safely, and:

- installs Apache and its TLS module if they are missing and turns on the modules the site uses;
- creates `/var/www/neuroreign.outiva.com` (`releases/` and a `current` link), owned by the GitLab runner's user
  (`gitlab-runner` by default; run it with `RUNNER_USER=someone` if yours is different);
- makes a self-signed origin certificate for `neuroreign.outiva.com` (ten years): `/etc/ssl/certs/opensynd-origin.crt` and
  `/etc/ssl/private/opensynd-origin.key` on Ubuntu (the same place the Battle City site keeps its origin certificate);
- installs the virtual host from `deploy/apache/` (port 80 redirects to https, port 443 serves the game), checks the
  configuration and reloads Apache.

The Apache settings were tested here with a private Apache on spare ports: the home page, the JavaScript modules (served as
`text/javascript`), the JSON files and the music load, compression works, and a missing page gives a 404.

### haproxy

Point the `neuroreign.outiva.com` backend at this server's port 443 and tell haproxy not to check the self-signed certificate,
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
   step, so visitors never see a half-copied site. The newest twelve releases are kept (roll back by pointing `current` at an
   older folder).

## Hot updates: pushing without disturbing anyone playing

A deploy never changes the game underneath someone who is playing it:

- **Each release keeps its own folder**, and the site serves every kept release under `/r/<release>/`. When the pipeline
  builds with `HOT_UPDATES=1`, the home page loads its code and style sheet from its own release's folder, and the game fetches
  all its content, art and music from the same folder. A game that is already open therefore keeps running on the release it
  started with, whatever is deployed next. The newest twelve releases are kept so that games left open for a long time still
  find their files.
- **The open game notices the new release** (it checks `build-meta.json` once a minute) and shows a small "A new version is
  ready" note in the corner. It switches over by itself only when that costs the player nothing: between operations (the title
  or outcome screen) and with the tab out of sight or left alone for twenty seconds. In the middle of an operation it only
  waits; the note's **Update now** button saves the operation, loads the new release and puts everyone back where they were. The campaign, funds, research, settings and saves live in the
  browser, so they carry over untouched.

**To switch pinning on:** run `sudo sh deploy/setup-apache.sh` again on the web server (it adds the `/r/` alias to the virtual
host), then set the project's CI/CD variable `HOT_UPDATES` to `1` (Settings, CI/CD, Variables). Until then the pages are not
pinned and a deploy is only announced to the open games, not isolated from them.

Pushes to the project's default branch deploy by themselves. Any other branch can be deployed with the manual **deploy**
button on its pipeline.

The runner needs: the **shell executor**, Node.js 20 or newer, Python 3, and the right to write in
`/var/www/neuroreign.outiva.com` (the set-up script gives that to the runner's user). Nothing else is installed: the game has no
build dependencies. The runner only picks up jobs tagged `ubuntu-server`, so every job in `.gitlab-ci.yml` carries that tag
(set once under `default:`).

## Notes

- The address is `neuroreign.outiva.com`.
- Nothing here needs secrets. The runner deploys by copying files on the same machine.
