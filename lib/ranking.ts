import { brusselsToday, diffDays } from "@/lib/dates";
import { formatFreshness } from "@/lib/freshness";
import type { PreparedEvent } from "@/lib/filters";
import type { PreferredMeetGender, UserGender } from "@/types/event";
import type { SearchState } from "@/types/search";

export type PreferenceScore = {
  /** Total soft score. Never used to hide events. */
  score: number;
  /** True when preferred audience age overlaps source audience ages. */
  preferredAgeMatch: boolean | null;
  /**
   * True only when source has knownAudienceGenders AND user preference matches.
   * Never invents a gender match from silence.
   */
  preferredGenderMatch: boolean | null;
};

function rangesOverlap(
  aMin: number | null,
  aMax: number | null,
  bMin: number | null,
  bMax: number | null,
): boolean {
  const leftMin = aMin ?? 18;
  const leftMax = aMax ?? 99;
  const rightMin = bMin ?? 18;
  const rightMax = bMax ?? 99;
  return leftMin <= rightMax && rightMin <= leftMax;
}

function preferredAgeOverlap(
  event: PreparedEvent,
  state: SearchState,
): boolean | null {
  const userHasPreference =
    state.preferredAgeMin != null || state.preferredAgeMax != null;
  const eventHasAudience =
    event.audienceAgeFromSource &&
    (event.preferredAudienceAgeMin != null ||
      event.preferredAudienceAgeMax != null);
  if (!userHasPreference || !eventHasAudience) return null;
  return rangesOverlap(
    state.preferredAgeMin,
    state.preferredAgeMax,
    event.preferredAudienceAgeMin,
    event.preferredAudienceAgeMax,
  );
}

function preferredGenderOverlap(
  event: PreparedEvent,
  preferredMeetGender: PreferredMeetGender,
): boolean | null {
  if (preferredMeetGender === "anyone") return null;
  if (!event.knownAudienceGenders || event.knownAudienceGenders.length === 0) {
    return null;
  }
  if (preferredMeetGender === "women") {
    return event.knownAudienceGenders.includes("woman");
  }
  if (preferredMeetGender === "men") {
    return event.knownAudienceGenders.includes("man");
  }
  return null;
}

/**
 * Soft preference ranking only.
 * Must never be used to exclude eligible events.
 */
export function calculatePreferenceScore(
  event: PreparedEvent,
  state: SearchState,
  now = new Date(),
): PreferenceScore {
  const today = brusselsToday(now);
  let score = 0;

  score += Math.max(0, 36 - event.distanceKm * 0.45);
  const days = Math.max(0, diffDays(today, event.startDate));
  score += Math.max(0, 18 - days * 0.65);

  if (state.activities.some((activity) => event.activities.includes(activity))) {
    score += 20;
  }
  if (state.categories.length > 0 && state.categories.includes(event.category)) {
    score += 12;
  }

  const preferredAgeMatch = preferredAgeOverlap(event, state);
  if (preferredAgeMatch === true) score += 22;
  if (preferredAgeMatch === false) score -= 4;

  const preferredGenderMatch = preferredGenderOverlap(
    event,
    state.preferredMeetGender,
  );
  if (preferredGenderMatch === true) score += 14;
  // false = source says genders that don't match preference → mild demotion, never hide
  if (preferredGenderMatch === false) score -= 3;

  if (state.singlesOnly && event.singlesOnly) score += 8;
  else if (event.singlesOnly) score += 2;

  if (event.socialSuitability === "high") score += 6;
  if (event.socialSuitability === "medium") score += 3;

  const freshness = formatFreshness(event.lastCheckedAt, now);
  if (freshness.tone === "fresh") score += 5;
  if (freshness.tone === "recent") score += 2;

  if (event.capacityStatus === "available") score += 6;
  if (event.capacityStatus === "limited") score += 4;
  if (event.capacityStatus === "almost_full") score += 1;
  if (event.capacityStatus === "sold_out") score -= 10;

  if (event.participation.status === "eligible") score += 4;
  if (
    event.participation.status === "guideline" &&
    event.participation.inRange
  ) {
    score += 2;
  }

  return { score, preferredAgeMatch, preferredGenderMatch };
}

export function sortEvents(
  events: PreparedEvent[],
  state: SearchState,
  now = new Date(),
): PreparedEvent[] {
  const copy = [...events];
  if (state.sort === "soon") {
    return copy.sort((a, b) => {
      const byDate = a.startDate.localeCompare(b.startDate);
      if (byDate !== 0) return byDate;
      return (a.startTime ?? "").localeCompare(b.startTime ?? "");
    });
  }
  if (state.sort === "distance") {
    return copy.sort((a, b) => a.distanceKm - b.distanceKm);
  }
  if (state.sort === "newest") {
    return copy.sort((a, b) => b.addedAt.localeCompare(a.addedAt));
  }
  return copy.sort(
    (a, b) =>
      calculatePreferenceScore(b, state, now).score -
      calculatePreferenceScore(a, state, now).score,
  );
}

export function preferenceOverlaps(
  event: PreparedEvent,
  state: SearchState,
): boolean | null {
  return preferredAgeOverlap(event, state);
}

export function hasAnyPreferredAgeMatch(
  events: PreparedEvent[],
  state: SearchState,
): boolean {
  if (state.preferredAgeMin == null && state.preferredAgeMax == null) {
    return true;
  }
  return events.some((event) => preferredAgeOverlap(event, state) === true);
}

export function userForEligibility(state: {
  age: number | null;
  gender: UserGender | null;
}): { age: number | null; gender: UserGender | null } {
  return { age: state.age, gender: state.gender };
}
