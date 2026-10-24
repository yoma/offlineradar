/**
 * Objective Instagram event selection.
 * Reuses geo focus from the website "Binnenkort" ticker.
 * Never invents "best" events — transparent priority + variety caps.
 */

import {
  addDays,
  brusselsToday,
  diffDays,
  formatDayMonth,
} from "@/lib/dates";
import {
  eventGeoFocus,
  isWalloniaEvent,
} from "@/lib/upcoming";
import type { ActivityId, Event } from "@/types/event";
import {
  IG_CAROUSEL_MAX,
  IG_CAROUSEL_MIN,
  IG_MAX_BRUSSELS,
  IG_MAX_SAME_ACTIVITY,
  IG_MAX_SAME_ORGANIZER,
  IG_NIEUW_MAX_EVENTS,
  IG_THIS_WEEK_MAX,
  IG_THIS_WEEK_MAX_EVENTS,
  IG_THIS_WEEK_MIN,
  IG_WINDOW_MID,
  IG_WINDOW_NEAR,
  type InstagramFormatId,
} from "@/lib/instagram/constants";

/** Brussels wall-clock HH:MM for same-day start checks. */
function brusselsHm(now: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Brussels",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);
}

export type InstagramPriorityBand = "near" | "mid" | "later";

export type InstagramSelectionOptions = {
  now?: Date;
  /** Event ids already used in recent Instagram concepts (avoid repeats). */
  recentlyUsedIds?: ReadonlySet<string>;
  format: InstagramFormatId;
};

export type InstagramSelectionResult = {
  format: InstagramFormatId;
  events: Event[];
  bandCounts: Record<InstagramPriorityBand, number>;
  skippedReasons: { id: string; reason: string }[];
  periodLabel: string;
};

function primaryActivity(event: Event): ActivityId | "other" {
  return event.activities[0] ?? "other";
}

function organizerKey(event: Event): string {
  return (event.organizerSlug || event.organizerName || event.id)
    .trim()
    .toLowerCase();
}

/** Sold out / cancelled-style statuses must never be promoted. */
export function isInstagramEligibleCapacity(event: Event): boolean {
  if (event.capacityStatus === "sold_out") return false;
  return true;
}

/** Cancelled / expired signals from tags or title — never invent availability. */
export function isInstagramCancelled(event: Event): boolean {
  const tags = (event.tags ?? []).map((t) => t.toLowerCase());
  if (
    tags.some((t) =>
      /cancel|geannuleerd|afgelast|expired|verlopen/.test(t),
    )
  ) {
    return true;
  }
  const title = (event.title ?? "").toLowerCase();
  return /\b(geannuleerd|afgelast|cancelled)\b/.test(title);
}

/**
 * True when the event has already started relative to `now` (Brussels).
 * Same-day events without a start time stay eligible until end of day.
 */
export function hasInstagramEventStarted(event: Event, now: Date): boolean {
  const today = brusselsToday(now);
  if (!event.startDate) return true;
  if (event.startDate < today) return true;
  if (event.startDate > today) return false;
  if (!event.startTime) return false;
  const hm = event.startTime.trim().slice(0, 5);
  if (!/^\d{2}:\d{2}$/.test(hm)) return false;
  return hm <= brusselsHm(now);
}

/** Extra Wallonia / Ardennen place names beyond the website ticker helper. */
const EXTRA_WALLONIA =
  /la\s*roche|rochefort|dinant|bastogne|viroinval|vielsalm|herve|spa|stavelot|malmedy|ardenne/i;

function isInstagramWallonia(event: Pick<Event, "region" | "city" | "title">): boolean {
  if (isWalloniaEvent(event)) return true;
  const blob = `${event.region ?? ""} ${event.city ?? ""} ${event.title ?? ""}`;
  return EXTRA_WALLONIA.test(blob);
}

/**
 * Hard gates shared by all Instagram formats.
 * Only published consumer-feed events should be passed in (listEvents).
 * Pass `now` so same-day start times are checked against publish moment.
 */
export function isInstagramBaseEligible(
  event: Event,
  today: string,
  now?: Date,
): boolean {
  if (!event.startDate) return false;
  if (event.startDate < today) return false;
  if (!isInstagramEligibleCapacity(event)) return false;
  if (isInstagramCancelled(event)) return false;
  if (now && hasInstagramEventStarted(event, now)) return false;
  // Vlaanderen + Brussel focus (no Wallonië / Ardennen promo).
  if (isInstagramWallonia(event)) return false;
  return true;
}

export function priorityBand(
  event: Event,
  today: string,
): InstagramPriorityBand {
  const days = diffDays(today, event.startDate);
  if (days <= IG_WINDOW_NEAR) return "near";
  if (days <= IG_WINDOW_MID) return "mid";
  return "later";
}

function geoRank(event: Event): number {
  const geo = eventGeoFocus(event);
  if (geo === "flanders") return 0;
  if (geo === "brussels") return 1;
  if (geo === "other") return 2;
  return 3;
}

/** Soonest first; within same day prefer Flanders over Brussels (ticker logic). */
function sortByStart(events: Event[]): Event[] {
  return [...events].sort((a, b) => {
    const byDate = a.startDate.localeCompare(b.startDate);
    if (byDate !== 0) return byDate;
    const byGeo = geoRank(a) - geoRank(b);
    if (byGeo !== 0) return byGeo;
    return (a.startTime ?? "99:99").localeCompare(b.startTime ?? "99:99");
  });
}

/**
 * Greedy variety pick: walk priority-ordered candidates and apply soft caps.
 */
