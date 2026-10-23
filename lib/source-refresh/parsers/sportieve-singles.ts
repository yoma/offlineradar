/**
 * Deterministic parser for Sportieve Singles kalender (Wix HTML).
 * Uses visible title + "dd mmm yyyy, hh:mm – hh:mm" lines only.
 *
 * Listing is a shared calendar URL for all editions → identity is
 * date + normalized title (never calendar index / shared URL alone).
 * Coverage is partial (paginated Wix) → engine must not emit removals.
 *
 * Location: postcode + place name are independent evidence (see
 * sportieve-location.ts). Generic "België" is never treated as confirmed.
 */
import {
  brusselsIso,
  monthNumber,
  normalizeText,
  slugify,
  stripTags,
} from "@/lib/source-refresh/normalize";
import {
  isWeakSportieveCity,
  matchSportieveEventUrl,
  resolveSportieveLocation,
} from "@/lib/source-refresh/parsers/sportieve-location";
import type {
  RefreshNormalizedCandidate,
  RefreshParserResult,
} from "@/lib/source-refresh/types";

const PARSER_CHECKED = () => new Date().toISOString();
const OFFICIAL = "https://www.sportievesingles.be/kalender";

const DATE_LINE =
  /^(\d{1,2})\s+([A-Za-zé.]{3,12})\s+(20\d{2}),\s*(\d{1,2}:\d{2})\s*[–-]\s*(\d{1,2}:\d{2})$/i;

function looksLikeEventTitle(line: string): boolean {
  if (line.length < 12 || line.length > 180) return false;
  if (DATE_LINE.test(line)) return false;
  if (/^(bekijk|regio|wandelingen|kalender|menu)/i.test(line)) return false;
  if (/ingeschreven/i.test(line)) return false;
  return /(wandeling|weekend|fiets|padel|city|stad|bos|zee|gids|km|hike|streetart|pleintjes|arboretum|natuur)/i.test(
    line,
  );
}

/** Strip listing " / City" suffix and collapse whitespace. */
export function cleanSportieveTitle(raw: string): string {
  return raw
    .replace(/\u00a0/g, " ")
    .replace(/\s*\/\s*[A-Za-zÀ-ÿ.' -]{2,60}\s*$/u, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Prefer city from the title (same edition). Body is only same-event lines
 * (callers must not include the next event's title/date).
 * Returns "België" only as an explicit weak placeholder (not geo-confirmed).
 */
export function extractCity(title: string, body: string): string {
  const loc = resolveSportieveLocation(title, body);
  if (loc.confirmed && loc.city) return loc.city;
  return "België";
}

function inferWeekendEndDate(title: string, startDate: string): string | null {
  if (!/weekend|meerdaags|2\s*dagen|3\s*dagen/i.test(title)) return null;
  const [y, m, d] = startDate.split("-").map(Number);
  if (!y || !m || !d) return null;
  // Common Sportieve weekends: Fri→Sun (+2 days)
  const end = new Date(Date.UTC(y, m - 1, d + 2));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${end.getUTCFullYear()}-${pad(end.getUTCMonth() + 1)}-${pad(end.getUTCDate())}`;
}

export function parseSportieveSinglesHtml(html: string): RefreshParserResult {
  const warnings: string[] = [];
  const text = stripTags(html);
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const candidates: RefreshNormalizedCandidate[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const dateMatch = DATE_LINE.exec(lines[i]!);
    if (!dateMatch) continue;

    const month = monthNumber(dateMatch[2]);
    if (!month) {
      warnings.push(`Onbekende maand: ${dateMatch[2]}`);
      continue;
    }
    const day = Number(dateMatch[1]);
    const year = Number(dateMatch[3]);
    const startTime = dateMatch[4]!.padStart(5, "0");
    const endTime = dateMatch[5]!.padStart(5, "0");
    const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

    let titleRaw: string | null = null;
    for (let j = i - 1; j >= Math.max(0, i - 6); j--) {
      const prev = lines[j]!;
      if (looksLikeEventTitle(prev)) {
        titleRaw = prev;
        break;
      }
    }
    if (!titleRaw) continue;

    // Stay inside this edition: stop before the next date line or next title.
    // Allow a few more lines so postcode/place rows after the date are kept.
    const bodyLines: string[] = [];
    for (let j = i + 1; j < Math.min(lines.length, i + 10); j++) {
      const line = lines[j]!;
      if (DATE_LINE.test(line)) break;
      if (looksLikeEventTitle(line)) break;
      bodyLines.push(line);
    }
    const body = bodyLines.join(" ");
    const loc = resolveSportieveLocation(titleRaw, body);
    const city = loc.confirmed && loc.city ? loc.city : "België";
    const title = cleanSportieveTitle(titleRaw);
    const externalKey = `sportieve:${date}:${slugify(title)}`.slice(0, 160);
    if (seen.has(externalKey)) continue;
    seen.add(externalKey);

    // Price rarely on listing; leave null unless € present nearby.
    const priceNearby = /€\s*(\d+)/.exec(`${title} ${body}`);
    const price = priceNearby ? Number(priceNearby[1]) : null;

    const weekendEnd = inferWeekendEndDate(title, date);
    const endsAt = weekendEnd
      ? brusselsIso(weekendEnd, endTime)
      : brusselsIso(date, endTime);

    const detailUrl = matchSportieveEventUrl(titleRaw, html);
    const evidenceNote =
      loc.confirmed && loc.evidence.length > 0
        ? ` locatie:[${loc.evidence.join("; ")}]`
        : loc.weakReason
          ? ` locatie-zwak:[${loc.weakReason}]`
          : "";

    candidates.push({
      externalKey,
      title,
      organizer: "Sportieve Singles",
      date,
      startsAt: brusselsIso(date, startTime),
      endsAt,
      venue: null,
      city,
      address: loc.postalCode
        ? `${loc.postalCode} ${loc.placeName ?? city}`.trim()
        : null,
      minAge: null,
      maxAge: null,
      ageRule: "unknown",
      price: Number.isFinite(price) ? price : null,
      availability: null,
      officialUrl: detailUrl ?? OFFICIAL,
      ticketUrl: detailUrl,
      rawEvidenceSummary: `${title} | ${lines[i]} | ${body}${evidenceNote}`.slice(
        0,
        280,
      ),
      sourceCheckedAt: PARSER_CHECKED(),
    });

    if (isWeakSportieveCity(city)) {
      warnings.push(`Zwakke locatie voor “${title.slice(0, 48)}”: ${loc.weakReason ?? "onbekend"}`);
    }
  }

  if (candidates.length === 0) {
    warnings.push("Geen dated Sportieve Singles edities gevonden in HTML.");
  }

  const filtered = candidates.filter((c) => {
    const n = normalizeText(c.title);
    return n.length >= 12 && !n.includes("bekijk hier");
  });

  return {
    candidates: filtered,
    warnings,
    // Wix kalender is paginated / not proven exhaustive.
    listingCoverage: "partial",
  };
}

export {
  isWeakSportieveCity,
  resolveSportieveLocation,
} from "@/lib/source-refresh/parsers/sportieve-location";
