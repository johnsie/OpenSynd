// SPDX-License-Identifier: GPL-2.0-or-later

// `npm test`: a syntax check of every source file and the unit tests, all at once. Every file in src/ is checked, so a new one needs
// no listing anywhere. Exits non-zero if either part fails.
import { spawn } from "node:child_process";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const run = (args, options = {}) =>
  new Promise((done) => {
    const child = spawn(process.execPath, args, { cwd: root, stdio: options.quiet ? ["ignore", "ignore", "pipe"] : "inherit" });
    let errors = "";
    child.stderr?.on("data", (chunk) => {
      errors += chunk;
    });
    child.on("exit", (code) => done({ code, errors, args }));
  });

// Every .js file under src/ and server/, folders included (the game core lives in src/core).
const sourceFiles = (top, folder = "") =>
  readdirSync(join(root, top, folder), { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? sourceFiles(top, join(folder, entry.name))
      : entry.name.endsWith(".js") ? [join(top, folder, entry.name)] : [],
  );
const files = [...sourceFiles("src"), ...sourceFiles("server")].sort();
const tests = readdirSync(join(root, "test")).filter((name) => name.endsWith(".test.js")).sort();
const [unit, ...checks] = await Promise.all([
  run(["--test", ...tests.map((name) => join("test", name))]),
  ...files.map((name) => run(["--check", name], { quiet: true })),
]);
const broken = checks.filter((check) => check.code !== 0);
for (const check of broken) console.error(`syntax: ${check.args.at(-1)}\n${check.errors}`);
if (broken.length === 0) console.log(`syntax: ${files.length} source files parse`);
process.exit(unit.code === 0 && broken.length === 0 ? 0 : 1);
