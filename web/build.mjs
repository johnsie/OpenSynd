// SPDX-License-Identifier: GPL-2.0-or-later

import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { contentHash } from "./server/content-hash.js";
import { fileURLToPath } from "node:url";

const projectRoot = dirname(fileURLToPath(import.meta.url));
const output = resolve(projectRoot, "dist");

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(resolve(projectRoot, "src"), output, { recursive: true });
await cp(
  resolve(projectRoot, "content"),
  resolve(output, "content"),
  { recursive: true },
);
// The game compares this with the server's own before it will play there, so the two never build different operations.
await writeFile(resolve(output, "content/hash.json"), `${JSON.stringify({ hash: contentHash(resolve(projectRoot, "content")) })}\n`);
// The page may only talk to its own site (and, for development, to a server on this machine). A deployed game that has a server of
// its own names it when it is built: OPENSYND_SERVER="https://play.example.org" adds that site and its WebSocket address.
if (process.env.OPENSYND_SERVER) {
  const origins = process.env.OPENSYND_SERVER.split(",").map((item) => item.trim().replace(/\/+$/, "")).filter(Boolean);
  const sockets = origins.map((origin) => origin.replace(/^http/, "ws"));
  const page = resolve(output, "index.html");
  const html = await readFile(page, "utf8");
  const named = `<meta name="opensynd-server" content="${origins[0]}" />`; // the server the page offers without ?server=
  const allowed = `connect-src 'self' ${[...origins, ...sockets].join(" ")}`;
  await writeFile(page, html.replace("connect-src 'self'", allowed).replace("</head>", `${named}</head>`));
}
await cp(
  resolve(projectRoot, "public/assets"),
  resolve(output, "assets"),
  { recursive: true },
);
await mkdir(resolve(output, "licenses"), { recursive: true });
await cp(
  resolve(projectRoot, "LICENSES/CC0-1.0.txt"),
  resolve(output, "licenses/CC0-1.0.txt"),
);
await cp(
  resolve(projectRoot, "LICENSES/GPL-2.0-or-later.txt"),
  resolve(output, "licenses/GPL-2.0-or-later.txt"),
);

let revision = process.env.SOURCE_REVISION ?? "working-tree";
try {
  const topLevel = execFileSync("git", ["rev-parse", "--show-toplevel"], {
    cwd: projectRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
  if (resolve(topLevel) === projectRoot) {
    revision = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: projectRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  }
} catch {
  // A source archive may not include Git metadata.
}

const metadata = {
  name: "NeuroReign browser prototype",
  revision,
  // SOURCE_DATE_EPOCH (seconds) makes the build reproducible: the same sources give the same bytes.
  builtAt: new Date(process.env.SOURCE_DATE_EPOCH ? Number(process.env.SOURCE_DATE_EPOCH) * 1000 : Date.now()).toISOString(),
  licenses: ["GPL-2.0-or-later", "CC0-1.0"],
};
await writeFile(
  resolve(output, "build-meta.json"),
  `${JSON.stringify(metadata, null, 2)}\n`,
  "utf8",
);

let index = await readFile(resolve(output, "index.html"), "utf8");
if (!index.includes("NeuroReign")) {
  throw new Error("Built index is missing the NeuroReign identity");
}
// Hot updates: when the site keeps every release under /r/<revision>/ (PIN_RELEASES=1, as the deploy build does), the page
// loads its style sheet and code from its own release's folder, so a running game is never changed by a newer deploy.
if (process.env.PIN_RELEASES) {
  const pinned = index
    .replace('href="styles.css"', `href="r/${revision}/styles.css"`)
    .replace('src="app.js"', `src="r/${revision}/app.js"`);
  if (pinned === index || !pinned.includes(`r/${revision}/app.js`)) throw new Error("Could not pin the release in index.html");
  index = pinned;
  await writeFile(resolve(output, "index.html"), index, "utf8");
}

console.log(`Built NeuroReign static site at ${output}`);
