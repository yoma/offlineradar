/**
 * Canonical event catalog types (Neon storage).
 * Separate from the consumer `Event` projection in types/event.ts.
 */

import type {
  ActivityId,
  CapacityStatus,
  EligibilityAgeRule,
  EventCategory,
  EventEligibility,
  ParticipantGender,
  SocialSuitability,
} from "@/types/event";

export const EVENT_PUBLICATION_STATUSES = [
  "candidate",
  "under_review",
  "approved",
  "draft",
  "published",
  "rejected",
  "expired",
  "cancelled",
] as const;

export type EventPublicationStatus = (typeof EVENT_PUBLICATION_STATUSES)[number];

export type EligibilityRoute = "route_a" | "route_b" | "unknown";

export type EventSourceType =
  | "organizer"
  | "official_event"
  | "ticket"
  | "social"
  | "aggregator"
  | "other";

export type EventImageType = "official" | "licensed" | "generated" | "mood";

export type OrganizerRecord = {
  id: string;
  slug: string;
  name: string;
  websiteUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

export type EventSeriesRecord = {
  id: string;
  organizerId: string;
  slug: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
};

export type EventSourceRecord = {
  id: string;
  eventEditionId: string;
  sourceType: EventSourceType;
  sourceName: string | null;
  url: string;
  normalizedUrl: string;
  isPrimary: boolean;
  checkedAt: string | null;
  evidenceNote: string | null;
  createdAt: string;
};

export type EventImageRecord = {
  id: string;
  eventEditionId: string;
  urlOrPath: string;
  imageType: EventImageType;
  sourceUrl: string | null;
  rightsNote: string | null;
  isPrimary: boolean;
  altText: string | null;
  createdAt: string;
};

export type EventEditionRecord = {
  id: string;
  slug: string;
  organizerId: string | null;
  seriesId: string | null;
  title: string;
  startsAt: string;
  endsAt: string | null;
  timezone: string;
  venueName: string | null;
  address: string | null;
  city: string;
  postalCode: string | null;
  region: string | null;
  country: string;
  latitude: number | null;
  longitude: number | null;
  eligibilityRoute: EligibilityRoute;
  singlesOriented: boolean | null;
  singlesOnly: boolean | null;
  singlesOnlyEvidence: string | null;
  meetFormula: string | null;
  meetFormulaEvidence: string | null;
  minAge: number | null;
  maxAge: number | null;
  ageRule: EligibilityAgeRule;
  eligibilityJson: EventEligibility | null;
  category: EventCategory;
  subCategory: string | null;
  activities: ActivityId[];
  tags: string[];
  priceAmount: number | null;
  priceCurrency: string | null;
  priceNote: string | null;
  priceIsFrom: boolean;
  availabilityStatus: CapacityStatus | null;
  spotsRemaining: number | null;
  bookingDeadline: string | null;
  availabilityNote: string | null;
  shortDescription: string | null;
  description: string | null;
  internalNotes: string | null;
  practicalInfo: string[];
  publicationStatus: EventPublicationStatus;
  approvedAt: string | null;
  publishedAt: string | null;
  rejectedAt: string | null;
  expiredAt: string | null;
  lastCheckedAt: string | null;
  sourceCheckedAt: string | null;
  nextCheckAt: string | null;
  socialSuitability: SocialSuitability | null;
  genderAvailability: string | null;
  startTimeDisplayNote: string | null;
  knownAudienceGenders: ParticipantGender[] | null;
  preferredAudienceAgeMin: number | null;
  preferredAudienceAgeMax: number | null;
  audienceAgeFromSource: boolean;
  createdAt: string;
  updatedAt: string;
};

/** Edition plus related rows for adapter / admin later. */
export type EventEditionBundle = {
  edition: EventEditionRecord;
  organizer: OrganizerRecord | null;
  series: EventSeriesRecord | null;
  sources: EventSourceRecord[];
  images: EventImageRecord[];
};

export type CreateOrganizerInput = {
  slug: string;
  name: string;
  websiteUrl?: string | null;
};

export type CreateSeriesInput = {
  organizerId: string;
  slug: string;
  name: string;
  description?: string | null;
};

export type CreateEditionInput = {
  slug: string;
  organizerId?: string | null;
  seriesId?: string | null;
  title: string;
  startsAt: string;
  endsAt?: string | null;
  timezone?: string;
  venueName?: string | null;
  address?: string | null;
  city: string;
  postalCode?: string | null;
  region?: string | null;
  country?: string;
  latitude?: number | null;
  longitude?: number | null;
  eligibilityRoute?: EligibilityRoute;
  singlesOriented?: boolean | null;
  singlesOnly?: boolean | null;
  singlesOnlyEvidence?: string | null;
  meetFormula?: string | null;
  meetFormulaEvidence?: string | null;
  minAge?: number | null;
  maxAge?: number | null;
  ageRule?: EligibilityAgeRule;
  eligibilityJson?: EventEligibility | null;
  category?: EventCategory;
  subCategory?: string | null;
  activities?: ActivityId[];
  tags?: string[];
  priceAmount?: number | null;
  priceCurrency?: string | null;
  priceNote?: string | null;
  priceIsFrom?: boolean;
  availabilityStatus?: CapacityStatus | null;
  spotsRemaining?: number | null;
  bookingDeadline?: string | null;
  availabilityNote?: string | null;
  shortDescription?: string | null;
  description?: string | null;
  internalNotes?: string | null;
  practicalInfo?: string[];
  publicationStatus?: EventPublicationStatus;
  approvedAt?: string | null;
  publishedAt?: string | null;
  rejectedAt?: string | null;
  expiredAt?: string | null;
  lastCheckedAt?: string | null;
  sourceCheckedAt?: string | null;
  nextCheckAt?: string | null;
  socialSuitability?: SocialSuitability | null;
  genderAvailability?: string | null;
  startTimeDisplayNote?: string | null;
  knownAudienceGenders?: ParticipantGender[] | null;
  preferredAudienceAgeMin?: number | null;
  preferredAudienceAgeMax?: number | null;
  audienceAgeFromSource?: boolean;
};

export type AttachSourceInput = {
  eventEditionId: string;
  sourceType: EventSourceType;
  url: string;
  normalizedUrl: string;
  sourceName?: string | null;
  isPrimary?: boolean;
  checkedAt?: string | null;
  evidenceNote?: string | null;
};

export type AttachImageInput = {
  eventEditionId: string;
  urlOrPath: string;
  imageType: EventImageType;
  sourceUrl?: string | null;
  rightsNote?: string | null;
  isPrimary?: boolean;
  altText?: string | null;
};
