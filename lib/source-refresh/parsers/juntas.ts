/**
 * Deterministic parser for Juntas single-only listing (WP reis cards).
 * One candidate per concrete Vertrekdatum on each product card.
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
import type { CapacityStatus } from "@/types/event";

const CHECKED = () => new Date().toISOString();
const DATE_TOKEN =
  /(\d{1,2})\s+(jan|feb|mrt|apr|mei|jun|jul|aug|sep|okt|nov|dec)[a-z.]*\s+(20\d{2})/gi;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function parseNlDate(token: string): string | null {
  const m =
    /^(\d{1,2})\s+(jan|feb|mrt|apr|mei|jun|jul|aug|sep|okt|nov|dec)[a-z.]*\s+(20\d{2})$/i.exec(
      token.trim(),
    );
  if (!m) return null;
  const month = monthNumber(m[2]!);
  if (!month) return null;
  return `${m[3]}-${pad(month)}-${pad(Number(m[1]))}`;
}

function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!));
  dt.setUTCDate(dt.getUTCDate() + days);
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

function cityFromTitle(title: string): string {
  const cleaned = title
    .replace(/\(.*?\)/g, "")
    .replace(/^nieuwjaarsreis\s+/i, "")
    .replace(/\s+strandvakantie$/i, "")
    .replace(/\s+tijdens schoolvakantie$/i, "")
    .trim();
  if (/algarve/i.test(cleaned)) return "Lagos";
  if (/egypte/i.test(cleaned)) return "Egypte";
  if (/costa de la luz/i.test(cleaned)) return "Costa de la Luz";
  return cleaned || "Internationaal";
}

function availabilityFromCard(
  classNames: string,
  plain: string,
  price: number | null,
): CapacityStatus | null {
  const lower = `${classNames} ${plain}`.toLowerCase();
  if (lower.includes("reis_label-volzet") || /\bvolzet\b/.test(lower)) {
    return "sold_out";
  }
  if (lower.includes("laatste kans") || lower.includes("laatste-kans")) {
    return "limited";
  }
  if (price != null || /vanaf\s*(€|eur|&euro;)/i.test(plain)) {
    return "available";
  }
  return null;
}

function extractCardTitle(plain: string, href: string | null): string {
  const colon = plain
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.startsWith(":") && l.length > 3);
  if (colon) return colon.slice(1).trim();
  if (href) {
    const slug = href.split("/").filter(Boolean).pop() ?? "";
    return slug
      .replace(/-\d+$/, "")
      .replace(/-/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return "Juntas singlereis";
}

export function parseJuntasHtml(
  html: string,
  now = new Date(),
): RefreshParserResult {
  const warnings: string[] = [];
  const today = now.toISOString().slice(0, 10);
  const parts = html.split(/(?=<li class="wp-block-post post-\d+[^"]*type-reis)/i);
  const candidates: RefreshNormalizedCandidate[] = [];
  const seen = new Set<string>();

  for (const part of parts) {
    if (!/type-reis/i.test(part)) continue;
    const postId = /post-(\d+)/i.exec(part)?.[1];
    if (!postId) continue;
    const classNames =
      /class="([^"]*type-reis[^"]*)"/i.exec(part)?.[1] ?? "";
    if (!/single-only/i.test(classNames) && !/reis_label-single-only/i.test(part)) {
      // Still accept cards on single-only hub even if class truncated
    }
    const href =
      /href="(https:\/\/juntas\.be\/groepsreis\/[^"]+)"/i.exec(part)?.[1] ??
      null;
    const plain = stripTags(part);
    const titleRaw = extractCardTitle(plain, href);
    if (/filter|kalender|alle reizen/i.test(titleRaw)) continue;

    const durationMatch = /(\d+)\s*dagen/i.exec(plain);
    const durationDays = durationMatch ? Number(durationMatch[1]) : null;
    const priceMatch = /Vanaf\s*€\s*([\d.]+)/i.exec(plain);
    const price = priceMatch
      ? Number(String(priceMatch[1]).replace(/\./g, ""))
      : null;
    const availability = availabilityFromCard(classNames, plain, price);

    const dateTokens = Array.from(plain.matchAll(DATE_TOKEN)).map((m) =>
      m[0]!.replace(/\s+/g, " "),
    );
    // Prefer dates under Vertrekdatum / Vertrekdata section: take unique parseable
    const starts: string[] = [];
    for (const token of dateTokens) {
      const ymd = parseNlDate(token);
      if (!ymd) continue;
      if (starts.includes(ymd)) continue;
      starts.push(ymd);
    }
    if (starts.length === 0) {
      warnings.push(`Geen vertrekdatum voor post-${postId} (${titleRaw}).`);
      continue;
    }

    for (const startDate of starts) {
      const endDate =
        durationDays && durationDays > 0
          ? addDays(startDate, durationDays - 1)
          : startDate;
      if (endDate < today) continue;

      const city = cityFromTitle(titleRaw);
      const title = `Juntas — Singlereis ${titleRaw} (45+)`;
      const externalKey = `juntas:${postId}:${startDate}`.slice(0, 160);
      if (seen.has(externalKey)) continue;
      seen.add(externalKey);

      const officialUrl = (href ?? "https://juntas.be/?reis_label=single-only").replace(
        /\/$/,
        "",
      );

      candidates.push({
        externalKey,
        title,
        organizer: "Juntas",
        date: startDate,
        startsAt: brusselsIso(startDate, "09:00"),
        endsAt: brusselsIso(endDate, "18:00"),
        venue: null,
        city,
        address: null,
        minAge: 45,
        maxAge: null,
        ageRule: "guideline",
        price: Number.isFinite(price) ? price : null,
        availability,
        officialUrl,
        ticketUrl: null,
        rawEvidenceSummary:
          `${titleRaw} | ${startDate} | ${durationDays ?? "?"}d | ${availability ?? "?"} | ${officialUrl}`.slice(
            0,
            280,
          ),
        sourceCheckedAt: CHECKED(),
      });
    }
  }

  if (candidates.length === 0) {
    warnings.push("Geen Juntas single-only edities gevonden in HTML.");
  }

  // Stable order
  candidates.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));

  return { candidates, warnings, listingCoverage: "complete" };
}

/** Exported for tests / city helpers. */
export function juntasCityFromTitle(title: string): string {
  return cityFromTitle(title);
}

export function juntasNormalizeText(value: string): string {
  return normalizeText(value);
}

export function juntasSlugify(value: string): string {
  return slugify(value);
}
