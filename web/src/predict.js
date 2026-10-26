// SPDX-License-Identifier: GPL-2.0-or-later

// Showing the player's own agents without waiting for the server. Everyone else is shown a little in the past (see createSmoother in
// online.js), but your own agents answer your clicks at once: when an order to move is given it is carried out on the page's own
// copy straight away, and between the server's reports each agent is shown where the game's own movement rules (advanceUnits) would
// have taken them from the last report. The server stays the authority: every report pulls the picture back to it, smoothly, and a
// refused order is simply undone.
import { FIXED_STEP_SECONDS, advanceUnits } from "./simulation.js";

const MAX_AHEAD_SECONDS = 0.6; // never run ahead of the last report by more than this (a connection that has stalled)

const copyPath = (path) => (Array.isArray(path) ? path.map((point) => ({ ...point })) : []);

export function createPredictor({ blendPerSecond = 14, snapDistance = 2 } = {}) {
  const anchors = new Map(); // unit id -> { position, path, step, seq, previous }: the last known state to move on from
  const shown = new Map(); // unit id -> where the unit was drawn last frame

  return {
    /** The server reported this unit (its state now is `unit`, at game step `step`). */
    report(unit, step) {
      anchors.set(unit.id, { position: { ...unit.position }, path: copyPath(unit.path), step, seq: null, previous: null });
    },

    /** An order was given on the page for `unit` (already carried out on its copy): move on from here, at once, until it is answered. */
    order(unit, step, seq) {
      const current = anchors.get(unit.id) ?? null;
      // What to go back to if the order is refused: the last thing the server said, not an earlier guess.
      const previous = current && current.seq !== null ? current.previous : current;
      anchors.set(unit.id, {
        position: { ...(shown.get(unit.id) ?? unit.position) },
        path: copyPath(unit.path),
        step,
        seq,
        previous,
      });
    },

    /** The server answered these orders (whether it carried them out or not): drop what was guessed and go back to what it last said. */
    answered(seqs) {
      const done = new Set(seqs);
      for (const [id, anchor] of anchors) {
        if (anchor.seq === null || !done.has(anchor.seq)) continue;
        if (anchor.previous) anchors.set(id, anchor.previous);
        else anchors.delete(id);
      }
    },

    /** Set the positions of the player's own `units` for drawing, `nowStep` being the game step the server is at as far as we can tell. */
    show(units, ids, nowStep, deltaSeconds) {
      for (const unit of units) {
        const anchor = anchors.get(unit.id);
        if (!anchor || !ids.includes(unit.id)) continue;
        if (unit.inVehicle || unit.disabled) {
          shown.delete(unit.id); // carried by a vehicle or down: shown as the server says
          continue;
        }
        const ghost = { ...unit, position: { ...anchor.position }, path: copyPath(anchor.path) };
        const seconds = Math.min(MAX_AHEAD_SECONDS, Math.max(0, (nowStep - anchor.step) * FIXED_STEP_SECONDS));
        advanceUnits([ghost], seconds);
        const before = shown.get(unit.id);
        const gap = before ? Math.hypot(ghost.position.x - before.x, ghost.position.y - before.y) : Infinity;
        const keep = 1 - Math.exp(-blendPerSecond * Math.max(0, deltaSeconds));
        const next =
          gap > snapDistance
            ? ghost.position
            : { x: before.x + (ghost.position.x - before.x) * keep, y: before.y + (ghost.position.y - before.y) * keep };
        shown.set(unit.id, next);
        unit.position = { ...next };
      }
    },

    clear() {
      anchors.clear();
      shown.clear();
    },
  };
}
