/**
 * "Binnenkort" strip: upcoming published editions from the in-memory feed.
 * No extra DB queries. Reuses matchingEvents / eligibility.
 */
import { findPlace } from "@/data/places";
import {
  addDays,
  brusselsToday,
  diffDays,
  formatDayMonth,
  weekendRange,
  weekdayIndex,
} from "@/lib/dates";
import { matchingEvents, type PreparedEvent } from "@/lib/filters";
import {
  type PublicActivityGroupId,
  PUBLIC_ACTIVITY_GROUPS,
} from "@/lib/public-activity-groups";
import { calculatePreferenceScore } from "@/lib/ranking";
import type { Event } from "@/types/event";
import type { SearchState } from "@/types/search";

export const UPCOMING_PRIMARY_DAYS = 7;
export const UPCOMING_FALLBACK_DAYS = 14;
export const UPCOMING_MIN_COUNT = 3;
export const UPCOMING_MAX_COUNT = 8;
export const UPCOMING_MAX_PER_FORMAT = 3;

const WEEKDAY_SHORT = ["zo", "ma", "di", "wo", "do", "vr", "za"] as const;

const WALLONIA_REGION =
  /wallon|hainaut|namur|li[eè]ge|luik|luxembourg|brabant\s*wallon|charleroi|mons|arlon|gembloux|huy|herve|verviers|tournai|wavre|nivelles|ottignies/i;

const WALLONIA_CITY =
  /^(namur|li[eè]ge|luik|charleroi|mons|arlon|gembloux|huy|herve|verviers|tournai|wavre|nivelles|ottignies|louvain-la-neuve|sterrebeek|waterloo|la hulpe|marche-en-famenne)$/i;

const FLANDERS_PLACE =
  /antwerpen|gent|brugge|leuven|hasselt|mechelen|kortrijk|oostende|aalst|sint-niklaas|roeselare|genk|turnhout|vilvoorde|dendermonde|lokeren|waregem|ieper|eeklo|holsbeek|tremelo|heusden|zolder|maasmechelen|beringen|lommel|tongeren|sint-truiden/i;

const BRUSSELS_PLACE = /brussel|bruxelles|etterbeek|koekelberg|uccle|ixelles|schaarbeek|woluwe/i;

export type UpcomingUrgencyLabel = "Vandaag" | "Morgen" | "Dit weekend" | string;

export type UpcomingSelection = {
  events: PreparedEvent[];
  windowDays: 7 | 14;
};

function eventEnd(event: Event): string {
  return event.endDate ?? event.startDate;
}

/** Started editions (start already past) never appear as upcoming. */
export function isUpcomingStart(event: Event, today: string): boolean {
  return event.startDate >= today;
}

export function isWithinUpcomingWindow(
  event: Event,
  today: string,
  windowDays: number,
): boolean {
  if (!isUpcomingStart(event, today)) return false;
  const last = addDays(today, windowDays);
  return event.startDate <= last;
}

export function isWalloniaEvent(event: Pick<Event, "region" | "city">): boolean {
  const region = (event.region ?? "").trim();
  const city = (event.city ?? "").trim();
  if (region && WALLONIA_REGION.test(region)) return true;
  if (city && WALLONIA_CITY.test(city)) return true;
  return false;
}

export function placeGeoFocus(
  placeId: string,
): "flanders" | "brussels" | "wallonia" | "other" {
  const place = findPlace(placeId);
  const label = `${place.label} ${placeId}`.toLowerCase();
  if (BRUSSELS_PLACE.test(label)) return "brussels";
  if (WALLONIA_REGION.test(label) || WALLONIA_CITY.test(label)) return "wallonia";
  if (FLANDERS_PLACE.test(label)) return "flanders";
  // Default product places are Flanders hubs.
  return "flanders";
}

/**
 * Default strip: do not actively spotlight Wallonia when the user searches
 * from Flanders/Brussels. Explicit Wallonia place keeps those editions.
 */
export function shouldExcludeWalloniaFromStrip(state: SearchState): boolean {
  const focus = placeGeoFocus(state.placeId);
  return focus === "flanders" || focus === "brussels";
}

export function primaryFormatId(
  activities: readonly string[],
): PublicActivityGroupId | "other" {
  for (const group of PUBLIC_ACTIVITY_GROUPS) {
    if (group.activities.some((a) => activities.includes(a))) {
      return group.id;
    }
  }
  return "other";
}

