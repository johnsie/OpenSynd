// SPDX-License-Identifier: GPL-2.0-or-later

// Run the game server:  node server/main.js
// Settings come from the environment:
//   PORT      port to listen on (default 8787)          HOST     address to listen on (default 127.0.0.1)
//   DATABASE  path of the SQLite file (default opensynd.sqlite, next to where it is started)
//   ORIGINS   sites whose pages may call the accounts API, comma separated (default: any)
//   CONTENT   the pack folder to play (default: the site's content folder)
import { loadContent, CONTENT_ROOT } from "./content.js";
import { createGameServer } from "./server.js";
import { openStore } from "./store.js";

const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? "127.0.0.1";
const origins = process.env.ORIGINS ? process.env.ORIGINS.split(",").map((origin) => origin.trim()) : ["*"];
const content = loadContent(process.env.CONTENT ?? CONTENT_ROOT);
const store = openStore(process.env.DATABASE ?? "opensynd.sqlite");
const server = createGameServer({ content, store, origins });
const address = await server.listen(port, host);
console.log(`OpenSynd server listening on ${address} (content ${server.content.hash})`);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, async () => {
    await server.close();
    store.close();
    process.exit(0);
  });
}
