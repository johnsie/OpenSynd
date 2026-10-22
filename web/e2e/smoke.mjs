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
    await page.waitForSelector(".roster-select");
    assert.match(await page.locator("#title-dialog").innerText(), /First Light/);
    // A fresh browser has only the first operation open.
    const missionButtons = page.locator("#mission-list button");
    assert.equal(await missionButtons.count(), 2);
    assert.equal(await missionButtons.nth(0).isDisabled(), false);
    assert.equal(await missionButtons.nth(1).isDisabled(), true);
    assert.match(await missionButtons.nth(1).innerText(), /LOCKED/);
    await page.click("#begin-button");
    // Watchers patrol: their positions change on their own.
    const before = await page.evaluate(() => window.opensyndTest.positions());
    await page.waitForTimeout(1500);
    const after = await page.evaluate(() => window.opensyndTest.positions());
    assert.notDeepEqual(after["watcher-one"], before["watcher-one"]);
    assert.deepEqual(after["operator-one"], before["operator-one"]);
    assert.match(await page.locator("#objective-list").innerText(), /service gate/i);
    await page.locator(".roster-select").first().click();
    assert.doesNotMatch(await page.locator("#selected-readout").innerText(), /No operator selected/);

    await page.locator("#game-canvas").focus();
    await page.keyboard.press("l");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(300);
    assert.match(await page.locator("#status-message").innerText(), /Route/);

    // Training bars: raise Speed for one operator, then lower Brain for everyone.
    await page.locator("#training-panel summary").click();
    await page.getByRole("button", { name: "Raise Legs", exact: true }).click();
    assert.match(await page.locator("#status-message").innerText(), /Legs raised/);
    assert.equal(await page.locator('#training-bars [aria-label="Legs 4 of 5"]').count(), 1);
    assert.equal(await page.locator('.roster [aria-label^="Legs of"]').count(), 4);
    // Each operator's own controls change only that operator.
    await page.getByRole("button", { name: "Raise Brain for Field Operator 3" }).click();
    assert.equal(await page.locator('[aria-label="Brain of Field Operator 3 4 of 5"]').count(), 1);
    assert.equal(await page.locator('[aria-label="Brain of Field Operator 1 4 of 5"]').count(), 0);
    await page.getByRole("button", { name: "Lower Brain for Field Operator 3" }).click();
    // Training points are limited: with Legs at 5 there is nothing left for Brain until Legs comes down.
    await page.getByRole("button", { name: "Raise Legs for Field Operator 1" }).click();
    assert.equal(
      await page.getByRole("button", { name: "Raise Brain for Field Operator 1" }).isDisabled(),
      true,
    );
    assert.match(await page.locator(".roster-item").first().innerText(), /Training points 0 left/);
    await page.getByRole("button", { name: "Lower Legs for Field Operator 1" }).click();
    assert.equal(
      await page.getByRole("button", { name: "Raise Brain for Field Operator 1" }).isDisabled(),
      false,
    );
    // Pick two operators with the roster checkboxes.
    await page.getByLabel("Include Field Operator 2 in the selection").check();
    await page.getByLabel("Include Field Operator 3 in the selection").check();
    assert.match(await page.locator("#status-message").innerText(), /3 operators selected/);
    await page.getByLabel("Include Field Operator 1 in the selection").uncheck();
    assert.match(await page.locator("#status-message").innerText(), /2 operators selected/);
    await page.getByRole("button", { name: "Lower Legs", exact: true }).click();
    assert.match(await page.locator("#status-message").innerText(), /Selected operators: Legs lowered/);
    await page.locator(".roster-select").first().click();
    // Select all operators with the A key, then check they all show as selected.
    await page.keyboard.press("a");
    const pressed = await page.locator(".roster-select").evaluateAll((buttons) =>
      buttons.map((button) => button.getAttribute("aria-pressed")),
    );
    assert.deepEqual(pressed, ["true", "true", "true", "true"]);
    await page.click("#select-all-button");
    assert.match(await page.locator("#status-message").innerText(), /All 4 operators selected/);
    await page.getByRole("button", { name: "Lower Brain", exact: true }).click();
    assert.match(await page.locator("#status-message").innerText(), /Selected operators: Brain lowered/);
    assert.equal(await page.locator('.roster [aria-label^="Brain of"][aria-label$="2 of 5"]').count(), 4);
    // Arrow keys pan the view while held.
    await page.locator("#game-canvas").focus();
    const cameraBefore = await page.evaluate(() => window.opensyndTest.camera());
    await page.keyboard.down("ArrowRight");
    await page.waitForTimeout(400);
    await page.keyboard.up("ArrowRight");
    const cameraAfter = await page.evaluate(() => window.opensyndTest.camera());
    assert.ok(cameraAfter.x - cameraBefore.x > 1, "the view moved right");
    await page.waitForTimeout(150);
    const settled = await page.evaluate(() => window.opensyndTest.camera());
    assert.ok(Math.abs(settled.x - cameraAfter.x) < 0.5, "panning stops when the key is released");
    // Moving the mouse to the edge of the map pans the view, and moving away stops it.
    const box = await page.locator("#game-canvas").boundingBox();
    const edgeBefore = await page.evaluate(() => window.opensyndTest.camera());
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.move(box.x + box.width - 4, box.y + box.height / 2);
    await page.waitForTimeout(500);
    const edgeAfter = await page.evaluate(() => window.opensyndTest.camera());
    assert.ok(edgeAfter.x - edgeBefore.x > 1, "the edge pushed the view right");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(150);
    const edgeStopped = await page.evaluate(() => window.opensyndTest.camera());
    await page.waitForTimeout(300);
    const edgeFinal = await page.evaluate(() => window.opensyndTest.camera());
    assert.ok(Math.abs(edgeFinal.x - edgeStopped.x) < 0.01, "moving away stops the scroll");
    // Stamina meters show for every operator and follow tiredness without rebuilding the roster.
    assert.equal(await page.locator(".stamina").count(), 4);
    await page.evaluate(() => window.opensyndTest.setStamina("operator-two", 0.1));
    await page.waitForFunction(
      () => document.querySelector('.stamina[data-unit="operator-two"]').classList.contains("empty"),
    );
    assert.match(
      await page.locator('.stamina[data-unit="operator-two"]').getAttribute("aria-label"),
      /Stamina of Field Operator 2 10 percent/,
    );
    // Fatigue shows on the bars: a spent operator-two has hollow (lost) Legs segments.
    await page.evaluate(() => window.opensyndTest.setStamina("operator-two", 0));
    await page.waitForFunction(
      () => document.querySelector('.roster .bar[data-unit="operator-two"][data-bar="speed"]')
        .getAttribute("aria-label").includes("tired down to"),
    );
    assert.ok(
      (await page.locator('.roster .bar[data-unit="operator-two"][data-bar="speed"] i.fatigued').count()) > 0,
    );
    assert.equal(await page.locator(".meter.focus").count(), 4);
    // Mental fatigue lowers the Brain bar the same way.
    await page.evaluate(() => window.opensyndTest.setFocus("operator-three", 0));
    await page.waitForFunction(
      () => document.querySelector('.roster .bar[data-unit="operator-three"][data-bar="brain"]')
        .getAttribute("aria-label").includes("tired down to"),
    );
    await page.evaluate(() => window.opensyndTest.setFocus("operator-three", 1));
    await page.evaluate(() => window.opensyndTest.setStamina("operator-two", 0.1));
    // Camera controls: zoom with the wheel and keys, jump with the minimap, recentre with C.
    await page.locator("#game-canvas").hover();
    await page.mouse.wheel(0, -200);
    await page.keyboard.press("-");
    await page.locator("#minimap").click({ position: { x: 128, y: 64 } });
    await page.keyboard.press("c");
    await page.evaluate(() => window.opensyndTest.setStamina("operator-two", 1));
    // A group move sends several operators at once.
    await page.keyboard.press("l");
    await page.keyboard.press("Enter");
    assert.match(await page.locator("#status-message").innerText(), /[34] operators moving/);
    await page.keyboard.press("Space");
    assert.equal(await page.locator("#pause-button").getAttribute("aria-pressed"), "true");

    await page.click("#settings-button");
    await page.locator("#setting-muted").check();
    await page.getByRole("button", { name: /^Interact:/ }).click();
    await page.keyboard.press("g");
    assert.match(await page.locator("#binding-message").innerText(), /now G/);
    await page.getByRole("button", { name: /^Use repair kit:/ }).click();
    await page.keyboard.press("g");
    assert.match(await page.locator("#binding-message").innerText(), /already used/);
    await page.click("#close-settings");
    const stored = await page.evaluate(() => localStorage.getItem("opensynd.settings.v1"));
    assert.match(stored, /"muted": true/);
    assert.match(stored, /"interact": "g"/);

    // The game was paused above; resume (Space only works with the canvas focused).
    await page.locator("#game-canvas").focus();
    await page.keyboard.press("Space");
    assert.equal(await page.locator("#pause-button").getAttribute("aria-pressed"), "false");
    // Leaving an operation in progress asks first; keeping playing changes nothing.
    await page.evaluate(() => window.opensyndTest.markInProgress());
    await page.click("#reset-button");
    await page.waitForSelector("#confirm-dialog[open]");
    assert.match(await page.locator("#confirm-text").innerText(), /restarts this operation/);
    await page.click("#confirm-cancel");
    await page.waitForFunction(() => !document.querySelector("#confirm-dialog").open);
    assert.equal(await page.locator("#outcome-dialog[open]").count(), 0);
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
    // Loot: a disabled watcher's weapon can be taken by an operator standing next to it.
    assert.match(await page.locator(".roster-item").first().innerText(), /Items 2\/8/);
    await page.evaluate(() => {
      window.opensyndTest.disableUnit("watcher-one");
      window.opensyndTest.placeNear("operator-one", "watcher-one");
    });
    await page.waitForFunction(() => !document.querySelector("#loot-button").disabled);
    assert.match(await page.locator("#loot-label").innerText(), /Loot 1 item/);
    await page.locator("#game-canvas").focus();
    await page.keyboard.press("f");
    assert.match(await page.locator("#status-message").innerText(), /looted Heavy Pulse Emitter/);
    assert.match(await page.locator("#achievement-toast").innerText(), /Scavenger/);
    assert.match(await page.locator(".roster-item").first().innerText(), /Items 3\/8/);
    assert.match(await page.locator(".roster-item").first().innerText(), /Heavy Pulse Emitter/);
    // The watcher has nothing left to loot, so the button waits for another body.
    await page.waitForFunction(() => document.querySelector("#loot-button").disabled);
    // A watcher notices an operator who walks into its sight and raises the alert.
    await page.evaluate(() => window.opensyndTest.placeNear("operator-one", "watcher-two", 0, 7));
    await page.waitForFunction(
      () => document.querySelector("#status-message").textContent.includes("spotted"),
    );
    // Success screen: complete every objective.
    await page.evaluate(() => window.opensyndTest.completeObjectives());
    await page.waitForSelector("#outcome-dialog[open]");
    assert.match(await page.locator("#outcome-heading").innerText(), /back on the mesh/);
    // Finishing an operation is remembered in this browser.
    const remembered = await page.evaluate(() => localStorage.getItem("opensynd.progress.v1"));
    assert.match(remembered, /developer\.restore-relay/);
    // Achievements pay funds. This run lost no operator and was quick, but a watcher spotted
    // one earlier, so Ghost is not awarded.
    const awards = await page.locator("#outcome-awards").innerText();
    assert.match(awards, /Whole squad \+30/);
    assert.match(awards, /Quick work \+30/);
    assert.doesNotMatch(awards, /Ghost/);
    const funds = Number((await page.locator("#funds-readout").innerText()).replace(/\D/g, ""));
    assert.ok(funds >= 60, `funds were ${funds}`);
    const storedCampaign = await page.evaluate(() => localStorage.getItem("opensynd.campaign.v1"));
    assert.match(storedCampaign, /"quick-work"/);
    // The first mission leads to the next one, which has its own name, story and map.
    assert.equal(await page.locator("#next-button").isVisible(), true);
    await page.click("#next-button");
    await page.waitForSelector("#title-dialog[open]");
    assert.match(await page.locator("#title-heading").innerText(), /Quiet Hours/);
    assert.match(await page.locator("#title-story").innerText(), /Audit Yard/);
    await page.click("#begin-button");
    assert.match(await page.locator("#operation-eyebrow").innerText(), /OPERATION 02/);
    assert.match(await page.locator("#operation-title").innerText(), /Quiet Hours/);
    await page.waitForFunction(() =>
      document.querySelector("#status-message").textContent.includes("Local map established"),
    );
    // The last mission has no next operation.
    await page.evaluate(() => window.opensyndTest.completeObjectives());
    await page.waitForSelector("#outcome-dialog[open]");
    assert.match(await page.locator("#outcome-heading").innerText(), /audit trail/i);
    assert.equal(await page.locator("#next-button").isVisible(), false);
    // The operations list shows what is done and what is open, and reopens from the header.
    await page.click("#outcome-close");
    await page.click("#operations-button");
    await page.waitForSelector("#title-dialog[open]");
    assert.match(await missionButtons.nth(0).innerText(), /COMPLETED/);
    assert.equal(await missionButtons.nth(1).isDisabled(), false);
    await missionButtons.nth(0).click();
    await page.waitForFunction(() => document.querySelector("#title-heading").textContent.includes("First Light"));
    await missionButtons.nth(1).click();
    await page.waitForFunction(() => document.querySelector("#title-heading").textContent.includes("Quiet Hours"));
    await page.click("#begin-button");
    await page.waitForFunction(() =>
      document.querySelector("#status-message").textContent.includes("Local map established"),
    );


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
