import { addDays, brusselsToday, weekendRange } from "@/lib/dates";
import { ACTIVITY_LABEL, CATEGORY_LABEL } from "@/lib/format";
import type { Event } from "@/types/event";

export type RefineDatePreset =
  | "all"
  | "today"
  | "weekend"
  | "7d"
  | "30d"
  | "custom";

export type RefineSort = "soonest" | "newest";

/** Special organizer filter: only events from followed organizers. */
export const FOLLOWED_ORGANIZERS_FILTER = "followed";

export type ResultRefinement = {
  q: string;
  datePreset: RefineDatePreset;
  dateFrom: string | null;
  dateTo: string | null;
  sort: RefineSort;
  /** "" = all, "followed" = followed orgs, else organizer slug. */
  organizer: string;
};

export type OrganizerFilterOption = {
  id: string;
  slug: string;
  name: string;
};

export const REFINE_DATE_LABEL: Record<RefineDatePreset, string> = {
  all: "Alle datums",
  today: "Vandaag",
  weekend: "Dit weekend",
  "7d": "Komende 7 dagen",
  "30d": "Komende 30 dagen",
  custom: "Kies periode",
};

export const REFINE_SORT_LABEL: Record<RefineSort, string> = {
  soonest: "Eerstvolgende",
  newest: "Nieuwste toegevoegd",
};

const DATE_PRESETS: RefineDatePreset[] = [
  "all",
  "today",
  "weekend",
  "7d",
  "30d",
  "custom",
];
const SORTS: RefineSort[] = ["soonest", "newest"];

export function defaultResultRefinement(): ResultRefinement {
  return {
    q: "",
    datePreset: "all",
    dateFrom: null,
    dateTo: null,
    sort: "soonest",
    organizer: "",
  };
}

