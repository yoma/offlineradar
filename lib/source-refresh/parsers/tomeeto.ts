/**
 * Deterministic parser for Tomeeto singles aanbod hub.
 * Listing shape: PRODUCT TITLE then "dd/mm-dd/mm/yyyy: min-max jr" lines.
 */
import {
  brusselsIso,
  normalizeText,
  slugify,
  stripTags,
} from "@/lib/source-refresh/normalize";
import type {
  RefreshNormalizedCandidate,
  RefreshParserResult,
} from "@/lib/source-refresh/types";

const HUB = "https://tomeeto.be/vakanties/aanbod-voor-singles/";
const CHECKED = () => new Date().toISOString();

/** dd/mm-dd/mm/yyyy: 40-55 jr  OR  dd/mm/yyyy-dd/mm/yyyy: 35-49 jr */
const EDITION_LINE =
  /^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\s*[-–]\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s*:\s*(\d{2})\s*[-–]\s*(\d{2})\s*jr\b/i;

const PRODUCT_URL_HINTS: { re: RegExp; path: string; city: string }[] = [
  {
    re: /herve/,
    path: "/vakanties/weekend-voor-singles-herve/",
    city: "Herve",
  },
  {
    re: /shortski/,
    path: "/vakanties/shortski-voor-singles/",
    city: "Oostenrijk",
  },
  {
    re: /skiweek|kronplatz/,
    path: "/vakanties/skiweek-voor-singles/",
    city: "Kronplatz",
  },
  {
    re: /gran\s*canaria|fiesta/,
    path: "/vakanties/winterzon-nieuwjaar-voor-singles/",
    city: "Gran Canaria",
  },
  {
    re: /luik|liege|liège/,
    path: "/vakanties/weekend-luik-voor-singles/",
    city: "Liège",
  },
  {
    re: /padel/,
    path: "/vakanties/padelvakantie-voor-singles/",
    city: "Mechelen",
  },
  {
    re: /tirol|winter/,
    path: "/vakanties/winter-tirol-voor-singles/",
    city: "Tirol",
  },
  {
    re: /egypte/,
    path: "/vakanties/winterzon-egypte-voor-singles/",
    city: "Egypte",
  },
  {
    re: /mallorca/,
    path: "/vakanties/mallorca-voor-singles/",
    city: "Mallorca",
  },
];

