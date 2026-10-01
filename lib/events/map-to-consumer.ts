/**
 * Map canonical Neon edition bundles → consumer `Event` (types/event.ts).
 * Does not invent facts. Gaps stay null/unknown/empty.
 */

import { distanceKmBetween } from "@/lib/distance";
import {
  normalizeEventActivities,
  normalizeSpeeddateSubCategory,
} from "@/lib/event-category";
import { resolveSourceVerifiedAt } from "@/lib/freshness";
import { resolveEditionCoords } from "@/lib/geo-cities";
import type { EventEditionBundle } from "@/types/event-catalog";
import type { Event, EventEligibility, ListingPath } from "@/types/event";
import { band } from "@/types/event";

/**
 * Public freshness: source_checked_at only (successful source verification).
 * Never uses last_checked_at (historically polluted with import stamps),
 * createdAt, updatedAt, or publishedAt.
 */
function resolvePublicFreshnessAt(
  edition: EventEditionBundle["edition"],
): string | null {
  return resolveSourceVerifiedAt({
    sourceCheckedAt: edition.sourceCheckedAt,
    lastCheckedAt: null,
  });
}

function brusselsParts(iso: string, timeZone: string): {
  date: string;
  time: string | null;
} {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: iso.slice(0, 10), time: null };

  const dateParts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const year = dateParts.find((p) => p.type === "year")?.value ?? "1970";
  const month = dateParts.find((p) => p.type === "month")?.value ?? "01";
  const day = dateParts.find((p) => p.type === "day")?.value ?? "01";

  const timeParts = new Intl.DateTimeFormat("nl-BE", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const hour = timeParts.find((p) => p.type === "hour")?.value;
  const minute = timeParts.find((p) => p.type === "minute")?.value;
  const time =
    hour != null && minute != null ? `${hour}:${minute}` : null;

  return { date: `${year}-${month}-${day}`, time };
}

function buildEligibility(bundle: EventEditionBundle): EventEligibility {
  const { edition } = bundle;
  if (edition.eligibilityJson?.default || edition.eligibilityJson?.byGender) {
    return edition.eligibilityJson;
  }
  return {
    default: band(edition.minAge, edition.maxAge, edition.ageRule),
    byGender: null,
    allowedGenders: null,
  };
}

function listingPathFor(bundle: EventEditionBundle): ListingPath {
  if (bundle.edition.eligibilityRoute === "route_b") {
    return "meet_activation";
  }
  return "organic";
}

function primaryOfficialUrl(bundle: EventEditionBundle): string {
  const primary =
    bundle.sources.find((s) => s.isPrimary) ?? bundle.sources[0] ?? null;
  if (primary) return primary.url;
  return bundle.organizer?.websiteUrl ?? "";
}

function ticketUrl(bundle: EventEditionBundle): string | null {
  const ticket = bundle.sources.find((s) => s.sourceType === "ticket");
  if (ticket) return ticket.url;
  // Booking platforms stored as official_event still act as book CTA.
  const primary =
    bundle.sources.find((s) => s.isPrimary) ?? bundle.sources[0] ?? null;
  if (!primary) return null;
  const host = primary.url.toLowerCase();
  if (
    host.includes("hipsy.") ||
    host.includes("eventgoose.") ||
    host.includes("ikwileenticket.") ||
    host.includes("houseofentertainment.")
  ) {
    return primary.url;
  }
  return null;
}

function sourceMeta(bundle: EventEditionBundle): {
  sourceType: Event["sourceType"];
  sourceName: string;
} {
  const primary =
    bundle.sources.find((s) => s.isPrimary) ?? bundle.sources[0] ?? null;
  if (!primary) {
    return { sourceType: "unknown", sourceName: bundle.organizer?.name ?? "onbekend" };
  }
  const map: Record<string, Event["sourceType"]> = {
    organizer: "official_website",
    official_event: "official_website",
    ticket: "ticket_platform",
    social: "community_page",
    aggregator: "community_page",
    other: "unknown",
  };
  return {
    sourceType: map[primary.sourceType] ?? "unknown",
    sourceName: primary.sourceName ?? bundle.organizer?.name ?? primary.sourceType,
  };
}

/**
 * Convert a stored edition (+ related rows) into the existing consumer Event.
 * Mapping gaps are documented inline; never invent eligibility or singlesOnly.
 */
