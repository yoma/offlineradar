/**
 * Approved tip → canonical draft event edition.
 * Never publishes. Never invents fees/ages/singles flags without AI/tip evidence.
 */
import { randomUUID } from "node:crypto";
import {
  attachSource,
  createEdition,
  getEditionById,
  upsertOrganizerBySlug,
} from "@/lib/events/neon-store";
import { getEventsSql } from "@/lib/events/db";
import { neonFindTipById, neonLinkTipToEvent } from "@/lib/tips/neon-store";
import { canCreateConceptFromTipStatus } from "@/lib/tips/status-guards";
import { normalizeRefreshUrl, slugify } from "@/lib/source-refresh/normalize";
import type { EventEditionRecord } from "@/types/event-catalog";
import type { TipAiPrep, TipSubmission } from "@/types/tips";

export type DuplicateCandidate = {
  id: string;
  slug: string;
  title: string;
  city: string;
  startsAt: string;
  publicationStatus: string;
  matchReason: string;
};

export type CreateConceptResult =
  | {
      ok: true;
      edition: EventEditionRecord;
      created: true;
    }
  | {
      ok: false;
      code:
        | "not_found"
        | "bad_status"
        | "already_linked"
        | "duplicate_candidates"
        | "missing_facts"
        | "storage_error";
      error: string;
      duplicates?: DuplicateCandidate[];
      linkedEdition?: EventEditionRecord | null;
    };

function hostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "tip";
  }
}

function buildStartsAt(prep: TipAiPrep | null): {
  startsAt: string;
  dateUnknown: boolean;
} {
  const date = prep?.proposedStartDate?.trim();
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const time =
      prep?.proposedStartTime && /^\d{2}:\d{2}/.test(prep.proposedStartTime)
        ? prep.proposedStartTime.slice(0, 5)
        : "12:00";
    return {
      startsAt: `${date}T${time}:00+02:00`,
      dateUnknown: false,
    };
  }
  return {
    startsAt: "2099-12-31T12:00:00+01:00",
    dateUnknown: true,
  };
}

function buildEndsAt(prep: TipAiPrep | null, startsAt: string): string | null {
  const date = prep?.proposedStartDate?.trim();
  const end = prep?.proposedEndTime?.trim();
  if (!date || !end || !/^\d{2}:\d{2}/.test(end)) return null;
  return `${date}T${end.slice(0, 5)}:00+02:00`;
}

function routeFromPrep(
  prep: TipAiPrep | null,
): "route_a" | "route_b" | "unknown" {
  if (prep?.routeSuggestion === "route_a_supported") return "route_a";
  if (prep?.routeSuggestion === "route_b_supported") return "route_b";
  return "unknown";
}

function singlesOnlyFromPrep(prep: TipAiPrep | null): boolean | null {
  if (prep?.singlesOnly === "true") return true;
  if (prep?.singlesOnly === "false") return false;
  return null;
}

export async function findLikelyDuplicateEditions(input: {
  tip: TipSubmission;
  prep: TipAiPrep | null;
}): Promise<DuplicateCandidate[]> {
  const sql = getEventsSql();
  if (!sql) return [];

  const normalized = normalizeRefreshUrl(input.tip.originalUrl);
  const title = input.prep?.proposedTitle?.trim() ?? null;
  const city = input.prep?.proposedCity?.trim() ?? null;
  const date = input.prep?.proposedStartDate?.trim() ?? null;

  const bySource = (await sql`
    SELECT DISTINCT e.id, e.slug, e.title, e.city, e.starts_at, e.publication_status
    FROM event_editions e
    JOIN event_sources s ON s.event_edition_id = e.id
    WHERE s.normalized_url = ${normalized}
    LIMIT 10
  `) as {
    id: string;
    slug: string;
    title: string;
    city: string;
    starts_at: string | Date;
    publication_status: string;
  }[];

  const out: DuplicateCandidate[] = bySource.map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    city: row.city,
    startsAt:
      typeof row.starts_at === "string"
        ? row.starts_at
        : row.starts_at.toISOString(),
    publicationStatus: row.publication_status,
    matchReason: "zelfde genormaliseerde bron-URL",
  }));

  if (title && city && date) {
    const byMeta = (await sql`
      SELECT id, slug, title, city, starts_at, publication_status
      FROM event_editions
      WHERE lower(title) = ${title.toLowerCase()}
        AND lower(city) = ${city.toLowerCase()}
        AND starts_at::date = ${date}::date
      LIMIT 10
    `) as {
      id: string;
      slug: string;
      title: string;
      city: string;
      starts_at: string | Date;
      publication_status: string;
    }[];
    for (const row of byMeta) {
      if (out.some((d) => d.id === row.id)) continue;
      out.push({
        id: row.id,
        slug: row.slug,
        title: row.title,
        city: row.city,
        startsAt:
          typeof row.starts_at === "string"
            ? row.starts_at
            : row.starts_at.toISOString(),
        publicationStatus: row.publication_status,
        matchReason: "zelfde titel + stad + datum",
      });
    }
  }

  return out;
}

