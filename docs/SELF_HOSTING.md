<!-- SPDX-License-Identifier: GPL-2.0-or-later -->

# Running your own copy

OpenSynd is a folder of static files. You do not need a database, an account, a container or any project service to run the
game. The online modes (daily operation, co-op, rival companies) need a game server, which you can also run yourself: see
[Running a game server](#running-a-game-server) below. Single-player never needs it.

## The quickest way: any static file server

1. Get the files: a release archive (`opensynd-<revision>.tar.gz`, see `docs/RELEASING.md`), or build them yourself:
   ```sh
   git clone <the repository> && cd freesynd/web
   node build.mjs          # needs Node.js 20 or newer; there is nothing to install
   ```
   The site is then in `web/dist`.
2. Serve that folder. For a trial: `cd web/dist && python3 -m http.server 8000`, then open <http://localhost:8000/>.
3. For a real host (Apache, nginx, Caddy, an object store with static hosting) copy the folder's contents to the document root.
   Requirements: files are served with the right types (`.js` as `text/javascript`, `.json` as `application/json`, `.mp3` as
   `audio/mpeg`), and `index.html` is the default page. HTTPS is recommended, and required for some browser features.

Nothing else is needed. The game stores everything in the visitor's browser and sends nothing anywhere.

## Running a game server

The server needs Node.js 22 or newer and nothing else (no packages: it uses Node's own SQLite, WebSocket and scrypt).

```sh
cd freesynd/web
node build.mjs                      # the site, with the content the server must also have
OPENSYND_SERVER=https://play.example.org node build.mjs     # build the site so it offers online play on that server
PORT=8791 HOST=0.0.0.0 DATABASE=/var/lib/opensynd/opensynd.sqlite ORIGINS=https://example.org node server/main.js
```

- Put it behind HTTPS (a reverse proxy that passes WebSocket upgrades on `/ws` and plain requests on `/api/`).
- `ORIGINS` lists the sites whose pages may call the server; leave it unset only for trying things out.
- The page's content security policy must allow the server's address (see `OPENSYND_SERVER` in `build.mjs`, and add the same
  address to `connect-src` in `deploy/apache/opensynd-common.conf` if you use it).
- The game and the server must have the same content: the server refuses a page whose content fingerprint differs.
- Back up the SQLite file; it holds the accounts, scores, replays and the shared world.
- **Moderation:** set `OPENSYND_ADMIN_TOKEN` to a long random secret to turn on `GET /api/admin/reports` and
  `POST /api/admin/ban` (`{ "name": "...", "banned": true }`), both with the header `x-admin-token`. A closed account cannot sign
  in and is disconnected at once. Without the token these endpoints refuse everything.
- On the project's own host: `sudo sh deploy/setup-server.sh` once (a service, its user, a database folder, a restart permission for the
  runner), then the deploy job runs `deploy/deploy-server.sh` when the CI/CD variable `DEPLOY_SERVER` is set, and the site is built
  offering that server when `OPENSYND_SERVER` is set. Apache passes `/api` and `/ws` to it (`deploy/apache/opensynd.outiva.com.conf`).
- **Sign in with Outiva** (OpenID Connect): on by default against `https://accounts.outiva.com/realms/outiva` with the client
  `opensynd-web` (`OIDC_ISSUER`, `OIDC_CLIENT`; `OIDC_ISSUER=` switches it off). Register the client once with
  `sudo sh deploy/configure-outiva-client.sh` on the Keycloak machine, **before** deploying a server that offers it: the page tries a
  quiet sign-in on the first visit, and an unregistered client would send visitors to an error page. The server keeps only the
  account's stable `sub` and a display name made from the username.
- Players can try it at `https://example.org/?server=https://play.example.org`; the page remembers the address.

## Keeping the project's habits (optional)

- **Hot updates**: if you deploy new versions over the top of a running copy, keep the old releases under `/r/<revision>/` and
  build with `PIN_RELEASES=1` so players who have a game open are not disturbed. `deploy/README.md` explains it with Apache.
- **Security headers**: `deploy/apache/opensynd-common.conf` sets a strict content security policy and other safe defaults. If
  you use another server, copy the same policy (`Content-Security-Policy: default-src 'self'; ...`, see that file).
- **Your own content**: put a content pack in `open-content/packs/` and use the mission editor (`editor.html`) to build
  operations; `docs/design/` explains the formats.

## What you may do

The code is GPL-2.0-or-later and the developer content CC0-1.0; the sprites and music have their own licences listed in
`PROVENANCE.md`. You may host, modify and redistribute the game under those terms, but you must keep the notices, and any
copy you distribute must also offer the source.
