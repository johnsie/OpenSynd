// SPDX-License-Identifier: GPL-2.0-or-later

// Hot updates. A running copy of the game stays on the release it started from (its code, content and art are fetched from that
// release's own folder, which the server keeps), so a new deploy never changes anything under someone who is playing. The page
// notices a newer release by polling the site's build-meta.json, says so quietly, and switches over only when that cannot cost
// the player anything: between operations, with the tab out of sight, or when the player asks. The campaign, settings and
// saves live in the browser, so they carry over to the new release untouched.

export const CHECK_SECONDS = 60;
export const IDLE_SECONDS = 20;

/** The folder the running code was loaded from (the release folder when the site pins releases, the site root otherwise). */
export const releaseBase = (moduleUrl) => new URL(".", moduleUrl).href;

/** Whether the published release is a different one from the running one. Unknown revisions never trigger an update. */
export function isNewerRelease(running, published) {
  return Boolean(running) && Boolean(published) && running !== "working-tree" && published !== "working-tree" && running !== published;
}

/**
 * When it is safe to switch on its own: an update is waiting, no operation is under way (the campaign is already kept in the
 * browser, but a mission in progress is not), no dialog is mid-way through something, and the player is away from the page
 * (tab hidden) or has left it idle for a while.
 */
export function canApplyQuietly({ waiting, operationActive, hidden, idleSeconds }) {
  if (!waiting || operationActive) return false;
  return hidden || idleSeconds >= IDLE_SECONDS;
}

/**
 * Watches for a newer release. `fetchPublished` returns the latest published revision (or null); `onWaiting` is told once, with
 * the new revision, when one appears. Returns a function that stops the watching.
 */
export function watchForUpdates({ running, fetchPublished, onWaiting, every = CHECK_SECONDS, timers = globalThis }) {
  let told = null;
  let stopped = false;
  const check = async () => {
    if (stopped) return;
    let published = null;
    try {
      published = await fetchPublished();
    } catch {
      return; // offline or the site is mid-deploy: try again next time
    }
    if (isNewerRelease(running, published) && published !== told) {
      told = published;
      onWaiting(published);
    }
  };
  const handle = timers.setInterval(check, every * 1000);
  return () => {
    stopped = true;
    timers.clearInterval(handle);
  };
}
