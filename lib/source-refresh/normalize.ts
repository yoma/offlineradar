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
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
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
