// SPDX-License-Identifier: GPL-2.0-or-later

// Run the game server:  node server/main.js
// Settings come from the environment:
//   PORT      port to listen on (default 8787)          HOST     address to listen on (default 127.0.0.1)
//   DATABASE  path of the SQLite file (default opensynd.sqlite, next to where it is started)
//   ORIGINS   sites whose pages may call the accounts API, comma separated (default: any)
//   OPENSYND_ADMIN_TOKEN  a secret that allows /api/admin/reports and /api/admin/ban (default: moderation endpoints off)
//   OIDC_ISSUER, OIDC_CLIENT  the Outiva sign-in (default https://accounts.outiva.com/realms/outiva, client opensynd-web); OIDC_ISSUER= turns it off
//   OIDC_INTERNAL  where this machine reaches the identity service when it cannot look up the public name (e.g. http://127.0.0.1:8180)
//   CONTENT   the pack folder to play (default: the site's content folder)
import { loadContent, CONTENT_ROOT } from "./content.js";
import { createOidc } from "./oidc.js";
import { createGameServer } from "./server.js";
import { openStore } from "./store.js";

const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? "127.0.0.1";
const origins = process.env.ORIGINS ? process.env.ORIGINS.split(",").map((origin) => origin.trim()) : ["*"];
const content = loadContent(process.env.CONTENT ?? CONTENT_ROOT);
const store = openStore(process.env.DATABASE ?? "opensynd.sqlite");
const server = createGameServer({
  content,
  store,
  origins,
  adminToken: process.env.OPENSYND_ADMIN_TOKEN || null,
  oidc: process.env.OIDC_ISSUER === "" ? null : createOidc({ issuer: process.env.OIDC_ISSUER, client: process.env.OIDC_CLIENT, internal: process.env.OIDC_INTERNAL || null }),
});
const address = await server.listen(port, host);
console.log(`NeuroReign server listening on ${address} (content ${server.content.hash})`);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, async () => {
    await server.close();
    store.close();
    process.exit(0);
  });
}