function pickWithVariety(
  ordered: Event[],
  max: number,
): { picked: Event[]; skipped: { id: string; reason: string }[] } {
  const picked: Event[] = [];
  const skipped: { id: string; reason: string }[] = [];
  const activityCounts = new Map<string, number>();
  const organizerCounts = new Map<string, number>();
  let brusselsTaken = 0;

  for (const event of ordered) {
    if (picked.length >= max) break;

    const activity = primaryActivity(event);
    const org = organizerKey(event);
    const geo = eventGeoFocus(event);

    if (geo === "brussels" && brusselsTaken >= IG_MAX_BRUSSELS) {
      skipped.push({ id: event.id, reason: "brussels_cap" });
      continue;
    }
    if ((activityCounts.get(activity) ?? 0) >= IG_MAX_SAME_ACTIVITY) {
      skipped.push({ id: event.id, reason: "activity_cap" });
      continue;
    }
    if ((organizerCounts.get(org) ?? 0) >= IG_MAX_SAME_ORGANIZER) {
      skipped.push({ id: event.id, reason: "organizer_cap" });
      continue;
    }

    picked.push(event);
    activityCounts.set(activity, (activityCounts.get(activity) ?? 0) + 1);
    organizerCounts.set(org, (organizerCounts.get(org) ?? 0) + 1);
    if (geo === "brussels") brusselsTaken += 1;
  }

  return { picked, skipped };
}

function formatPeriodLabel(
  events: Event[],
  today: string,
  format: InstagramFormatId,
): string {
  if (events.length === 0) {
    if (format === "deze_week") return "Geen geschikte events deze week";
    if (format === "nieuw") return "Geen nieuwe events";
    return "Geen aankomende events";
  }
  if (format === "deze_week") {
    return `${formatDayMonth(today)} – ${formatDayMonth(addDays(today, IG_THIS_WEEK_MAX))}`;
  }
  const dates = events.map((e) => e.startDate).sort();
  const first = dates[0];
  const last = dates[dates.length - 1];
  if (first === last) return formatDayMonth(first);
  return `${formatDayMonth(first)} – ${formatDayMonth(last)}`;
}

/**
 * Select events for one Instagram format using transparent rules.
 *
 * Priority (Format A / default):
 * 1. Published, start within 0–7 days
 * 2. Within 8–14 days
 * 3. Later starts, most recently published first
 *
 * Format B (deze_week): only 3–7 days ahead.
 * Format C (nieuw): later or mid window, sorted by published/addedAt desc.
 */
export function selectInstagramEvents(
  catalog: Event[],
  options: InstagramSelectionOptions,
): InstagramSelectionResult {
  const now = options.now ?? new Date();
  const today = brusselsToday(now);
  const used = options.recentlyUsedIds ?? new Set<string>();
  const skippedReasons: { id: string; reason: string }[] = [];

  const base = catalog.filter((event) => {
    if (!isInstagramBaseEligible(event, today, now)) {
      skippedReasons.push({ id: event.id, reason: "base_ineligible" });
      return false;
    }
    if (used.has(event.id)) {
      skippedReasons.push({ id: event.id, reason: "recently_used" });
      return false;
    }
    return true;
  });

  const bandCounts: Record<InstagramPriorityBand, number> = {
    near: 0,
    mid: 0,
    later: 0,
  };
  for (const event of base) {
    bandCounts[priorityBand(event, today)] += 1;
  }

  let ordered: Event[] = [];
  let max = IG_CAROUSEL_MAX;

  if (options.format === "deze_week") {
    max = IG_THIS_WEEK_MAX_EVENTS;
    ordered = sortByStart(
      base.filter((event) => {
        const days = diffDays(today, event.startDate);
        return days >= IG_THIS_WEEK_MIN && days <= IG_THIS_WEEK_MAX;
      }),
    );
  } else if (options.format === "nieuw") {
    max = IG_NIEUW_MAX_EVENTS;
    const midAndLater = base.filter((event) => {
      const band = priorityBand(event, today);
      return band === "mid" || band === "later";
    });
    ordered = [...midAndLater].sort((a, b) => {
      const byAdded = (b.addedAt || "").localeCompare(a.addedAt || "");
      if (byAdded !== 0) return byAdded;
      return a.startDate.localeCompare(b.startDate);
    });
  } else {
    // Format A — Binnenkort: near → mid → later (later by recency)
    const near = sortByStart(
      base.filter((e) => priorityBand(e, today) === "near"),
    );
    const mid = sortByStart(
      base.filter((e) => priorityBand(e, today) === "mid"),
    );
    const later = [...base.filter((e) => priorityBand(e, today) === "later")].sort(
      (a, b) => {
        const byAdded = (b.addedAt || "").localeCompare(a.addedAt || "");
        if (byAdded !== 0) return byAdded;
        return a.startDate.localeCompare(b.startDate);
      },
    );
    ordered = [...near, ...mid, ...later];
  }

  const { picked, skipped } = pickWithVariety(ordered, max);
  skippedReasons.push(...skipped);

  // Format A: require a minimum carousel size when enough candidates exist.
  if (
    options.format === "binnenkort" &&
    picked.length < IG_CAROUSEL_MIN &&
    ordered.length >= IG_CAROUSEL_MIN
  ) {
    // Relaxation already applied via caps; keep what we have.
  }

  return {
    format: options.format,
    events: picked,
    bandCounts,
    skippedReasons,
    periodLabel: formatPeriodLabel(picked, today, options.format),
  };
}

/** True when a format should not produce a post (insufficient suitable events). */
export function hasEnoughEventsForFormat(
  format: InstagramFormatId,
  count: number,
): boolean {
  if (format === "binnenkort") return count >= IG_CAROUSEL_MIN;
  if (format === "deze_week") return count >= 2;
  return count >= 1;
}
