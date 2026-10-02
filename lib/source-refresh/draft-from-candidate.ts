/**
 * Create a canonical draft edition from an accepted refresh candidate.
 * Never publishes.
 */
import { randomUUID } from "node:crypto";
import {
  attachSource,
  createEdition,
  upsertOrganizerBySlug,
} from "@/lib/events/neon-store";
import { coordsForCity } from "@/lib/geo-cities";
import { normalizeRefreshUrl, slugify } from "@/lib/source-refresh/normalize";
import type { RefreshNormalizedCandidate } from "@/lib/source-refresh/types";
import type { EventEditionRecord } from "@/types/event-catalog";

export async function createDraftFromRefreshCandidate(input: {
  candidate: RefreshNormalizedCandidate;
  organizerSlug: string;
  organizerName: string;
  organizerWebsite: string | null;
}): Promise<EventEditionRecord | null> {
  const organizer = await upsertOrganizerBySlug({
    slug: input.organizerSlug,
    name: input.organizerName,
    websiteUrl: input.organizerWebsite,
  });
  if (!organizer) return null;

  const baseSlug = slugify(
    `${input.candidate.title}-${input.candidate.date}-${input.candidate.externalKey}`,
  );
  const slug = `${baseSlug || "refresh-draft"}-${randomUUID().slice(0, 8)}`;

  const isDating =
    /speed\s*dat/i.test(input.candidate.title) ||
    input.organizerSlug === "smartvibes" ||
    input.organizerSlug === "hoptodate";

  const cityCoords = coordsForCity(input.candidate.city);

  const edition = await createEdition({
    slug,
    organizerId: organizer.record.id,
    title: input.candidate.title,
    startsAt: input.candidate.startsAt,
    endsAt: input.candidate.endsAt,
    timezone: "Europe/Brussels",
    venueName: input.candidate.venue,
    address: input.candidate.address,
    city: input.candidate.city,
    latitude: cityCoords?.lat ?? null,
    longitude: cityCoords?.lng ?? null,
    country: "BE",
    eligibilityRoute: "route_a",
    singlesOriented: true,
    singlesOnly: true,
    singlesOnlyEvidence: `Source refresh candidate from ${input.organizerName} agenda.`,
    minAge: input.candidate.minAge,
    maxAge: input.candidate.maxAge,
    ageRule: input.candidate.ageRule,
    category: isDating ? "dating" : "meet_new_people",
    subCategory: isDating ? "speeddate" : null,
    activities: isDating ? ["speeddate"] : ["wandelen"],
    tags: ["source-refresh", "draft"],
    priceAmount: input.candidate.price,
    priceCurrency: "EUR",
    availabilityStatus: input.candidate.availability,
    genderAvailability: input.candidate.genderAvailability ?? null,
    availabilityNote: input.candidate.availabilityNote ?? null,
    shortDescription: input.candidate.rawEvidenceSummary.slice(0, 180),
    description: input.candidate.rawEvidenceSummary,
    internalNotes: `Created from source refresh item ${input.candidate.externalKey}`,
    practicalInfo: [],
    publicationStatus: "draft",
    sourceCheckedAt: input.candidate.sourceCheckedAt,
    lastCheckedAt: input.candidate.sourceCheckedAt,
  });

  if (!edition) return null;

  await attachSource({
    eventEditionId: edition.id,
    sourceType: "organizer",
    sourceName: input.organizerName,
    url: input.candidate.officialUrl,
    normalizedUrl: normalizeRefreshUrl(input.candidate.officialUrl),
    isPrimary: true,
    checkedAt: input.candidate.sourceCheckedAt,
    evidenceNote: "source refresh V1",
  });
  if (
    input.candidate.ticketUrl &&
    input.candidate.ticketUrl !== input.candidate.officialUrl
  ) {
    await attachSource({
      eventEditionId: edition.id,
      sourceType: "ticket",
      sourceName: input.organizerName,
      url: input.candidate.ticketUrl,
      normalizedUrl: normalizeRefreshUrl(input.candidate.ticketUrl),
      isPrimary: false,
      checkedAt: input.candidate.sourceCheckedAt,
    });
  }

  return edition;
}
