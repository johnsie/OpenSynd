// SPDX-License-Identifier: GPL-2.0-or-later

// The shared world: every territory has a holder (a player, or the rival company that has it until somebody takes it), a defence
// level, and a shield after it has been raided. These are the rules for that, as plain functions of the state so they are easy to test,
// and the operation a raid is played as: the territory's defence operation, with as many of its agents as its defence level allows.
export const HOUR_MS = 3_600_000;
export const RAID_COST = 300;
export const SIGNUP_FUNDS = 1500;
export const MAX_DEFENCE = 5;
export const SHIELD_AFTER_DEFENDED_HOURS = 6;
export const SHIELD_AFTER_CAPTURED_HOURS = 12;
export const MAX_INCOME_HOURS = 72; // income stops building up after three days away

/** The season a time falls in: a calendar month. Each season the map starts afresh (funds are kept). */
export function seasonOf(milliseconds) {
  const date = new Date(milliseconds);
  return date.getUTCFullYear() * 12 + date.getUTCMonth();
}

/** What raising a territory's defence to this level costs (from the level below). */
export const upgradeCost = (level) => level * 500;

/** The defence a territory nobody holds has, from its place in the world (more people, more guards). */
export function rivalDefence(territory) {
  const people = territory.population / 1_000_000;
  return Math.min(3, Math.max(1, Math.round(people / 3)));
}

/** Funds a territory pays each hour to the player who holds it. */
export const incomePerHour = (territory) => Math.max(1, Math.round((territory.population / 1_000_000) * 40));

/** What a player's territories have paid since they last collected (never more than three days' worth). */
export function accrued(territories, collectedAt, now) {
  const hours = Math.min(MAX_INCOME_HOURS, Math.max(0, (now - collectedAt) / HOUR_MS));
  return Math.floor(hours * territories.reduce((total, territory) => total + incomePerHour(territory), 0));
}

/**
 * May this player raid this territory? `heldBy` is the holder's name, or null when it is the rival company's; `holderCount` how many
 * territories the holder has; `yours` how many the raider has. Returns { ok: true } or { ok: false, reason }.
 */
export function canRaid({ raiderId, holderId, holderCount, yours, shieldUntil, now, funds }) {
  if (holderId === raiderId) return { ok: false, reason: "That territory is yours." };
  if (shieldUntil > now) return { ok: false, reason: "It was raided recently and is shielded for a while." };
  // A raid on a player is matched by strength: nobody picks on someone with far less than they have.
  if (holderId !== null && holderCount * 2 < yours) return { ok: false, reason: "That player has far less than you. Pick a bigger target." };
  if (funds < RAID_COST) return { ok: false, reason: `A raid costs ${RAID_COST} funds.` };
  return { ok: true };
}

const fraction = (level) => Math.min(1, 0.35 + 0.13 * level);
const centreOf = (zone) => ({ x: zone.position.x + Math.floor((zone.width - 1) / 2), y: zone.position.y + Math.floor((zone.height - 1) / 2) });

/**
 * The operation a raid is played as: the territory's defence operation with the number of agents its defence level allows, the
 * nearest of them heading for the position being held, and a hold time that grows with the level. It is built the same way every
 * time from the level alone, so a recorded raid can be played back.
 */
export function raidMission(content, entry, level) {
  const mission = JSON.parse(JSON.stringify(content.read(entry.defence)));
  const zones = [...content.read(mission.map).zones, ...(mission.zones ?? [])];
  const hold = mission.objectives.find((objective) => objective.type === "hold");
  const spot = centreOf(zones.find((zone) => zone.id === hold.targetZone));
  const isAgent = (placement) => placement.unit.includes("enemy-agent");
  const distance = (placement) => Math.abs(placement.position.x - spot.x) + Math.abs(placement.position.y - spot.y);
  const agents = mission.opponents.filter(isAgent).sort((a, b) => distance(a) - distance(b) || (a.id < b.id ? -1 : 1));
  const keep = Math.min(agents.length, Math.max(3, Math.round(agents.length * fraction(level))));
  const kept = new Set(agents.slice(0, keep).map((agent) => agent.id));
  const sending = Math.max(3, Math.min(8, Math.ceil(keep / 3)));
  const marching = new Set(agents.slice(0, sending).map((agent) => agent.id));
  mission.opponents = mission.opponents
    .filter((placement) => !isAgent(placement) || kept.has(placement.id))
    .map((placement) => {
      if (!isAgent(placement)) return placement;
      const { patrol: _patrol, ...rest } = placement;
      return marching.has(placement.id) ? { ...rest, patrol: [{ ...placement.position }, { ...spot }] } : rest;
    });
  hold.holdSeconds = 30 + 8 * level;
  hold.description = `Hold the marked position for ${hold.holdSeconds} seconds.`;
  mission.id = `${mission.id}-raid`;
  mission.variant = "raid";
  mission.name = `${entry.name} Raid`;
  mission.title = "Take the territory";
  mission.briefing =
    `${entry.name} is held by ${entry.holder ?? "its owner"}, with defences at level ${level}. Hold the marked position for ` +
    `${hold.holdSeconds} seconds while its agents close in, then fall back to the landing area. The territory is yours if you do.`;
  mission.story = `${entry.name} Raid: take what another company holds.`;
  mission.debrief = {
    success: `${entry.name} is yours. Its income is now yours too, until somebody takes it from you.`,
    failure: `The raid on ${entry.name} failed. The defences held.`,
  };
  mission.intel = [`Defence level ${level}: ${keep} of the district's ${agents.length} agents are on watch.`];
  return mission;
}