function one(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function parseResultRefinement(
  params: URLSearchParams | Record<string, string | string[] | undefined>,
): ResultRefinement {
  const get =
    params instanceof URLSearchParams
      ? (key: string) => params.get(key) ?? undefined
      : (key: string) => one(params[key]);

  const q = (get("q") ?? "").trim();
  const rawPreset = get("datePreset") ?? "all";
  const datePreset = DATE_PRESETS.includes(rawPreset as RefineDatePreset)
    ? (rawPreset as RefineDatePreset)
    : "all";
  const rawFrom = get("dateFrom");
  const rawTo = get("dateTo");
  const dateFrom =
    datePreset === "custom" && rawFrom && isIsoDate(rawFrom) ? rawFrom : null;
  const dateTo =
    datePreset === "custom" && rawTo && isIsoDate(rawTo) ? rawTo : null;
  const rawSort = get("rsort") ?? get("sort");
  let sort: RefineSort = "soonest";
  if (rawSort === "newest") sort = "newest";
  else if (rawSort === "soonest" || rawSort === "soon") sort = "soonest";
  // Do not hijack main filter sort=match|distance into refinement.

  const rawOrganizer = (get("organizer") ?? "").trim().toLowerCase();
  const organizer = normalizeOrganizerParam(rawOrganizer);

  return {
    q,
    datePreset,
    dateFrom,
    dateTo,
    sort,
    organizer,
  };
}

/** Accept single slug, "followed", or comma-separated slugs. */
export function normalizeOrganizerParam(raw: string): string {
  const value = raw.trim().toLowerCase();
  if (!value) return "";
  if (value === FOLLOWED_ORGANIZERS_FILTER) return FOLLOWED_ORGANIZERS_FILTER;
  const parts = value
    .split(",")
    .map((part) => part.trim())
    .filter((part) => /^[a-z0-9][a-z0-9-]{0,80}$/.test(part));
  return [...new Set(parts)].join(",");
}

export function organizerSlugsFromParam(organizer: string): string[] {
  const normalized = normalizeOrganizerParam(organizer);
  if (!normalized || normalized === FOLLOWED_ORGANIZERS_FILTER) return [];
  return normalized.split(",").filter(Boolean);
}

/**
 * Serialize only refinement keys. Merge onto an existing query that already
 * holds main SearchState params.
 */
export function serializeResultRefinement(
  refinement: ResultRefinement,
  base = new URLSearchParams(),
): URLSearchParams {
  const params = new URLSearchParams(base.toString());
  params.delete("q");
  params.delete("datePreset");
  params.delete("dateFrom");
  params.delete("dateTo");
  params.delete("rsort");
  params.delete("organizer");

  const q = refinement.q.trim();
  if (q) params.set("q", q);
  if (refinement.datePreset !== "all") {
    params.set("datePreset", refinement.datePreset);
  }
  if (refinement.datePreset === "custom") {
    if (refinement.dateFrom) params.set("dateFrom", refinement.dateFrom);
    if (refinement.dateTo) params.set("dateTo", refinement.dateTo);
  }
  if (refinement.sort !== "soonest") {
    params.set("rsort", refinement.sort);
  }
  const organizer = normalizeOrganizerParam(refinement.organizer);
  if (organizer) params.set("organizer", organizer);
  return params;
}

export function refinementIsActive(refinement: ResultRefinement): boolean {
  return (
    Boolean(refinement.q.trim()) ||
    refinement.datePreset !== "all" ||
    refinement.sort !== "soonest" ||
    Boolean(refinement.organizer.trim())
  );
}

/** True when text, date, or organizer filter actually narrows results. */
export function refinementFiltersActive(refinement: ResultRefinement): boolean {
  if (refinement.q.trim()) return true;
  if (refinement.organizer.trim()) return true;
  if (refinement.datePreset === "all") return false;
  if (refinement.datePreset === "custom") {
    return Boolean(refinement.dateFrom || refinement.dateTo);
  }
  return true;
}

export function refineDateRange(
  refinement: ResultRefinement,
  today = brusselsToday(),
): { start: string; end: string } | null {
  switch (refinement.datePreset) {
    case "all":
      return null;
    case "today":
      return { start: today, end: today };
    case "weekend": {
      const weekend = weekendRange(today);
      // Remaining weekend days when Sat/Sun already started.
      return {
        start: weekend.start < today ? today : weekend.start,
        end: weekend.end,
      };
    }
    case "7d":
      return { start: today, end: addDays(today, 6) };
    case "30d":
      return { start: today, end: addDays(today, 29) };
    case "custom": {
      const from = refinement.dateFrom;
      const to = refinement.dateTo;
      if (!from && !to) return null;
      if (from && to) {
        return from <= to
          ? { start: from, end: to }
          : { start: to, end: from };
      }
      if (from) return { start: from, end: from };
      return { start: to!, end: to! };
    }
    default:
      return null;
  }
}

function eventOverlapsRange(
  event: Pick<Event, "startDate" | "endDate">,
  range: { start: string; end: string },
): boolean {
  const eventEnd = event.endDate ?? event.startDate;
  return event.startDate <= range.end && eventEnd >= range.start;
}

export function eventSearchHaystack(event: Event): string {
  const parts = [
    event.title,
    event.organizerName,
    event.organizerSlug ?? "",
    event.city,
    event.venue ?? "",
    event.region,
    event.subCategory,
    event.shortDescription,
    CATEGORY_LABEL[event.category] ?? event.category,
    ...event.activities.map((id) => ACTIVITY_LABEL[id] ?? id),
    ...event.activities,
    ...event.tags,
  ];
  return parts.join(" ").toLowerCase();
}

export function matchesTextQuery(event: Event, query: string): boolean {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return true;
  const haystack = eventSearchHaystack(event);
  const tokens = trimmed.split(/\s+/).filter(Boolean);
  return tokens.every((token) => haystack.includes(token));
}

/** Unique organizers present in a result set (canonical ids, display names). */
export function organizersFromEvents(events: Event[]): OrganizerFilterOption[] {
  const byId = new Map<string, OrganizerFilterOption>();
  for (const event of events) {
    const id = event.organizerId?.trim();
    if (!id) continue;
    if (byId.has(id)) continue;
    const slug = (event.organizerSlug ?? "").trim().toLowerCase();
    if (!slug) continue;
    byId.set(id, {
      id,
      slug,
      name: event.organizerName.trim() || slug,
    });
  }
  return [...byId.values()].sort((a, b) =>
    a.name.localeCompare(b.name, "nl", { sensitivity: "base" }),
  );
}

function matchesOrganizerFilter(
  event: Event,
  organizer: string,
  followedOrganizerIds: ReadonlySet<string>,
): boolean {
  const key = normalizeOrganizerParam(organizer);
  if (!key) return true;
  if (key === FOLLOWED_ORGANIZERS_FILTER) {
    return Boolean(
      event.organizerId && followedOrganizerIds.has(event.organizerId),
    );
  }
  const slugs = new Set(organizerSlugsFromParam(key));
  const slug = (event.organizerSlug ?? "").trim().toLowerCase();
  if (slug && slugs.has(slug)) return true;
  return Boolean(event.organizerId && slugs.has(event.organizerId));
}

export function applyResultRefinement<T extends Event>(
  events: T[],
  refinement: ResultRefinement,
  today = brusselsToday(),
  options?: { followedOrganizerIds?: readonly string[] },
): T[] {
  const range = refineDateRange(refinement, today);
  const followed = new Set(options?.followedOrganizerIds ?? []);
  let next = events;
  if (refinement.q.trim()) {
    next = next.filter((event) => matchesTextQuery(event, refinement.q));
  }
  if (refinement.organizer.trim()) {
    next = next.filter((event) =>
      matchesOrganizerFilter(event, refinement.organizer, followed),
    );
  }
  if (range) {
    next = next.filter((event) => eventOverlapsRange(event, range));
  }
  const copy = [...next];
  if (refinement.sort === "newest") {
    return copy.sort((a, b) => b.addedAt.localeCompare(a.addedAt));
  }
  return copy.sort((a, b) => {
    const byDate = a.startDate.localeCompare(b.startDate);
    if (byDate !== 0) return byDate;
    return (a.startTime ?? "").localeCompare(b.startTime ?? "");
  });
}