function looksLikeProductTitle(line: string): boolean {
  if (line.length < 4 || line.length > 80) return false;
  if (EDITION_LINE.test(line)) return false;
  if (/^(leeftijd|vakanties|filter|menu|tomeeto|home)/i.test(line)) return false;
  if (/^\d{1,2}\//.test(line)) return false;
  if (/online vanaf/i.test(line)) return false;
  // Product titles are typically ALL CAPS or Title-ish travel names
  return /[A-Za-zÀ-ÿ]{3,}/.test(line);
}

function titleCaseProduct(raw: string): string {
  const cleaned = raw.replace(/\s+/g, " ").trim();
  if (cleaned !== cleaned.toUpperCase()) return cleaned;
  return cleaned
    .toLowerCase()
    .split(" ")
    .map((w) => (w.length ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(" ");
}

function resolveProductUrl(title: string, html: string): string {
  const n = normalizeText(title);
  for (const hint of PRODUCT_URL_HINTS) {
    if (hint.re.test(n)) {
      return `https://tomeeto.be${hint.path}`.replace(/\/$/, "");
    }
  }
  const hrefs = Array.from(
    html.matchAll(/href="(https?:\/\/tomeeto\.be\/vakanties\/[^"#?]+)"/gi),
  ).map((m) => m[1]!);
  for (const href of hrefs) {
    const path = normalizeText(href);
    const tokens = n.split(" ").filter((t) => t.length > 3);
    if (tokens.some((t) => path.includes(t))) {
      return href.replace(/\/$/, "");
    }
  }
  return HUB.replace(/\/$/, "");
}

function resolveCity(title: string): string {
  const n = normalizeText(title);
  for (const hint of PRODUCT_URL_HINTS) {
    if (hint.re.test(n)) return hint.city;
  }
  return "België";
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function isoDate(y: number, m: number, d: number): string {
  return `${y}-${pad(m)}-${pad(d)}`;
}

function todayYmd(now = new Date()): string {
  // Use Brussels-ish calendar day from local ISO for filter; tests inject fixed now via filter.
  return now.toISOString().slice(0, 10);
}

export function parseTomeetoHtml(
  html: string,
  now = new Date(),
): RefreshParserResult {
  const warnings: string[] = [];
  const lines = stripTags(html)
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const candidates: RefreshNormalizedCandidate[] = [];
  const seen = new Set<string>();
  let currentTitle: string | null = null;
  const today = todayYmd(now);

  for (const line of lines) {
    if (looksLikeProductTitle(line) && !EDITION_LINE.test(line)) {
      // Prefer uppercase product headers when present
      if (
        line === line.toUpperCase() ||
        /weekend|ski|vakantie|fiesta|padel|luik|herve|canaria|tirol|egypte|mallorca/i.test(
          line,
        )
      ) {
        currentTitle = titleCaseProduct(line);
        if (/^skiweek$/i.test(currentTitle)) {
          currentTitle = "Skiweek Kronplatz";
        }
      }
      continue;
    }

    const m = EDITION_LINE.exec(line);
    if (!m || !currentTitle) continue;

    const startDay = Number(m[1]);
    const startMonth = Number(m[2]);
    const endDay = Number(m[4]);
    const endMonth = Number(m[5]);
    const endYear = Number(m[6]);
    const startYear = m[3] ? Number(m[3]) : endYear;
    // Cross-year: start year omitted and start month > end month → start in previous year
    let yStart = startYear;
    if (!m[3] && startMonth > endMonth) {
      yStart = endYear - 1;
    }
    const minAge = Number(m[7]);
    const maxAge = Number(m[8]);
    if (
      !Number.isFinite(startDay) ||
      !Number.isFinite(endDay) ||
      !Number.isFinite(minAge) ||
      !Number.isFinite(maxAge)
    ) {
      continue;
    }

    const startDate = isoDate(yStart, startMonth, startDay);
    const endDate = isoDate(endYear, endMonth, endDay);
    // Keep ongoing + future; drop fully past
    if (endDate < today) continue;

    const officialUrl = resolveProductUrl(currentTitle, html);
    const city = resolveCity(currentTitle);
    const ageLabel = `${minAge}–${maxAge}`;
    const title = `${currentTitle} (${ageLabel})`;
    const externalKey =
      `tomeeto:${slugify(currentTitle)}:${startDate}:${minAge}-${maxAge}`.slice(
        0,
        160,
      );
    if (seen.has(externalKey)) continue;
    seen.add(externalKey);

    // Price almost never on hub listing; leave null unless € nearby in same line
    const priceMatch = /€\s*(\d{3,5})/.exec(line);
    const price = priceMatch ? Number(priceMatch[1]) : null;

    candidates.push({
      externalKey,
      title: `Tomeeto — ${title}`,
      organizer: "Tomeeto",
      date: startDate,
      startsAt: brusselsIso(startDate, "08:00"),
      endsAt: brusselsIso(endDate, "18:00"),
      venue: null,
      city,
      address: null,
      minAge,
      maxAge,
      // Tomeeto product bands are admission groups (fase15 verified).
      ageRule: "strict",
      price: Number.isFinite(price) ? price : null,
      availability: null,
      officialUrl,
      ticketUrl: null,
      rawEvidenceSummary: `${currentTitle} | ${line}`.slice(0, 280),
      sourceCheckedAt: CHECKED(),
    });
  }

  if (candidates.length === 0) {
    warnings.push("Geen Tomeeto edities met datum+leeftijd gevonden.");
  }

  return { candidates, warnings, listingCoverage: "complete" };
}
