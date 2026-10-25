/**
 * Public visibility for an event edition.
 * Known end clock wins. Without an end clock the edition stays visible
 * through the end of its last local calendar day in Europe/Brussels.
 * Multi-day editions use the known end date. Exactly at the end instant
 * the edition is past. Records are never deleted here.
 */
import { brusselsOffsetForDate } from "@/lib/aanvoer/dates";
import { addDays } from "@/lib/dates";

export type EventVisibilityInput = {
  startDate: string;
  endDate?: string | null;
  endTime?: string | null;
};

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const CLOCK = /^(\d{2}):(\d{2})/;

/**
 * Local midnight after `ymd`, using that day's Brussels offset.
 * EU transitions happen at 01:00 UTC, so the offset still in force at the
 * end of the calendar day is the noon offset of that same day.
 */
export function endOfBrusselsDayInstant(ymd: string): Date {
  const next = addDays(ymd, 1);
  const offset = brusselsOffsetForDate(ymd);
  return new Date(`${next}T00:00:00${offset}`);
}

export function brusselsWallInstant(ymd: string, hhmm: string): Date {
  const offset = brusselsOffsetForDate(ymd);
  return new Date(`${ymd}T${hhmm}:00${offset}`);
}

function clockOrNull(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = value.trim().match(CLOCK);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return `${match[1]}:${match[2]}`;
}

/** Last moment the edition is still shown on ordinary public overviews. */
export function visibleUntil(event: EventVisibilityInput): Date | null {
  const lastDay = event.endDate?.trim() || event.startDate?.trim();
  if (!lastDay || !YMD.test(lastDay)) return null;
  const clock = clockOrNull(event.endTime);
  if (clock) return brusselsWallInstant(lastDay, clock);
  return endOfBrusselsDayInstant(lastDay);
}

export function isCurrentEvent(
  event: EventVisibilityInput,
  now = new Date(),
): boolean {
  const until = visibleUntil(event);
  if (!until || Number.isNaN(until.getTime())) return false;
  return now.getTime() < until.getTime();
}

/**
 * Stored edition timestamps (timestamptz). A present endsAt is a known end.
 * A missing endsAt keeps the edition through the Brussels start day, so a
 * noon placeholder for an unknown clock is not treated as the end.
 */
export function isStoredEditionCurrent(
  edition: { startsAt: string | null; endsAt?: string | null },
  now = new Date(),
): boolean {
  if (edition.endsAt) {
    const end = new Date(edition.endsAt);
    if (!Number.isNaN(end.getTime())) return now.getTime() < end.getTime();
  }
  if (!edition.startsAt) return false;
  const start = new Date(edition.startsAt);
  if (Number.isNaN(start.getTime())) return false;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Brussels",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(start);
  if (!YMD.test(parts)) return false;
  const until = endOfBrusselsDayInstant(parts);
  return now.getTime() < until.getTime();
}
