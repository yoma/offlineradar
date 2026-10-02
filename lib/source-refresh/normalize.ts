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

/**
 * Last meaningful path segment (no extension), used as cross-host event identity.
 * Returns null for listing/index pages so many editions sharing one agenda URL
 * never collide.
 */
export function urlPathKey(url: string): string | null {
  try {
    const parsed = new URL(normalizeRefreshUrl(url));
    const parts = parsed.pathname.split("/").filter(Boolean);
    const last = (parts[parts.length - 1] ?? "").replace(
      /\.(html?|php|aspx?)$/i,
      "",
    );
    if (!last || last.length < 6) return null;
    if (isListingPathSegment(last)) return null;
    return last.toLowerCase();
  } catch {
    return null;
  }
}

function isListingPathSegment(segment: string): boolean {
  const s = segment.toLowerCase().replace(/-\d+$/, "");
  return /^(kalender|calendar|agenda|events?|evenementen|programma|program|overview|index|listing|all)$/.test(
    s,
  );
}

/** True when URL is an agenda/listing page, not a single-event detail page. */
export function isListingOrIndexUrl(url: string): boolean {
  try {
    const parsed = new URL(url.trim());
    const parts = parsed.pathname.split("/").filter(Boolean);
    const last = (parts[parts.length - 1] ?? "").replace(
      /\.(html?|php|aspx?)$/i,
      "",
    );
    if (isListingPathSegment(last)) return true;
    if (parts.length <= 1 && !/\d{4,}/.test(last)) return true;
    return false;
  } catch {
    return false;
  }
}

/**
 * Same event page even across sister domains / www / query noise.
 * Path key must match. Listing/agenda URLs never count as event identity
 * (many editions share one calendar URL).
 */
export function urlsReferToSameEvent(a: string, b: string): boolean {
  if (isListingOrIndexUrl(a) || isListingOrIndexUrl(b)) return false;
  const na = normalizeRefreshUrl(a);
  const nb = normalizeRefreshUrl(b);
  if (na === nb) return true;
  const ka = urlPathKey(a);
  const kb = urlPathKey(b);
  return Boolean(ka && kb && ka === kb);
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

/** Title tokens for similarity; drops weak filler words and listing noise. */
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
    // Generic activity wrappers (listing vs published titles)
    "speeddate",
    "speeddating",
    "event",
    "activiteit",
    "activiteiten",
    "jaar",
    "ans",
    "years",
  ]);
  return normalizeText(value)
    .replace(/\bst\b/g, "sint") // St-Niklaas ≈ Sint-Niklaas
    .split(" ")
    .map((w) => w.replace(/(\d+)[aj]$/i, "$1")) // 40a / 35j → 40 / 35
    .filter((w) => w.length > 2 && !stop.has(w) && !/^\d+$/.test(w));
}

export function titlesLooselyEqual(a: string, b: string): boolean {
  const na = normalizeText(a).replace(/\bst\b/g, "sint");
  const nb = normalizeText(b).replace(/\bst\b/g, "sint");
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  // Listing titles often start with DD/MM; published titles often don't.
  const stripDate = (s: string) => s.replace(/^\d{1,2}\s+\d{1,2}\s+/, "");
  const sa = stripDate(na);
  const sb = stripDate(nb);
  if (sa && sb && (sa === sb || sa.includes(sb) || sb.includes(sa))) return true;

  const ta = new Set(titleMatchTokens(a));
  const tb = new Set(titleMatchTokens(b));
  if (ta.size === 0 || tb.size === 0) return false;
  let overlap = 0;
  for (const w of ta) if (tb.has(w)) overlap++;
  const denom = Math.min(ta.size, tb.size);
  // City-only overlap is allowed; callers must also check day + age + organizer.
  return overlap / denom >= 0.5 && overlap >= 1;
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
