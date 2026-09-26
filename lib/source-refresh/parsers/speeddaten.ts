/**
 * Deterministic parser for SmartVibes / speeddaten.be calendar HTML.
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
  if (lower.includes("volzet") || lower.includes("volled")) {
    if (lower.includes("reservelijst") || lower.includes("wachtlijst")) {
      return "waitlist";
    }
    return "sold_out";
  }
  if (lower.includes("laatste plaatsen") || lower.includes("bijna")) {
    return "limited";
  }
  if (lower.includes("plaatsen beschikbaar") || lower.includes("beschikbaar")) {
    return "available";
  }
  return null;
}

function extractTime(text: string): string | null {
  const m = /\bom\s+(\d{1,2})[:.](\d{2})\b/i.exec(text);
  if (!m) return null;
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}

function extractCityFromTitle(title: string): string {
  // e.g. "29/09 Leuven Hogeropgeleiden, 30-40j"
  const withoutDate = title.replace(/^\d{1,2}\/\d{1,2}\s+/, "");
  const city = withoutDate.split(/[,\-–]/)[0]?.trim() ?? "";
  // Drop trailing descriptors like "Hogeropgeleiden"
  const first = city.split(/\s+/)[0] ?? city;
  return first || "Onbekend";
}

function parseAgendaItem(block: string): RefreshNormalizedCandidate | null {
  const titleMatch = /class="title"[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(
    block,
  );
  if (!titleMatch) return null;
  const officialUrl = titleMatch[1].trim();
  const title = stripTags(titleMatch[2]).trim();
  if (!title || !officialUrl.includes("speeddaten.be")) return null;

  const dateBig = /class="big">(\d{1,2})<\/span>\s*<span>([^<]+)<\/span>\s*<span>(\d{4})<\/span>/i.exec(
    block,
  );
  if (!dateBig) return null;
  const day = Number(dateBig[1]);
  const month = monthNumber(dateBig[2]);
  const year = Number(dateBig[3]);
  if (!month || !day || !year) return null;
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
  const address = addressLines.length > 1 ? addressLines.slice(1).join(", ") : null;

  const priceMatch = /EUR\s*(\d+(?:[.,]\d+)?)/i.exec(block);
  const price = priceMatch ? Number(priceMatch[1].replace(",", ".")) : null;

  const { minAge, maxAge } = parseAgeRange(title);
  const availability = parseAvailability(block);
  const city = extractCityFromTitle(title);
  const externalKey =
    officialUrl.match(/\/([^/]+)\.htm/i)?.[1] ??
    normalizeRefreshUrl(officialUrl);

  return {
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
    officialUrl,
    ticketUrl: null,
    rawEvidenceSummary: stripTags(block).slice(0, 280),
    sourceCheckedAt: PARSER_CHECKED(),
  };
}

export function parseSpeeddatenHtml(html: string): RefreshParserResult {
  const warnings: string[] = [];
  const parts = html.split(/<div class="agenda-item">/i).slice(1);
  if (parts.length === 0) {
    warnings.push("Geen agenda-item blokken gevonden.");
  }

  const seen = new Set<string>();
  const candidates: RefreshNormalizedCandidate[] = [];
  for (const part of parts) {
    const block = part.slice(0, 8000);
    try {
      const candidate = parseAgendaItem(block);
      if (!candidate) continue;
      if (seen.has(candidate.externalKey)) continue;
      seen.add(candidate.externalKey);
      candidates.push(candidate);
    } catch {
      warnings.push("Eén agenda-item kon niet worden geparsed.");
    }
  }

  return { candidates, warnings, listingCoverage: "complete" };
}
