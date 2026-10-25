import {
  addDays,
  brusselsToday,
  monthRange,
  nextWeekRange,
  weekendRange,
} from "@/lib/dates";
import { distanceOrigin, placeLabel, withUserDistance } from "@/lib/distance";
import { isCurrentEvent } from "@/lib/event-visibility";
import { ALL_LOCATIONS_ID } from "@/lib/location-options";
import { isEligibleForEvent } from "@/lib/eligibility";
import {
  coversAllPublicActivityGroups,
  coversAllPublicCategories,
  eventMatchesActivityFilter,
  expandActivityFilterSelection,
  isTravelOrWeekendActivity,
} from "@/lib/public-activity-groups";
import type { Event } from "@/types/event";
import type { SearchState } from "@/types/search";

export type PreparedEvent = Event & {
  /** Hard participation check result. Separate from event.eligibility (source rules). */
  participation: ReturnType<typeof isEligibleForEvent>;
};

function eventEnd(event: Event): string {
  return event.endDate ?? event.startDate;
}

function overlaps(event: Event, start: string, end: string): boolean {
  return event.startDate <= end && eventEnd(event) >= start;
}

function matchesWhen(event: Event, state: SearchState, today: string): boolean {
  if (eventEnd(event) < today) return false;
  if (state.when === "any") return true;
  if (state.when === "today") return overlaps(event, today, today);
  if (state.when === "tomorrow") {
    const tomorrow = addDays(today, 1);
    return overlaps(event, tomorrow, tomorrow);
  }
  if (state.when === "weekend") {
    const weekend = weekendRange(today);
    const start = weekend.start < today ? today : weekend.start;
    return overlaps(event, start, weekend.end);
  }
  if (state.when === "next_week") {
    const next = nextWeekRange(today);
    return overlaps(event, next.start, next.end);
  }
  if (state.when === "month") {
    const range = monthRange(today);
    return overlaps(event, range.start, range.end);
  }
  if (state.when === "date" && state.date) {
    return overlaps(event, state.date, state.date);
  }
  return true;
}

function matchesPrice(event: Event, state: SearchState): boolean {
  if (state.price === "any") return true;
  // Sparse catalog: unknown price must not wipe results for a price chip.
  if (event.price == null) return true;
  if (state.price === "free") return event.price === 0;
  if (state.price === "lt25") return event.price > 0 && event.price < 25;
  if (state.price === "mid") return event.price >= 25 && event.price <= 50;
  return event.price > 50;
}

function matchesAvailability(event: Event, state: SearchState): boolean {
  if (state.availability === "any") return true;
  const status = event.capacityStatus ?? "unknown";
  // Most editions have no capacity signal; keep them under “beschikbaar”.
  if (status === "unknown") {
    return state.availability === "open";
  }
  if (state.availability === "open") {
    return status === "available" || status === "limited";
  }
  if (state.availability === "almost_full") {
    return status === "almost_full";
  }
  return status === "waitlist";
}

export function prepareEvents(
  events: Event[],
  state: SearchState,
): PreparedEvent[] {
  return events.map((event) => {
    const placed = withUserDistance(event, state.placeId);
    return {
      ...placed,
      participation: isEligibleForEvent(
        { age: state.age, gender: state.gender },
        placed,
      ),
    };
  });
}

/**
 * Soft filters (when, distance, category, activity…) then hard eligibility.
 * Preference never removes events here.
 *
 * Activity semantics (public groups expand before match; see public-activity-groups):
 * - no activities selected → all formats (including speeddate)
 * - one or more activities selected → OR match on those ActivityIds
 * Classic speeddates expose activity `speeddate` via normalizeEventActivities.
 *
 * Distance: travel/weekend editions are exempt from maxDistanceKm so
 * destination trips stay findable from Belgian search places.
 */
export function matchingEvents(
  events: Event[],
  state: SearchState,
  now = new Date(),
): { visible: PreparedEvent[]; hiddenStrict: number; guidelineHidden: number } {
  const today = brusselsToday(now);
  const selectedActivities = expandActivityFilterSelection(state.activities);
  // A dimension with every chip on restricts nothing (chips toggle off to
  // exclude a type, so "all categories + all but Party" must not hide events
  // in chip-less categories or without activity tags).
  const categoryFilter = coversAllPublicCategories(state.categories)
    ? []
    : state.categories;
  const activityFilter = coversAllPublicActivityGroups(selectedActivities)
    ? []
    : selectedActivities;
  const allLocations = state.placeId === ALL_LOCATIONS_ID;
  const origin = distanceOrigin(state.placeId);
  const prepared = prepareEvents(events, state).filter((event) => {
    if (!isCurrentEvent(event, now)) return false;
    if (!matchesWhen(event, state, today)) return false;
    // Unknown place ids match nothing and are left selected by the caller.
    if (!allLocations && !origin) return false;
    const travelExempt = isTravelOrWeekendActivity(event.activities);
    // Alle locaties has no radius. Otherwise unknown/infinite distance stays out.
    if (
      !allLocations &&
      !travelExempt &&
      !(event.distanceKm <= state.maxDistanceKm)
    ) {
      return false;
    }
    if (
      state.typesMode === "none" ||
      (state.typesMode === "pick" &&
        state.categories.length === 0 &&
        selectedActivities.length === 0)
    ) {
      return false;
    }
    // Alle soorten = no type filter. Otherwise apply category/activity picks
    // (also if activities/categories are set while typesMode was left on "all").
    const typeFilterOn =
      state.typesMode === "pick" ||
      state.categories.length > 0 ||
      selectedActivities.length > 0;
    if (typeFilterOn) {
      if (
        categoryFilter.length > 0 &&
        !categoryFilter.includes(event.category)
      ) {
        return false;
      }
      if (
        !eventMatchesActivityFilter(event.activities, activityFilter, {
          title: event.title,
          subCategory: event.subCategory,
        })
      ) {
        return false;
      }
    }
    if (!matchesPrice(event, state)) return false;
    // “Alleen singles”: singles-only OR singles-oriented (catalog rarely sets both).
    if (
      state.singlesOnly &&
      event.singlesOnly !== true &&
      event.singlesOriented !== true
    ) {
      return false;
    }
    if (!matchesAvailability(event, state)) return false;
    return true;
  });

  const hiddenStrict = prepared.filter(
    (event) => event.participation.status === "ineligible",
  ).length;

  const guidelineHidden = state.strictOnly
    ? prepared.filter((event) => event.participation.status === "guideline")
        .length
    : 0;

  const visible = prepared.filter((event) => {
    if (!event.participation.includedByDefault) return false;
    if (state.strictOnly && event.participation.status === "guideline") {
      return false;
    }
    return true;
  });

  return { visible, hiddenStrict, guidelineHidden };
}

export { placeLabel };