export function upcomingUrgencyLabel(
  startDate: string,
  today = brusselsToday(),
): UpcomingUrgencyLabel {
  const days = diffDays(today, startDate);
  if (days === 0) return "Vandaag";
  if (days === 1) return "Morgen";

  const weekend = weekendRange(today);
  const dow = weekdayIndex(today);
  // Fri–Sun: label sat/sun of this weekend as "Dit weekend".
  if (dow >= 5 || dow === 0) {
    const weekendStart = weekend.start < today ? today : weekend.start;
    if (startDate >= weekendStart && startDate <= weekend.end) {
      return "Dit weekend";
    }
  }

  const day = WEEKDAY_SHORT[weekdayIndex(startDate)];
  return `${day} ${formatDayMonth(startDate)}`;
}

function sortSoonest(
  events: PreparedEvent[],
  state: SearchState,
): PreparedEvent[] {
  return [...events].sort((a, b) => {
    const byDate = a.startDate.localeCompare(b.startDate);
    if (byDate !== 0) return byDate;
    const byTime = (a.startTime ?? "99:99").localeCompare(b.startTime ?? "99:99");
    if (byTime !== 0) return byTime;
    const scoreA = calculatePreferenceScore(a, state).organicScore;
    const scoreB = calculatePreferenceScore(b, state).organicScore;
    return scoreB - scoreA;
  });
}

/**
 * Cap per primary format when alternatives exist.
 * Urgency stays first; fill from deferred if under max.
 */
export function applyFormatDiversity(
  sorted: PreparedEvent[],
  state: SearchState,
  maxPerFormat = UPCOMING_MAX_PER_FORMAT,
  limit = UPCOMING_MAX_COUNT,
): PreparedEvent[] {
  const counts = new Map<string, number>();
  const taken: PreparedEvent[] = [];
  const deferred: PreparedEvent[] = [];
  const formatsInPool = new Set(
    sorted.map((event) => primaryFormatId(event.activities)),
  );
  const multiFormat = formatsInPool.size > 1;

  for (const event of sorted) {
    const format = primaryFormatId(event.activities);
    const count = counts.get(format) ?? 0;
    if (count < maxPerFormat) {
      taken.push(event);
      counts.set(format, count + 1);
    } else {
      deferred.push(event);
    }
    if (taken.length >= limit) {
      return sortSoonest(taken, state);
    }
  }

  while (taken.length < limit && deferred.length > 0) {
    const underCapIdx = deferred.findIndex(
      (event) =>
        (counts.get(primaryFormatId(event.activities)) ?? 0) < maxPerFormat,
    );
    if (underCapIdx >= 0) {
      const [event] = deferred.splice(underCapIdx, 1);
      const format = primaryFormatId(event.activities);
      taken.push(event);
      counts.set(format, (counts.get(format) ?? 0) + 1);
      continue;
    }
    // Same-format-only pools may still fill the strip.
    if (!multiFormat) {
      taken.push(deferred.shift()!);
      continue;
    }
    break;
  }

  return sortSoonest(taken, state);
}

/**
 * Select upcoming cards from the already-loaded catalog.
 * Overrides `when`/`date` so the strip always uses the 7→14 urgency window,
 * while keeping location, age eligibility, categories, and activity filters.
 */
export function selectUpcomingEvents(
  events: Event[],
  state: SearchState,
  now = new Date(),
): UpcomingSelection {
  const today = brusselsToday(now);
  const stripState: SearchState = {
    ...state,
    when: "any",
    date: null,
  };

  const { visible } = matchingEvents(events, stripState, now);
  const excludeWallonia = shouldExcludeWalloniaFromStrip(state);

  const pool = visible.filter((event) => {
    if (eventEnd(event) < today) return false;
    if (!isUpcomingStart(event, today)) return false;
    if (excludeWallonia && isWalloniaEvent(event)) return false;
    return true;
  });

  const inWindow = (days: number) =>
    pool.filter((event) => isWithinUpcomingWindow(event, today, days));

  let windowDays: 7 | 14 = UPCOMING_PRIMARY_DAYS;
  let candidates = inWindow(UPCOMING_PRIMARY_DAYS);
  if (candidates.length < UPCOMING_MIN_COUNT) {
    windowDays = UPCOMING_FALLBACK_DAYS;
    candidates = inWindow(UPCOMING_FALLBACK_DAYS);
  }

  if (candidates.length === 0) {
    return { events: [], windowDays };
  }

  const sorted = sortSoonest(candidates, stripState);
  const eventsOut = applyFormatDiversity(
    sorted,
    stripState,
    UPCOMING_MAX_PER_FORMAT,
    UPCOMING_MAX_COUNT,
  );

  return { events: eventsOut, windowDays };
}
