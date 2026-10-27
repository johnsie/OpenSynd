// SPDX-License-Identifier: GPL-2.0-or-later

// Wait briefly for a freshly restarted production server and require it to report the content fingerprint built for the website.
const expected = process.argv[2];
const address = process.env.SERVER_HEALTH_URL ?? "http://127.0.0.1:8791/api/health";
if (!expected) throw new Error("usage: node deploy/check-server.mjs <expected-content-hash>");

let lastProblem = "did not answer";
for (let attempt = 0; attempt < 20; attempt += 1) {
  try {
    const response = await fetch(address);
    const health = response.ok ? await response.json() : null;
    if (health?.ok && health.content === expected) process.exit(0);
    lastProblem = health?.content ? `reported content ${health.content}` : `returned HTTP ${response.status}`;
  } catch (error) {
    lastProblem = error.message;
  }
  await new Promise((resolve) => setTimeout(resolve, 250));
}
console.error(`server health check failed: ${lastProblem}; expected content ${expected}`);
process.exit(1);
