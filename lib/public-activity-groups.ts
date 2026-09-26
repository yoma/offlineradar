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
 * Soft secondary tags (eten/drinken/outdoor on a weekend, drinken on bowling)
 * do not invent extra public groups.
 */
export function publicGroupsForEventActivities(
  activities: readonly ActivityId[],
  meta?: { title?: string | null; subCategory?: string | null },
): PublicActivityGroupId[] {
  const effective = effectiveActivitiesForMatch(activities, meta);
  return PUBLIC_ACTIVITY_GROUPS.filter((group) => {
    if (!group.activities.some((activity) => effective.includes(activity))) {
      return false;
    }
    if (group.id === "sport_active" && isSoftActiveNoise(activities, meta)) {
      return false;
    }
    if (group.id === "drinken" && isSecondaryDrinksNoise(activities, meta)) {
      return false;
    }
    if (group.id === "eten" && isSecondaryFoodNoise(activities, meta)) {
      return false;
    }
    return true;
  }).map((group) => group.id);
}

function textOf(meta?: { title?: string | null; subCategory?: string | null }) {
  return `${meta?.title ?? ""} ${meta?.subCategory ?? ""}`.toLowerCase();
}

/** Title/subcategory clearly framed as drinks/apero social. */
export function isDrinksLedSocial(meta?: {
  title?: string | null;
  subCategory?: string | null;
}): boolean {
  return /\b(apero|apéritif|aperitivo|borrel|afterwork|praatcafé|praatcafe|happy\s*hour|rooftop|night out|drinks)\b/.test(
    textOf(meta),
  );
}

export function isDinnerLedSocial(meta?: {
  title?: string | null;
  subCategory?: string | null;
}): boolean {
  return /\b(dinner|dîner|diner|brunch|eetfestijn|kook)\b/.test(textOf(meta));
}

export function isWeekendLedSocial(
  activities: readonly ActivityId[],
  meta?: { title?: string | null; subCategory?: string | null },
): boolean {
  if (activities.includes("weekend") || activities.includes("reizen")) {
    return true;
  }
  return /\b(weekend|vakantie|citytrip|skiweek|shortski|singlereis|reis\b|travel)\b/.test(
    textOf(meta),
  );
}

export function isSportActivityLed(meta?: {
  title?: string | null;
  subCategory?: string | null;
}): boolean {
  return /\b(bowling|padel|tennis|climbing|klimmen|fitness|sportieve)\b/.test(
    textOf(meta),
  );
}

/** Infer weekend/reizen when catalog forgot the activity tag. */
export function effectiveActivitiesForMatch(
  activities: readonly ActivityId[],
  meta?: { title?: string | null; subCategory?: string | null },
): ActivityId[] {
  const next = activities.filter(
    (activity): activity is ActivityId =>
      activity === "speeddate" ||
      activity === "eten" ||
      activity === "drinken" ||
      activity === "wandelen" ||
      activity === "lopen" ||
      activity === "sport" ||
      activity === "padel" ||
      activity === "party" ||
      activity === "dans" ||
      activity === "workshop" ||
      activity === "reizen" ||
      activity === "weekend" ||
      activity === "outdoor",
  );
  if (
    isWeekendLedSocial(activities, meta) &&
    !next.includes("weekend") &&
    !next.includes("reizen")
  ) {
    next.push("weekend");
  }
  return next;
}

function hasStrongActive(activities: readonly ActivityId[]): boolean {
  return activities.some(
    (activity) =>
      activity === "sport" || activity === "padel" || activity === "lopen",
  );
}

/** Apero/weekend packages that only soft-bridge into Sport & actief. */
function isSoftActiveNoise(
  activities: readonly ActivityId[],
  meta?: { title?: string | null; subCategory?: string | null },
): boolean {
  if (hasStrongActive(activities)) return false;
  const softOnly =
    activities.includes("wandelen") || activities.includes("outdoor");
  if (!softOnly) return false;
  if (isDrinksLedSocial(meta) && activities.includes("drinken")) return true;
  if (isWeekendLedSocial(activities, meta)) return true;
  return false;
}

/** Bowling/weekend amenity drinken should not fill Drinks / apero alone. */
function isSecondaryDrinksNoise(
  activities: readonly ActivityId[],
  meta?: { title?: string | null; subCategory?: string | null },
): boolean {
  if (!activities.includes("drinken")) return false;
  if (isDrinksLedSocial(meta)) return false;
  if (isSportActivityLed(meta) && hasStrongActive(activities)) return true;
  if (isWeekendLedSocial(activities, meta)) return true;
  return false;
}

/** Weekend meal packages should not fill Dinner / food alone. */
function isSecondaryFoodNoise(
  activities: readonly ActivityId[],
  meta?: { title?: string | null; subCategory?: string | null },
): boolean {
  if (!activities.includes("eten")) return false;
  if (isDinnerLedSocial(meta)) return false;
  if (isWeekendLedSocial(activities, meta)) return true;
  return false;
}

/**
 * Match selected ActivityIds against an event.
 *
 * Broad groups ignore soft secondary tags that would create filter noise
 * (apero under Sport, bowling under Drinks, weekend under Dinner, etc.).
 */
export function eventMatchesActivityFilter(
  eventActivities: readonly ActivityId[],
  selected: readonly ActivityId[],
  meta?: { title?: string | null; subCategory?: string | null },
): boolean {
  if (selected.length === 0) return true;

  const effective = effectiveActivitiesForMatch(eventActivities, meta);
  const overlap = selected.filter((activity) => effective.includes(activity));
  if (overlap.length === 0) return false;

  const broadSportActive = SPORT_ACTIVE_ACTIVITIES.every((activity) =>
    selected.includes(activity),
  );
  const drinksSelected = selected.includes("drinken");
  const foodSelected = selected.includes("eten");
  const travelSelected =
    selected.includes("reizen") || selected.includes("weekend");
  const sportSliceSelected = selected.some((activity) =>
    (SPORT_ACTIVE_ACTIVITIES as readonly ActivityId[]).includes(activity),
  );

  // Sport & actief: drop apero/weekend hybrids that only soft-match.
  if (broadSportActive && isSoftActiveNoise(eventActivities, meta)) {
    const stillMatchedWithoutSoft = overlap.some(
      (activity) =>
        activity !== "wandelen" &&
        activity !== "outdoor" &&
        (SPORT_ACTIVE_ACTIVITIES as readonly ActivityId[]).includes(activity),
    );
    if (!stillMatchedWithoutSoft) {
      // Keep if user also picked the true primary group (drinks/travel).
      if (drinksSelected && eventActivities.includes("drinken")) return true;
      if (travelSelected && isWeekendLedSocial(eventActivities, meta)) {
        return true;
      }
      return false;
    }
  }

  // Drinks / apero alone: drop bowling amenity drinks + weekend packages.
  if (
    drinksSelected &&
    !sportSliceSelected &&
    isSecondaryDrinksNoise(eventActivities, meta)
  ) {
    const onlyViaDrinks = overlap.every((activity) => activity === "drinken");
    if (onlyViaDrinks) return false;
  }

  // Dinner / food alone: drop weekend meal packages.
  if (
    foodSelected &&
    !travelSelected &&
    isSecondaryFoodNoise(eventActivities, meta)
  ) {
    const onlyViaFood = overlap.every((activity) => activity === "eten");
    if (onlyViaFood) return false;
  }

  return true;
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
