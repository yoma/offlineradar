/**
 * Match refresh candidates against canonical event editions.
 * Reuses normalize helpers; no second dedupe engine.
 */
import {
  calendarDayKey,
  isListingOrIndexUrl,
  normalizeRefreshUrl,
  normalizeText,
  sameInstant,
  titlesLooselyEqual,
  urlPathKey,
  urlsReferToSameEvent,
} from "@/lib/source-refresh/normalize";
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
  return calendarDayKey(iso);
}

function sameAge(
  c: RefreshNormalizedCandidate,
  e: EventEditionRecord,
): boolean {
  if (c.minAge == null && c.maxAge == null) return true;
  return c.minAge === e.minAge && c.maxAge === e.maxAge;
}

/**
 * Meaningful field diffs only.
 * Unknown/null source observations never erase richer canonical values.
 */
export function diffCandidate(
  c: RefreshNormalizedCandidate,
  e: EventEditionRecord,
): RefreshFieldChange[] {
  const changes: RefreshFieldChange[] = [];

  if (c.startsAt && e.startsAt && !sameInstant(c.startsAt, e.startsAt)) {
    // Same calendar day + multi-hour drift still counts as real time change.
    changes.push({ field: "startsAt", before: e.startsAt, after: c.startsAt });
  }

  if (c.endsAt && e.endsAt && !sameInstant(c.endsAt, e.endsAt)) {
    const listingSameDay =
      dayKey(c.startsAt) !== "" && dayKey(c.startsAt) === dayKey(c.endsAt);
    const canonicalMultiDay =
      dayKey(e.startsAt) !== "" &&
      dayKey(e.endsAt) !== "" &&
      dayKey(e.startsAt) !== dayKey(e.endsAt);
    const candidateMultiDay =
      dayKey(c.startsAt) !== "" &&
      dayKey(c.endsAt) !== "" &&
      dayKey(c.startsAt) !== dayKey(c.endsAt);
    // Listing often collapses weekend ranges to a single day slot → not a real change.
    // When both are multi-day and end on the same calendar day, ignore wall-clock.
    if (
      (listingSameDay && canonicalMultiDay) ||
      (candidateMultiDay &&
        canonicalMultiDay &&
        dayKey(c.endsAt) === dayKey(e.endsAt))
    ) {
      // no endsAt change
    } else {
      changes.push({ field: "endsAt", before: e.endsAt, after: c.endsAt });
    }
  }

  if (c.city && normalizeText(c.city) !== normalizeText(e.city)) {
    const generic = ["belgie", "belgië", "belgium", "nederland", "netherlands"].includes(
      normalizeText(c.city),
    );
    // When titles already identify the same edition, city spelling /
    // gemeente-vs-streek differences are presentation, not real moves.
    const sameEditionByTitle =
      Boolean(c.title && e.title && titlesLooselyEqual(c.title, e.title));
    if (!generic && !sameEditionByTitle) {
      changes.push({ field: "city", before: e.city, after: c.city });
    }
  }

  // Venue: only when source observed a concrete venue (null = unknown, not a wipe).
  if (
    c.venue &&
    e.venueName &&
    normalizeText(c.venue) !== normalizeText(e.venueName)
  ) {
    changes.push({ field: "venue", before: e.venueName, after: c.venue });
  }

  // Price: both must be known; null source ≠ change.
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
    c.genderAvailability &&
    c.genderAvailability !== (e.genderAvailability ?? null)
  ) {
    changes.push({
      field: "genderAvailability",
      before: e.genderAvailability ?? null,
      after: c.genderAvailability,
    });
  }

  if (
    c.availabilityNote &&
    c.availabilityNote !== (e.availabilityNote ?? null)
  ) {
    changes.push({
      field: "availabilityNote",
      before: e.availabilityNote ?? null,
      after: c.availabilityNote,
    });
  }

  // Age: only when source observed an age band.
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

  // Title: only semantic diffs (not punctuation / & vs en).
  if (c.title && e.title && !titlesLooselyEqual(c.title, e.title)) {
    const na = normalizeText(c.title);
    const nb = normalizeText(e.title);
    if (na !== nb) {
      changes.push({ field: "title", before: e.title, after: c.title });
    }
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

/**
 * Shared listing URLs (one kalender for many editions) must not identity-match
 * without title agreement. Unique product URLs still qualify with title check.
 */
export function matchCandidate(
  candidate: RefreshNormalizedCandidate,
  editions: MatchableEdition[],
  expectedOrganizerSlug: string,
): CandidateMatch {
  const candUrl = normalizeRefreshUrl(candidate.officialUrl);
  const ticketUrl = candidate.ticketUrl
    ? normalizeRefreshUrl(candidate.ticketUrl)
    : null;
  const day = candidate.date;
  // Only use a product path key; never treat shared agenda URLs as identity.
  const candPathKey = isListingOrIndexUrl(candidate.officialUrl)
    ? null
    : urlPathKey(candidate.officialUrl);

  // 0) Same product path key in any source URL (works across sister domains)
  if (candPathKey) {
    for (const row of editions) {
      if (row.organizerSlug !== expectedOrganizerSlug) continue;
      const pathHit = row.sourceUrls.some((u) => {
        if (isListingOrIndexUrl(u)) return false;
        if (urlsReferToSameEvent(candidate.officialUrl, u)) return true;
        const key = urlPathKey(u);
        return key != null && key === candPathKey;
      });
      if (!pathHit) continue;
      if (
        dayKey(row.edition.startsAt) &&
        dayKey(row.edition.startsAt) !== day
      ) {
        continue;
      }
      return {
        editionId: row.edition.id,
        confidence: "exact",
        changes: diffCandidate(candidate, row.edition),
      };
    }
  }

  // 1) Organizer + same day + title (preferred for outdoor calendars)
  let bestTitle: { row: MatchableEdition; cityOk: boolean } | null = null;
  for (const row of editions) {
    if (row.organizerSlug !== expectedOrganizerSlug) continue;
    if (dayKey(row.edition.startsAt) !== day) continue;
    if (!titlesLooselyEqual(candidate.title, row.edition.title)) continue;
    if (
      (candidate.minAge != null || candidate.maxAge != null) &&
      !sameAge(candidate, row.edition)
    ) {
      continue;
    }
    const cityOk =
      normalizeText(candidate.city) === normalizeText(row.edition.city);
    if (cityOk) {
      return {
        editionId: row.edition.id,
        confidence: "exact",
        changes: diffCandidate(candidate, row.edition),
      };
    }
    if (!bestTitle) bestTitle = { row, cityOk };
  }
  if (bestTitle) {
    return {
      editionId: bestTitle.row.edition.id,
      confidence: "exact",
      changes: diffCandidate(candidate, bestTitle.row.edition),
    };
  }

  // 2) Unique detail URL / ticket URL + same day + title similar
  // Shared listing URLs are ignored here (many editions share one agenda page).
  for (const row of editions) {
    const urlHit =
      (!isListingOrIndexUrl(candUrl) &&
        row.sourceUrls.some(
          (u) =>
            !isListingOrIndexUrl(u) &&
            (normalizeRefreshUrl(u) === candUrl ||
              urlsReferToSameEvent(candidate.officialUrl, u)),
        )) ||
      (ticketUrl != null &&
        !isListingOrIndexUrl(ticketUrl) &&
        row.sourceUrls.some(
          (u) =>
            !isListingOrIndexUrl(u) &&
            (normalizeRefreshUrl(u) === ticketUrl ||
              (candidate.ticketUrl
                ? urlsReferToSameEvent(candidate.ticketUrl, u)
                : false)),
        ));
    if (!urlHit) continue;
    if (dayKey(row.edition.startsAt) && dayKey(row.edition.startsAt) !== day) {
      continue;
    }
    if (!titlesLooselyEqual(candidate.title, row.edition.title)) continue;
    if (
      (candidate.minAge != null || candidate.maxAge != null) &&
      !sameAge(candidate, row.edition)
    ) {
      continue;
    }
    return {
      editionId: row.edition.id,
      confidence: "exact",
      changes: diffCandidate(candidate, row.edition),
    };
  }

  // 3) Organizer + day + city only → probable (weak; outdoor cities collide)
  let probable: MatchableEdition | null = null;
  for (const row of editions) {
    if (row.organizerSlug !== expectedOrganizerSlug) continue;
    if (dayKey(row.edition.startsAt) !== day) continue;
    if (normalizeText(candidate.city) !== normalizeText(row.edition.city)) {
      continue;
    }
    if (
      (candidate.minAge != null || candidate.maxAge != null) &&
      !sameAge(candidate, row.edition)
    ) {
      continue;
    }
    if (!probable) probable = row;
    else {
      // Ambiguous city collision → do not guess
      probable = null;
      break;
    }
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
