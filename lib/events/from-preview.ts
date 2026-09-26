/**
 * Pure helper: consumer/preview `Event` → canonical CreateEditionInput (+ related).
 * Phase 1: mapping only. Does NOT write to Neon. Used by Phase 2 import later.
 */

import type { Event } from "@/types/event";
import type {
  CreateEditionInput,
  CreateOrganizerInput,
  AttachImageInput,
  AttachSourceInput,
  EligibilityRoute,
} from "@/types/event-catalog";

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120);
}

function startsAtIso(event: Event): string {
  const time = event.startTime ?? "00:00";
  // Interpret as Brussels local wall time → store as ISO via Date parse of offsetless.
  // Phase 2 import should refine timezone handling; here we keep a stable draft.
  return `${event.startDate}T${time}:00+02:00`;
}

function endsAtIso(event: Event): string | null {
  if (!event.endDate && !event.endTime) return null;
  const date = event.endDate ?? event.startDate;
  const time = event.endTime ?? event.startTime ?? "00:00";
  return `${date}T${time}:00+02:00`;
}

function eligibilityRoute(event: Event): EligibilityRoute {
  if (event.listingPath === "meet_activation") return "route_b";
  if (event.singlesOriented === true) return "route_a";
  return "unknown";
}

export type PreviewToCatalogDraft = {
  organizer: CreateOrganizerInput;
  edition: CreateEditionInput;
  sources: Omit<AttachSourceInput, "eventEditionId">[];
  images: Omit<AttachImageInput, "eventEditionId">[];
};

/**
 * Build a canonical draft from a preview/mock consumer Event.
 * Never persists. Publication status defaults to `draft` (never published).
 */
export function mapConsumerEventToCatalogDraft(
  event: Event,
): PreviewToCatalogDraft {
  const organizerSlug = slugify(event.organizerName) || "organizer";
  const organizer: CreateOrganizerInput = {
    slug: organizerSlug,
    name: event.organizerName,
    websiteUrl: event.officialUrl || null,
  };

  const edition: CreateEditionInput = {
    slug: event.slug,
    title: event.title,
    startsAt: startsAtIso(event),
    endsAt: endsAtIso(event),
    timezone: "Europe/Brussels",
    venueName: event.venue,
    city: event.city,
    region: event.region,
    country: "BE",
    latitude: event.latitude,
    longitude: event.longitude,
    eligibilityRoute: eligibilityRoute(event),
    singlesOriented:
      event.singlesOriented === true
        ? true
        : event.singlesOriented === false
          ? false
          : null,
    singlesOnly: event.singlesOnly,
    minAge: event.eligibilityAgeMin,
    maxAge: event.eligibilityAgeMax,
    ageRule: event.eligibilityAgeRule,
    eligibilityJson: event.eligibility,
    category: event.category,
    subCategory: event.subCategory || null,
    activities: event.activities,
    tags: event.tags,
    priceAmount: event.price,
    priceCurrency: "EUR",
    priceIsFrom: event.priceIsFrom === true,
    availabilityStatus: event.capacityStatus,
    spotsRemaining: event.spotsRemaining,
    bookingDeadline: event.registrationDeadline,
    availabilityNote: event.availabilityNote ?? null,
    shortDescription: event.shortDescription || null,
    description: event.description,
    practicalInfo: event.practicalInfo,
    // Never auto-publish from preview mapping. Phase 2 import overrides status.
    publicationStatus: "draft",
    approvedAt: null,
    publishedAt: null,
    lastCheckedAt: event.lastCheckedAt,
    sourceCheckedAt: event.lastCheckedAt,
    socialSuitability: event.socialSuitability,
    genderAvailability: event.genderAvailability,
    startTimeDisplayNote: event.startTimeDisplayNote ?? null,
    knownAudienceGenders: event.knownAudienceGenders,
    preferredAudienceAgeMin: event.preferredAudienceAgeMin,
    preferredAudienceAgeMax: event.preferredAudienceAgeMax,
    audienceAgeFromSource: event.audienceAgeFromSource,
  };

  const sources: Omit<AttachSourceInput, "eventEditionId">[] = [];
  if (event.officialUrl) {
    sources.push({
      sourceType: "official_event",
      url: event.officialUrl,
      normalizedUrl: event.officialUrl.replace(/\/$/, "").toLowerCase(),
      sourceName: event.sourceName,
      isPrimary: true,
      checkedAt: event.lastCheckedAt,
    });
  }
  if (event.ticketUrl) {
    sources.push({
      sourceType: "ticket",
      url: event.ticketUrl,
      normalizedUrl: event.ticketUrl.replace(/\/$/, "").toLowerCase(),
      sourceName: event.sourceName,
      isPrimary: !event.officialUrl,
      checkedAt: event.lastCheckedAt,
    });
  }

  const images: Omit<AttachImageInput, "eventEditionId">[] = [];
  if (event.imageUrl) {
    images.push({
      urlOrPath: event.imageUrl,
      imageType: event.imageIsAtmosphere ? "mood" : "official",
      isPrimary: true,
      altText: event.imageAlt ?? null,
      rightsNote: event.imageIsAtmosphere
        ? "Sfeerbeeld; geen officiële editiefoto."
        : null,
    });
  }

  return { organizer, edition, sources, images };
}
