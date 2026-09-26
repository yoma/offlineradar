/**
 * Deterministic parser for Sportieve Singles kalender (Wix HTML).
 * Uses visible title + "dd mmm yyyy, hh:mm – hh:mm" lines only.
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
  // Prefer activity-like titles
  return /(wandeling|weekend|fiets|padel|city|stad|bos|zee|gids|km)/i.test(
    line,
  );
}

function extractCity(title: string, body: string): string {
  const hay = `${title} ${body}`;
  const known = [
    "Antwerpen",
    "Gent",
    "Brugge",
    "Kortrijk",
    "Mechelen",
    "Oostende",
    "Leuven",
    "Hasselt",
    "Heusden-Zolder",
    "Wespelaar",
    "Koksijde",
    "Herzele",
    "Reusel",
    "Ellezelles",
    "La Roche",
    "Viroinval",
    "Pajottenland",
  ];
  for (const city of known) {
    if (new RegExp(city, "i").test(hay)) return city;
  }
  // "in Brugge" / "te Gent"
  const m = /\b(?:in|te|door)\s+([A-ZÀ-Ü][A-Za-zÀ-ÿ'-]+)/.exec(title);
  return m?.[1] ?? "België";
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

    // Title is usually the previous non-meta line
    let title: string | null = null;
    for (let j = i - 1; j >= Math.max(0, i - 6); j--) {
      const prev = lines[j]!;
      if (looksLikeEventTitle(prev)) {
        title = prev;
        break;
      }
    }
    if (!title) continue;

    const body = lines.slice(i + 1, i + 4).join(" ");
    const city = extractCity(title, body);
    const externalKey = `${date}-${slugify(title)}`.slice(0, 160);
    if (seen.has(externalKey)) continue;
    seen.add(externalKey);

    // Price rarely on listing; leave null unless € present nearby
    const priceNearby = /€\s*(\d+)/.exec(`${title} ${body}`);
    const price = priceNearby ? Number(priceNearby[1]) : null;

    candidates.push({
      externalKey,
      title,
      organizer: "Sportieve Singles",
      date,
      startsAt: brusselsIso(date, startTime),
      endsAt: brusselsIso(date, endTime),
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

  // Filter out past-looking noise: keep only lines that look like real activities
  const filtered = candidates.filter((c) => {
    const n = normalizeText(c.title);
    return n.length >= 12 && !n.includes("bekijk hier");
  });

  return { candidates: filtered, warnings };
}
