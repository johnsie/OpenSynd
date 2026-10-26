// SPDX-License-Identifier: GPL-2.0-or-later

// A territory has three operations: its main one (to take it), an uprising (to take it back when it is in revolt) and a defence
// (to keep it when a rival company moves to take it over). Which one is played follows from the territory's state.

/** "uprising" for a territory in revolt, "defence" for one under a takeover attempt, otherwise null (the main operation). */
export function variantFor(territory) {
  if (territory?.status === "rebel") return "uprising";
  if (territory?.threat) return "defence";
  return null;
}

export const VARIANT_LABELS = Object.freeze({ uprising: "UPRISING", defence: "DEFENCE" });

/**
 * What the map and the lists say about a territory that needs attention, or null: { kind: "revolt" | "takeover", label, detail }.
 * `day` is the campaign's current day (a takeover has days left to answer it); `rival` names the company behind it.
 */
export function territoryAlert(territory, day, rival = "A rival company") {
  const variant = variantFor(territory);
  if (variant === "uprising") {
    return { kind: "revolt", label: "IN REVOLT", detail: "The people have risen. Play its uprising operation to take it back." };
  }
  if (variant === "defence") {
    const left = Math.max(0, territory.threat.until - day);
    const days = left === 1 ? "1 day" : `${left} days`;
    return {
      kind: "takeover",
      label: "TAKEOVER ATTEMPT",
      detail: `${rival} is moving to take it over: ${days} left. Play its defence operation to keep it.`,
    };
  }
  return null;
}

/** The content path of the operation to play for a territory entry (from territories.json) and variant. */
export function operationPath(entry, variant) {
  return (variant ? entry?.[variant] : entry?.mission) ?? null;
}
