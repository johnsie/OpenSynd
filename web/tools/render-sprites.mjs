// SPDX-License-Identifier: GPL-2.0-or-later

// Renders the CC0 Quaternius human, in a shared military uniform, to 8-direction
// sprite sheets for the operatives and the opposition.
// Usage: node tools/render-sprites.mjs   (CHROMIUM_PATH selects the browser)

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright-core";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
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

const human = "/art-source/quaternius-animated-human/AnimatedHuman.fbx";

// One shared uniform: palette is skin, boots, hair, jacket, trousers. Operatives
// differ only in skin tone so the squad reads as uniformed but not cloned.
// A worn khaki trench coat over dark gunmetal, with neon cyan piping, a visor
// and a metal cybernetic forearm gives the cyberpunk look.
const uniform = {
  palette: [null, [26, 26, 32], [20, 16, 14], [96, 88, 70], [40, 46, 58]],
  kit: {
    rig: [34, 40, 50],
    coat: [112, 102, 82],
    metal: [120, 130, 146],
    belt: [14, 16, 20],
    boots: [18, 18, 22],
    beret: [28, 34, 48],
    glow: [66, 214, 208],
  },
};
const skins = {
  "operative-one": [255, 209, 159],
  "operative-two": [196, 146, 104],
  "operative-three": [156, 114, 72],
  "operative-four": [233, 186, 140],
};
// Opposition wear the same uniform with a crimson beret; only the hat differs.
const watcherSkins = {
  "watcher-one": [233, 186, 140],
  "watcher-two": [196, 146, 104],
};
const humanAnimations = {
  idle: { pick: "Idle", frames: 4, window: 2 },
  // A serious march: quick cadence, little arm swing, a steady head and level shoulders.
  walk: {
    pick: "Walk",
    frames: 8,
    playback: 0.66,
    posture: {
      LeftShoulder: 0.6,
      RightShoulder: 0.6,
      LeftArm: 0.7,
      RightArm: 0.7,
      LeftForeArm: 0.45,
      RightForeArm: 0.45,
      Spine: 0.5,
      Spine1: 0.5,
      Spine2: 0.5,
      Neck: 0.8,
      Head: 0.8,
    },
  },
};
const humanJob = (name, skin, kit) => ({
  name,
  options: {
    model: human,
    animations: humanAnimations,
    palette: uniform.palette.map((color, index) => (index === 0 ? skin : color)),
    kit,
  },
});
const jobs = [
  ...Object.entries(skins).map(([name, skin]) => humanJob(name, skin, uniform.kit)),
  ...Object.entries(watcherSkins).map(([name, skin]) =>
    humanJob(name, skin, { ...uniform.kit, beret: [150, 28, 40] }),
  ),
];

// Armed variants: the same characters holding each weapon in both hands, for when it is selected.
for (const job of [...jobs]) {
  for (const weapon of ["pulse", "heavy-pulse"]) {
    jobs.push({ name: `${job.name}-${weapon}`, options: { ...job.options, aim: weapon } });
  }
}

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
  const manifest = { source: "Quaternius Animated Human (CC0-1.0)", sheets: {} };
  for (const { name, options } of jobs) {
    const result = await page.evaluate((job) => window.renderSheet(job), options);
    await writeFile(join(output, `${name}.png`), Buffer.from(result.png.split(",")[1], "base64"));
    manifest.sheets[name] = { file: `${name}.png`, ...result.meta };
    console.log(`rendered ${name}`);
  }
  await writeFile(join(output, "sprites.json"), `${JSON.stringify(manifest, null, 2)}\n`);
} finally {
  await browser.close();
  server.close();
}
