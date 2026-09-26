/**
 * Match refresh candidates against canonical event editions.
 * Reuses normalize helpers; no second dedupe engine.
 */
import { normalizeRefreshUrl, normalizeText } from "@/lib/source-refresh/normalize";
import type {
  RefreshFieldChange,
  RefreshNormalizedCandidate,
  SourceRefreshMatchConfidence,
} from "@/lib/source-refresh/types";
import type { EventEditionBundle, EventEditionRecord } from "@/types/event-catalog";

export type MatchableEdition = {
  edition: EventEditionRecord;
  sourceUrls: string[];
  organizerSlug: string | null;
};

export type CandidateMatch = {
  editionId: string | null;
  confidence: SourceRefreshMatchConfidence;
  changes: RefreshFieldChange[];
};

function dayKey(iso: string | null | undefined): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

function titleSimilar(a: string, b: string): boolean {
  const na = normalizeText(a);
  const nb = normalizeText(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  const ta = new Set(na.split(" ").filter((w) => w.length > 2));
  const tb = new Set(nb.split(" ").filter((w) => w.length > 2));
  if (ta.size === 0 || tb.size === 0) return false;
  let overlap = 0;
  for (const w of ta) if (tb.has(w)) overlap++;
  return overlap / Math.min(ta.size, tb.size) >= 0.6;
}

function sameAge(
  c: RefreshNormalizedCandidate,
  e: EventEditionRecord,
): boolean {
  if (c.minAge == null && c.maxAge == null) return true;
  return c.minAge === e.minAge && c.maxAge === e.maxAge;
}

function diffCandidate(
  c: RefreshNormalizedCandidate,
  e: EventEditionRecord,
): RefreshFieldChange[] {
  const changes: RefreshFieldChange[] = [];
  const candStart = c.startsAt.slice(0, 16);
  const edStart = e.startsAt.slice(0, 16);
  if (candStart !== edStart) {
    changes.push({ field: "startsAt", before: e.startsAt, after: c.startsAt });
  }
  if (c.city && normalizeText(c.city) !== normalizeText(e.city)) {
    changes.push({ field: "city", before: e.city, after: c.city });
  }
  if (
    c.venue &&
    e.venueName &&
    normalizeText(c.venue) !== normalizeText(e.venueName)
  ) {
    changes.push({ field: "venue", before: e.venueName, after: c.venue });
  }
  if (c.price != null && e.priceAmount != null && c.price !== Number(e.priceAmount)) {
    changes.push({ field: "price", before: e.priceAmount, after: c.price });
  }
  if (
    c.availability &&
    e.availabilityStatus &&
    c.availability !== e.availabilityStatus
  ) {
    changes.push({
      field: "availability",
      before: e.availabilityStatus,
      after: c.availability,
    });
  }
  if (
    (c.minAge != null || c.maxAge != null) &&
    (c.minAge !== e.minAge || c.maxAge !== e.maxAge)
  ) {
    changes.push({
      field: "age",
      before: `${e.minAge ?? "?"}-${e.maxAge ?? "?"}`,
      after: `${c.minAge ?? "?"}-${c.maxAge ?? "?"}`,
    });
  }
  return changes;
}

export function bundlesToMatchable(
  bundles: EventEditionBundle[],
): MatchableEdition[] {
  return bundles.map((b) => ({
    edition: b.edition,
    sourceUrls: b.sources.map((s) => normalizeRefreshUrl(s.normalizedUrl || s.url)),
    organizerSlug: b.organizer?.slug ?? null,
  }));
}

export function matchCandidate(
  candidate: RefreshNormalizedCandidate,
  editions: MatchableEdition[],
  expectedOrganizerSlug: string,
): CandidateMatch {
  const candUrl = normalizeRefreshUrl(candidate.officialUrl);
  const ticketUrl = candidate.ticketUrl
    ? normalizeRefreshUrl(candidate.ticketUrl)
    : null;

  // 1) Exact URL match
  for (const row of editions) {
    if (
      row.sourceUrls.includes(candUrl) ||
      (ticketUrl && row.sourceUrls.includes(ticketUrl))
    ) {
      const changes = diffCandidate(candidate, row.edition);
      return {
        editionId: row.edition.id,
        confidence: "exact",
        changes,
      };
    }
  }

  // 2) Same organizer + same day + (city or title) + age when present
  const day = candidate.date;
  let probable: MatchableEdition | null = null;
  for (const row of editions) {
    if (row.organizerSlug !== expectedOrganizerSlug) continue;
    if (dayKey(row.edition.startsAt) !== day) continue;
    const cityOk =
      normalizeText(candidate.city) === normalizeText(row.edition.city);
    const titleOk = titleSimilar(candidate.title, row.edition.title);
    if (!(cityOk || titleOk)) continue;
    if (!sameAge(candidate, row.edition) && candidate.minAge != null) {
      // Different age bands on same day/city are different editions
      if (cityOk && !titleOk) continue;
    }
    if (cityOk && titleOk && sameAge(candidate, row.edition)) {
      const changes = diffCandidate(candidate, row.edition);
      return {
        editionId: row.edition.id,
        confidence: "exact",
        changes,
      };
    }
    if (!probable) probable = row;
  }

  if (probable) {
    return {
      editionId: probable.edition.id,
      confidence: "probable",
      changes: diffCandidate(candidate, probable.edition),
    };
  }

  return { editionId: null, confidence: "none", changes: [] };
}
