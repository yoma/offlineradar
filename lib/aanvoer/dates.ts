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
