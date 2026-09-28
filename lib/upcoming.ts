/**
 * "Binnenkort" sticker strip: global upcoming published editions.
 * Filter-independent. No eligibility / location / activity coupling.
 * Derived from the in-memory public feed (no extra DB queries).
 */
import {
  addDays,
  brusselsToday,
  diffDays,
  formatDayMonth,
  weekdayIndex,
} from "@/lib/dates";
import type { Event } from "@/types/event";

export const UPCOMING_WINDOW_DAYS = 14;
export const UPCOMING_MAX_COUNT = 8;
/** Soft cap so Brussels never crowds out Flanders when both exist. */
export const UPCOMING_MAX_BRUSSELS = 2;

const WEEKDAY_SHORT = ["zo", "ma", "di", "wo", "do", "vr", "za"] as const;

const WALLONIA_REGION =
  /wallon|hainaut|namur|li[eè]ge|luik|luxembourg|brabant\s*wallon|charleroi|mons|arlon|gembloux|huy|herve|verviers|tournai|wavre|nivelles|ottignies/i;

const WALLONIA_CITY =
  /^(namur|li[eè]ge|luik|charleroi|mons|arlon|gembloux|huy|herve|verviers|tournai|wavre|nivelles|ottignies|louvain-la-neuve|sterrebeek|waterloo|la hulpe|marche-en-famenne)$/i;

const FLANDERS_REGION =
  /antwerpen|oost-?vlaanderen|west-?vlaanderen|vlaams-?brabant|limburg|vlaanderen|flanders/i;

const FLANDERS_CITY =
  /antwerpen|gent|brugge|leuven|hasselt|mechelen|kortrijk|oostende|aalst|sint-niklaas|roeselare|genk|turnhout|vilvoorde|dendermonde|lokeren|waregem|ieper|eeklo|holsbeek|tremelo|heusden|zolder|maasmechelen|beringen|lommel|tongeren|sint-truiden|deinze|gooik|oostkamp|stekene|haacht|ronse|genk|waregem|middelheim/i;

const BRUSSELS_PLACE =
  /brussel|bruxelles|etterbeek|koekelberg|uccle|ixelles|schaarbeek|woluwe|anderlecht|jette|vorst|sint-gillis|elsene/i;

export type UpcomingUrgencyLabel = "Vandaag" | "Morgen" | string;

export type UpcomingSelection = {
  events: Event[];
  windowDays: typeof UPCOMING_WINDOW_DAYS;
};

export type UpcomingGeoFocus = "flanders" | "brussels" | "wallonia" | "other";

export function isUpcomingStart(event: Event, today: string): boolean {
  return event.startDate >= today;
}

export function isWithinUpcomingWindow(
  event: Event,
  today: string,
  windowDays: number = UPCOMING_WINDOW_DAYS,
): boolean {
  if (!isUpcomingStart(event, today)) return false;
  return event.startDate <= addDays(today, windowDays);
}

export function isWalloniaEvent(event: Pick<Event, "region" | "city">): boolean {
  const region = (event.region ?? "").trim();
  const city = (event.city ?? "").trim();
  if (region && WALLONIA_REGION.test(region)) return true;
  if (city && WALLONIA_CITY.test(city)) return true;
  return false;
}

export function isBrusselsEvent(event: Pick<Event, "region" | "city">): boolean {
  const region = (event.region ?? "").trim();
  const city = (event.city ?? "").trim();
  if (BRUSSELS_PLACE.test(region) || BRUSSELS_PLACE.test(city)) return true;
  return false;
}

export function isFlandersEvent(event: Pick<Event, "region" | "city">): boolean {
  if (isWalloniaEvent(event) || isBrusselsEvent(event)) return false;
  const region = (event.region ?? "").trim();
  const city = (event.city ?? "").trim();
  if (region && FLANDERS_REGION.test(region)) return true;
  if (city && FLANDERS_CITY.test(city)) return true;
  return false;
}

export function eventGeoFocus(
  event: Pick<Event, "region" | "city">,
): UpcomingGeoFocus {
  if (isWalloniaEvent(event)) return "wallonia";
  if (isBrusselsEvent(event)) return "brussels";
  if (isFlandersEvent(event)) return "flanders";
  return "other";
}

export function upcomingUrgencyLabel(
  startDate: string,
  today = brusselsToday(),
): UpcomingUrgencyLabel {
  const days = diffDays(today, startDate);
  if (days === 0) return "Vandaag";
  if (days === 1) return "Morgen";
  const day = WEEKDAY_SHORT[weekdayIndex(startDate)];
  return `${day} ${formatDayMonth(startDate)}`;
}

/** Compact sticker text: `za 3 okt · Title` (+ city when not already in title). */
export function upcomingStickerLabel(
  event: Pick<Event, "title" | "city" | "startDate">,
  today = brusselsToday(),
): string {
  const when = upcomingUrgencyLabel(event.startDate, today);
  const title = event.title.trim();
  const city = (event.city ?? "").trim();
  const cityInTitle =
    city.length > 0 && title.toLowerCase().includes(city.toLowerCase());
  if (city && !cityInTitle) {
    return `${when} · ${title} · ${city}`;
  }
  return `${when} · ${title}`;
}

function sortSoonest(events: Event[]): Event[] {
  return [...events].sort((a, b) => {
    const byDate = a.startDate.localeCompare(b.startDate);
    if (byDate !== 0) return byDate;
    return (a.startTime ?? "99:99").localeCompare(b.startTime ?? "99:99");
  });
}

/**
 * Global product strip selection. Ignores user search/filter state entirely.
 * Flanders first, Brussels selective, Wallonia not promoted.
 */
export function selectUpcomingEvents(
  events: Event[],
  now = new Date(),
): UpcomingSelection {
  const today = brusselsToday(now);
  const windowDays = UPCOMING_WINDOW_DAYS;

  const pool = events.filter((event) => {
    if (!event.startDate) return false;
    if (!isWithinUpcomingWindow(event, today, windowDays)) return false;
    if (isWalloniaEvent(event)) return false;
    return true;
  });

  if (pool.length === 0) {
    return { events: [], windowDays };
  }

  const flanders = sortSoonest(
    pool.filter((event) => eventGeoFocus(event) === "flanders"),
  );
  const brussels = sortSoonest(
    pool.filter((event) => eventGeoFocus(event) === "brussels"),
  );
  const other = sortSoonest(
    pool.filter((event) => eventGeoFocus(event) === "other"),
  );

  const out: Event[] = [];
  for (const event of flanders) {
    if (out.length >= UPCOMING_MAX_COUNT) break;
    out.push(event);
  }

  let brusselsTaken = 0;
  for (const event of brussels) {
    if (out.length >= UPCOMING_MAX_COUNT) break;
    if (brusselsTaken >= UPCOMING_MAX_BRUSSELS) break;
    out.push(event);
    brusselsTaken += 1;
  }

  for (const event of other) {
    if (out.length >= UPCOMING_MAX_COUNT) break;
    out.push(event);
  }

  return { events: sortSoonest(out), windowDays };
}
