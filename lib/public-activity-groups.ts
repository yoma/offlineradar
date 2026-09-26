/**
 * Public activity filter taxonomy.
 *
 * Internal ActivityIds stay precise (wandelen, padel, outdoor, …).
 * Public filters are broader groups so users get expected results
 * (e.g. Sport & actief includes walks and outdoor).
 */
import type { ActivityId } from "@/types/event";

export type PublicActivityGroupId =
  | "speeddate"
  | "sport_active"
  | "drinken"
  | "eten"
  | "party"
  | "workshop"
  | "travel";

export type PublicActivityGroup = {
  id: PublicActivityGroupId;
  label: string;
  /** Internal ActivityIds that match this public filter (OR). */
  activities: readonly ActivityId[];
  /** URL / legacy tokens that expand to this group. */
  aliases: readonly string[];
};

/** Activities under Sport & actief (not speeddate, dinner, workshop, …). */
export const SPORT_ACTIVE_ACTIVITIES: readonly ActivityId[] = [
  "sport",
  "outdoor",
  "wandelen",
  "lopen",
  "padel",
] as const;

/**
 * Canonical public filter groups shown in home chips + filter sheet.
 * No separate Wandelen/outdoor chip: covered by Sport & actief.
 */
export const PUBLIC_ACTIVITY_GROUPS: readonly PublicActivityGroup[] = [
  {
    id: "speeddate",
    label: "Speeddate",
    activities: ["speeddate"],
    aliases: ["speeddate", "speeddating", "speed"],
  },
  {
    id: "sport_active",
    label: "Sport & actief",
    activities: SPORT_ACTIVE_ACTIVITIES,
    aliases: ["sport_active", "sport-active", "sportactief", "active"],
  },
  {
    id: "drinken",
    label: "Drinks / apero",
    activities: ["drinken"],
    aliases: ["drinken", "drinks", "apero"],
  },
  {
    id: "eten",
    label: "Dinner / food",
    activities: ["eten"],
    aliases: ["eten", "dinner", "food"],
  },
  {
    id: "party",
    label: "Party",
    activities: ["party", "dans"],
    aliases: ["party", "uitgaan", "dans"],
  },
  {
    id: "workshop",
    label: "Workshop / connection",
    activities: ["workshop"],
    aliases: ["workshop"],
  },
  {
    id: "travel",
    label: "Weekend / reis",
    activities: ["reizen", "weekend"],
    aliases: ["travel", "reizen", "weekend", "reis"],
  },
] as const;

const GROUP_BY_ID = new Map(
  PUBLIC_ACTIVITY_GROUPS.map((group) => [group.id, group]),
);

export function getPublicActivityGroup(
  id: PublicActivityGroupId,
): PublicActivityGroup {
  return GROUP_BY_ID.get(id)!;
}

/** Travel / weekend formats: destination may be far; still nationally relevant. */
export function isTravelOrWeekendActivity(
  activities: readonly ActivityId[],
): boolean {
  return activities.includes("reizen") || activities.includes("weekend");
}

/**
 * Expand URL / UI selection tokens into ActivityIds used for matching.
 *
 * - `sport` alone (legacy Sport chip) → full Sport & actief set
 * - `sport_active` / aliases → full Sport & actief set
 * - narrow tokens (wandelen, padel, …) stay narrow
 * - group aliases expand to their full member lists
 */
export function expandActivityFilterSelection(
  tokens: readonly string[],
): ActivityId[] {
  const result = new Set<ActivityId>();

  for (const raw of tokens) {
    const key = raw.trim().toLowerCase().replace(/[\s_]+/g, "");
    if (!key) continue;

    const byAlias = PUBLIC_ACTIVITY_GROUPS.find((group) =>
      group.aliases.some(
        (alias) => alias.toLowerCase().replace(/[\s_]+/g, "") === key,
      ),
    );
    if (byAlias) {
      for (const activity of byAlias.activities) result.add(activity);
      continue;
    }

    // Legacy: bare `sport` means the broad Sport & actief group.
    if (key === "sport") {
      for (const activity of SPORT_ACTIVE_ACTIVITIES) result.add(activity);
      continue;
    }

    const mapped = mapTokenToActivityId(key);
    if (mapped) result.add(mapped);
  }

  return Array.from(result);
}

