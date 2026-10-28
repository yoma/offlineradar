/**
 * When promo reels go out (config/promo-reels.ts → schedule) and the real
 * event count they may mention. Light on purpose: the site imports this.
 */

import { PROMO_REELS_CONFIG } from "@/config/promo-reels";
import { addDays, brusselsToday, weekdayIndex } from "@/lib/dates";
import { brusselsWallInstant } from "@/lib/event-visibility";
import type { Event } from "@/types/event";

/** Publish time of the promo reel on a day (Brussels). */
export function promoPostTime(ymd: string): Date {
  return brusselsWallInstant(ymd, PROMO_REELS_CONFIG.schedule.time);
}

/** The next promo moment after `now` (for a promo reel made by hand). */
export function nextPromoTime(now = new Date()): Date {
  const today = brusselsToday(now);
  for (let d = 0; d <= 7; d++) {
    const ymd = addDays(today, d);
    if (!PROMO_REELS_CONFIG.schedule.weekdays.includes(weekdayIndex(ymd))) continue;
    const at = promoPostTime(ymd);
    if (at.getTime() > now.getTime()) return at;
  }
  return promoPostTime(addDays(today, 7));
}

/** Published events starting in the 7 days from `from` (Brussels dates). */
export function countEventsThisWeek(catalog: Event[], from = new Date()): number {
  const start = brusselsToday(from);
  const end = addDays(start, 6);
  return catalog.filter((e) => e.startDate >= start && e.startDate <= end).length;
}
