// SPDX-License-Identifier: GPL-2.0-or-later

// The running record of the current operation, kept for the debrief: who was put out of action, objectives done, gear
// looted, how often the squad was spotted, how long it took and how it ended ("active", "success" or "failure").
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
