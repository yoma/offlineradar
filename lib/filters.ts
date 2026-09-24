import { findPlace } from "@/data/places";
import {
  addDays,
  brusselsToday,
  nextWeekRange,
  weekendRange,
} from "@/lib/dates";
import { withUserDistance } from "@/lib/distance";
import { isEligibleForEvent } from "@/lib/eligibility";
import type { Event } from "@/types/event";
import type { SearchState } from "@/types/search";

export type PreparedEvent = Event & {
  eligibility: ReturnType<typeof isEligibleForEvent>;
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
    return event.startDate.slice(0, 7) === today.slice(0, 7) && eventEnd(event) >= today;
  }
  if (state.when === "date" && state.date) {
    return overlaps(event, state.date, state.date);
  }
  return true;
}

function matchesPrice(event: Event, state: SearchState): boolean {
  if (state.price === "any") return true;
  if (event.price == null) return false;
  if (state.price === "free") return event.price === 0;
  if (state.price === "lt25") return event.price > 0 && event.price < 25;
  if (state.price === "mid") return event.price >= 25 && event.price <= 50;
  return event.price > 50;
}

function matchesAvailability(event: Event, state: SearchState): boolean {
  if (state.availability === "any") return true;
  if (state.availability === "open") {
    return event.capacityStatus === "available" || event.capacityStatus === "limited";
  }
  if (state.availability === "almost_full") {
    return event.capacityStatus === "almost_full";
  }
  return event.capacityStatus === "waitlist";
}

export function prepareEvents(events: Event[], state: SearchState): PreparedEvent[] {
  return events.map((event) => {
    const placed = withUserDistance(event, state.placeId);
    return {
      ...placed,
      eligibility: isEligibleForEvent({ age: state.age }, placed),
    };
  });
}

export function matchingEvents(
  events: Event[],
  state: SearchState,
  now = new Date(),
): { visible: PreparedEvent[]; hiddenStrict: number; guidelineHidden: number } {
  const today = brusselsToday(now);
  const prepared = prepareEvents(events, state).filter((event) => {
    if (!matchesWhen(event, state, today)) return false;
    if (event.distanceKm > state.maxDistanceKm) return false;
    if (
      state.categories.length > 0 &&
      !state.categories.includes(event.category)
    ) {
      return false;
    }
    if (
      state.activities.length > 0 &&
      !state.activities.some((activity) => event.activities.includes(activity))
    ) {
      return false;
    }
    if (!matchesPrice(event, state)) return false;
    if (state.singlesOnly && event.singlesOnly !== true) return false;
    if (!matchesAvailability(event, state)) return false;
    return true;
  });

  const hiddenStrict = prepared.filter(
    (event) => event.eligibility.status === "ineligible",
  ).length;

  const guidelineHidden = state.strictOnly
    ? prepared.filter((event) => event.eligibility.status === "guideline").length
    : 0;

  const visible = prepared.filter((event) => {
    if (!event.eligibility.includedByDefault) return false;
    if (state.strictOnly && event.eligibility.status === "guideline") return false;
    return true;
  });

  return { visible, hiddenStrict, guidelineHidden };
}

export function placeLabel(placeId: string): string {
  return findPlace(placeId).label;
}
