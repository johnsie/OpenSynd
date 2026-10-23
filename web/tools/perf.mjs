// SPDX-License-Identifier: GPL-2.0-or-later

// A performance check: plays the biggest operation (a 128 by 128 city with a train, traffic, crowds and a full set of enemies) for
// a few seconds in a real browser and reports how long the game's own work takes each frame. Usage: node tools/perf.mjs
// The budget is 16 ms for smooth play at 60 frames a second; the check fails if the 95th percentile goes over 33 ms.

import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { firefox } from "playwright-core";

const dist = resolve(dirname(fileURLToPath(import.meta.url)), "../dist");
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };
const server = createServer(async (request, response) => {
  const path = normalize(new URL(request.url, "http://x").pathname);
  const file = join(dist, path.endsWith("/") ? `${path}index.html` : path);
  try {
    const body = await readFile(file);
    response.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" });
    response.end(body);
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const url = `http://127.0.0.1:${server.address().port}/`;

const browser = await firefox.launch();
let failed = false;
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await page.goto(`${url}?e2e`);
  await page.waitForSelector(".roster-select");
  // Open every operation, then play the last (the biggest map, the most enemies).
  await page.evaluate(async () => {
    const pack = await (await fetch("content/pack.json")).json();
    const ids = [];
    for (const path of pack.missions) ids.push((await (await fetch(`content/${path}`)).json()).id);
    localStorage.setItem("opensynd.progress.v1", JSON.stringify({ completed: ids.slice(0, -1) }));
  });
  await page.reload();
  await page.waitForSelector(".roster-select");
  await page.click("#filter-all");
  const buttons = page.locator("#mission-list button");
  await buttons.nth((await buttons.count()) - 1).click();
  await page.click("#begin-button");
  await page.waitForFunction(() => document.querySelector("#status-message").textContent.includes("Local map established"));
  await page.keyboard.press("a");
  await page.waitForTimeout(6000);
  const stats = await page.evaluate(() => window.opensyndTest.frameWork());
  const ms = (value) => `${value.toFixed(1)} ms`;
  console.log(`perf: ${stats.frames} frames, median ${ms(stats.median)}, 95th percentile ${ms(stats.p95)}, worst ${ms(stats.worst)}`);
  if (stats.p95 > 33) {
    console.error("perf: FAIL: the 95th percentile frame is slower than 33 ms");
    failed = true;
  }
} finally {
  await browser.close();
  server.close();
}
process.exit(failed ? 1 : 0);
