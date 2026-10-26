// SPDX-License-Identifier: GPL-2.0-or-later

// A fingerprint of the game's content: every file of the pack, by name and contents. The server announces it and the page
// compares it with its own copy, so two sides that would build different operations never play together.
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

function files(root, folder = "") {
  return readdirSync(join(root, folder), { withFileTypes: true })
    .sort((left, right) => (left.name < right.name ? -1 : 1))
    .flatMap((entry) => {
      const relative = folder ? `${folder}/${entry.name}` : entry.name;
      if (entry.isDirectory()) return files(root, relative);
      return entry.name.endsWith(".json") && entry.name !== "hash.json" ? [relative] : [];
    });
}

export function contentHash(root) {
  const hash = createHash("sha256");
  for (const file of files(root)) {
    hash.update(file);
    hash.update("\0");
    hash.update(readFileSync(join(root, file)));
    hash.update("\0");
  }
  return hash.digest("hex").slice(0, 16);
}
