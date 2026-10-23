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
    // The list shows what is open to play by default (one operation on a fresh browser); All lists the 50 operations.
    assert.equal(await missionButtons.count(), 1);
    await page.click("#filter-all");
    assert.equal(await missionButtons.count(), 50);
    assert.equal(await page.locator(".map-region").count(), 50, "every territory is on the world map");
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
    assert.equal(await page.getByLabel(/slot \d+: Heavy Pulse Emitter/).count(), 1);
    assert.match(await page.locator("#achievement-toast").innerText(), /Scavenger/);
    assert.equal(await page.locator(".roster-item").first().locator(".slot:not(.empty)").count(), 3);
    assert.equal(await page.getByLabel("Field Operator 1 slot 3: Heavy Pulse Emitter", { exact: false }).count(), 1);
    // The watcher has nothing left to loot, so the button waits for another body.
    await page.waitForFunction(() => document.querySelector("#loot-button").disabled);
    // Click-to-pickup: the pointer changes over fallen gear and a click sends an operator to collect it.
    await page.evaluate(() => {
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
    await page.getByLabel(/slot \d+: Shadow Cloak/).first().waitFor({ timeout: 20000 });
    assert.equal(await page.locator(".roster-item").first().locator(".slot:not(.empty)").count(), 4);
    assert.equal(await page.getByLabel("Field Operator 1 slot 4: Shadow Cloak", { exact: false }).count(), 1);
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
    await page.evaluate(() => window.opensyndTest.setFunds(300));
    await page.click("#open-research");
    await page.waitForSelector("#research-dialog[open]");
    const labFunds = async () =>
      Number((await page.locator("#research-funds").innerText()).replace(/\D/g, ""));
    assert.equal(await labFunds(), 300);
    // Two tabs: Squad (roster, body parts, loadout) and Research. The operative picker belongs to the squad tab.
    assert.equal(await page.locator("#roster-list").isVisible(), true);
    assert.equal(await page.locator("#research-items").isVisible(), false);
    assert.equal(await page.locator("#research-tracks").isVisible(), true, "body parts are on the squad tab");
    await page.locator("#research-tracks button").first().click();
    assert.match(await page.locator("#research-tracks").innerText(), /Legs · tier 1 of 3/);
    assert.equal(await labFunds(), 294);
    await page.click("#tab-lab-research");
    // Research runs on game time: pick an item and a funding level, then hours pass and it is paid for by the hour.
    assert.match(await page.locator("#research-dial").innerText(), /Nothing is being researched/);
    await page.getByRole("button", { name: /^Research Scanner/ }).click();
    assert.match(await page.locator("#research-dial").innerText(), /Funding for Scanner/);
    assert.equal(await page.getByRole("button", { name: /^Research Rotary Cannon/ }).count(), 0, "needs the machine pistol first");
    await page.evaluate(() => window.opensyndTest.advanceHours(70));
    assert.match(await page.locator("#research-items").innerText(), /Scanner\s+RESEARCHED/);
    const base = await labFunds();
    assert.ok(base >= 220, `research cost about 60 funds, tax came in: ${base}`);

    // Eight picture slots per operative: two are filled (the starting kit; unresearched loot is not kept).
    await page.click("#tab-lab-squad");
    const squads = page.locator(".armoury-card");
    assert.equal(await squads.count(), 1, "the chosen operative's slots");
    assert.equal(await page.locator("#roster-list .roster-pick:not(:disabled)").count(), 4);
    assert.equal(await squads.first().locator(".slot").count(), 8);
    assert.equal(await squads.first().locator(".slot:not(.empty)").count(), 2);
    assert.equal(await squads.first().locator(".slot svg").count(), 2, "each filled slot shows a picture");

    // Buy a scanner into slot 3, then two pulse emitters: an operative can carry several of the same weapon.
    await page.getByLabel("Operator 1 slot 3: empty", { exact: true }).click();
    await page.getByRole("button", { name: "Buy Scanner for Operator 1 slot 3, 40 funds" }).click();
    assert.equal(await labFunds(), base - 40);
    await page.getByLabel("Operator 1 slot 4: empty", { exact: true }).click();
    await page.getByRole("button", { name: "Buy Civic Pulse Emitter for Operator 1 slot 4, 15 funds" }).click();
    await page.getByLabel("Operator 1 slot 5: empty", { exact: true }).click();
    await page.getByRole("button", { name: "Buy Civic Pulse Emitter for Operator 1 slot 5, 15 funds" }).click();
    assert.equal(await labFunds(), base - 70);
    assert.equal(await squads.first().locator(".slot:not(.empty)").count(), 5);
    // Swapping refunds half the price of what it replaces: the spare emitter (7 back) pays toward a repair kit (10).
    await page.getByLabel("Operator 1 slot 5: Civic Pulse Emitter", { exact: true }).click();
    await page.getByRole("button", { name: "Buy Field Repair Kit for Operator 1 slot 5, 3 funds" }).click();
    assert.equal(await labFunds(), base - 73);
    // Selling returns half the price again.
    await page.getByRole("button", { name: /Sell Field Repair Kit · \+5 funds/ }).click();
    assert.equal(await labFunds(), base - 68);
    assert.equal(await squads.first().locator(".slot:not(.empty)").count(), 4);

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
    // The purchases are in operator 1's squares when the operation starts: four items, two of them pulse emitters.
    assert.equal(await page.locator(".roster-item").first().locator(".slot:not(.empty)").count(), 4);
    assert.equal(await page.getByLabel("Field Operator 1 slot 3: Scanner", { exact: false }).count(), 1);
    assert.equal(await page.getByLabel("Field Operator 1 slot 4: Civic Pulse Emitter", { exact: false }).count(), 1);


    // Queued orders: walk a route, then pick up a body's gear (Shift+click), all in one sweep; Esc clears the queue.
    const queuePage = await browser.newPage();
    await queuePage.goto(`${url}?e2e`);
    await queuePage.waitForSelector(".roster-select");
    await queuePage.click("#begin-button");
    await queuePage.evaluate(() => {
      const test = window.opensyndTest;
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
    await street.mouse.move(officer.x + 14, officer.y - 55);
    await street.waitForFunction(() => document.querySelector("#game-canvas").className.includes("cursor-attack"));
    await street.close();

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

    // The mission editor page loads a mission, accepts a placement, and checks it.
    const editorPage = await browser.newPage();
    await editorPage.goto(`${url}editor.html`);
    await editorPage.waitForSelector("#problem-list li");
    assert.match(await editorPage.locator("#problem-list").innerText(), /No problems found/);
    await editorPage.getByLabel("Add guard").check();
    const editorBox = await editorPage.locator("#editor-canvas").boundingBox();
    await editorPage.mouse.click(editorBox.x + editorBox.width * 0.3, editorBox.y + editorBox.height * 0.45);
    assert.match(await editorPage.locator("#editor-hint").innerText(), /^Added at \d+, \d+\./);
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
