<!-- SPDX-License-Identifier: GPL-2.0-or-later -->

# Running your own copy

OpenSynd is a folder of static files. You do not need a database, an account, a container or any project service.

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