export function mapEditionToConsumerEvent(
  bundle: EventEditionBundle,
): Event {
  const { edition, organizer, images } = bundle;
  const tz = edition.timezone || "Europe/Brussels";
  const start = brusselsParts(edition.startsAt, tz);
  const end = edition.endsAt ? brusselsParts(edition.endsAt, tz) : null;
  const eligibility = buildEligibility(bundle);
  const primaryImage =
    images.find((img) => img.isPrimary) ?? images[0] ?? null;
  const coords = resolveEditionCoords({
    latitude: edition.latitude,
    longitude: edition.longitude,
    city: edition.city,
  });
  const lat = coords.lat;
  const lng = coords.lng;
  const source = sourceMeta(bundle);
  const path = listingPathFor(bundle);

  const singlesOriented =
    edition.singlesOriented === true
      ? true
      : edition.eligibilityRoute === "route_a"
        ? true
        : edition.singlesOriented === false
          ? false
          : undefined;

  return {
    id: edition.id,
    title: edition.title,
    slug: edition.slug,
    shortDescription: edition.shortDescription ?? "",
    description: edition.description,
    category: edition.category,
    subCategory: normalizeSpeeddateSubCategory(
      edition.subCategory,
      edition.title,
    ),
    organizerName: organizer?.name ?? "Onbekende organisator",
    organizerId: organizer?.id ?? edition.organizerId,
    organizerSlug: organizer?.slug ?? null,
    city: edition.city,
    region: edition.region ?? edition.city,
    venue: edition.venueName,
    venueId: null,
    latitude: lat,
    longitude: lng,
    // Placeholder until prepareEvents/withUserDistance recalculates from the user place.
    // Unknown coords → Infinity so distance filters exclude them (never fake Antwerp).
    distanceKm: coords.known
      ? distanceKmBetween({ lat: 51.2194, lng: 4.4025 }, { lat, lng })
      : Number.POSITIVE_INFINITY,
    startDate: start.date,
    endDate: end && end.date !== start.date ? end.date : null,
    startTime: start.time,
    endTime: end?.time ?? null,
    price: edition.priceAmount,
    currency: "EUR",
    eligibility,
    eligibilityAgeMin: eligibility.default?.ageMin ?? edition.minAge,
    eligibilityAgeMax: eligibility.default?.ageMax ?? edition.maxAge,
    eligibilityAgeRule: eligibility.default?.ageRule ?? edition.ageRule,
    preferredAudienceAgeMin: edition.preferredAudienceAgeMin,
    preferredAudienceAgeMax: edition.preferredAudienceAgeMax,
    audienceAgeFromSource: edition.audienceAgeFromSource,
    knownAudienceGenders: edition.knownAudienceGenders,
    singlesOnly: edition.singlesOnly,
    singlesOriented,
    singlesFriendly: false,
    listingPath: path,
    // Route B Meet commitment object is not stored in Phase 1 schema yet.
    meetActivation: null,
    genderAvailability: edition.genderAvailability,
    capacityStatus: edition.availabilityStatus ?? "unknown",
    spotsRemaining: edition.spotsRemaining,
    registrationDeadline: edition.bookingDeadline,
    socialSuitability: edition.socialSuitability ?? "high",
    sourceType: source.sourceType,
    sourceName: source.sourceName,
    officialUrl: primaryOfficialUrl(bundle),
    ticketUrl: ticketUrl(bundle),
    instagramUrl:
      bundle.sources.find((s) => s.sourceType === "social")?.url ?? null,
    lastCheckedAt: resolvePublicFreshnessAt(edition),
    addedAt: edition.createdAt,
    imageUrl: primaryImage?.urlOrPath ?? null,
    imageAlt: primaryImage?.altText ?? null,
    imageIsAtmosphere:
      primaryImage?.imageType === "mood" ||
      primaryImage?.imageType === "generated"
        ? true
        : primaryImage
          ? false
          : undefined,
    tags: edition.tags,
    activities: normalizeEventActivities({
      activities: edition.activities,
      subCategory: edition.subCategory,
      title: edition.title,
      tags: edition.tags,
    }),
    practicalInfo: edition.practicalInfo,
    availabilityNote: edition.availabilityNote,
    startTimeDisplayNote: edition.startTimeDisplayNote,
    priceIsFrom: edition.priceIsFrom,
  };
}

/**
 * Published-only helper for a future feed switch.
 * approved ≠ published: callers must use listPublishedEditions first.
 */
export function mapPublishedBundlesToConsumerEvents(
  bundles: EventEditionBundle[],
): Event[] {
  return bundles
    .filter((b) => b.edition.publicationStatus === "published")
    .map(mapEditionToConsumerEvent);
}
