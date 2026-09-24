import { brusselsToday, diffDays } from "@/lib/dates";
import { formatFreshness } from "@/lib/freshness";
import type { PreparedEvent } from "@/lib/filters";
import { isActiveMeetActivation } from "@/types/domain";
import type { PreferredMeetGender, UserGender } from "@/types/event";
import type { SearchState } from "@/types/search";

export type AgeOverlapStrength = "strong" | "partial" | "none";

export type PreferenceScore = {
  /**
   * Organic soft score only (relevance, distance, Meet signal, etc.).
   * Never used to hide events. Never includes paid promotion.
   */
  organicScore: number;
  /**
   * Paid boost. Always 0 in the consumer MVP.
   * Must never invent eligibility or social suitability.
   */
  promotionScore: number;
  /** organicScore + promotionScore. Prefer reading the split fields. */
  score: number;
  /**
   * Graded age overlap with source audience ages.
   * null = no user preference or no reliable audience data.
   */
  ageOverlap: AgeOverlapStrength | null;
  /** @deprecated Prefer ageOverlap; true when strong or partial. */
  preferredAgeMatch: boolean | null;
  /**
   * True only when source has knownAudienceGenders AND user preference matches.
   * Never invents a gender match from silence.
   */
  preferredGenderMatch: boolean | null;
};

function inclusiveWidth(min: number, max: number): number {
  return Math.max(1, max - min + 1);
}

/** Share of the user's preferred age range that overlaps the event audience. */
export function preferenceAgeOverlapRatio(
  prefMin: number | null,
  prefMax: number | null,
  audienceMin: number | null,
  audienceMax: number | null,
): number {
  const leftMin = prefMin ?? 18;
  const leftMax = prefMax ?? 99;
  const rightMin = audienceMin ?? 18;
  const rightMax = audienceMax ?? 99;
  const start = Math.max(leftMin, rightMin);
  const end = Math.min(leftMax, rightMax);
  if (end < start) return 0;
  return inclusiveWidth(start, end) / inclusiveWidth(leftMin, leftMax);
}

export function classifyAgeOverlap(ratio: number): AgeOverlapStrength {
  if (ratio <= 0) return "none";
  if (ratio >= 0.6) return "strong";
  return "partial";
}

function preferredAgeOverlap(
  event: PreparedEvent,
  state: SearchState,
): AgeOverlapStrength | null {
  const userHasPreference =
    state.preferredAgeMin != null || state.preferredAgeMax != null;
  const eventHasAudience =
    event.audienceAgeFromSource &&
    (event.preferredAudienceAgeMin != null ||
      event.preferredAudienceAgeMax != null);
  if (!userHasPreference || !eventHasAudience) return null;
  const ratio = preferenceAgeOverlapRatio(
    state.preferredAgeMin,
    state.preferredAgeMax,
    event.preferredAudienceAgeMin,
    event.preferredAudienceAgeMax,
  );
  return classifyAgeOverlap(ratio);
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

  const ageOverlap = preferredAgeOverlap(event, state);
  if (ageOverlap === "strong") score += 22;
  else if (ageOverlap === "partial") score += 10;
  else if (ageOverlap === "none") score -= 4;

  const preferredAgeMatch =
    ageOverlap == null ? null : ageOverlap === "strong" || ageOverlap === "partial";

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

  // Meet bonus is intentional organic signal, never paid promotion.
  // Temporary MVP heuristic: only when search intent is social/meet-oriented.
  // Do not treat “Meet = always +5” as a permanent domain rule.
  if (
    isActiveMeetActivation(event.meetActivation) &&
    hasSocialMeetIntent(state)
  ) {
    score += 5;
  }

  // singlesFriendly is informational only: no ranking effect.

  const organicScore = score;
  const promotionScore = 0;

  return {
    organicScore,
    promotionScore,
    score: organicScore + promotionScore,
    ageOverlap,
    preferredAgeMatch,
    preferredGenderMatch,
  };
}

/**
 * Whether the user's current search expresses social / meeting intent.
 * Used to gate Meet ranking bonus so a Meet label cannot beat a better
 * activity match for a user who is not looking to meet people.
 */
export function hasSocialMeetIntent(state: SearchState): boolean {
  if (state.categories.some((c) => c === "dating" || c === "meet_new_people")) {
    return true;
  }
  if (state.singlesOnly) return true;
  if (state.preferredMeetGender !== "anyone") return true;
  if (state.preferredAgeMin != null || state.preferredAgeMax != null) {
    return true;
  }
  return false;
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
  const overlap = preferredAgeOverlap(event, state);
  if (overlap == null) return null;
  return overlap === "strong" || overlap === "partial";
}

export function hasStrongPreferenceMatch(
  event: PreparedEvent,
  state: SearchState,
): boolean {
  const score = calculatePreferenceScore(event, state);
  return (
    score.ageOverlap === "strong" || score.preferredGenderMatch === true
  );
}

/** True when at least one visible event is a strong preference match. */
export function hasAnyStrongPreferenceMatch(
  events: PreparedEvent[],
  state: SearchState,
): boolean {
  const hasAgePref =
    state.preferredAgeMin != null || state.preferredAgeMax != null;
  const hasGenderPref = state.preferredMeetGender !== "anyone";
  if (!hasAgePref && !hasGenderPref) return true;
  return events.some((event) => hasStrongPreferenceMatch(event, state));
}

/** @deprecated Use hasAnyStrongPreferenceMatch */
export function hasAnyPreferredAgeMatch(
  events: PreparedEvent[],
  state: SearchState,
): boolean {
  return hasAnyStrongPreferenceMatch(events, state);
}

export function userHasMeetPreference(state: SearchState): boolean {
  return (
    state.preferredMeetGender !== "anyone" ||
    state.preferredAgeMin != null ||
    state.preferredAgeMax != null
  );
}

export function userForEligibility(state: {
  age: number | null;
  gender: UserGender | null;
}): { age: number | null; gender: UserGender | null } {
  return { age: state.age, gender: state.gender };
}