export async function createConceptEventFromTip(input: {
  tipId: string;
  forceCreate?: boolean;
}): Promise<CreateConceptResult> {
  const found = await neonFindTipById(input.tipId);
  if (!found) {
    return { ok: false, code: "not_found", error: "Tip niet gevonden." };
  }
  const { tip, review } = found;

  if (!canCreateConceptFromTipStatus(tip.status)) {
    return {
      ok: false,
      code: "bad_status",
      error:
        "Maak eerst status ‘Goedgekeurd voor publicatie’ vóór een concept-event.",
    };
  }

  if (tip.linkedEventId) {
    const linked = await getEditionById(tip.linkedEventId);
    return {
      ok: false,
      code: "already_linked",
      error: "Deze tip is al gekoppeld aan een event.",
      linkedEdition: linked?.edition ?? null,
    };
  }

  const prep = review.aiPrep;
  const title = prep?.proposedTitle?.trim() || null;
  if (!title) {
    return {
      ok: false,
      code: "missing_facts",
      error:
        "Geen bevestigde titel uit AI/review. Vul de bron bij of scan opnieuw vóór concept.",
    };
  }

  if (!input.forceCreate) {
    const duplicates = await findLikelyDuplicateEditions({ tip, prep });
    if (duplicates.length > 0) {
      return {
        ok: false,
        code: "duplicate_candidates",
        error: "Mogelijk bestaand event gevonden.",
        duplicates,
      };
    }
  }

  const organizerName =
    prep?.proposedOrganizer?.trim() || `Organisator (${hostLabel(tip.originalUrl)})`;
  const organizerSlug =
    slugify(organizerName) || `org-${randomUUID().slice(0, 8)}`;
  const organizer = await upsertOrganizerBySlug({
    slug: organizerSlug,
    name: organizerName,
    websiteUrl: tip.originalUrl,
  });
  if (!organizer) {
    return {
      ok: false,
      code: "storage_error",
      error: "Kon organisator niet opslaan.",
    };
  }

  const { startsAt, dateUnknown } = buildStartsAt(prep);
  const endsAt = buildEndsAt(prep, startsAt);
  const city = prep?.proposedCity?.trim() || "Onbekend";
  const venue = prep?.proposedVenue?.trim() || null;
  const singlesOnly = singlesOnlyFromPrep(prep);
  const eligibilityRoute = routeFromPrep(prep);

  const baseSlug = slugify(`${title}-${prep?.proposedStartDate ?? "tbd"}`);
  const slug = `tip-${baseSlug || "concept"}-${randomUUID().slice(0, 8)}`;

  const gaps = [
    ...(prep?.gaps ?? []),
    ...(dateUnknown ? ["Startdatum niet bevestigd op bron; placeholder 2099-12-31."] : []),
    ...(city === "Onbekend" ? ["Gemeente niet bevestigd op bron."] : []),
  ];

  const edition = await createEdition({
    slug,
    organizerId: organizer.record.id,
    title,
    startsAt,
    endsAt,
    timezone: "Europe/Brussels",
    venueName: venue,
    city,
    country: "BE",
    eligibilityRoute,
    singlesOriented: singlesOnly === true ? true : null,
    singlesOnly,
    singlesOnlyEvidence:
      singlesOnly === true
        ? prep?.singlesEvidence ?? "AI/review: singles-only met bronbewijs."
        : null,
    minAge: null,
    maxAge: null,
    ageRule: prep?.ageRule ?? "unknown",
    category: "dating",
    subCategory: null,
    activities: [],
    tags: ["from-tip", "draft"],
    priceAmount: null,
    priceCurrency: "EUR",
    priceNote: prep?.proposedPriceNotes ?? prep?.priceNotes ?? null,
    priceIsFrom: false,
    availabilityStatus: "unknown",
    availabilityNote: prep?.availabilityNotes ?? null,
    shortDescription: tip.note?.slice(0, 180) ?? null,
    description: null,
    internalNotes: [
      `Created from tip ${tip.id}`,
      tip.note ? `Tip note: ${tip.note}` : null,
      prep?.routeReason ? `AI route: ${prep.routeReason}` : null,
      gaps.length ? `Gaps: ${gaps.join("; ")}` : null,
    ]
      .filter(Boolean)
      .join("\n"),
    practicalInfo: [],
    publicationStatus: "draft",
    publishedAt: null,
    lastCheckedAt: review.checkedAt ?? new Date().toISOString(),
    sourceCheckedAt: review.checkedAt ?? new Date().toISOString(),
    startTimeDisplayNote: dateUnknown
      ? "Startdatum nog niet bevestigd op de bron"
      : null,
    audienceAgeFromSource: false,
  });

  if (!edition) {
    return {
      ok: false,
      code: "storage_error",
      error: "Kon concept-event niet aanmaken.",
    };
  }

  await attachSource({
    eventEditionId: edition.id,
    sourceType: "official_event",
    sourceName: organizerName,
    url: tip.originalUrl,
    normalizedUrl: normalizeRefreshUrl(tip.originalUrl),
    isPrimary: true,
    checkedAt: review.checkedAt ?? new Date().toISOString(),
    evidenceNote: "from tip submission",
  });

  if (
    prep?.bookingUrl &&
    normalizeRefreshUrl(prep.bookingUrl) !==
      normalizeRefreshUrl(tip.originalUrl)
  ) {
    await attachSource({
      eventEditionId: edition.id,
      sourceType: "ticket",
      sourceName: organizerName,
      url: prep.bookingUrl,
      normalizedUrl: normalizeRefreshUrl(prep.bookingUrl),
      isPrimary: false,
      checkedAt: review.checkedAt ?? new Date().toISOString(),
    });
  }

  // No image attach: render-time image compatibility supplies mood/neutral.

  const linked = await neonLinkTipToEvent({
    tipId: tip.id,
    eventEditionId: edition.id,
  });
  if (!linked) {
    return {
      ok: false,
      code: "storage_error",
      error: "Concept aangemaakt maar tip-koppeling mislukte.",
    };
  }

  return { ok: true, edition, created: true };
}

export async function linkTipToExistingEvent(input: {
  tipId: string;
  eventEditionId: string;
}): Promise<
  | { ok: true; edition: EventEditionRecord }
  | { ok: false; code: string; error: string }
> {
  const found = await neonFindTipById(input.tipId);
  if (!found) {
    return { ok: false, code: "not_found", error: "Tip niet gevonden." };
  }
  if (found.tip.linkedEventId) {
    return {
      ok: false,
      code: "already_linked",
      error: "Tip is al gekoppeld.",
    };
  }
  if (
    found.tip.status !== "approved_for_publication" &&
    found.tip.status !== "in_review"
  ) {
    return {
      ok: false,
      code: "bad_status",
      error: "Koppelen mag vanaf in_review / approved_for_publication.",
    };
  }
  const bundle = await getEditionById(input.eventEditionId);
  if (!bundle) {
    return { ok: false, code: "not_found", error: "Event niet gevonden." };
  }
  const linked = await neonLinkTipToEvent({
    tipId: input.tipId,
    eventEditionId: input.eventEditionId,
  });
  if (!linked) {
    return { ok: false, code: "storage_error", error: "Koppelen mislukt." };
  }
  return { ok: true, edition: bundle.edition };
}
