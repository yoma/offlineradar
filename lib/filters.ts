import {
  addDays,
  brusselsToday,
  isInWeekend,
  monthRange,
  nextWeekRange,
} from "@/lib/dates";
import {
  distanceOrigin,
  isInBelgiumArea,
  placeLabel,
  withUserDistance,
} from "@/lib/distance";
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
  if (state.when === "weekend") return isInWeekend(event, today);
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

/**
 * A trip: tagged reizen/weekend, or located abroad (a country or resort as
 * place). Trips are not local outings, so the radius never applies to them.
 */
export function isTripEvent(
  event: Pick<Event, "activities" | "latitude" | "longitude">,
): boolean {
  if (isTravelOrWeekendActivity(event.activities)) return true;
  if (!Number.isFinite(event.latitude) || !Number.isFinite(event.longitude)) {
    return false;
  }
  return !isInBelgiumArea({ lat: event.latitude, lng: event.longitude });
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
 * Distance: trips (isTripEvent) are exempt from maxDistanceKm so
 * destination trips stay findable from Belgian search places.
 * “Reizen tonen” off (state.trips false) hides them altogether.
 */
export function matchingEvents(
  events: Event[],
  state: SearchState,
  now = new Date(),
): {
  visible: PreparedEvent[];
  hiddenStrict: number;
  /** The events counted in hiddenStrict, for an opt-in “toon ze toch”. */
  ineligible: PreparedEvent[];
  guidelineHidden: number;
  /**
   * Events that match every filter except the radius (and that the user may
   * join), nearest first. Shown on request below the results.
   */
  beyondRadius: PreparedEvent[];
} {
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
  const outOfRadius: PreparedEvent[] = [];
  const prepared = prepareEvents(events, state).filter((event) => {
    if (!isCurrentEvent(event, now)) return false;
    if (!matchesWhen(event, state, today)) return false;
    // Unknown place ids match nothing and are left selected by the caller.
    if (!allLocations && !origin) return false;
    const trip = isTripEvent(event);
    if (trip && !state.trips) return false;
    // Alle locaties has no radius. Otherwise unknown/infinite distance stays out.
    const outsideRadius =
      !allLocations && !trip && !(event.distanceKm <= state.maxDistanceKm);
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
    if (outsideRadius) {
      // Known place only: an event without coordinates has no distance to show.
      if (Number.isFinite(event.distanceKm)) outOfRadius.push(event);
      return false;
    }
    return true;
  });

  const ineligible = prepared.filter(
    (event) => event.participation.status === "ineligible",
  );
  const hiddenStrict = ineligible.length;

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

  const beyondRadius = outOfRadius
    .filter((event) => event.participation.includedByDefault)
    .sort((a, b) => a.distanceKm - b.distanceKm);

  return { visible, hiddenStrict, ineligible, guidelineHidden, beyondRadius };
}

/** Guideline age given and the user's age falls outside it (not a hard bar). */
export function isOutsideGuidelineAge(event: PreparedEvent): boolean {
  return (
    event.participation.status === "guideline" &&
    event.participation.inRange === false
  );
}

/**
 * Split results so events outside their guideline age can go in a separate,
 * collapsed block below the main results. Order within each part is kept.
 */
export function splitByGuidelineAge<T extends PreparedEvent>(
  events: T[],
): { fitting: T[]; outsideGuideline: T[] } {
  const fitting: T[] = [];
  const outsideGuideline: T[] = [];
  for (const event of events) {
    if (isOutsideGuidelineAge(event)) outsideGuideline.push(event);
    else fitting.push(event);
  }
  return { fitting, outsideGuideline };
}

export { placeLabel };

export type OutsideFilterHint = {
  id: "when" | "types" | "price" | "singles" | "availability" | "trips" | "strict";
  /** Events you would see extra when only this filter is let go. */
  count: number;
  /** Short line, e.g. "3 op een andere datum". */
  label: string;
  /** Patch that lets this filter go. */
  patch: Partial<SearchState>;
};

/**
 * Per active filter: how many joinable events you would see extra if only
 * that filter were let go. Distance and age have their own boxes.
 */
export function outsideFilterHints(
  events: Event[],
  state: SearchState,
  now = new Date(),
): OutsideFilterHint[] {
  const shown = new Set(
    matchingEvents(events, state, now).visible.map((event) => event.id),
  );
  const candidates: Array<{
    id: OutsideFilterHint["id"];
    active: boolean;
    patch: Partial<SearchState>;
    one: string;
    many: string;
  }> = [
    {
      id: "when",
      active: state.when !== "any",
      patch: { when: "any", date: null },
      one: "op een andere datum",
      many: "op een andere datum",
    },
    {
      id: "types",
      active:
        state.typesMode !== "all" ||
        state.categories.length > 0 ||
        state.activities.length > 0,
      patch: { typesMode: "all", categories: [], activities: [] },
      one: "van een andere soort",
      many: "van een andere soort",
    },
    {
      id: "price",
      active: state.price !== "any",
      patch: { price: "any" },
      one: "in een andere prijsklasse",
      many: "in een andere prijsklasse",
    },
    {
      id: "singles",
      active: state.singlesOnly,
      patch: { singlesOnly: false },
      one: "niet enkel voor singles",
      many: "niet enkel voor singles",
    },
    {
      id: "availability",
      active: state.availability !== "any",
      patch: { availability: "any" },
      one: "met een andere beschikbaarheid",
      many: "met een andere beschikbaarheid",
    },
    {
      id: "trips",
      active: !state.trips,
      patch: { trips: true },
      one: "reis",
      many: "reizen",
    },
    {
      id: "strict",
      active: state.strictOnly,
      patch: { strictOnly: false },
      one: "met enkel een richtleeftijd",
      many: "met enkel een richtleeftijd",
    },
  ];
  const hints: OutsideFilterHint[] = [];
  for (const candidate of candidates) {
    if (!candidate.active) continue;
    const relaxed = { ...state, ...candidate.patch };
    const count = matchingEvents(events, relaxed, now).visible.filter(
      (event) => !shown.has(event.id),
    ).length;
    if (count === 0) continue;
    hints.push({
      id: candidate.id,
      count,
      label: `${count} ${count === 1 ? candidate.one : candidate.many}`,
      patch: candidate.patch,
    });
  }
  return hints;
}
