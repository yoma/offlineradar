const WEEKDAYS = [
  "zondag",
  "maandag",
  "dinsdag",
  "woensdag",
  "donderdag",
  "vrijdag",
  "zaterdag",
] as const;

const MONTHS = [
  "januari",
  "februari",
  "maart",
  "april",
  "mei",
  "juni",
  "juli",
  "augustus",
  "september",
  "oktober",
  "november",
  "december",
] as const;

const MONTHS_SHORT = [
  "jan",
  "feb",
  "mrt",
  "apr",
  "mei",
  "jun",
  "jul",
  "aug",
  "sep",
  "okt",
  "nov",
  "dec",
] as const;

export function brusselsToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Brussels",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function weekdayIndex(isoDate: string): number {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12)).getUTCDay();
}

export function addDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days, 12));
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function diffDays(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  const start = Date.UTC(fy, fm - 1, fd);
  const end = Date.UTC(ty, tm - 1, td);
  return Math.round((end - start) / 86_400_000);
}

export function weekendRange(today: string): { start: string; end: string } {
  const dow = weekdayIndex(today);
  if (dow === 0) return { start: addDays(today, -1), end: today };
  const daysToSaturday = 6 - dow;
  return {
    start: addDays(today, daysToSaturday),
    end: addDays(today, daysToSaturday + 1),
  };
}

export function endOfMonth(isoDate: string): string {
  const [year, month] = isoDate.split("-").map(Number);
  const last = new Date(Date.UTC(year, month, 0, 12)); // day 0 of next month
  const y = last.getUTCFullYear();
  const m = String(last.getUTCMonth() + 1).padStart(2, "0");
  const d = String(last.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * "Deze maand" window for discovery:
 * from today through the end of the current calendar month.
 * In the last 14 days of a month, also include the next calendar month
 * so late-month browsing still finds upcoming editions.
 */
export function monthRange(today: string): { start: string; end: string } {
  const endThis = endOfMonth(today);
  const daysLeft = diffDays(today, endThis);
  // Remove unused variable warning if any - clean monthRange
  if (daysLeft <= 14) {
    const nextMonthDay = addDays(endThis, 1);
    return { start: today, end: endOfMonth(nextMonthDay) };
  }
  return { start: today, end: endThis };
}

export function nextWeekRange(today: string): { start: string; end: string } {
  const weekend = weekendRange(today);
  const start = addDays(weekend.end, 1);
  return { start, end: addDays(start, 6) };
}

export function capitalize(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function formatWeekday(isoDate: string): string {
  return capitalize(WEEKDAYS[weekdayIndex(isoDate)]);
}

export function formatDayMonth(isoDate: string): string {
  const [, month, day] = isoDate.split("-").map(Number);
  return `${day} ${MONTHS_SHORT[month - 1]}`;
}

export function formatLongDate(isoDate: string): string {
  const [, month, day] = isoDate.split("-").map(Number);
  return `${formatWeekday(isoDate)} ${day} ${MONTHS[month - 1]}`;
}

export function hoursAgoIso(hours: number, now = new Date()): string {
  return new Date(now.getTime() - hours * 3_600_000).toISOString();
}

export function daysAgoIso(days: number, now = new Date()): string {
  return new Date(now.getTime() - days * 86_400_000).toISOString();
}
