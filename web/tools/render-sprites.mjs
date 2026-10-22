// SPDX-License-Identifier: GPL-2.0-or-later

// Renders the CC0 Kenney character model, with the recoloured operative skins
// from tools/make-skins.py, to 8-direction sprite sheets.
// Usage: node tools/render-sprites.mjs   (CHROMIUM_PATH selects the browser)

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright-core";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = "/art-source/kenney-animated-characters-protagonists";
const output = join(root, "public/assets/sprites");
const types = { ".html": "text/html", ".js": "text/javascript", ".png": "image/png" };

const server = createServer(async (request, response) => {
  const path = normalize(new URL(request.url, "http://x").pathname);
  const file = join(root, path === "/" ? "tools/render.html" : path);
  if (!file.startsWith(root)) {
    response.writeHead(403).end();
    return;
  }
  try {
    const body = await readFile(file);
    response.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" });
    response.end(body);
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));

const skins = ["operative-one", "operative-two", "operative-three", "operative-four"];
const animations = {
  idle: { url: `${source}/Animations/idle.fbx`, frames: 4 },
  run: { url: `${source}/Animations/run.fbx`, frames: 8 },
};

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
try {
  const page = await browser.newPage();
  page.on("pageerror", (error) => console.error("page error:", error.message));
  page.on("console", (message) => message.type() === "error" && console.error(message.text()));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => window.ready === true, null, { timeout: 30000 });
  await mkdir(output, { recursive: true });
  const manifest = { source: "Kenney Animated Characters Protagonists 1.1 (CC0-1.0)", sheets: {} };
  for (const skin of skins) {
    const result = await page.evaluate(
      (options) => window.renderSheet(options),
      {
        model: `${source}/Model/characterMedium.fbx`,
        skin: `/art-source/opensynd-skins/${skin}.png`,
        animations,
      },
    );
    await writeFile(join(output, `${skin}.png`), Buffer.from(result.png.split(",")[1], "base64"));
    manifest.sheets[skin] = { file: `${skin}.png`, ...result.meta };
    console.log(`rendered ${skin}`);
  }
  await writeFile(join(output, "sprites.json"), `${JSON.stringify(manifest, null, 2)}\n`);
} finally {
  await browser.close();
  server.close();
}
