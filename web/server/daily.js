// SPDX-License-Identifier: GPL-2.0-or-later

// The daily operation and the daily chores. Every day (by the server's UTC date) there is one operation and one seed for everyone,
// and three small tasks to try for while playing it. Everything here is a plain function of the date and of how an operation went,
// so it is easy to test and the same wherever it is worked out.
export const DAY_MS = 86_400_000;

export const dayNumber = (milliseconds) => Math.floor(milliseconds / DAY_MS);
export const dayDate = (day) => new Date(day * DAY_MS).toISOString().slice(0, 10);

// A small stable hash, so the day's picks are the same for everyone and every time.
function hash(...parts) {
  let value = 2166136261;
  for (const char of parts.join("|")) {
    value ^= char.charCodeAt(0);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

/**
 * How an operation went, in the terms the chores and the score use: `world` is the finished (or timed-out) world, `squad` the ids of
 * the player's agents.
 */
export function resultOf(world, squad = world.units.filter((unit) => unit.side === "team").map((unit) => unit.id)) {
  const team = world.units.filter((unit) => squad.includes(unit.id));
  const stats = world.opStats;
  return {
    outcome: world.outcome === "active" ? "timeout" : world.outcome,
    seconds: Math.round(world.missionSeconds),
    lost: team.filter((unit) => unit.disabled).length,
    squad: team.length,
    spotted: stats.spotted,
    bystandersHarmed: stats.civiliansHarmed + stats.policeHarmed,
    itemsLooted: stats.itemsLooted,
    enemiesDisabled: stats.enemiesDisabled,
    persuaded: world.units.filter((unit) => unit.persuaded && !unit.disabled && squad.includes(unit.persuadedBy)).length,
    objectives: stats.objectivesCompleted,
  };
}

const won = (result) => result.outcome === "success";

// The pool the day's three chores are drawn from. Each says what to do, what it pays, and how to tell it was done.
export const CHORES = Object.freeze([
  { id: "flawless", title: "Flawless", description: "Win without losing an operative.", reward: 900, done: (r) => won(r) && r.lost === 0 },
  { id: "quick", title: "Quick work", description: "Win in under four minutes.", reward: 800, done: (r) => won(r) && r.seconds < 240 },
  { id: "quiet", title: "Keep it quiet", description: "Win without being spotted more than three times.", reward: 800, done: (r) => won(r) && r.spotted <= 3 },
  { id: "gentle", title: "Mind the streets", description: "Win without harming a bystander.", reward: 700, done: (r) => won(r) && r.bystandersHarmed === 0 },
  { id: "scavenger", title: "Scavenger", description: "Win and pick up at least three items from the fallen.", reward: 700, done: (r) => won(r) && r.itemsLooted >= 3 },
  { id: "recruiter", title: "A friendly word", description: "Win with someone persuaded to follow you.", reward: 1000, done: (r) => won(r) && r.persuaded >= 1 },
  { id: "thorough", title: "Thorough", description: "Win having put down at least eight enemy agents.", reward: 900, done: (r) => won(r) && r.enemiesDisabled >= 8 },
  { id: "survivor", title: "Against the odds", description: "Win with two operatives or fewer still standing.", reward: 1100, done: (r) => won(r) && r.squad - r.lost <= 2 },
]);

/** The three chores of a day, and the operation and seed everyone plays that day. */
export function dailyOperation(content, day) {
  const missions = content.pack.missions;
  const mission = missions[hash("operation", day) % missions.length];
  const chores = [];
  for (let pick = 0; chores.length < 3; pick += 1) {
    const chore = CHORES[hash("chore", day, pick) % CHORES.length];
    if (!chores.includes(chore)) chores.push(chore);
  }
  const name = content.read(mission).name;
  return { day, date: dayDate(day), mission, name, seed: (hash("seed", day) % 2_000_000_000) + 1, chores };
}

/** The chores of the day that an operation's result earned. */
export const choresEarned = (operation, result) => operation.chores.filter((chore) => chore.done(result));

/** The score of a win: faster is better, and every operative lost costs. Anything but a win scores nothing. */
export function scoreOf(result) {
  if (!won(result)) return 0;
  return Math.max(0, 10_000 - 15 * result.seconds - 2000 * result.lost);
}

/** What a chore pays today, with the streak's bonus (a tenth more for each day, up to half as much again). */
export const rewardWithStreak = (reward, streak) => Math.round(reward * (1 + 0.1 * Math.min(streak, 5)));

/**
 * How many days in a row there have been chores done, counting back from today (or from yesterday if today has none yet). One
 * missed day is forgiven, but only one in any week, so a streak survives a day off without rewarding a long break.
 */
export function streakOf(days, today) {
  let streak = 0;
  let day = days.has(today) ? today : today - 1;
  let forgiven = Infinity;
  for (;;) {
    if (days.has(day)) {
      streak += 1;
      day -= 1;
    } else if (days.has(day - 1) && (forgiven === Infinity || forgiven - day >= 7)) {
      forgiven = day;
      day -= 1;
    } else {
      return streak;
    }
  }
}

/** A chore as the page shows it. */
export const describeChore = ({ id, title, description, reward }) => ({ id, title, description, reward });
