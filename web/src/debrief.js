// SPDX-License-Identifier: GPL-2.0-or-later

// What the debrief counts: shots and hits for each operator, and who they put down, by kind of person. Pure rules;
// the app feeds in combat events and prints the lines.

export const KILL_LABELS = Object.freeze({
  "enemy-agent": ["enemy agent", "enemy agents"],
  guard: ["guard", "guards"],
  criminal: ["criminal", "criminals"],
  civilian: ["civilian", "civilians"],
  police: ["police officer", "police officers"],
});

export function newDebriefCounts() {
  return { shooters: {}, kills: {} };
}

const entry = (counts, id) => (counts.shooters[id] ??= { shots: 0, hits: 0, kills: 0 });

/** Count one shot from a squad member; a "damage" event is a hit, a "shot" event (it landed beside) a miss. */
export function recordShot(counts, attackerId, hit) {
  const record = entry(counts, attackerId);
  record.shots += 1;
  if (hit) record.hits += 1;
}

/** Count a kill by a squad member of a victim of this role. */
export function recordKill(counts, attackerId, role) {
  entry(counts, attackerId).kills += 1;
  counts.kills[role] = (counts.kills[role] ?? 0) + 1;
}

/** "7 of 12 shots (58%)", or "no shots". */
export function accuracyText(shots, hits) {
  if (!shots) return "no shots";
  return `${hits} of ${shots} shots (${Math.round((hits / shots) * 100)}%)`;
}

/** The squad's total shots and hits. */
export function totals(counts) {
  return Object.values(counts.shooters).reduce(
    (sum, record) => ({ shots: sum.shots + record.shots, hits: sum.hits + record.hits }),
    { shots: 0, hits: 0 },
  );
}

/** "3 enemy agents, 1 guard", most numerous first; empty when nobody was put down. */
export function killsText(counts) {
  return Object.entries(counts.kills)
    .filter(([, count]) => count > 0)
    .sort((left, right) => right[1] - left[1])
    .map(([role, count]) => `${count} ${KILL_LABELS[role]?.[count === 1 ? 0 : 1] ?? role}`)
    .join(", ");
}
