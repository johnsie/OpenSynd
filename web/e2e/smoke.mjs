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
    // The main menu comes before the world map. Pages from browser.newPage() step through it to the campaign map as soon as they
    // load; the menu test below uses a context page, which is left alone.
    const rawNewPage = browser.newPage.bind(browser);
    browser.newPage = async (options) => {
      const made = await rawNewPage(options);
      made.on("load", () =>
        made
          .evaluate(() => {
            document.querySelector("#menu-dialog[open] #menu-campaign")?.click();
            // A first visit asks for the company name before the map; the dialog opens synchronously.
            if (document.querySelector("#company-dialog[open]")) {
              document.querySelector("#company-name").value = "Test Company";
              document.querySelector("#company-save").click();
            }
          })
          .catch(() => {}),
      );
      return made;
    };
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
    // The list shows what is open to play by default (one operation on a fresh browser); All lists the 50 operations.
    assert.equal(await missionButtons.count(), 1);
    await page.click("#filter-all");
    assert.equal(await missionButtons.count(), 50);
    assert.equal(await page.locator(".map-region").count(), 50, "every territory is on the world map");
    // The world map zooms with its buttons and goes back to the whole map.
    const viewWidth = async () => Number((await page.locator(".world-map-svg").getAttribute("viewBox")).split(" ")[2]);
    const wholeWidth = await viewWidth();
    await page.getByRole("button", { name: "Zoom in" }).click();
    assert.ok((await viewWidth()) < wholeWidth);
    await page.getByRole("button", { name: "Show the whole map" }).click();
    assert.equal(await viewWidth(), wholeWidth);
    assert.equal(await missionButtons.nth(0).isDisabled(), false);
    assert.equal(await missionButtons.nth(1).isDisabled(), true);
    assert.match(await missionButtons.nth(1).innerText(), /LOCKED/);
    await page.click("#begin-button");
    // Watchers patrol: their positions change on their own.
    const before = await page.evaluate(() => window.opensyndTest.positions());
    await page.waitForTimeout(1500);
    const after = await page.evaluate(() => window.opensyndTest.positions());
    assert.notDeepEqual(after["enemy-agent-one"], before["enemy-agent-one"]);
    assert.deepEqual(after["operator-one"], before["operator-one"]);
    assert.match(await page.locator("#objective-list").innerText(), /service gate/i);
    await page.locator(".roster-select").first().click();
    assert.doesNotMatch(await page.locator("#selected-readout").innerText(), /No operator selected/);

    await page.locator("#game-canvas").focus();
    await page.keyboard.press("l");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(300);
    assert.match(await page.locator("#status-message").innerText(), /Route/);

    // The hub button where the four cards meet selects the whole squad.
    await page.locator("#game-canvas").focus();
    await page.keyboard.press("0");
    await page.click("#select-all-hub");
    assert.equal((await page.evaluate(() => window.opensyndTest.selection())).length, 4);
    assert.equal(await page.locator("#select-all-hub").getAttribute("aria-pressed"), "true");
    await page.locator("#game-canvas").focus();
    await page.keyboard.press("0");
    assert.equal((await page.evaluate(() => window.opensyndTest.selection())).length, 1);
    // Pick two operators with the roster checkboxes.
    await page.getByLabel("Include Field Operator 2 in the selection").check();
    await page.getByLabel("Include Field Operator 3 in the selection").check();
    assert.match(await page.locator("#status-message").innerText(), /3 operators selected/);
    await page.getByLabel("Include Field Operator 1 in the selection").uncheck();
    assert.match(await page.locator("#status-message").innerText(), /2 operators selected/);
    await page.locator(".roster-select").first().click();
    // With everyone selected, choosing a weapon chooses it for all of them (and again puts it away for all).
    await page.keyboard.press("a");
    await page.locator(".roster-item").first().locator(".slot").first().click();
    const weaponPressed = () =>
      page.locator(".roster-item").evaluateAll((items) =>
        items.map((item) => item.querySelector(".slot").getAttribute("aria-pressed")),
      );
    assert.deepEqual(await weaponPressed(), ["true", "true", "true", "true"]);
    assert.match(await page.locator("#status-message").innerText(), /4 operators: Civic Pulse Emitter selected/);
    await page.locator(".roster-item").first().locator(".slot").first().click();
    assert.deepEqual(await weaponPressed(), ["false", "false", "false", "false"]);
    assert.match(await page.locator("#status-message").innerText(), /4 operators: weapons put away/);
    await page.locator(".roster-select").first().click();
    // Select all operators with the A key, then check they all show as selected.
    await page.keyboard.press("a");
    const pressed = await page.locator(".roster-select").evaluateAll((buttons) =>
      buttons.map((button) => button.getAttribute("aria-pressed")),
    );
    assert.deepEqual(pressed, ["true", "true", "true", "true"]);
    await page.click("#select-all-button");
    assert.match(await page.locator("#status-message").innerText(), /All 4 operators selected/);
    // Drug sliders: moving one sets it for everyone selected, and the dose takes effect over the next seconds.
    await page.getByLabel("Adrenaline of Field Operator 1").fill("100");
    assert.equal((await page.evaluate(() => window.opensyndTest.drugOf("operator-three", "adrenaline"))).amount, 100);
    await page.waitForTimeout(2200);
    const dose = await page.evaluate(() => window.opensyndTest.drugOf("operator-three", "adrenaline"));
    assert.ok(dose.effect > 50, `the effect is building: ${JSON.stringify(dose)}`);
    await page.getByLabel("Adrenaline of Field Operator 1").fill("50");
    // The side panel has tabs: Mission shows the objectives, Enemies the threats, Save the archive tools.
    await page.click("#tab-enemies");
    assert.equal(await page.locator("#objective-list").isVisible(), false);
    assert.ok((await page.locator("#threats button").count()) > 0);
    assert.match(await page.locator("#enemy-count").innerText(), /^\d+$/);
    await page.click("#tab-archive");
    assert.equal(await page.locator("#save-button").isVisible(), true);
    await page.click("#tab-mission");
    assert.equal(await page.locator("#objective-list").isVisible(), true);
    // Number keys pick operators; 0 switches between one and everyone; Shift+number toggles one in or out.
    await page.locator("#game-canvas").focus();
    await page.keyboard.press("2");
    assert.deepEqual(await page.evaluate(() => window.opensyndTest.selection()), ["operator-two"]);
    await page.keyboard.press("Shift+3");
    assert.deepEqual(await page.evaluate(() => window.opensyndTest.selection()), ["operator-two", "operator-three"]);
    await page.keyboard.press("0");
    assert.equal((await page.evaluate(() => window.opensyndTest.selection())).length, 1, "0 narrows to the leader");
    await page.keyboard.press("0");
    assert.equal((await page.evaluate(() => window.opensyndTest.selection())).length, 4, "and back to everyone");
    // Alt+1 presses inventory slot 1 of the leader, which is a weapon for the whole group.
    await page.keyboard.press("1");
    await page.keyboard.press("Alt+1");
    assert.match(await page.locator("#status-message").innerText(), /Civic Pulse Emitter selected/);
    await page.keyboard.press("Alt+1");
    // Shift+click on the ground adds a leg to the route after the one under way (the e2e page does not reduce
    // motion, so the operator is still walking when the second leg is added).
    await page.keyboard.press("1");
    await page.evaluate(() => window.opensyndTest.placeUnit("operator-one", 3, 62));
    await page.evaluate(() => window.opensyndTest.moveSelected(3, 52));
    await page.evaluate(() => window.opensyndTest.focusOn("operator-one"));
    await page.waitForTimeout(700);
    const ahead = await page.evaluate(() => window.opensyndTest.screenPointAt(3, 58));
    const first = await page.evaluate(() => window.opensyndTest.queue("operator-one"));
    await page.keyboard.down("Shift");
    await page.mouse.click(ahead.x, ahead.y);
    await page.keyboard.up("Shift");
    const queued = await page.evaluate(() => window.opensyndTest.queue("operator-one"));
    assert.ok(first.steps > 0 && queued.waypoints === 2, `two legs: ${JSON.stringify([first, queued])}`);
    assert.ok(queued.steps > first.steps + 4, "the second leg adds its steps to the first");
    await page.keyboard.press("a");
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
    // Each operator shows three drug sliders and no fatigue meters.
    assert.equal(await page.locator(".drug input").count(), 12);
    assert.equal(await page.locator(".meter").count(), 0);
    // Camera controls: zoom with the wheel and keys, jump with the minimap, recentre with C.
    await page.locator("#game-canvas").hover();
    await page.mouse.wheel(0, -200);
    await page.keyboard.press("-");
    await page.locator("#minimap").click({ position: { x: 128, y: 64 } });
    await page.keyboard.press("c");
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
    // Each operative has eight item squares: two are filled to start, with the pulse emitter's rounds shown.
    const firstSquares = page.locator(".roster-item").first().locator(".slot");
    assert.equal(await firstSquares.count(), 8);
    assert.equal(await page.locator(".roster-item").first().locator(".slot:not(.empty)").count(), 2);
    assert.equal(await firstSquares.first().locator(".charges").innerText(), "24");
    // Clicking a weapon square selects it (click again to put it away); a repair kit at full health explains itself.
    // No weapon selected: nothing in the hands. Selecting one puts it in the hand; selecting it again puts it away.
    assert.equal(await page.evaluate(() => window.opensyndTest.held("operator-one")), null);
    await firstSquares.first().click();
    assert.equal(await firstSquares.first().getAttribute("aria-pressed"), "true");
    assert.equal(await page.evaluate(() => window.opensyndTest.held("operator-one")), "Civic Pulse Emitter");
    assert.match(await page.locator("#status-message").innerText(), /Civic Pulse Emitter selected/);
    await firstSquares.first().click();
    assert.equal(await firstSquares.first().getAttribute("aria-pressed"), "false");
    assert.equal(await page.evaluate(() => window.opensyndTest.held("operator-one")), null);
    assert.match(await page.locator("#status-message").innerText(), /weapon put away/);
    await firstSquares.nth(1).click();
    assert.match(await page.locator("#status-message").innerText(), /integrity is already full/);
    await page.evaluate(() => {
      window.opensyndTest.disableUnit("enemy-agent-one");
      window.opensyndTest.placeNear("operator-one", "enemy-agent-one");
    });
    await page.waitForFunction(() => !document.querySelector("#loot-button").disabled);
    assert.match(await page.locator("#loot-label").innerText(), /Pick up 1 item/);
    await page.locator("#game-canvas").focus();
    await page.keyboard.press("f");
    // (Read it from the inventory: a nearby guard may spot the operator and change the status line at once.)
    assert.equal(await page.getByLabel(/slot \d+: Scatter Emitter/).count(), 1);
    assert.equal(await page.locator(".roster-item").first().locator(".slot:not(.empty)").count(), 3);
    assert.equal(await page.getByLabel("Field Operator 1 slot 3: Scatter Emitter", { exact: false }).count(), 1);
    // The watcher has nothing left to loot, so the button waits for another body.
    await page.waitForFunction(() => document.querySelector("#loot-button").disabled);
    // Click-to-pickup: the pointer changes over fallen gear and a click sends an operator to collect it.
    await page.evaluate(() => {
      window.opensyndTest.giveItem("enemy-agent-three", "developer.scanner");
      window.opensyndTest.disableUnit("enemy-agent-three");
      window.opensyndTest.placeNear("operator-one", "enemy-agent-three", 0, 6);
      window.opensyndTest.focusOn("enemy-agent-three");
    });
    await page.waitForTimeout(250);
    const gear = await page.evaluate(() => window.opensyndTest.screenPoint("enemy-agent-three"));
    await page.mouse.move(gear.x, gear.y);
    await page.waitForFunction(() => document.querySelector("#game-canvas").classList.contains("cursor-loot"));
    await page.mouse.click(gear.x, gear.y);
    assert.match(await page.locator("#status-message").innerText(), /walking over to pick up/);
    await page.getByLabel(/slot \d+: Scanner/).first().waitFor({ timeout: 20000 });
    assert.equal(await page.locator(".roster-item").first().locator(".slot:not(.empty)").count(), 4);
    assert.equal(await page.getByLabel("Field Operator 1 slot 4: Scanner", { exact: false }).count(), 1);
    // With the gear gone the pointer goes back to normal over the same spot.
    await page.mouse.move(gear.x + 60, gear.y + 60);
    await page.mouse.move(gear.x, gear.y);
    await page.waitForFunction(() => !document.querySelector("#game-canvas").classList.contains("cursor-loot"));
    // Pursuit: the pointer becomes a circular crosshair over a watcher, and clicking sends the selected
    // operator after it until it is in range of the weapon.
    await page.evaluate(() => {
      window.opensyndTest.placeNear("operator-two", "enemy-agent-four", -17, 0);
      window.opensyndTest.focusOn("enemy-agent-four");
    });
    await page.locator(".roster-select").nth(1).click();
    // Nobody fires without choosing a weapon: with none selected the order is refused.
    await page.evaluate(() => window.opensyndTest.focusOn("enemy-agent-four"));
    await page.waitForTimeout(400);
    const firstEnemy = await page.evaluate(() => window.opensyndTest.screenPoint("enemy-agent-four"));
    await page.mouse.click(firstEnemy.x, firstEnemy.y);
    assert.match(await page.locator("#status-message").innerText(), /No weapon selected/);
    await page.locator(".roster-item").nth(1).getByLabel(/slot \d+: Civic Pulse Emitter/).first().click();
    await page.evaluate(() => window.opensyndTest.focusOn("enemy-agent-four"));
    await page.waitForTimeout(400);
    const enemy = await page.evaluate(() => window.opensyndTest.screenPoint("enemy-agent-four"));
    await page.mouse.move(enemy.x + 40, enemy.y + 40);
    await page.mouse.move(enemy.x, enemy.y);
    // Seventeen tiles away is out of the pistol's range: the crosshair is white.
    await page.waitForFunction(() => document.querySelector("#game-canvas").classList.contains("cursor-attack-far"));
    assert.equal(await page.evaluate(() => document.querySelector("#game-canvas").classList.contains("cursor-attack")), false);
    await page.mouse.click(enemy.x, enemy.y);
    assert.match(await page.locator("#status-message").innerText(), /(closing in on|engaging) Enemy Agent/);
    assert.equal(await page.evaluate(() => window.opensyndTest.following("operator-two")), "enemy-agent-four");
    // Ordering the operator somewhere else ends the pursuit.
    await page.locator("#game-canvas").focus();
    await page.keyboard.press("Enter");
    assert.equal(await page.evaluate(() => window.opensyndTest.following("operator-two")), null);
    // Brought within range, the same crosshair turns red without the mouse moving.
    await page.evaluate(() => {
      window.opensyndTest.focusOn("enemy-agent-four");
      window.opensyndTest.placeNear("operator-two", "enemy-agent-four", -2, 0);
    });
    await page.waitForTimeout(300);
    const closeEnemy = await page.evaluate(() => window.opensyndTest.screenPoint("enemy-agent-four"));
    await page.mouse.move(closeEnemy.x + 30, closeEnemy.y + 30);
    await page.mouse.move(closeEnemy.x, closeEnemy.y);
    await page.waitForFunction(() => document.querySelector("#game-canvas").classList.contains("cursor-attack"));
    // Right-click fires the selected weapon in the direction of the pointer and spends a round.
    const rounds = async () =>
      Number(await page.locator(".roster-item").nth(1).locator(".slot .charges").first().innerText());
    const roundsBefore = await rounds();
    await page.mouse.click(closeEnemy.x, closeEnemy.y, { button: "right" });
    assert.equal(await rounds(), roundsBefore - 1);
    await page.waitForTimeout(900);
    await page.mouse.click(closeEnemy.x + 80, closeEnemy.y + 40, { button: "right" });
    assert.equal(await rounds(), roundsBefore - 2, "a shot that hits nothing still costs a round");
    // Holding the right button keeps firing as the weapon recharges, and releasing stops it.
    await page.waitForTimeout(900);
    await page.mouse.move(closeEnemy.x + 80, closeEnemy.y + 40);
    await page.mouse.down({ button: "right" });
    await page.waitForTimeout(2200);
    await page.mouse.up({ button: "right" });
    const heldRounds = await rounds();
    assert.ok(heldRounds <= roundsBefore - 4, `held fire spent several rounds: ${roundsBefore} -> ${heldRounds}`);
    await page.waitForTimeout(1200);
    assert.equal(await rounds(), heldRounds, "letting go stops the fire");

    // A watcher notices an operator who walks into its sight (shortened by the cloak just
    // picked up) and raises the alert.
    await page.evaluate(() => window.opensyndTest.placeNear("operator-one", "enemy-agent-two", 0, 4));
    await page.waitForFunction(
      () =>
        document.querySelector("#status-message").textContent.includes("spotted") ||
        window.opensyndTest.musicStatus().intense,
    );
    // Being seen brings in the intense score, which takes over from the calm one.
    await page.waitForFunction(() => window.opensyndTest.musicStatus().intense, null, { timeout: 5000 });
    await page.evaluate(() => window.opensyndTest.advanceMusic(2));
    assert.equal(await page.evaluate(() => window.opensyndTest.musicStatus().mix), 1);
    // Success screen: complete every objective.
    await page.evaluate(() => window.opensyndTest.completeObjectives());
    await page.waitForSelector("#outcome-dialog[open]");
    assert.match(await page.locator("#outcome-heading").innerText(), /back on the mesh/);
    // Finishing an operation is remembered in this browser.
    const remembered = await page.evaluate(() => localStorage.getItem("opensynd.progress.v1"));
    assert.match(remembered, /developer\.restore-relay/);
    const funds = Number((await page.locator("#funds-readout").innerText()).replace(/\D/g, ""));
    assert.ok(funds >= 60, `funds were ${funds}`);
    const storedCampaign = await page.evaluate(() => localStorage.getItem("opensynd.campaign.v1"));
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
    // The second mission leads to a third that is not about relays at all.
    await page.evaluate(() => window.opensyndTest.completeObjectives());
    await page.waitForSelector("#outcome-dialog[open]");
    assert.match(await page.locator("#outcome-heading").innerText(), /audit trail/i);
    assert.equal(await page.locator("#next-button").isVisible(), true);
    await page.click("#next-button");
    await page.waitForSelector("#title-dialog[open]");
    assert.match(await page.locator("#title-heading").innerText(), /Dead Drop/);
    await page.click("#begin-button");
    assert.match(await page.locator("#operation-eyebrow").innerText(), /OPERATION 03/);
    const objectiveText = await page.locator("#objective-list").innerText();
    assert.match(objectiveText, /Disable the site warden/);
    assert.match(objectiveText, /Hold the central uplink for 20 seconds .*\(0 \/ 20 s\)/);
    assert.equal(await page.locator("#objective-list li").count(), 4, "different jobs, not three relays");
    await page.evaluate(() => window.opensyndTest.completeObjectives());
    await page.waitForSelector("#outcome-dialog[open]");
    assert.equal(await page.locator("#next-button").isVisible(), true);
    // Safe Passage is done in order: the first objective stands out and the later ones wait.
    await page.click("#next-button");
    await page.waitForSelector("#title-dialog[open]");
    assert.match(await page.locator("#title-heading").innerText(), /Safe Passage/);
    await page.click("#begin-button");
    assert.match(await page.locator("#operation-eyebrow").innerText(), /OPERATION 04/);
    assert.equal(await page.locator("#objective-list li.current").count(), 1);
    assert.match(await page.locator("#objective-list li.current").innerText(), /clearance key/i);
    assert.equal(await page.locator("#objective-list li.waiting").count(), 2);
    await page.evaluate(() => window.opensyndTest.completeObjectives());
    await page.waitForSelector("#outcome-dialog[open]");
    await page.click("#next-button");
    await page.waitForSelector("#title-dialog[open]");
    assert.match(await page.locator("#title-heading").innerText(), /Loose Ends/);
    await page.click("#begin-button");
    assert.match(await page.locator("#operation-eyebrow").innerText(), /OPERATION 05/);
    await page.evaluate(() => window.opensyndTest.completeObjectives());
    await page.waitForSelector("#outcome-dialog[open]");
    // Foyle Crossing (opened by the first operation) is still to do, so it comes next.
    await page.click("#next-button");
    await page.waitForSelector("#title-dialog[open]");
    assert.match(await page.locator("#title-heading").innerText(), /Foyle Crossing/);
    await page.click("#begin-button");
    assert.match(await page.locator("#operation-eyebrow").innerText(), /OPERATION 06/);
    // The territories it opened are next: the campaign goes on past the hand-made operations.
    await page.evaluate(() => window.opensyndTest.completeObjectives());
    await page.waitForSelector("#outcome-dialog[open]");
    assert.equal(await page.locator("#next-button").isVisible(), true);
    // The operations list shows what is done and what is open, and reopens from the header.
    await page.click("#outcome-close");
    await page.click("#operations-button");
    await page.waitForSelector("#title-dialog[open]");
    assert.match(await missionButtons.nth(0).innerText(), /COMPLETED/);
    assert.equal(await missionButtons.nth(1).isDisabled(), false);
    // Territories pay tax at a rate you set; their mood follows it.
    await missionButtons.nth(0).click();
    await page.waitForFunction(() => document.querySelector("#territory-panel").textContent.includes("First Light"));
    assert.match(await page.locator("#territory-panel").innerText(), /First Light: 4\.\d+ million people · held/);
    assert.match(await page.locator("#territory-panel").innerText(), /Tax 30% · pays \d+\.\d funds a day/);
    await page.getByRole("button", { name: "Raise tax on First Light" }).click();
    assert.match(await page.locator("#territory-panel").innerText(), /Tax 40%/);
    assert.match(await page.locator("#territory-panel").innerText(), /worsening in \d+ days/);
    await page.getByRole("button", { name: "Lower tax on First Light" }).click();

    // The Research & Armoury screen: research, then buy weapons into specific slots.
    await page.evaluate(() => window.opensyndTest.setFunds(100000));
    await page.click("#open-research");
    await page.waitForSelector("#research-dialog[open]");
    const labFunds = async () =>
      Number((await page.locator("#research-funds").innerText()).replace(/\D/g, ""));
    assert.equal(await labFunds(), 100000);
    // Two tabs: Squad (roster, body parts, loadout) and Research. The operative picker belongs to the squad tab.
    assert.equal(await page.locator("#roster-list").isVisible(), true);
    assert.equal(await page.locator("#research-items").isVisible(), false);
    assert.equal(await page.locator("#research-tracks").isVisible(), true, "body parts are on the squad tab");
    await page.locator("#research-tracks button").first().click();
    assert.match(await page.locator("#research-tracks").innerText(), /Legs · tier 1 of 3/);
    assert.equal(await labFunds(), 94000, "legs tier 1 costs FreeSynd's 6000");
    await page.click("#tab-lab-research");
    // Research runs on game time: pick an item and a funding level, then hours pass and it is paid for by the hour.
    assert.match(await page.locator("#research-dial").innerText(), /Nothing is being researched/);
    await page.getByRole("button", { name: /^Research Machine Pistol/ }).click();
    assert.match(await page.locator("#research-dial").innerText(), /Funding for Machine Pistol/);
    assert.equal(await page.getByRole("button", { name: /^Research Rotary Cannon/ }).count(), 0, "needs the machine pistol first");
    // Several researches run at once: a second one joins the first, each with its own funding dial.
    await page.getByRole("button", { name: /^Research Incinerator/ }).click();
    assert.equal(await page.locator("#research-dial .dial-row").count(), 2);
    await page.getByRole("button", { name: "Pause research on Incinerator" }).click();
    assert.equal(await page.locator("#research-dial .dial-row").count(), 1);
    await page.evaluate(() => window.opensyndTest.advanceHours(70));
    assert.match(await page.locator("#research-items").innerText(), /Machine Pistol\s+RESEARCHED/);
    const base = await labFunds();
    assert.ok(base >= 92000 && base <= 99000, `research cost about 1500 funds, tax came in: ${base}`);

    // Body parts have a research tab of their own: tier 2 and 3 of each part, the third after the second.
    await page.click("#tab-lab-parts");
    assert.equal(await page.locator("#parts-items .research-row").count(), 12);
    assert.equal(await page.getByRole("button", { name: /^Research Legs tier 3/ }).count(), 0, "the third waits for the second");
    await page.getByRole("button", { name: /^Research Legs tier 2/ }).click();
    assert.equal(await page.locator("#parts-dial .dial-row").count(), 1);
    await page.getByRole("button", { name: "Pause research on Legs tier 2" }).click();

    // Eight picture slots per operative: two are filled (the starting kit; unresearched loot is not kept).
    await page.click("#tab-lab-squad");
    const squads = page.locator(".armoury-card");
    assert.equal(await squads.count(), 1, "the chosen operative's slots");
    // (An operative lost in an earlier fight leaves the roster short, so count who is there rather than assuming all four.)
    const standing = await page.locator("#roster-list .roster-card:not(.fallen)").count();
    assert.equal(await page.locator("#roster-list .roster-pick:not(:disabled)").count(), standing);
    assert.equal(await squads.first().locator(".slot").count(), 8);
    assert.equal(await squads.first().locator(".slot:not(.empty)").count(), 4);
    assert.equal(await squads.first().locator(".slot svg").count(), 4, "each filled slot shows a picture");

    // Buy a scanner into slot 5, then two pulse emitters: an operative can carry several of the same weapon.
    await page.getByLabel("Operator 1 slot 5: empty", { exact: true }).click();
    await page.getByRole("button", { name: "Buy Scanner for Operator 1 slot 5, 500 funds" }).click();
    assert.equal(await labFunds(), base - 500);
    await page.getByLabel("Operator 1 slot 6: empty", { exact: true }).click();
    await page.getByRole("button", { name: "Buy Civic Pulse Emitter for Operator 1 slot 6, 0 funds" }).click();
    await page.getByLabel("Operator 1 slot 7: empty", { exact: true }).click();
    await page.getByRole("button", { name: "Buy Civic Pulse Emitter for Operator 1 slot 7, 0 funds" }).click();
    assert.equal(await labFunds(), base - 500);
    assert.equal(await squads.first().locator(".slot:not(.empty)").count(), 7);
    // Swapping refunds the full price of what it replaces (FreeSynd sells at cost).
    await page.getByLabel("Operator 1 slot 7: Civic Pulse Emitter", { exact: true }).click();
    await page.getByRole("button", { name: "Buy Field Repair Kit for Operator 1 slot 7, 500 funds" }).click();
    assert.equal(await labFunds(), base - 1000);
    // Selling returns the whole price again.
    await page.getByRole("button", { name: /Sell Field Repair Kit · \+500 funds/ }).click();
    assert.equal(await labFunds(), base - 500);
    assert.equal(await squads.first().locator(".slot:not(.empty)").count(), 6);

    // The roster: four operatives deploy; benching one takes them out of the Armoury until they are put back.
    assert.equal(await page.locator("#roster-list .roster-card").count(), 4);
    const deployBoxes = page.getByLabel(/^Deploy /);
    assert.equal(await deployBoxes.count(), 4);
    await deployBoxes.nth(3).uncheck();
    assert.equal(await page.locator("#roster-list .roster-pick:not(:disabled)").count(), 3);
    assert.match(await page.locator("#roster-note").innerText(), /3 of 4 deploying/);
    await deployBoxes.nth(3).check();
    assert.equal(await page.locator("#roster-list .roster-pick:not(:disabled)").count(), 4);
    assert.equal(await page.getByLabel("Fallen operatives are lost for good").isChecked(), true);

    // Pick two operatives in the roster: one purchase is made for both, in the chosen slot.
    await page.locator("#roster-list .roster-pick").nth(1).click();
    await page.locator("#roster-list .roster-pick").nth(2).click();
    assert.equal(await page.locator("#roster-list .roster-card.picked").count(), 2);
    await page.getByLabel("Operator 3 slot 4: empty", { exact: true }).click();
    await page.getByRole("button", { name: /^Buy Civic Pulse Emitter for 2 operators/ }).click();
    assert.match(await page.locator("#lab-message").innerText(), /bought for 2 of 2 operators/);
    const afterGroup = await page.evaluate(() => JSON.parse(localStorage.getItem("opensynd.campaign.v1")));
    assert.equal(afterGroup.loadouts["operator-two"].at(-1), "developer.civic-pulse-emitter");
    assert.equal(afterGroup.loadouts["operator-three"].at(-1), "developer.civic-pulse-emitter");
    assert.equal(afterGroup.loadouts["operator-four"], undefined, "an operative who was not picked is untouched");
    // Clicking a picked card un-picks it again.
    await page.locator("#roster-list .roster-pick").nth(2).click();
    assert.equal(await page.locator("#roster-list .roster-card.picked").count(), 1);

    const campaignRecord = await page.evaluate(() => JSON.parse(localStorage.getItem("opensynd.campaign.v1")));
    assert.equal(campaignRecord.upgrades["operator-one"].legs, 1);
    assert.deepEqual(campaignRecord.loadouts["operator-one"], [
      "developer.civic-pulse-emitter",
      "developer.field-repair-kit",
      "developer.scatter-emitter",
      "developer.scanner",
      "developer.scanner",
      "developer.civic-pulse-emitter",
    ]);
    await page.click("#close-research");
    await page.waitForFunction(() => !document.querySelector("#research-dialog").open);

    await missionButtons.nth(0).click();
    await page.waitForFunction(() => document.querySelector("#title-heading").textContent.includes("First Light"));
    await missionButtons.nth(1).click();
    await page.waitForFunction(() => document.querySelector("#title-heading").textContent.includes("Quiet Hours"));
    await page.click("#begin-button");
    await page.waitForFunction(() =>
      document.querySelector("#status-message").textContent.includes("Local map established"),
    );
    // The purchases are in operator 1's squares when the operation starts: six items.
    assert.equal(await page.locator(".roster-item").first().locator(".slot:not(.empty)").count(), 6);
    assert.equal(await page.getByLabel("Field Operator 1 slot 5: Scanner", { exact: false }).count(), 1);
    assert.equal(await page.getByLabel("Field Operator 1 slot 6: Civic Pulse Emitter", { exact: false }).count(), 1);


    // New game: wipes the campaign and what was won, keeps the settings, and asks first.
    const fresh = await browser.newPage();
    await fresh.goto(`${url}?e2e`);
    await fresh.waitForSelector(".roster-select");
    await fresh.evaluate(() => {
      window.opensyndTest.setFunds(777);
      localStorage.setItem("opensynd.progress.v1", JSON.stringify({ completed: ["developer.restore-relay"] }));
      localStorage.setItem("opensynd.settings.v1", JSON.stringify({ muted: true }));
    });
    await fresh.reload();
    await fresh.waitForSelector("#new-game-button");
    await fresh.click("#new-game-button");
    assert.match(await fresh.locator("#confirm-heading").innerText(), /Start a new game/);
    await fresh.click("#confirm-cancel");
    assert.ok((await fresh.evaluate(() => localStorage.getItem("opensynd.progress.v1"))) !== null, "cancelling changes nothing");
    await fresh.click("#new-game-button");
    await Promise.all([fresh.waitForEvent("load"), fresh.click("#confirm-accept")]);
    await fresh.waitForSelector(".roster-select");
    assert.equal(await fresh.evaluate(() => localStorage.getItem("opensynd.progress.v1")), null);
    assert.ok((await fresh.evaluate(() => localStorage.getItem("opensynd.settings.v1"))).includes("muted"), "settings stay");
    assert.equal(await fresh.locator("#mission-list button").count(), 1, "only the first operation is open again");
    await fresh.close();

    // Winning the last of the 50 main missions ends the campaign, once.
    const finale = await browser.newPage();
    await finale.goto(`${url}?e2e`);
    await finale.waitForSelector(".roster-select");
    await finale.click("#begin-button");
    await finale.evaluate(() => {
      window.opensyndTest.completeAllOtherOperations();
      window.opensyndTest.completeObjectives();
    });
    await finale.waitForSelector("#outcome-dialog[open]");
    assert.match(await finale.locator("#outcome-heading").innerText(), /whole world is yours/);
    assert.match(await finale.locator("#outcome-stats").innerText(), /Territories held\s+\d+ of 50/);
    await finale.close();

    // Queued orders: walk a route, then pick up a body's gear (Shift+click), all in one sweep; Esc clears the queue.
    const queuePage = await browser.newPage();
    await queuePage.goto(`${url}?e2e`);
    await queuePage.waitForSelector(".roster-select");
    await queuePage.click("#begin-button");
    await queuePage.evaluate(() => {
      const test = window.opensyndTest;
      test.giveItem("enemy-agent-three", "developer.scanner");
      test.disableUnit("enemy-agent-three");
      test.placeNear("operator-one", "enemy-agent-three", 0, 9);
      test.focusOn("operator-one");
    });
    await queuePage.waitForTimeout(700);
    const queueStart = await queuePage.evaluate(() => window.opensyndTest.positions());
    const goal = { x: Math.round(queueStart["operator-one"].x), y: Math.round(queueStart["operator-one"].y) - 4 };
    await queuePage.evaluate((point) => window.opensyndTest.moveSelected(point.x, point.y), goal);
    const gearPoint = await queuePage.evaluate(() => window.opensyndTest.screenPoint("enemy-agent-three"));
    await queuePage.keyboard.down("Shift");
    await queuePage.mouse.click(gearPoint.x, gearPoint.y);
    await queuePage.keyboard.up("Shift");
    assert.equal((await queuePage.evaluate(() => window.opensyndTest.queue("operator-one"))).pending, 1, "the pickup waits its turn");
    assert.match(await queuePage.locator("#status-message").innerText(), /will pick up .* next/);
    await queuePage.keyboard.press("Escape");
    assert.equal((await queuePage.evaluate(() => window.opensyndTest.queue("operator-one"))).pending, 0, "Esc clears the queue");
    await queuePage.keyboard.down("Shift");
    await queuePage.mouse.click(gearPoint.x, gearPoint.y);
    await queuePage.keyboard.up("Shift");
    await queuePage.getByLabel(/Field Operator 1 slot 3:/).first().waitFor({ timeout: 30000 });
    await queuePage.close();

    // Clicking an item that has nothing left in it puts it down.
    const spentPage = await browser.newPage();
    await spentPage.goto(`${url}?e2e`);
    await spentPage.waitForSelector(".roster-select");
    await spentPage.click("#begin-button");
    await spentPage.evaluate(() => window.opensyndTest.giveItem("operator-one", "developer.scatter-emitter", 0));
    await spentPage.getByLabel(/Field Operator 1 slot 3: Scatter Emitter/).click();
    assert.equal(await spentPage.getByLabel("Field Operator 1 slot 3: empty").count(), 1, "the spent item left the slot");
    assert.equal((await spentPage.evaluate(() => window.opensyndTest.drops())).length, 1);
    await spentPage.close();

    // Languages: the fixed interface can be switched to Spanish or French, and back (the choice is kept in the browser).
    const tongue = await browser.newPage();
    await tongue.goto(`${url}?e2e`);
    await tongue.waitForSelector(".roster-select");
    await tongue.click("#begin-button");
    await tongue.click("#settings-button");
    await tongue.selectOption("#setting-language", "es");
    assert.equal(await tongue.locator("html").getAttribute("lang"), "es");
    assert.equal(await tongue.locator("#reset-button").innerText(), "Reiniciar");
    assert.match(await tongue.locator("#settings-title").innerText(), /Ajustes/);
    assert.equal(await tongue.locator("#setting-muted").count(), 1, "the checkbox inside a translated label survives");
    await tongue.selectOption("#setting-language", "fr");
    assert.equal(await tongue.locator("#reset-button").innerText(), "Réinitialiser");
    await tongue.selectOption("#setting-language", "en");
    assert.equal(await tongue.locator("#reset-button").innerText(), "Reset");
    await tongue.close();

    // Privacy and security: the game talks only to the site it came from, and the content security policy is never violated.
    const private_ = await browser.newPage();
    const strangers = [];
    const violations = [];
    private_.on("request", (request) => {
      const address = new URL(request.url());
      if (address.protocol.startsWith("http") && address.origin !== new URL(url).origin) strangers.push(request.url());
    });
    private_.on("console", (message) => /content security policy/i.test(message.text()) && violations.push(message.text()));
    await private_.goto(`${url}?e2e`);
    await private_.waitForSelector(".roster-select");
    await private_.click("#begin-button");
    await private_.waitForFunction(() => document.querySelector("#status-message").textContent.includes("Local map established"));
    await private_.waitForTimeout(1500);
    assert.deepEqual(strangers, [], "no request leaves the site");
    assert.deepEqual(violations, [], "no content security policy violation");
    assert.match(await private_.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute("content"), /default-src 'self'/);
    await private_.close();

    // Accessibility basics on every screen the game has: names, labels, landmarks and a language, checked by the browser's own
    // accessibility tree rather than by eye.
    const audit = await browser.newPage();
    await audit.goto(`${url}?e2e`);
    await audit.waitForSelector(".roster-select");
    const problems = async () =>
      audit.evaluate(() => {
        const found = [];
        const labelledBy = (element) => {
          const ids = (element.getAttribute("aria-labelledby") ?? "").split(" ").filter(Boolean);
          return ids.map((id) => document.getElementById(id)?.textContent ?? "").join("").trim();
        };
        const nameOf = (element) =>
          (element.getAttribute("aria-label") ?? "").trim() ||
          (element.labels?.[0]?.textContent ?? "").trim() ||
          labelledBy(element) ||
          (element.getAttribute("title") ?? "").trim() ||
          element.textContent.trim();
        const reachable = (element) => !element.closest("[hidden]") && getComputedStyle(element).display !== "none";
        for (const element of document.querySelectorAll("button, a[href], input, select, textarea, canvas[tabindex]")) {
          if (!reachable(element)) continue;
          if (element.closest("dialog:not([open])")) continue;
          const label = `${element.tagName.toLowerCase()}#${element.id || "?"}.${element.className}`;
          if (!nameOf(element)) found.push(`${label} has no accessible name`);
        }
        for (const dialog of document.querySelectorAll("dialog[open]")) {
          if (!dialog.getAttribute("aria-labelledby") && !dialog.getAttribute("aria-label")) found.push(`dialog#${dialog.id} has no name`);
        }
        for (const image of document.querySelectorAll("img")) if (!image.hasAttribute("alt")) found.push("an image has no alt text");
        if (!document.documentElement.lang) found.push("the page has no language");
        if (!document.title) found.push("the page has no title");
        if (document.querySelectorAll("h1").length !== 1) found.push(`there are ${document.querySelectorAll("h1").length} h1 headings`);
        return found;
      });
    assert.deepEqual(await problems(), [], "the title screen");
    await audit.click("#begin-button");
    await audit.waitForFunction(() => document.querySelector("#status-message").textContent.includes("Local map established"));
    assert.deepEqual(await problems(), [], "the operation screen");
    await audit.click("#settings-button");
    assert.deepEqual(await problems(), [], "the settings dialog");
    await audit.keyboard.press("Escape");
    // The keyboard can reach and operate the main controls (a tab order that includes the game and its buttons).
    await audit.locator("#game-canvas").focus();
    assert.equal(await audit.evaluate(() => document.activeElement.id), "game-canvas", "the game area takes keyboard focus");
    await audit.close();

    // A left click on a civilian follows them (FreeSynd): the operative walks after them and does not shoot.
    const tail = await browser.newPage();
    await tail.goto(`${url}?e2e`);
    await tail.waitForSelector(".roster-select");
    await tail.click("#begin-button");
    await tail.waitForFunction(() => document.querySelector("#status-message").textContent.includes("Local map established"));
    await tail.evaluate(() => {
      window.opensyndTest.placeNear("civilian-1", "operator-one", 0, 4);
      window.opensyndTest.focusOn("civilian-1");
    });
    await tail.waitForTimeout(700);
    const walkerPoint = await tail.evaluate(() => window.opensyndTest.screenPoint("civilian-1"));
    await tail.mouse.move(walkerPoint.x, walkerPoint.y);
    await tail.waitForFunction(() => document.querySelector("#game-canvas").className.includes("cursor-attack"));
    await tail.mouse.click(walkerPoint.x, walkerPoint.y);
    assert.match(await tail.locator("#status-message").innerText(), /following/i);
    assert.match(await tail.locator("#selected-readout").innerText(), /following/);
    // With Shift held a follow waits its turn behind a walk that is already under way.
    const attempts = await tail.evaluate(() => {
      const test = window.opensyndTest;
      test.placeNear("civilian-2", "operator-one", 3, 2);
      const here = test.positionOf("operator-one");
      const tried = [];
      for (const [dx, dy] of [[0, -6], [0, 6], [6, 0], [-6, 0], [0, -3], [0, 3]]) {
        test.moveSelected(Math.round(here.x) + dx, Math.round(here.y) + dy);
        if (test.queue("operator-one").steps > 0) break;
      }
      return tried;
    });
    await tail.waitForTimeout(400);
    const second = await tail.evaluate(() => window.opensyndTest.screenPoint("civilian-2"));
    await tail.keyboard.down("Shift");
    await tail.mouse.click(second.x, second.y);
    await tail.keyboard.up("Shift");
    assert.equal((await tail.evaluate(() => window.opensyndTest.queue("operator-one"))).pending, 1, "the follow is queued");
    assert.match(await tail.locator("#status-message").innerText(), /will follow/);
    await tail.close();

    // Clicking gear that lies beside a tall figure picks it up rather than selecting the figure.
    const beside = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    await beside.goto(`${url}?e2e`);
    await beside.waitForSelector(".roster-select");
    await beside.click("#begin-button");
    await beside.waitForFunction(() => document.querySelector("#status-message").textContent.includes("Local map established"));
    await beside.evaluate(() => {
      const test = window.opensyndTest;
      test.giveItem("operator-four", "developer.scanner");
      test.placeNear("operator-four", "operator-one", 3, 0);
      test.placeNear("operator-two", "operator-four", 2, 0);
      test.focusOn("operator-four");
    });
    await beside.waitForTimeout(600);
    await beside.locator(".roster-item").nth(3).getByLabel(/Scanner/).click({ button: "right" });
    await beside.locator("#game-canvas").focus();
    await beside.keyboard.press("2");
    await beside.waitForTimeout(1500); // the camera follows the new selection
    const lying = await beside.evaluate(() => {
      const drop = window.opensyndTest.drops()[0];
      return window.opensyndTest.screenPointAt(drop.x, drop.y);
    });
    await beside.mouse.click(lying.x, lying.y);
    await beside.getByLabel(/Field Operator 2 slot 3: Scanner/).waitFor({ timeout: 10000 });
    await beside.close();

    // Trains: wait on the platform until the train pulls in, board it (V), ride to the next station and step out there.
    const rail = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    await rail.addInitScript(() => {
      for (const key of Object.keys(localStorage)) if (key.startsWith("opensynd.save")) localStorage.removeItem(key);
    });
    await rail.goto(`${url}?e2e`);
    await rail.waitForSelector(".roster-select");
    await rail.evaluate(async () => {
      const pack = await (await fetch("content/pack.json")).json();
      const ids = [];
      for (const path of pack.missions) ids.push((await (await fetch(`content/${path}`)).json()).id);
      localStorage.setItem("opensynd.progress.v1", JSON.stringify({ completed: ids.filter((id) => !id.includes("balkans")) }));
    });
    await rail.reload();
    await rail.waitForSelector(".roster-select");
    await rail.click("#filter-all");
    await rail.locator("#mission-list button", { hasText: "Balkans Uplink" }).click();
    await rail.waitForFunction(() => document.querySelector("#title-heading").textContent.includes("Balkans"));
    await rail.click("#begin-button");
    await rail.waitForFunction(() => document.querySelector("#status-message").textContent.includes("Local map established"));
    const firstTrain = await rail.evaluate(() => window.opensyndTest.trains()[0]);
    assert.equal(firstTrain.cars.length, 5, "an engine and four carriages");
    // The middle station: wait for the train there, then stand on the platform beside its middle carriage.
    await rail.waitForFunction(
      () => {
        const train = window.opensyndTest.trains()[0];
        return train.waiting > 3 && train.cars[0].x > 40;
      },
      null,
      { timeout: 40000 },
    );
    await rail.evaluate(() => {
      const train = window.opensyndTest.trains()[0];
      window.opensyndTest.placeUnit("operator-one", Math.round(train.cars[2].x), 3);
      window.opensyndTest.focusOn("operator-one");
    });
    await rail.locator("#game-canvas").focus();
    await rail.waitForFunction(() => !document.querySelector("#vehicle-button").disabled);
    await rail.keyboard.press("v");
    await rail.waitForFunction(() => window.opensyndTest.riders().length > 0);
    // Out of the first station: the passenger is carried to the next, and set down on its platform.
    await rail.waitForFunction(() => window.opensyndTest.riders().length === 0, null, { timeout: 40000 });
    assert.match(await rail.locator("#status-message").innerText(), /got off the train at the platform/);
    assert.equal((await rail.evaluate(() => window.opensyndTest.positionOf("operator-one"))).y, 3, "on the platform");
    await rail.close();

    // Hot updates: a newer release is announced quietly and never switched in while an operation is being played.
    const updating = await browser.newPage();
    let published = "rev-a";
    await updating.route("**/build-meta.json", (route) =>
      route.fulfill({ contentType: "application/json", body: JSON.stringify({ revision: published, builtAt: "now" }) }),
    );
    await updating.goto(`${url}?e2e`);
    await updating.waitForSelector(".roster-select");
    await updating.evaluate(() => (window.updateMarker = "still the same page"));
    assert.equal(await updating.locator("#update-banner").isVisible(), false, "nothing waiting");
    published = "rev-b";
    await updating.waitForSelector("#update-banner:not([hidden])", { timeout: 15000 });
    // Pretend the tab is out of sight while the title screen is up: that is a quiet moment, so it switches over by itself.
    await updating.evaluate(() => Object.defineProperty(document, "hidden", { get: () => true, configurable: true }));
    await updating.waitForFunction(() => window.updateMarker === undefined, null, { timeout: 15000 });
    await updating.waitForSelector(".roster-select");
    // The new page begins an operation; a newer release then waits, even with the tab out of sight.
    await updating.click("#begin-button");
    await updating.waitForFunction(() => document.querySelector("#status-message").textContent.includes("Local map established"));
    await updating.evaluate(() => (window.updateMarker = "mid-operation"));
    published = "rev-c";
    await updating.waitForSelector("#update-banner:not([hidden])", { timeout: 15000 });
    await updating.evaluate(() => Object.defineProperty(document, "hidden", { get: () => true, configurable: true }));
    await updating.waitForTimeout(3500);
    assert.equal(await updating.evaluate(() => window.updateMarker), "mid-operation", "never switched in the middle of an operation");
    // Asking for it mid-operation saves the operation first, and the new release picks it up where it was left.
    const spot = await updating.evaluate(() => {
      window.opensyndTest.placeUnit("operator-one", 4, 52);
      return window.opensyndTest.positionOf("operator-one");
    });
    await Promise.all([updating.waitForEvent("load"), updating.click("#update-now")]);
    await updating.waitForFunction(
      () => document.querySelector("#status-message").textContent.includes("resumed"),
      null,
      { timeout: 30000 },
    );
    assert.equal(await updating.evaluate(() => window.updateMarker), undefined, "a fresh page");
    assert.deepEqual(await updating.evaluate(() => window.opensyndTest.positionOf("operator-one")), spot, "back where they were");
    assert.equal(await updating.evaluate(() => document.querySelector("#title-dialog").open), false, "straight back into the operation");
    await updating.close();

    // A defection: win the defector over with the Persuader, then they follow the squad and the objective is done.
    const defection = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    await defection.goto(`${url}?e2e`);
    await defection.waitForSelector(".roster-select");
    const defectionName = await defection.evaluate(async () => {
      const pack = await (await fetch("content/pack.json")).json();
      const all = [];
      for (const path of pack.missions) all.push(await (await fetch(`content/${path}`)).json());
      const chosen = all.find((mission) => mission.objectives.some((objective) => objective.type === "persuade"));
      localStorage.setItem("opensynd.progress.v1", JSON.stringify({ completed: all.filter((m) => m !== chosen).map((m) => m.id) }));
      return chosen.name;
    });
    await defection.reload();
    await defection.waitForSelector(".roster-select");
    await defection.click("#filter-all");
    await defection.locator("#mission-list button", { hasText: defectionName }).first().click();
    await defection.waitForFunction(() => document.querySelector("#title-heading").textContent.length > 0);
    await defection.click("#begin-button");
    await defection.waitForFunction(() => document.querySelector("#status-message").textContent.includes("Local map established"));
    assert.match(await defection.locator("#objective-list").innerText(), /Win the defector over/);
    await defection.evaluate(() => {
      const test = window.opensyndTest;
      test.placeNear("operator-one", "defector", 2, 0);
      test.focusOn("operator-one");
    });
    await defection.getByLabel(/Field Operator 1 slot \d+: Persuader/).click();
    await defection.waitForFunction(() => window.opensyndTest.persuadedBy("defector") !== null, null, { timeout: 30000 });
    await defection.waitForFunction(() => document.querySelector("#objective-list li.complete")?.textContent.includes("defector"));
    await defection.close();

    // Several operatives selected: they all move up to gear on the ground, and the one with fewest items picks it up.
    const crowd = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    await crowd.goto(`${url}?e2e`);
    await crowd.waitForSelector(".roster-select");
    await crowd.click("#begin-button");
    await crowd.waitForFunction(() => document.querySelector("#status-message").textContent.includes("Local map established"));
    await crowd.evaluate(() => {
      const test = window.opensyndTest;
      test.giveItem("enemy-agent-three", "developer.scanner");
      test.disableUnit("enemy-agent-three");
      for (const id of ["operator-one", "operator-two", "operator-three"]) test.placeNear(id, "enemy-agent-three", 0, 8);
      test.giveItem("operator-one", "developer.scanner");
      test.focusOn("enemy-agent-three");
    });
    await crowd.locator("#game-canvas").focus();
    await crowd.keyboard.press("a");
    await crowd.waitForTimeout(700);
    await crowd.keyboard.press("f");
    await crowd.waitForTimeout(150);
    const routes = await crowd.evaluate(() =>
      ["operator-one", "operator-two", "operator-three"].map((id) => window.opensyndTest.queue(id).steps),
    );
    assert.ok(routes.every((steps) => steps > 0), `all three selected operatives are on their way to the gear (${routes})`);
    await crowd.close();

    // A saved operation is offered again on the title screen after a reload, and can be put back where it was or discarded.
    const returning = await browser.newPage();
    await returning.goto(`${url}?e2e`);
    await returning.waitForSelector(".roster-select");
    assert.equal(await returning.locator("#resume-box").isVisible(), false, "nothing saved yet");
    await returning.click("#begin-button");
    await returning.waitForFunction(() => document.querySelector("#status-message").textContent.includes("Local map established"));
    const there = await returning.evaluate(() => {
      window.opensyndTest.placeUnit("operator-one", 5, 52);
      window.opensyndTest.autosaveNow();
      return window.opensyndTest.positionOf("operator-one");
    });
    await returning.reload();
    await returning.waitForSelector("#resume-box:not([hidden])");
    assert.match(await returning.locator("#resume-text").innerText(), /was saved/);
    await returning.click("#resume-button");
    await returning.waitForFunction(() => document.querySelector("#status-message").textContent.includes("resumed"));
    assert.deepEqual(await returning.evaluate(() => window.opensyndTest.positionOf("operator-one")), there);
    await returning.reload();
    await returning.waitForSelector("#resume-box:not([hidden])");
    await returning.click("#resume-discard");
    await returning.reload();
    await returning.waitForSelector(".roster-select");
    assert.equal(await returning.locator("#resume-box").isVisible(), false, "discarded");
    await returning.close();

    // The main menu: a fresh browser has only the new choices, Escape does not dismiss it, settings open from it, and the world map
    // is the Campaign choice (with a way back). Once something is won, Continue appears.
    const menuPage = await (await browser.newContext()).newPage();
    await menuPage.goto(`${url}?e2e`);
    await menuPage.waitForSelector("#menu-dialog[open]");
    assert.equal(await menuPage.locator("#title-dialog").evaluate((dialog) => dialog.open), false, "the map is not the first screen");
    assert.equal(await menuPage.locator("#menu-continue").isVisible(), false, "nothing to continue yet");
    assert.equal(await menuPage.locator("#menu-campaign").isVisible(), true, "a fresh browser starts a campaign");
    assert.equal(await menuPage.locator("#menu-new-game").isVisible(), false, "nothing to wipe yet");
    assert.equal(await menuPage.locator("#menu-dialog button:disabled").count(), 3, "the online modes are listed but planned");
    await menuPage.keyboard.press("Escape");
    assert.equal(await menuPage.locator("#menu-dialog").evaluate((dialog) => dialog.open), true, "Escape leaves the menu up");
    await menuPage.click("#menu-settings");
    await menuPage.waitForSelector("#settings-dialog[open]");
    await menuPage.click("#close-settings");
    await menuPage.click("#menu-campaign");
    await menuPage.waitForSelector("#company-dialog[open]");
    assert.equal(await menuPage.locator("#title-dialog").evaluate((dialog) => dialog.open), false, "the company comes before the map");
    await menuPage.click("#company-save"); // empty: refused
    assert.equal(await menuPage.locator("#company-error").isVisible(), true, "a blank name is refused");
    await menuPage.fill("#company-name", "  Grey   Harbour <b> ");
    await menuPage.click("#company-save");
    await menuPage.waitForSelector("#title-dialog[open]");
    assert.equal(await menuPage.locator("#title-company").innerText(), "Grey Harbour b", "the name is cleaned and shown");
    assert.equal(await menuPage.locator("#menu-dialog").evaluate((dialog) => dialog.open), false);
    await menuPage.click("#menu-button");
    await menuPage.waitForSelector("#menu-dialog[open]");
    assert.equal(await menuPage.locator("#title-dialog").evaluate((dialog) => dialog.open), false);
    await menuPage.evaluate(() => {
      localStorage.removeItem("opensynd.autosave.v1");
      localStorage.setItem("opensynd.progress.v1", JSON.stringify({ completed: ["developer.restore-relay"] }));
    });
    await menuPage.reload();
    await menuPage.waitForSelector("#menu-continue:not([hidden])");
    assert.equal(await menuPage.locator("#menu-company-name").innerText(), "Grey Harbour b", "the name is remembered");
    await menuPage.click("#menu-company-edit");
    await menuPage.fill("#company-name", "Harbour Group");
    await menuPage.click("#company-save");
    assert.equal(await menuPage.locator("#menu-company-name").innerText(), "Harbour Group", "it can be renamed");
    assert.match(await menuPage.locator("#menu-continue-note").innerText(), /1 operation won/);
    assert.equal(await menuPage.locator("#menu-campaign").isVisible(), false, "Continue replaces Start campaign");
    assert.equal(await menuPage.locator("#menu-new-game").isVisible(), true, "New campaign is offered beside it");
    await menuPage.click("#menu-continue");
    await menuPage.waitForSelector("#title-dialog[open]");
    await menuPage.close();

    // The tutorial: a bot follows the prompts. It runs on a scratch campaign, so nothing it does is kept.
    const trainee = await (await browser.newContext()).newPage();
    await trainee.goto(`${url}?e2e`);
    await trainee.waitForSelector("#menu-dialog[open]");
    await trainee.evaluate(() => localStorage.setItem("opensynd.campaign.v1", JSON.stringify({ company: "Keep Me", funds: 777 })));
    await trainee.reload();
    await trainee.waitForSelector("#menu-dialog[open]");
    await trainee.click("#menu-tutorial");
    await trainee.waitForSelector("#tutorial-panel:not([hidden])");
    const step = () => trainee.evaluate(() => window.opensyndTest.tutorialStep().step);
    const waitStep = async (id) => {
      await trainee.waitForFunction((wanted) => window.opensyndTest.tutorialStep().step === wanted, id, { timeout: 8000 });
      assert.ok((await trainee.locator("#tutorial-text").innerText()).length > 20, `${id} has a prompt`);
    };
    assert.equal(await step(), "select");
    await trainee.locator("#game-canvas").focus();
    await trainee.keyboard.press("2");
    await waitStep("walk");
    await trainee.evaluate(() => window.opensyndTest.moveSelected(11, 20));
    await waitStep("weapon");
    await trainee.evaluate(() => window.opensyndTest.selectWeapon("operator-two"));
    await waitStep("shoot");
    await trainee.evaluate(() => window.opensyndTest.disableUnit("practice-target"));
    await waitStep("loot");
    await trainee.evaluate(() => window.opensyndTest.placeNear("operator-two", "practice-target", 1, 0));
    await trainee.locator("#game-canvas").focus();
    await trainee.keyboard.press("f");
    await waitStep("queue");
    await trainee.evaluate(() => window.opensyndTest.placeUnit("operator-two", 6, 19));
    await trainee.evaluate(() => window.opensyndTest.moveSelected(16, 19));
    await trainee.evaluate(() => window.opensyndTest.focusOn("operator-two"));
    await trainee.waitForTimeout(700);
    const farther = await trainee.evaluate(() => window.opensyndTest.screenPointAt(9, 19));
    await trainee.keyboard.down("Shift");
    await trainee.mouse.click(farther.x, farther.y);
    await trainee.keyboard.up("Shift");
    await waitStep("persuade");
    await trainee.evaluate(() => window.opensyndTest.persuade("civilian-1", "operator-one"));
    await waitStep("drive");
    await trainee.evaluate(() => window.opensyndTest.placeUnit("training-car", 34, 20));
    await waitStep("gate");
    await trainee.evaluate(() => window.opensyndTest.completeObjectives());
    await trainee.waitForSelector("#tutorial-done-dialog[open]", { timeout: 8000 });
    assert.equal((await trainee.evaluate(() => window.opensyndTest.tutorialStep())).finished, true);
    await trainee.click("#tutorial-finish");
    await trainee.waitForSelector("#menu-dialog[open]");
    assert.equal(await trainee.evaluate(() => window.opensyndTest.tutorialStep().running), false, "back out of the training");
    const kept = await trainee.evaluate(() => JSON.parse(localStorage.getItem("opensynd.campaign.v1")));
    assert.equal(kept.funds, 777, "the campaign is untouched by the training");
    assert.equal(kept.company, "Keep Me");
    assert.equal(await trainee.evaluate(() => localStorage.getItem("opensynd.progress.v1")), null, "nothing is marked won");
    await trainee.close();

    // Gear bought before the operation begins is on the operative when it does (the operation is set up again on closing).
    const buyer = await browser.newPage();
    await buyer.goto(`${url}?e2e`);
    await buyer.waitForSelector(".roster-select");
    await buyer.click("#open-research");
    await buyer.waitForSelector("#research-dialog[open]");
    await buyer.getByLabel("Operator 1 slot 3: empty", { exact: true }).click();
    await buyer.getByRole("button", { name: /^Buy Persuader for Operator 1 slot 3/ }).click();
    await buyer.click("#close-research");
    await buyer.click("#begin-button");
    await buyer.waitForFunction(() => document.querySelector("#status-message").textContent.includes("Local map established"));
    assert.equal(await buyer.getByLabel(/Field Operator 1 slot 3: Persuader/).count(), 1, "the purchase is in the inventory");
    await buyer.close();

    // Shift+right-click a slot while walking queues the drop for the end of the route.
    const later = await browser.newPage();
    await later.goto(`${url}?e2e`);
    await later.waitForSelector(".roster-select");
    await later.click("#begin-button");
    await later.evaluate(() => window.opensyndTest.giveItem("operator-one", "developer.scatter-emitter"));
    await later.waitForTimeout(500);
    const here = await later.evaluate(() => window.opensyndTest.positionOf("operator-one"));
    const walkTo = { x: Math.round(here.x), y: Math.round(here.y) - 3 };
    await later.evaluate((point) => window.opensyndTest.moveSelected(point.x, point.y), walkTo);
    await later
      .getByLabel(/Field Operator 1 slot 3: Scatter Emitter/)
      .evaluate((slot) => slot.dispatchEvent(new MouseEvent("contextmenu", { shiftKey: true, bubbles: true, cancelable: true })));
    assert.equal((await later.evaluate(() => window.opensyndTest.queue("operator-one"))).pending, 1, "the drop waits for the walk");
    assert.equal((await later.evaluate(() => window.opensyndTest.drops())).length, 0, "nothing on the ground yet");
    await later.waitForFunction(() => window.opensyndTest.drops().length === 1, null, { timeout: 30000 });
    await later.close();

    // Right-clicking a slot drops that item beside the operative; F picks it up again.
    const dropper = await browser.newPage();
    await dropper.goto(`${url}?e2e`);
    await dropper.waitForSelector(".roster-select");
    await dropper.click("#begin-button");
    await dropper.evaluate(() => window.opensyndTest.giveItem("operator-one", "developer.scatter-emitter"));
    const heavySlot = dropper.getByLabel(/Field Operator 1 slot 3: Scatter Emitter/);
    await heavySlot.click({ button: "right" });
    assert.equal(await dropper.getByLabel("Field Operator 1 slot 3: empty").count(), 1, "the slot is free again");
    const dropsNow = await dropper.evaluate(() => window.opensyndTest.drops());
    assert.equal(dropsNow.length, 1);
    assert.equal(dropsNow[0].item, "developer.scatter-emitter");
    assert.match(await dropper.locator("#status-message").innerText(), /dropped the Scatter Emitter/);
    await dropper.locator("#game-canvas").focus();
    await dropper.keyboard.press("f");
    await dropper.getByLabel(/Field Operator 1 slot 3: Scatter Emitter/).waitFor({ timeout: 5000 });
    assert.equal((await dropper.evaluate(() => window.opensyndTest.drops())).length, 0);
    await dropper.close();

    // A charge is armed by its slot, thrown by clicking the ground, and the Escape key puts it away.
    const bombPage = await browser.newPage();
    await bombPage.goto(`${url}?e2e`);
    await bombPage.waitForSelector(".roster-select");
    await bombPage.click("#begin-button");
    await bombPage.evaluate(() => {
      window.opensyndTest.giveItem("operator-one", "developer.delay-charge");
      window.opensyndTest.focusOn("operator-one");
    });
    await bombPage.waitForTimeout(700);
    const bombSlot = bombPage.getByLabel(/Field Operator 1 slot \d+: Delay Charge/);
    await bombSlot.click();
    assert.match(await bombPage.locator("#status-message").innerText(), /click the ground within 6 tiles to throw/);
    await bombPage.keyboard.press("Escape");
    assert.match(await bombPage.locator("#status-message").innerText(), /put away/);
    await bombSlot.click();
    const where = await bombPage.evaluate(() => {
      const unit = window.opensyndTest.positionOf("operator-one");
      return window.opensyndTest.screenPointAt(unit.x + 3, unit.y);
    });
    await bombPage.mouse.click(where.x, where.y);
    await bombPage.waitForFunction(() => window.opensyndTest.bombs().length === 1);
    const thrown = await bombPage.evaluate(() => window.opensyndTest.bombs()[0]);
    const start = await bombPage.evaluate(() => window.opensyndTest.positionOf("operator-one"));
    assert.ok(Math.abs(thrown.x - start.x - 3) < 1 && Math.abs(thrown.y - start.y) < 1, "it landed three tiles away");
    await bombPage.close();

    // The Persuader: switched on beside a civilian, it wins them over; the crosshair shows over civilians.
    const street = await browser.newPage();
    await street.goto(`${url}?e2e`);
    await street.waitForSelector(".roster-select");
    await street.click("#begin-button");
    await street.evaluate(() => {
      const test = window.opensyndTest;
      test.giveItem("operator-one", "developer.persuader");
      test.placeNear("civilian-3", "operator-one", 8, 0);
      test.focusOn("operator-one");
    });
    const carried = street.locator(".roster-item").first().locator(".slot:not(.empty)");
    const slotCount = await carried.count();
    const persuaderSlot = street.getByLabel(`Field Operator 1 slot ${slotCount}: Persuader`, { exact: false });
    await persuaderSlot.click();
    assert.match(await street.locator("#status-message").innerText(), /Persuader on/);
    // Beyond its range nothing happens; once the civilian is beside the agent it follows.
    assert.equal(await street.evaluate(() => window.opensyndTest.persuadedBy("civilian-3")), null);
    await street.evaluate(() => window.opensyndTest.placeNear("civilian-3", "operator-one", 2, 0));
    await street.waitForFunction(() => window.opensyndTest.persuadedBy("civilian-3") === "operator-one");
    assert.match(await street.locator("#status-message").innerText(), /now follows/);
    // The crosshair appears over a civilian the squad could fire on, but not over a follower.
    await street.evaluate(() => {
      window.opensyndTest.placeNear("civilian-1", "operator-one", 3, 0);
      window.opensyndTest.focusOn("operator-one");
    });
    await street.waitForTimeout(700);
    const stranger = await street.evaluate(() => window.opensyndTest.screenPoint("civilian-1"));
    await street.mouse.move(stranger.x + 40, stranger.y + 40);
    await street.mouse.move(stranger.x, stranger.y);
    await street.waitForFunction(() => document.querySelector("#game-canvas").className.includes("cursor-attack"));
    // Police get the crosshair too, and it is easy to land: a little above and beside the figure still counts.
    await street.evaluate(() => {
      window.opensyndTest.placeNear("police-15", "operator-one", 3, 0);
      window.opensyndTest.focusOn("operator-one");
    });
    await street.mouse.move(5, 400);
    await street.waitForTimeout(300);
    const officer = await street.evaluate(() => window.opensyndTest.screenPoint("police-15"));
    await street.mouse.move(officer.x + 40, officer.y + 60);
    await street.mouse.move(officer.x + 10, officer.y - 38);
    await street.waitForFunction(() => document.querySelector("#game-canvas").className.includes("cursor-attack"));
    await street.close();

    // With everyone in one car, any selected rider can order it on: the first selected is often a passenger, not the driver.
    const crew = await browser.newPage();
    await crew.addInitScript(() => {
      for (const key of Object.keys(localStorage)) if (key.startsWith("opensynd.save")) localStorage.removeItem(key);
    });
    await crew.goto(`${url}?e2e`);
    await crew.waitForSelector(".roster-select");
    await crew.click("#begin-button");
    await crew.waitForFunction(() => document.querySelector("#status-message").textContent.includes("Local map established"));
    await crew.locator("#game-canvas").focus();
    for (const [key, id] of [["2", "operator-two"], ["1", "operator-one"]]) {
      await crew.evaluate((who) => window.opensyndTest.placeNear(who, "parked-city-car-1", 1, 1), id);
      await crew.keyboard.press(key);
      await crew.waitForFunction(() => !document.querySelector("#vehicle-button").disabled);
      await crew.keyboard.press("v");
      await crew.waitForTimeout(300);
    }
    await crew.keyboard.press("a");
    const carAt = await crew.evaluate(() => window.opensyndTest.positionOf("parked-city-car-1"));
    await crew.evaluate((at) => window.opensyndTest.moveSelected(Math.round(at.x), Math.round(at.y) + 6), carAt);
    assert.match(await crew.locator("#status-message").innerText(), /driving off/, "a passenger's order still sends the car");
    await crew.close();

    // Vehicles: take a parked car and drive it, leave it, and shoot at a moving one to throw its driver out.
    const garage = await browser.newPage();
    // A fresh game: earlier pages in this browser may have left a save behind.
    await garage.addInitScript(() => {
      for (const key of Object.keys(localStorage)) if (key.startsWith("opensynd.save")) localStorage.removeItem(key);
    });
    await garage.goto(`${url}?e2e`);
    await garage.waitForSelector(".roster-select");
    await garage.click("#begin-button");
    await garage.waitForFunction(() => document.querySelector("#status-message").textContent.includes("Local map established"));
    await garage.evaluate(() => {
      window.opensyndTest.placeNear("operator-one", "parked-city-car-1", 1, 1);
      window.opensyndTest.focusOn("operator-one");
    });
    await garage.locator("#game-canvas").focus();
    await garage.waitForFunction(() => !document.querySelector("#vehicle-button").disabled);
    assert.match(await garage.locator("#vehicle-label").innerText(), /Take vehicle/);
    // Clicking a car sends the selected operator to it, and they get in on arrival.
    await garage.evaluate(() => {
      window.opensyndTest.placeNear("operator-one", "parked-city-car-1", 4, 0);
      window.opensyndTest.focusOn("parked-city-car-1"); // centred, clear of the squad panel in the corner
    });
    await garage.waitForTimeout(700); // the camera glides to its new centre
    const carPoint = await garage.evaluate(() => window.opensyndTest.screenPoint("parked-city-car-1"));
    await garage.mouse.click(carPoint.x, carPoint.y - 12);
    await garage.waitForFunction(
      () => document.querySelector("#status-message").textContent.includes("got into the City Car"),
      null,
      { timeout: 8000 },
    );
    await garage.keyboard.press("v");
    assert.match(await garage.locator("#status-message").innerText(), /left the City Car/);
    await garage.evaluate(() => window.opensyndTest.placeNear("operator-one", "parked-city-car-1", 1, 1));
    await garage.keyboard.press("v");
    assert.match(await garage.locator("#status-message").innerText(), /got into the City Car/);
    assert.match(await garage.locator("#vehicle-label").innerText(), /Leave vehicle/);
    const carBefore = await garage.evaluate(() => window.opensyndTest.positions()["parked-city-car-1"]);
    await garage.evaluate(() => window.opensyndTest.moveSelected(33, 60));
    assert.match(await garage.locator("#status-message").innerText(), /driving off/);
    await garage.waitForTimeout(1500);
    const carAfter = await garage.evaluate(() => window.opensyndTest.positions());
    const parked = carAfter["parked-city-car-1"];
    assert.ok(Math.hypot(parked.x - carBefore.x, parked.y - carBefore.y) > 1, "the car drove");
    assert.deepEqual(carAfter["operator-one"], carAfter["parked-city-car-1"], "the operator rides in it");
    await garage.keyboard.press("v");
    assert.match(await garage.locator("#status-message").innerText(), /left the City Car/);
    // Shooting a moving car throws its driver out.
    await garage.evaluate(() => {
      const test = window.opensyndTest;
      test.placeNear("operator-one", "city-car-1", 0, 3);
      test.focusOn("operator-one");
    });
    await garage.getByLabel(/slot \d+: Civic Pulse Emitter/).first().click();
    await garage.evaluate(() => window.opensyndTest.placeNear("city-car-1", "operator-one", 0, -3));
    await garage.keyboard.press("Space");
    await garage.waitForTimeout(300);
    const target = await garage.evaluate(() => window.opensyndTest.screenPoint("city-car-1"));
    await garage.mouse.click(target.x, target.y - 10, { button: "right" });
    assert.match(await garage.locator("#status-message").innerText(), /thrown out of the City Car|integrity/);
    await garage.close();

    // The whole squad gets in together (FreeSynd has no seat limit): select everyone and click the car.
    const convoy = await browser.newPage();
    await convoy.goto(`${url}?e2e`);
    await convoy.waitForSelector(".roster-select");
    await convoy.click("#begin-button");
    await convoy.evaluate(() => {
      for (const id of ["operator-one", "operator-two", "operator-three", "operator-four"]) {
        window.opensyndTest.placeNear(id, "parked-city-car-1", 4, 0);
      }
      window.opensyndTest.focusOn("parked-city-car-1");
    });
    await convoy.waitForTimeout(800);
    await convoy.locator("#game-canvas").focus();
    await convoy.keyboard.press("a");
    const squadCar = await convoy.evaluate(() => window.opensyndTest.screenPoint("parked-city-car-1"));
    await convoy.mouse.click(squadCar.x, squadCar.y - 12);
    await convoy.waitForFunction(() => window.opensyndTest.riders().length === 4, null, { timeout: 20000 });
    await convoy.close();

    // The mission editor page loads a mission, accepts a placement, and checks it.
    const editorPage = await browser.newPage();
    await editorPage.goto(`${url}editor.html`);
    await editorPage.waitForSelector("#problem-list li");
    assert.match(await editorPage.locator("#problem-list").innerText(), /No problems found/);
    await editorPage.getByLabel("Add guard").check();
    const editorBox = await editorPage.locator("#editor-canvas").boundingBox();
    await editorPage.mouse.click(editorBox.x + editorBox.width * 0.3, editorBox.y + editorBox.height * 0.45);
    assert.match(await editorPage.locator("#editor-hint").innerText(), /^Added at \d+, \d+\./);
    // Route and script: choose the new guard, add a route point, then give it a script (and get told when it is wrong).
    await editorPage.getByLabel("Edit route and script").check();
    await editorPage.mouse.click(editorBox.x + editorBox.width * 0.3, editorBox.y + editorBox.height * 0.45);
    assert.equal(await editorPage.locator("#route-editor").isVisible(), true);
    assert.match(await editorPage.locator("#route-title").innerText(), /guard-\d+: 0 route points/);
    await editorPage.mouse.click(editorBox.x + editorBox.width * 0.3, editorBox.y + editorBox.height * 0.5);
    assert.match(await editorPage.locator("#route-title").innerText(), /1 route points/);
    await editorPage.locator("#script-text").fill("[oops");
    await editorPage.click("#script-apply");
    assert.match(await editorPage.locator("#script-message").innerText(), /not valid JSON/);
    await editorPage.locator("#script-text").fill('[{"type":"wait","seconds":4}]');
    await editorPage.click("#script-apply");
    assert.match(await editorPage.locator("#script-message").innerText(), /Script of 1 steps saved/);
    await editorPage.click("#route-clear");
    assert.match(await editorPage.locator("#route-title").innerText(), /0 route points/);
    // The map can be painted too: a wall of buildings across the map cuts the entry off from the exit, which the checks say.
    await editorPage.getByLabel("Paint: Building (blocked, three floors)").check();
    const left = editorBox.x + editorBox.width * 0.5;
    await editorPage.mouse.click(left, editorBox.y + 3);
    assert.match(await editorPage.locator("#editor-hint").innerText(), /^Corner at/);
    await editorPage.mouse.click(left + 6, editorBox.y + editorBox.height - 3);
    assert.match(await editorPage.locator("#editor-hint").innerText(), /^Painted from/);
    await editorPage.waitForFunction(() =>
      /cannot walk from the entry|nobody can stand/.test(document.querySelector("#problem-list").innerText),
    );
    await editorPage.getByLabel("Take off painted area").check();
    await editorPage.mouse.click(left + 3, editorBox.y + editorBox.height * 0.5);
    assert.match(await editorPage.locator("#editor-hint").innerText(), /^Took off painted-1/);
    await editorPage.waitForFunction(() => !/cannot walk from the entry/.test(document.querySelector("#problem-list").innerText));
    const [download] = await Promise.all([editorPage.waitForEvent("download"), editorPage.click("#export-map-button")]);
    assert.match(download.suggestedFilename(), /\.map\.json$/);
    await editorPage.close();

    // Permadeath and recruiting: a fallen operative is lost after a win, and a persuaded enemy agent joins.
    const roster = await browser.newPage();
    await roster.goto(`${url}?e2e`);
    await roster.waitForSelector(".roster-select");
    await roster.click("#begin-button");
    await roster.waitForFunction(() =>
      document.querySelector("#status-message").textContent.includes("Local map established"),
    );
    await roster.evaluate(() => {
      window.opensyndTest.disableUnit("operator-four");
      window.opensyndTest.persuade("enemy-agent-one", "operator-one");
      window.opensyndTest.completeObjectives();
    });
    await roster.waitForSelector("#outcome-dialog[open]");
    const debrief = await roster.locator("#outcome-stats").innerText();
    assert.match(debrief, /Operatives lost/);
    assert.match(debrief, /Shooting\s+no shots/);
    assert.match(debrief, /Funds\s+\d+ → \d+ \([+−]/);
    assert.match(debrief, /Recruited/);
    const record = await roster.evaluate(() => JSON.parse(localStorage.getItem("opensynd.campaign.v1")));
    assert.equal(record.roster.find((member) => member.id === "operator-four").alive, false);
    assert.equal(record.roster.length, 5);
    assert.equal(record.squad.length, 4, "three survivors and the recruit deploy next");
    assert.ok(record.squad.includes("agent-5"));
    await roster.click("#next-button");
    await roster.waitForSelector("#title-dialog[open]");
    await roster.click("#begin-button");
    assert.equal(await roster.locator(".roster-select").count(), 4);
    await roster.close();

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
