// SPDX-License-Identifier: GPL-2.0-or-later

// In-game achievements. Each pays funds once per campaign. `stats` is the running
// record of the current operation: enemiesDisabled, enemiesTotal,
// operatorsDisabled, objectivesCompleted, itemsLooted, spotted, seconds and
// outcome ("active", "success" or "failure").
export const ACHIEVEMENTS = Object.freeze([
  {
    id: "first-signal",
    name: "First signal",
    description: "Complete an objective.",
    reward: 0,
    earned: (stats) => stats.objectivesCompleted >= 1,
  },
  {
    id: "first-contact",
    name: "First contact",
    description: "Disable an enemy agent.",
    reward: 0,
    earned: (stats) => stats.enemiesDisabled >= 1,
  },
  {
    id: "scavenger",
    name: "Scavenger",
    description: "Loot a weapon from a disabled enemy.",
    reward: 0,
    earned: (stats) => stats.itemsLooted >= 1,
  },
  {
    id: "clear-the-streets",
    name: "Clear the streets",
    description: "Disable every enemy agent in one operation.",
    reward: 0,
    earned: (stats) => stats.enemiesTotal > 0 && stats.enemiesDisabled >= stats.enemiesTotal,
  },
  {
    id: "whole-squad",
    name: "Whole squad",
    description: "Finish an operation without losing an operator.",
    reward: 0,
    earned: (stats) => stats.outcome === "success" && stats.operatorsDisabled === 0,
  },
  {
    id: "quick-work",
    name: "Quick work",
    description: "Finish an operation within six minutes.",
    reward: 0,
    earned: (stats) => stats.outcome === "success" && stats.seconds <= 360,
  },
  {
    id: "ghost",
    name: "Ghost",
    description: "Finish an operation without an enemy agent ever spotting you.",
    reward: 0,
    earned: (stats) => stats.outcome === "success" && stats.spotted === 0,
  },
  {
    id: "clean-hands",
    name: "Clean hands",
    description: "Finish an operation without harming a civilian or a police officer.",
    reward: 0,
    earned: (stats) => stats.outcome === "success" && stats.civiliansHarmed === 0 && stats.policeHarmed === 0,
  },
]);

export function newStats(enemiesTotal) {
  return {
    enemiesDisabled: 0,
    enemiesTotal,
    operatorsDisabled: 0,
    objectivesCompleted: 0,
    itemsLooted: 0,
    spotted: 0,
    civiliansHarmed: 0,
    policeHarmed: 0,
    seconds: 0,
    outcome: "active",
  };
}

// Achievements whose conditions are now met and that have not been earned yet.
export function newlyEarned(stats, earnedIds) {
  return ACHIEVEMENTS.filter((achievement) => !earnedIds.includes(achievement.id) && achievement.earned(stats));
}
