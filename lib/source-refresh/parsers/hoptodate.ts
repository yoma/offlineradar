/**
 * Deterministic parser for HopToDate FR speed-dating listing HTML.
 */
import {
  brusselsIso,
  monthNumber,
  normalizeRefreshUrl,
  parseAgeRange,
  stripTags,
} from "@/lib/source-refresh/normalize";
import type {
  RefreshNormalizedCandidate,
  RefreshParserResult,
} from "@/lib/source-refresh/types";
import type { CapacityStatus } from "@/types/event";

const PARSER_CHECKED = () => new Date().toISOString();

function parseAvailability(block: string): CapacityStatus | null {
  const lower = block.toLowerCase();
  if (
    lower.includes("liste d’attente") ||
    lower.includes("liste d'attente") ||
    lower.includes("wachtlijst")
  ) {
    return "waitlist";
  }
  if (
    lower.includes("temporairement complet") ||
    lower.includes("complet") ||
    lower.includes("volzet")
  ) {
    if (
      lower.includes("liste d’attente") ||
      lower.includes("liste d'attente")
    ) {
      return "waitlist";
    }
    return "sold_out";
  }
  if (lower.includes("presque complet") || lower.includes("bijna")) {
    return "limited";
  }
  if (lower.includes("dispo") || lower.includes("beschikbaar")) {
    return "available";
  }
  return null;
}

function parseCard(block: string): RefreshNormalizedCandidate | null {
  const ticketUrl =
    /https:\/\/hoptodate\.com\/(?:fr-be|nl-be)\/tickets\/([a-z0-9-]+)\//i.exec(
      block,
    )?.[0] ?? null;
  if (!ticketUrl) return null;

  const slug = ticketUrl.match(/\/tickets\/([a-z0-9-]+)\//i)?.[1] ?? "";
  // slug: 29-09-wavre-30-40a-12457
  const slugParts = /^(\d{2})-(\d{2})-([a-z-]+?)-(\d{2})-(\d{2})a-(\d+)$/i.exec(
    slug,
  );

  const titleMatch =
    /(\d{1,2}\/\d{1,2}\s+[A-Za-zÀ-ÿ' -]+,\s*\d{2}-\d{2}a)/i.exec(
      stripTags(block),
    ) ??
    /(\d{1,2}\/\d{1,2}\s+[A-Za-zÀ-ÿ' -]+,\s*\d{2}-\d{2})/i.exec(
      stripTags(block),
    );
  const title = titleMatch?.[1]?.trim() ?? (slug ? slug.replace(/-/g, " ") : null);
  if (!title) return null;

  const text = stripTags(block);
  let date: string | null = null;
  let time: string | null = null;

  if (slugParts) {
    const day = Number(slugParts[1]);
    const month = Number(slugParts[2]);
    // Year from visible "2026" near card date stack
    const yearMatch = /\b(20\d{2})\b/.exec(block);
    const year = yearMatch ? Number(yearMatch[1]) : new Date().getFullYear();
    date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  } else {
    const frDate =
      /(\d{1,2})\s+([A-Za-zéûôà.]+)\.?,?\s+(?:[A-Za-zéûôà]+,\s+)?(?:[A-Za-z]+,\s+)?(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|[A-Za-zé]+)?\s*(?:<\/span>)?\s*(?:<[^>]+>)*\s*(\d{1,2}:\d{2})/i.exec(
        block,
      ) ||
      /(\d{1,2})\s+(Janvier|Février|Fevrier|Mars|Avril|Mai|Juin|Juillet|Août|Aout|Septembre|Octobre|Novembre|Décembre|Decembre)\b[\s\S]{0,80}?(\d{1,2}:\d{2})/i.exec(
        block,
      );
    if (frDate) {
      const month = monthNumber(frDate[2]);
      const yearMatch = /\b(20\d{2})\b/.exec(block);
      const year = yearMatch ? Number(yearMatch[1]) : new Date().getFullYear();
      if (month) {
        date = `${year}-${String(month).padStart(2, "0")}-${String(Number(frDate[1])).padStart(2, "0")}`;
        time = frDate[3];
      }
    }
  }

  if (!date) {
    const yearMatch = /\b(20\d{2})\b/.exec(block);
    const dayMonth = />(\d{1,2})<\/[a-z0-9]+>\s*<[^>]+>([A-Za-z.]+)</i.exec(
      block,
    );
    if (yearMatch && dayMonth) {
      const month = monthNumber(dayMonth[2]);
      if (month) {
        date = `${yearMatch[1]}-${String(month).padStart(2, "0")}-${String(Number(dayMonth[1])).padStart(2, "0")}`;
      }
    }
  }

  if (!date) return null;

  if (!time) {
    const t = /\b(\d{1,2}:\d{2})\b/.exec(text);
    time = t?.[1] ?? null;
  }

  const { minAge, maxAge } = parseAgeRange(title);
  // City from title "29/09 Wavre, 30-40a"
  const cityPart = title.replace(/^\d{1,2}\/\d{1,2}\s+/, "").split(",")[0]?.trim();
  const city = cityPart || (slugParts?.[3]?.replace(/-/g, " ") ?? "Onbekend");

  // Venue line often: "Au Bureau, Place Alphonse Bosch 10 , 1300 Wavre"
  const venueMatch =
    /([A-Za-zÀ-ÿ0-9' .+-]+),\s*([^,]+\d[^,]*)\s*,\s*(\d{4})\s+([A-Za-zÀ-ÿ' -]+)/.exec(
      text,
    );
  const venue = venueMatch?.[1]?.trim() ?? null;
  const address = venueMatch
    ? `${venueMatch[2].trim()}, ${venueMatch[3]} ${venueMatch[4].trim()}`
    : null;

  return {
    externalKey: slug || normalizeRefreshUrl(ticketUrl),
    title: `Speed Dating ${title}`,
    organizer: "HopToDate",
    date,
    startsAt: brusselsIso(date, time),
    endsAt: null,
    venue,
    city: city.replace(/\bfr\b/gi, "").trim() || city,
    address,
    minAge,
    maxAge,
    ageRule: minAge != null || maxAge != null ? "guideline" : "unknown",
    price: null,
    availability: parseAvailability(block),
    officialUrl: ticketUrl,
    ticketUrl,
    rawEvidenceSummary: text.slice(0, 280),
    sourceCheckedAt: PARSER_CHECKED(),
  };
}

export function parseHoptodateHtml(html: string): RefreshParserResult {
  const warnings: string[] = [];
  const parts = html.split(/event-card-new/i).slice(1);
  if (parts.length === 0) {
    warnings.push("Geen event-card blokken gevonden.");
  }

  const seen = new Set<string>();
  const candidates: RefreshNormalizedCandidate[] = [];
  for (const part of parts) {
    const block = part.slice(0, 9000);
    try {
      const candidate = parseCard(block);
      if (!candidate) continue;
      if (seen.has(candidate.externalKey)) continue;
      seen.add(candidate.externalKey);
      candidates.push(candidate);
    } catch {
      warnings.push("Eén HopToDate-kaart kon niet worden geparsed.");
    }
  }

  return { candidates, warnings, listingCoverage: "complete" };
}
