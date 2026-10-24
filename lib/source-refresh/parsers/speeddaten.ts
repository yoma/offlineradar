/**
 * Deterministic parser for SmartVibes / speeddaten.be calendar HTML.
 * Discovers every agenda-item block; AI is not used for listing discovery.
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
  RefreshSkipReason,
} from "@/lib/source-refresh/types";
import type { CapacityStatus } from "@/types/event";

const PARSER_CHECKED = () => new Date().toISOString();

/** Status rank: higher = more restrictive. */
const STATUS_RANK: Record<CapacityStatus, number> = {
  available: 0,
  limited: 1,
  almost_full: 2,
  waitlist: 3,
  sold_out: 4,
  unknown: -1,
};

function parseGenderStatus(rawHtmlOrText: string): CapacityStatus | null {
  const lower = rawHtmlOrText.toLowerCase();
  if (!lower.trim()) return null;
  const hasWaitlistEvidence =
    lower.includes("reservelijst") || lower.includes("wachtlijst");
  // "volzet" / nee.png = sold out unless the source explicitly offers a waitlist.
  if (lower.includes("volzet") || lower.includes("volled")) {
    return hasWaitlistEvidence ? "waitlist" : "sold_out";
  }
  if (lower.includes("nee.png") || /(?:^|[\s/])nee(?:[\s.,]|$)/.test(lower)) {
    return hasWaitlistEvidence ? "waitlist" : "sold_out";
  }
  if (lower.includes("laatste plaatsen") || lower.includes("bijna")) {
    return "limited";
  }
  if (
    lower.includes("nog plaats") ||
    lower.includes("plaatsen beschikbaar") ||
    lower.includes("ja.png") ||
    lower.includes("ok.png")
  ) {
    return "available";
  }
  // Bare "beschikbaar" is too broad (also appears in "reservelijst beschikbaar").
  return null;
}

/** Bookable enough that a generic "volzet/wachtlijst" badge would mislead. */
function isBookableStatus(status: CapacityStatus): boolean {
  return (
    status === "available" ||
    status === "limited" ||
    status === "almost_full"
  );
}

function statusLabelNl(status: CapacityStatus): string {
  switch (status) {
    case "available":
      return "nog plaats";
    case "limited":
      return "laatste plaatsen";
    case "almost_full":
      return "bijna vol";
    case "waitlist":
      return "volzet (reservelijst)";
    case "sold_out":
      return "volzet";
    case "unknown":
      return "onbekend";
  }
}

/**
 * Merge per-gender statuses into one card badge status.
 * When one gender can still book, never surface waitlist/sold_out as the
 * general badge (genderAvailability keeps the split). Waitlist only when
 * both genders are closed and at least one has waitlist evidence.
 */
export function mergeAvailability(
  women: CapacityStatus | null,
  men: CapacityStatus | null,
): CapacityStatus | null {
  if (!women && !men) return null;
  if (!women) return men;
  if (!men) return women;
  const wBook = isBookableStatus(women);
  const mBook = isBookableStatus(men);
  if (wBook || mBook) {
    const open = [women, men].filter(isBookableStatus);
    return open.reduce((best, cur) =>
      STATUS_RANK[cur] < STATUS_RANK[best] ? cur : best,
    );
  }
  // Both closed: prefer waitlist over sold_out when either still has a list.
  return STATUS_RANK[women] <= STATUS_RANK[men] ? women : men;
}

function extractGenderBlock(
  block: string,
  genderClass: "woman" | "man",
): string {
  const re = new RegExp(
    `<div class="${genderClass}">([\\s\\S]*?)(?=<div class="(?:woman|man|price-wrapper)"|$)`,
    "i",
  );
  const m = re.exec(block);
  // Keep img src filenames (ja.png / nee.png / bijna.png) for status cues.
  return m
    ? m[1]
        .replace(/<img[^>]+src="([^"]+)"[^>]*>/gi, " $1 ")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
    : "";
}

