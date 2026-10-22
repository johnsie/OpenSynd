// SPDX-License-Identifier: GPL-2.0-or-later

// Drives the built site in real browsers. Usage:
//   node build.mjs && node e2e/smoke.mjs
// Set CHROMIUM_PATH / FIREFOX_PATH to use installed browsers, or leave unset
// to use browsers installed by `npx playwright-core install`.

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium, firefox } from "playwright-core";

const dist = resolve(dirname(fileURLToPath(import.meta.url)), "../dist");
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".txt": "text/plain",
};

const server = createServer(async (request, response) => {
  const path = normalize(new URL(request.url, "http://x").pathname);
  const file = join(dist, path.endsWith("/") ? `${path}index.html` : path);
  if (!file.startsWith(dist)) {
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
const url = `http://127.0.0.1:${server.address().port}/`;

const targets = [
  ["chromium", chromium, process.env.CHROMIUM_PATH],
  ["firefox", firefox, process.env.FIREFOX_PATH],
];

let failed = false;
for (const [name, type, executablePath] of targets) {
  let browser;
  try {
    browser = await type.launch({ executablePath });
  } catch (error) {
    console.log(`skip ${name}: ${error.message.split("\n")[0]}`);
    // E2E_STRICT makes a missing browser a failure, so CI cannot pass vacuously.
    if (process.env.E2E_STRICT) failed = true;
    continue;
  }
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${url}?e2e`);
    await page.waitForSelector("#roster button");
    assert.match(await page.locator("#title-dialog").innerText(), /First Light/);
    await page.click("#begin-button");
    // Watchers patrol: their positions change on their own.
    const before = await page.evaluate(() => window.opensyndTest.positions());
    await page.waitForTimeout(1500);
    const after = await page.evaluate(() => window.opensyndTest.positions());
    assert.notDeepEqual(after["watcher-one"], before["watcher-one"]);
    assert.deepEqual(after["operator-one"], before["operator-one"]);
    assert.match(await page.locator("#objective-list").innerText(), /service gate/i);
    await page.locator("#roster button").first().click();
    assert.doesNotMatch(await page.locator("#selected-readout").innerText(), /No operator selected/);

    await page.locator("#game-canvas").focus();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(300);
    assert.match(await page.locator("#status-message").innerText(), /Route/);

    // Select all operators with the A key, then check they all show as selected.
    await page.keyboard.press("a");
    const pressed = await page.locator("#roster button").evaluateAll((buttons) =>
      buttons.map((button) => button.getAttribute("aria-pressed")),
    );
    assert.deepEqual(pressed, ["true", "true", "true", "true"]);
    await page.click("#select-all-button");
    assert.match(await page.locator("#status-message").innerText(), /All 4 operators selected/);
    // Camera controls: zoom with the wheel and keys, jump with the minimap, recentre with C.
    await page.locator("#game-canvas").hover();
    await page.mouse.wheel(0, -200);
    await page.keyboard.press("-");
    await page.locator("#minimap").click({ position: { x: 128, y: 64 } });
    await page.keyboard.press("c");
    // A group move sends several operators at once.
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Enter");
    assert.match(await page.locator("#status-message").innerText(), /[34] operators moving/);
    await page.keyboard.press("Space");
    assert.equal(await page.locator("#pause-button").getAttribute("aria-pressed"), "true");

    await page.click("#settings-button");
    await page.locator("#setting-muted").check();
    await page.locator("#binding-list button").nth(5).click();
    await page.keyboard.press("f");
    assert.match(await page.locator("#binding-message").innerText(), /now F/);
    await page.locator("#binding-list button").nth(4).click();
    await page.keyboard.press("f");
    assert.match(await page.locator("#binding-message").innerText(), /already used/);
    await page.click("#close-settings");
    const stored = await page.evaluate(() => localStorage.getItem("opensynd.settings.v1"));
    assert.match(stored, /"muted": true/);
    assert.match(stored, /"interact": "f"/);

    // The game was paused above; resume (Space only works with the canvas focused).
    await page.locator("#game-canvas").focus();
    await page.keyboard.press("Space");
    assert.equal(await page.locator("#pause-button").getAttribute("aria-pressed"), "false");
    // Failure screen: disable every operator and wait for the outcome dialog.
    await page.evaluate(() => window.opensyndTest.disableOperators());
    await page.waitForSelector("#outcome-dialog[open]");
    assert.match(await page.locator("#outcome-heading").innerText(), /gone dark/);
    // Replaying restarts the mission with everyone active again.
    await page.click("#replay-button");
    await page.waitForFunction(() => !document.querySelector("#outcome-dialog").open);
    await page.waitForFunction(() =>
      document.querySelector("#status-message").textContent.includes("Local map established"),
    );
    // A watcher notices an operator who walks into its sight and raises the alert.
    await page.evaluate(() => window.opensyndTest.placeUnit("operator-one", 28, 28));
    await page.waitForFunction(
      () => document.querySelector("#status-message").textContent.includes("spotted"),
    );
    // Success screen: complete every objective.
    await page.evaluate(() => window.opensyndTest.completeObjectives());
    await page.waitForSelector("#outcome-dialog[open]");
    assert.match(await page.locator("#outcome-heading").innerText(), /back on the mesh/);

    assert.deepEqual(errors, []);
    console.log(`ok ${name}`);
  } catch (error) {
    failed = true;
    console.error(`FAIL ${name}: ${error.message}\n${error.stack.split("\n").filter((l) => l.includes("smoke.mjs")).join("\n")}`);
  } finally {
    await browser.close();
  }
}
server.close();
process.exit(failed ? 1 : 0);
