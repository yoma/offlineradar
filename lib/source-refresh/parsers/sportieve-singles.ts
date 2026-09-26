/**
 * Deterministic parser for Sportieve Singles kalender (Wix HTML).
 * Uses visible title + "dd mmm yyyy, hh:mm – hh:mm" lines only.
 *
 * Listing is a shared calendar URL for all editions → identity is
 * date + normalized title (never calendar index / shared URL alone).
 * Coverage is partial (paginated Wix) → engine must not emit removals.
 */
import {
  brusselsIso,
  monthNumber,
  normalizeText,
  slugify,
  stripTags,
} from "@/lib/source-refresh/normalize";
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
    .replace(/\s*\/\s*[A-Za-zÀ-ÿ.' -]{2,40}\s*$/u, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractCity(title: string, body: string): string {
  const hay = `${title} ${body}`;
  const known = [
    "La Roche-en-Ardenne",
    "Heusden-Zolder",
    "Antwerpen",
    "Gent",
    "Brugge",
    "Kortrijk",
    "Mechelen",
    "Oostende",
    "Leuven",
    "Hasselt",
    "Wespelaar",
    "Koksijde",
    "Herzele",
    "Reusel",
    "Ellezelles",
    "Viroinval",
    "Pajottenland",
    "Gooik",
    "Oostkamp",
    "Haacht",
    "Stekene",
    "Ronse",
  ];
  for (const city of known) {
    if (new RegExp(city.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(hay)) {
      return city;
    }
  }
  const m = /\b(?:in|te|door)\s+([A-ZÀ-Ü][A-Za-zÀ-ÿ'-]+)/.exec(title);
  return m?.[1] ?? "België";
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

    const title = cleanSportieveTitle(titleRaw);
    const body = lines.slice(i + 1, i + 4).join(" ");
    const city = extractCity(title, body);
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

    candidates.push({
      externalKey,
      title,
      organizer: "Sportieve Singles",
      date,
      startsAt: brusselsIso(date, startTime),
      endsAt,
      venue: null,
      city,
      address: null,
      minAge: null,
      maxAge: null,
      ageRule: "unknown",
      price: Number.isFinite(price) ? price : null,
      availability: null,
      officialUrl: OFFICIAL,
      ticketUrl: null,
      rawEvidenceSummary: `${title} | ${lines[i]} | ${body}`.slice(0, 280),
      sourceCheckedAt: PARSER_CHECKED(),
    });
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
