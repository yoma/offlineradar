import { brusselsToday, diffDays } from "@/lib/dates";
import { isInAgeRange } from "@/lib/eligibility";
import { formatFreshness } from "@/lib/freshness";
import type { PreparedEvent } from "@/lib/filters";
import type { SearchState } from "@/types/search";

function audienceOverlap(event: PreparedEvent, state: SearchState): boolean | null {
  const userHasPreference =
    state.preferredAgeMin != null || state.preferredAgeMax != null;
  const eventHasAudience =
    event.preferredAudienceAgeMin != null ||
    event.preferredAudienceAgeMax != null;
  if (!userHasPreference || !eventHasAudience) return null;
  const min = state.preferredAgeMin ?? 18;
  const max = state.preferredAgeMax ?? 99;
  const audienceMin = event.preferredAudienceAgeMin ?? 18;
  const audienceMax = event.preferredAudienceAgeMax ?? 99;
  return min <= audienceMax && audienceMin <= max;
}

export function matchScore(
  event: PreparedEvent,
  state: SearchState,
  now = new Date(),
): number {
  const today = brusselsToday(now);
  let score = Math.max(0, 40 - event.distanceKm * 0.4);
  const days = Math.max(0, diffDays(today, event.startDate));
  score += Math.max(0, 20 - days * 0.7);

  if (
    state.activities.some((activity) => event.activities.includes(activity))
  ) {
    score += 18;
  }
  if (
    state.categories.length > 0 &&
    state.categories.includes(event.category)
  ) {
    score += 12;
  }

  const overlap = audienceOverlap(event, state);
  if (overlap === true) score += 16;

  const freshness = formatFreshness(event.lastCheckedAt, now);
  if (freshness.tone === "fresh") score += 6;
  if (freshness.tone === "recent") score += 3;

  if (event.capacityStatus === "available") score += 8;
  if (event.capacityStatus === "limited") score += 5;
  if (event.capacityStatus === "almost_full") score += 2;
  if (event.capacityStatus === "sold_out") score -= 12;

  if (state.singlesOnly && event.singlesOnly) score += 6;
  if (event.eligibility.status === "eligible") score += 4;

  if (
    state.preferredAgeMin != null &&
    event.preferredAudienceAgeMin != null &&
    isInAgeRange(
      Math.round(
        ((state.preferredAgeMin ?? 18) + (state.preferredAgeMax ?? state.preferredAgeMin ?? 18)) /
          2,
      ),
      event.preferredAudienceAgeMin,
      event.preferredAudienceAgeMax,
    )
  ) {
    score += 4;
  }

  return score;
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
    (a, b) => matchScore(b, state, now) - matchScore(a, state, now),
  );
}

export function preferenceOverlaps(
  event: PreparedEvent,
  state: SearchState,
): boolean | null {
  return audienceOverlap(event, state);
}
