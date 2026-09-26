/** Shared text / URL helpers for source refresh parsers + matching. */

export function normalizeRefreshUrl(url: string): string {
  try {
    const parsed = new URL(url.trim());
    parsed.hash = "";
    // Drop reserve/query noise for identity, keep path.
    const drop = ["reserve", "utm_source", "utm_medium", "utm_campaign"];
    for (const key of drop) parsed.searchParams.delete(key);
    let out = parsed.toString().replace(/\/$/, "").toLowerCase();
    return out;
  } catch {
    return url.trim().replace(/\/$/, "").toLowerCase();
  }
}

export function normalizeText(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    // Treat & / "en" as equivalent for BE/NL titles
    .replace(/&/g, " ")
    .replace(/\ben\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Title tokens for similarity; drops weak filler words. */
export function titleMatchTokens(value: string | null | undefined): string[] {
  const stop = new Set([
    "de",
    "het",
    "een",
    "van",
    "voor",
    "met",
    "door",
    "naar",
    "in",
    "op",
    "aan",
    "bij",
    "tot",
    "the",
    "and",
    "km",
    "wandeling",
    "weekend",
    "singles",
    "sportieve",
  ]);
  return normalizeText(value)
    .split(" ")
    .filter((w) => w.length > 2 && !stop.has(w) && !/^\d+$/.test(w));
}

export function titlesLooselyEqual(a: string, b: string): boolean {
  const na = normalizeText(a);
  const nb = normalizeText(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  const ta = new Set(titleMatchTokens(a));
  const tb = new Set(titleMatchTokens(b));
  if (ta.size === 0 || tb.size === 0) return false;
  let overlap = 0;
  for (const w of ta) if (tb.has(w)) overlap++;
  const denom = Math.min(ta.size, tb.size);
  return overlap / denom >= 0.55 && overlap >= 2;
}

/** Absolute instant compare; true when both parse and differ by < 60s. */
export function sameInstant(
  a: string | null | undefined,
  b: string | null | undefined,
  slackMs = 60_000,
): boolean {
  if (!a || !b) return false;
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return false;
  return Math.abs(ta - tb) < slackMs;
}

export function calendarDayKey(iso: string | null | undefined): string {
  if (!iso) return "";
  // Prefer Brussels calendar day for +02 offsets already in string; else UTC date.
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(iso);
  if (m) return m[1]!;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  return new Date(t).toISOString().slice(0, 10);
}

export function slugify(value: string): string {
  return normalizeText(value).replace(/\s+/g, "-").slice(0, 120);
}

const NL_MONTHS: Record<string, number> = {
  januari: 1,
  february: 2,
  februari: 2,
  maart: 3,
  march: 3,
  april: 4,
  mei: 5,
  may: 5,
  juni: 6,
  june: 6,
  juli: 7,
  july: 7,
  augustus: 8,
  august: 8,
  september: 9,
  okt: 10,
  oktober: 10,
  october: 10,
  novembre: 11,
  november: 11,
  december: 12,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  jun: 6,
  jul: 7,
  aug: 8,
};

const FR_MONTHS: Record<string, number> = {
  janvier: 1,
  fevrier: 2,
  février: 2,
  mars: 3,
  avril: 4,
  mai: 5,
  juin: 6,
  juillet: 7,
  aout: 8,
  août: 8,
  septembre: 9,
  octobre: 10,
  novembre: 11,
  décembre: 12,
  decembre: 12,
};

export function monthNumber(token: string): number | null {
  const key = normalizeText(token).replace(/\./g, "");
  return NL_MONTHS[key] ?? FR_MONTHS[key] ?? null;
}

/** Build Europe/Brussels wall-time ISO (+02:00). Good enough for V1 calendar matches. */
export function brusselsIso(date: string, time: string | null): string {
  const hhmm = time && /^\d{1,2}:\d{2}$/.test(time) ? time : "00:00";
  const [h, m] = hhmm.split(":").map(Number);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date}T${pad(h)}:${pad(m)}:00+02:00`;
}

export function parseAgeRange(
  text: string,
): { minAge: number | null; maxAge: number | null } {
  const m =
    /(\d{2})\s*[-–àa]\s*(\d{2})\s*(?:j|a|ans|jaar)?/i.exec(text) ||
    /(\d{2})\s*[-–]\s*(\d{2})a\b/i.exec(text);
  if (!m) return { minAge: null, maxAge: null };
  const minAge = Number(m[1]);
  const maxAge = Number(m[2]);
  if (!Number.isFinite(minAge) || !Number.isFinite(maxAge)) {
    return { minAge: null, maxAge: null };
  }
  return { minAge, maxAge };
}

export function decodeBasicEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

export function stripTags(html: string): string {
  return decodeBasicEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(?:p|div|li|h\d)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/\n+/g, "\n")
      .trim(),
  );
}
