/**
 * Normalize intake calendar dates to YYYY-MM-DD (Europe/Brussels day keys).
 */

const MONTHS: Record<string, number> = {
  januari: 1,
  january: 1,
  jan: 1,
  februari: 2,
  february: 2,
  feb: 2,
  maart: 3,
  march: 3,
  mar: 3,
  mrt: 3,
  april: 4,
  apr: 4,
  mei: 5,
  may: 5,
  juni: 6,
  june: 6,
  jun: 6,
  juli: 7,
  july: 7,
  jul: 7,
  augustus: 8,
  august: 8,
  aug: 8,
  september: 9,
  sep: 9,
  oktober: 10,
  october: 10,
  okt: 10,
  oct: 10,
  november: 11,
  nov: 11,
  december: 12,
  dec: 12,
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** True when value is a concrete event calendar day (not a placeholder year). */
export function isIsoYmd(value: string | null | undefined): boolean {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return false;
  const year = Number(value.trim().slice(0, 4));
  return Number.isFinite(year) && year >= 2020 && year < 2090;
}

/**
 * Accept ISO YYYY-MM-DD or common NL/EN long forms ("31 Oktober 2026").
 */
export function normalizeIntakeDateToYmd(
  raw: string | null | undefined,
): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (isIsoYmd(trimmed)) return trimmed.slice(0, 10);

  const isoPrefix = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoPrefix && isIsoYmd(isoPrefix[1]!)) return isoPrefix[1]!;

  const long = trimmed.match(
    /^(\d{1,2})\s+([A-Za-zÀ-ÿ.]+)\s+(20\d{2})\b/,
  );
  if (long) {
    const day = Number(long[1]);
    const year = Number(long[3]);
    const monthKey = long[2]!.toLowerCase().replace(/\./g, "");
    const month =
      MONTHS[monthKey] ??
      MONTHS[monthKey.slice(0, 3)] ??
      null;
    if (month && day >= 1 && day <= 31 && year >= 2020 && year < 2090) {
      return `${year}-${pad(month)}-${pad(day)}`;
    }
  }

  const dmy = trimmed.match(/^(\d{1,2})[./-](\d{1,2})[./-](20\d{2})$/);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    const year = Number(dmy[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && year < 2090) {
      return `${year}-${pad(month)}-${pad(day)}`;
    }
  }

  return null;
}

export function addCalendarDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!));
  dt.setUTCDate(dt.getUTCDate() + days);
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

/** Europe/Brussels offset for a calendar date (+01 winter / +02 summer). */
export function brusselsOffsetForDate(dateYmd: string): "+01:00" | "+02:00" {
  const utcNoon = new Date(`${dateYmd}T12:00:00.000Z`);
  if (Number.isNaN(utcNoon.getTime())) return "+01:00";
  const brusselsHour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Brussels",
      hour: "2-digit",
      hour12: false,
    }).format(utcNoon),
  );
  return brusselsHour - 12 >= 2 ? "+02:00" : "+01:00";
}

/**
 * Read a DB `starts_at` (Date, ISO string, or timestamptz text) as Europe/Brussels
 * wall-clock date + HH:MM. Never use String(value).slice — Neon may return Date
 * or UTC `…Z` / `…+00` forms where slice(11,16) is not Brussels local time.
 */
export function brusselsWallDateTimeFromDb(
  startsAt: string | Date | null | undefined,
): { date: string; time: string } | null {
  if (startsAt == null) return null;
  const d =
    startsAt instanceof Date
      ? startsAt
      : new Date(typeof startsAt === "string" ? startsAt : String(startsAt));
  if (Number.isNaN(d.getTime())) return null;

  const dateParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Brussels",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const year = dateParts.find((p) => p.type === "year")?.value;
  const month = dateParts.find((p) => p.type === "month")?.value;
  const day = dateParts.find((p) => p.type === "day")?.value;
  if (!year || !month || !day) return null;

  const timeParts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Brussels",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const hour = timeParts.find((p) => p.type === "hour")?.value;
  const minute = timeParts.find((p) => p.type === "minute")?.value;
  if (hour == null || minute == null) return null;

  return { date: `${year}-${month}-${day}`, time: `${hour}:${minute}` };
}

/**
 * Build timestamptz strings from intake date/time fields.
 * DB requires starts_at NOT NULL: when clock is unknown we still store a
 * technical noon placeholder but set timeUnknown=true so callers mark
 * startTimeDisplayNote / tags (never treat noon as a confirmed hour).
 */
export function buildIntakeStartsAt(input: {
  startDate: string;
  startTime?: string;
}): { startsAt: string; dateUnknown: boolean; timeUnknown: boolean } | null {
  const date = normalizeIntakeDateToYmd(input.startDate);
  if (!date || !isIsoYmd(date)) return null;
  const hasTime = Boolean(
    input.startTime && /^\d{2}:\d{2}/.test(input.startTime.trim()),
  );
  const time = hasTime ? input.startTime!.trim().slice(0, 5) : "12:00";
  return {
    startsAt: `${date}T${time}:00${brusselsOffsetForDate(date)}`,
    dateUnknown: false,
    timeUnknown: !hasTime,
  };
}

/** Consumer-safe note when wall-clock was never confirmed. */
export const UNKNOWN_START_TIME_NOTE = "startuur nog te bevestigen";

export function buildIntakeEndsAt(input: {
  startDate: string;
  startTime?: string;
  endTime?: string;
}): string | null {
  const startDate = normalizeIntakeDateToYmd(input.startDate);
  const end = (input.endTime ?? "").trim();
  if (!startDate || !isIsoYmd(startDate) || !end || !/^\d{2}:\d{2}/.test(end)) {
    return null;
  }
  const endTime = end.slice(0, 5);
  const startTime =
    input.startTime && /^\d{2}:\d{2}/.test(input.startTime)
      ? input.startTime.slice(0, 5)
      : null;
  const endDate =
    startTime && endTime <= startTime
      ? addCalendarDays(startDate, 1)
      : startDate;
  return `${endDate}T${endTime}:00${brusselsOffsetForDate(endDate)}`;
}