function mapTokenToActivityId(key: string): ActivityId | null {
  const map: Record<string, ActivityId> = {
    eten: "eten",
    drinken: "drinken",
    drinks: "drinken",
    wandelen: "wandelen",
    walk: "wandelen",
    hiking: "wandelen",
    hike: "wandelen",
    lopen: "lopen",
    running: "lopen",
    sport: "sport",
    padel: "padel",
    bowling: "sport",
    climbing: "sport",
    party: "party",
    uitgaan: "party",
    dans: "dans",
    workshop: "workshop",
    reizen: "reizen",
    weekend: "weekend",
    outdoor: "outdoor",
    buiten: "outdoor",
    speeddate: "speeddate",
    speeddating: "speeddate",
    speed: "speeddate",
  };
  return map[key] ?? null;
}

/** Compact ActivityIds back to public group chips when a full group is selected. */
export function publicActivityChipsFromSelection(
  activities: readonly ActivityId[],
): { id: string; label: string; activities: ActivityId[] }[] {
  const remaining = new Set(activities);
  const chips: { id: string; label: string; activities: ActivityId[] }[] = [];

  for (const group of PUBLIC_ACTIVITY_GROUPS) {
    if (group.activities.every((activity) => remaining.has(activity))) {
      chips.push({
        id: group.id,
        label: group.label,
        activities: [...group.activities],
      });
      for (const activity of group.activities) remaining.delete(activity);
    }
  }

  const leftoverLabels: Partial<Record<ActivityId, string>> = {
    speeddate: "Speeddate",
    eten: "Dinner / food",
    drinken: "Drinks / apero",
    wandelen: "Wandelen",
    lopen: "Lopen",
    sport: "Sport",
    padel: "Padel",
    party: "Party",
    dans: "Dans",
    workshop: "Workshop",
    reizen: "Reizen",
    weekend: "Weekend",
    outdoor: "Buiten",
  };
  for (const activity of remaining) {
    chips.push({
      id: activity,
      label: leftoverLabels[activity] ?? activity,
      activities: [activity],
    });
  }

  return chips;
}

/**
 * Which public groups an event belongs to (multi-match allowed).
 * Used by golden matrix + documentation; filter match uses OR on activities.
 */
export function publicGroupsForEventActivities(
  activities: readonly ActivityId[],
): PublicActivityGroupId[] {
  return PUBLIC_ACTIVITY_GROUPS.filter((group) =>
    group.activities.some((activity) => activities.includes(activity)),
  ).map((group) => group.id);
}

export function eventMatchesActivityFilter(
  eventActivities: readonly ActivityId[],
  selected: readonly ActivityId[],
): boolean {
  if (selected.length === 0) return true;
  return selected.some((activity) => eventActivities.includes(activity));
}

/** Toggle a full public group in/out of the activity selection. */
export function togglePublicActivityGroup(
  current: readonly ActivityId[],
  groupId: PublicActivityGroupId,
): ActivityId[] {
  const group = getPublicActivityGroup(groupId);
  const allSelected = group.activities.every((activity) =>
    current.includes(activity),
  );
  if (allSelected) {
    return current.filter((activity) => !group.activities.includes(activity));
  }
  return Array.from(new Set([...current, ...group.activities]));
}

export function isPublicActivityGroupSelected(
  current: readonly ActivityId[],
  groupId: PublicActivityGroupId,
): boolean {
  const group = getPublicActivityGroup(groupId);
  return group.activities.every((activity) => current.includes(activity));
}

/**
 * Serialize activities for URL: compress full groups to stable group ids.
 * Keeps deep links short and chip labels public.
 */
export function serializeActivitySelection(
  activities: readonly ActivityId[],
): string {
  if (activities.length === 0) return "";
  const chips = publicActivityChipsFromSelection(activities);
  return chips
    .map((chip) => {
      if (GROUP_BY_ID.has(chip.id as PublicActivityGroupId)) return chip.id;
      return chip.activities[0];
    })
    .join(",");
}
