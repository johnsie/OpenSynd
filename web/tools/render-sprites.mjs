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
const humanJob = (name, skin, kit, palette = null) => ({
  name,
  options: {
    model: human,
    animations: humanAnimations,
    palette: palette ?? uniform.palette.map((color, index) => (index === 0 ? skin : color)),
    kit,
  },
});
const jobs = [
  ...Object.entries(skins).map(([name, skin]) => humanJob(name, skin, uniform.kit)),
  ...Object.entries(watcherSkins).map(([name, skin]) =>
    humanJob(name, skin, { ...uniform.kit, beret: [150, 28, 40] }),
  ),
];

// The city's people: civilians in street clothes and police, none in the squad's trench coat.
const street = {
  boots: [14, 14, 18],
  belt: [16, 18, 24],
  metal: [150, 160, 176],
};
const bystanderJobs = [
  // Women: dark clothes, black tights (the trousers colour) and a short skirt.
  ["civilian-woman-1", [255, 209, 159], [40, 32, 44], [92, 72, 98], [84, 82, 92],
    { style: "woman", skirt: [52, 44, 60], top: [92, 72, 98], hair: [40, 32, 44], glow: [120, 84, 120] }],
  ["civilian-woman-2", [196, 146, 104], [88, 56, 44], [60, 92, 96], [62, 60, 70],
    { style: "woman", skirt: [38, 52, 56], top: [60, 92, 96], hair: [88, 56, 44], glow: [80, 120, 120] }],
  // Men: worn street clothes in dull, muted colours with a faint trim: a pressured world, not a bright one.
  ["civilian-man-1", [233, 186, 140], [20, 16, 14], [66, 56, 76], [30, 32, 42],
    { style: "man", collar: [52, 46, 62], crest: [110, 84, 120], glow: [110, 84, 120] }],
  ["civilian-man-2", [156, 114, 72], [18, 18, 22], [48, 70, 72], [26, 30, 38],
    { style: "man", collar: [40, 58, 60], crest: [70, 100, 100], glow: [70, 100, 100], headgear: "cap" }],
  ["civilian-man-3", [255, 209, 159], [40, 30, 18], [96, 70, 56], [32, 30, 36],
    { style: "man", collar: [78, 56, 44], crest: [150, 120, 70], glow: [150, 120, 70], headgear: "bare" }],
  // Police: navy armour, a visored helmet and a red and blue light bar.
  ["police-1", [233, 186, 140], [20, 16, 14], [22, 34, 64], [16, 20, 34],
    { style: "police", armour: [34, 48, 84], helmet: [24, 34, 60], glow: [74, 163, 255] }],
  ["police-2", [196, 146, 104], [20, 16, 14], [22, 34, 64], [16, 20, 34],
    { style: "police", armour: [30, 42, 76], helmet: [20, 30, 54], glow: [74, 163, 255] }],
];
for (const [name, skin, hair, jacket, trousers, extra] of bystanderJobs) {
  jobs.push(
    humanJob(name, skin, { ...street, ...extra }, [skin, street.boots, hair, jacket, trousers]),
  );
}
const isOnlyNew = (name) => ["civilian-", "police-", "guard-", "criminal-"].some((prefix) => name.startsWith(prefix));

// Corporate guards and street criminals (neither wears the squad's trench coat).
const hostileJobs = [
  ["guard-1", [233, 186, 140], [20, 16, 14], [44, 58, 50], [38, 48, 42],
    { style: "guard", armour: [56, 72, 64], helmet: [34, 44, 40], cloth: [44, 58, 50], glow: [240, 170, 50] }],
  ["guard-2", [196, 146, 104], [20, 16, 14], [52, 54, 60], [40, 42, 48],
    { style: "guard", armour: [70, 72, 80], helmet: [38, 40, 48], cloth: [52, 54, 60], glow: [240, 170, 50] }],
  ["criminal-1", [233, 186, 140], [20, 16, 14], [28, 24, 30], [52, 56, 40],
    { style: "criminal", vest: [34, 28, 34], cloth: [180, 40, 50], glow: [255, 138, 74], crest: [255, 138, 74] }],
  ["criminal-2", [156, 114, 72], [20, 16, 14], [32, 30, 44], [44, 44, 56],
    { style: "criminal", vest: [48, 36, 70], cloth: [30, 120, 90], glow: [121, 213, 155], crest: [121, 213, 155] }],
];
for (const [name, skin, hair, jacket, trousers, extra] of hostileJobs) {
  jobs.push(humanJob(name, skin, { ...street, ...extra }, [skin, street.boots, hair, jacket, trousers]));
}

// Armed variants: the same characters holding each weapon in both hands, for when it is selected.
for (const job of [...jobs]) {
  // Only the police ever hold a weapon among the city's people, and only a pistol.
  const single = ["police-", "guard-", "criminal-"].some((prefix) => job.name.startsWith(prefix));
  const weapons = job.name.startsWith("civilian-") ? [] : single ? ["pulse"] : ["pulse", "heavy-pulse"];
  for (const weapon of weapons) {
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
  // ONLY=street renders just the civilians and police, leaving the existing sheets untouched.
  const onlyStreet = ["street", "police", "hostile", "women", "civilians"].includes(process.env.ONLY ?? "");
  let manifest = { source: "Quaternius Animated Human (CC0-1.0)", sheets: {} };
  if (onlyStreet) manifest = JSON.parse(await readFile(join(output, "sprites.json"), "utf8"));
  for (const { name, options } of jobs) {
    if (onlyStreet) {
      const groups = { police: ["police-"], hostile: ["guard-", "criminal-"], women: ["civilian-woman"], civilians: ["civilian-"] };
      const wanted = groups[process.env.ONLY];
      if (wanted ? !wanted.some((prefix) => name.startsWith(prefix)) : !isOnlyNew(name)) continue;
    }
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
