// SPDX-License-Identifier: GPL-2.0-or-later

import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
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
  name: "OpenSynd browser prototype",
  revision,
  builtAt: new Date().toISOString(),
  licenses: ["GPL-2.0-or-later", "CC0-1.0"],
};
await writeFile(
  resolve(output, "build-meta.json"),
  `${JSON.stringify(metadata, null, 2)}\n`,
  "utf8",
);

const index = await readFile(resolve(output, "index.html"), "utf8");
if (!index.includes("OpenSynd")) {
  throw new Error("Built index is missing the OpenSynd identity");
}

console.log(`Built OpenSynd static site at ${output}`);