function extractTime(text: string): string | null {
  const m = /\bom\s+(\d{1,2})[:.](\d{2})\b/i.exec(text);
  if (!m) return null;
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}

function extractCityFromTitle(title: string): string {
  const withoutDate = title.replace(/^\d{1,2}\/\d{1,2}\s+/, "").trim();
  if (!withoutDate) return "Onbekend";
  // Known Speeddaten truncations / FR labels → catalog city keys.
  if (/^st(?:\s*|-)niklaas\b/i.test(withoutDate) || /^sint[-\s]?niklaas\b/i.test(withoutDate)) {
    return "Sint-Niklaas";
  }
  if (/^kempen\b/i.test(withoutDate) || /\(\s*geel\s*\)/i.test(withoutDate)) {
    return "Geel";
  }
  if (/^bruxelles\b/i.test(withoutDate)) return "Brussel";
  if (/^louvain[-\s]?la[-\s]?neuve\b/i.test(withoutDate)) {
    return "Louvain-la-Neuve";
  }
  const city = withoutDate.split(/[,\-–]/)[0]?.trim() ?? "";
  const first = city.split(/\s+/)[0] ?? city;
  return first || "Onbekend";
}

function detectLanguage(url: string, title: string): string | null {
  if (/\/fr\//i.test(url) || /\bFR\b/.test(title)) return "fr";
  if (/\/nl\//i.test(url)) return "nl";
  return null;
}

type ParseOutcome =
  | { ok: true; candidate: RefreshNormalizedCandidate }
  | { ok: false; reason: RefreshSkipReason; detail: string };

function parseAgendaItem(block: string): ParseOutcome {
  const titleMatch =
    /class="title"[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(
      block,
    );
  if (!titleMatch) {
    return {
      ok: false,
      reason: "parse_failed",
      detail: "Geen titel-link in agenda-item.",
    };
  }
  const officialUrl = titleMatch[1].trim();
  const title = stripTags(titleMatch[2]).trim();
  if (!title || !officialUrl.includes("speeddaten.be")) {
    return {
      ok: false,
      reason: "not_singles_dating",
      detail: "Geen speeddaten.be detail-URL of lege titel.",
    };
  }

  const dateBig =
    /class="big">(\d{1,2})<\/span>\s*<span>([^<]+)<\/span>\s*<span>(\d{4})<\/span>/i.exec(
      block,
    );
  if (!dateBig) {
    return {
      ok: false,
      reason: "missing_required_fields",
      detail: `Datum ontbreekt voor ${title}`,
    };
  }
  const day = Number(dateBig[1]);
  const month = monthNumber(dateBig[2]);
  const year = Number(dateBig[3]);
  if (!month || !day || !year) {
    return {
      ok: false,
      reason: "missing_required_fields",
      detail: `Ongeldige datum voor ${title}`,
    };
  }
  const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  const whenBlock =
    /Datum\s*&amp;\s*tijd[\s\S]*?class="description"[^>]*>\s*<span>([\s\S]*?)<\/span>/i.exec(
      block,
    )?.[1] ?? "";
  const time = extractTime(stripTags(whenBlock));

  const addressHtml =
    /class="adres"[\s\S]*?class="description"[^>]*>\s*<span>([\s\S]*?)<\/span>/i.exec(
      block,
    )?.[1] ?? "";
  const addressText = stripTags(addressHtml.replace(/<br\s*\/?>/gi, ", "));
  const addressLines = addressText
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const venue = addressLines[0] ?? null;
  const address =
    addressLines.length > 1 ? addressLines.slice(1).join(", ") : null;

  const priceMatch = /EUR\s*(\d+(?:[.,]\d+)?)/i.exec(block);
  const price = priceMatch ? Number(priceMatch[1].replace(",", ".")) : null;

  const { minAge, maxAge } = parseAgeRange(title);
  const womenText = extractGenderBlock(block, "woman");
  const menText = extractGenderBlock(block, "man");
  const womenAvailability = womenText ? parseGenderStatus(womenText) : null;
  const menAvailability = menText ? parseGenderStatus(menText) : null;
  const availability = mergeAvailability(womenAvailability, menAvailability);

  const genderParts: string[] = [];
  if (womenAvailability) {
    genderParts.push(`Vrouwen: ${statusLabelNl(womenAvailability)}`);
  }
  if (menAvailability) {
    genderParts.push(`Mannen: ${statusLabelNl(menAvailability)}`);
  }
  const genderAvailability =
    genderParts.length > 0 ? genderParts.join(" · ") : null;
  const availabilityNote =
    womenText || menText
      ? [womenText && `Vrouwen: ${womenText}`, menText && `Mannen: ${menText}`]
          .filter(Boolean)
          .join(" | ")
          .slice(0, 280)
      : null;

  const city = extractCityFromTitle(title);
  const language = detectLanguage(officialUrl, title);
  const externalKey =
    officialUrl.match(/\/([^/]+)\.htm/i)?.[1] ??
    normalizeRefreshUrl(officialUrl);
  const cmsId = officialUrl.match(/-(\d{4,})\.htm/i)?.[1] ?? null;
  const ticketUrl = cmsId
    ? `https://www.speeddaten.be/nl/tickets-${cmsId}.htm`
    : null;

  return {
    ok: true,
    candidate: {
      externalKey,
      title,
      organizer: "SmartVibes",
      date,
      startsAt: brusselsIso(date, time),
      endsAt: null,
      venue,
      city,
      address,
      minAge,
      maxAge,
      ageRule: minAge != null || maxAge != null ? "guideline" : "unknown",
      price: Number.isFinite(price) ? price : null,
      availability,
      genderAvailability,
      availabilityNote,
      womenAvailability,
      menAvailability,
      language,
      officialUrl,
      ticketUrl,
      rawEvidenceSummary: stripTags(block).slice(0, 280),
      sourceCheckedAt: PARSER_CHECKED(),
    },
  };
}

/**
 * Split long HTML into agenda-item chunks and parse each fully.
 * Never silently truncates mid-item: each block is processed independently.
 */
export function parseSpeeddatenHtml(html: string): RefreshParserResult {
  const warnings: string[] = [];
  const skipped: RefreshParserResult["skipped"] = [];
  const parts = html.split(/<div class="agenda-item">/i).slice(1);
  if (parts.length === 0) {
    warnings.push("Geen agenda-item blokken gevonden.");
    return {
      candidates: [],
      warnings,
      skipped,
      listingCoverage: "unknown",
      pagesObserved: 1,
    };
  }

  const seen = new Set<string>();
  const candidates: RefreshNormalizedCandidate[] = [];
  for (const part of parts) {
    // Full agenda-item; cap only extreme runaway blocks (normal ~2–4 KB).
    const block = part.slice(0, 50_000);
    try {
      const outcome = parseAgendaItem(block);
      if (!outcome.ok) {
        skipped.push({
          reason: outcome.reason,
          detail: outcome.detail,
          evidence: stripTags(block).slice(0, 120),
        });
        continue;
      }
      if (seen.has(outcome.candidate.externalKey)) {
        skipped.push({
          reason: "duplicate_in_listing",
          detail: outcome.candidate.externalKey,
          evidence: outcome.candidate.title,
        });
        continue;
      }
      seen.add(outcome.candidate.externalKey);
      candidates.push(outcome.candidate);
    } catch (err) {
      skipped.push({
        reason: "parse_failed",
        detail: err instanceof Error ? err.message : "Onbekende parsefout",
        evidence: stripTags(block).slice(0, 120),
      });
    }
  }

  if (skipped.length > 0) {
    warnings.push(`${skipped.length} agenda-item(s) overgeslagen.`);
  }

  // Single unfiltered kalender page contains the full future window.
  return {
    candidates,
    warnings,
    skipped,
    listingCoverage: "complete",
    pagesObserved: 1,
  };
}
