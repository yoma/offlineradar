export type EventCategory = "dating" | "meet_new_people" | "social";

export type EligibilityAgeRule = "strict" | "guideline" | "unknown";

/** User identity gender for eligibility checks. */
export type UserGender = "man" | "woman" | "other" | "prefer_not";

/** Optional preference: who the user hopes to meet. Never a hard filter. */
export type PreferredMeetGender = "women" | "men" | "anyone";

export type ParticipantGender = "man" | "woman";

export type AgeEligibilityBand = {
  ageMin: number | null;
  ageMax: number | null;
  ageRule: EligibilityAgeRule;
};

/**
 * Structured participation rules from the source.
 * Bounds are never invented; unknown stays unknown.
 */
export type EventEligibility = {
  default: AgeEligibilityBand | null;
  byGender: Partial<Record<ParticipantGender, AgeEligibilityBand>> | null;
  /** null = no gender restriction known / everyone welcome */
  allowedGenders: ParticipantGender[] | null;
};

export type CapacityStatus =
  | "available"
  | "limited"
  | "almost_full"
  | "waitlist"
  | "sold_out"
  | "unknown";

export type SocialSuitability = "high" | "medium" | "low";

export type SourceType =
  | "official_website"
  | "ticket_platform"
  | "community_page"
  | "unknown";

export type ActivityId =
  | "eten"
  | "drinken"
  | "wandelen"
  | "lopen"
  | "sport"
  | "padel"
  | "party"
  | "dans"
  | "workshop"
  | "reizen"
  | "weekend"
  | "outdoor";

export type Event = {
  id: string;
  title: string;
  slug: string;
  shortDescription: string;
  description: string | null;
  category: EventCategory;
  subCategory: string;
  organizerName: string;
  city: string;
  region: string;
  venue: string | null;
  latitude: number;
  longitude: number;
  /** Distance from Antwerp. Replaced in the UI with distance from the chosen place. */
  distanceKm: number;
  startDate: string;
  endDate: string | null;
  startTime: string | null;
  endTime: string | null;
  price: number | null;
  currency: "EUR";
  eligibility: EventEligibility;
  /**
   * Display fallback when no gender-specific band applies.
   * Derived from eligibility.default or a summary of byGender.
   */
  eligibilityAgeMin: number | null;
  eligibilityAgeMax: number | null;
  eligibilityAgeRule: EligibilityAgeRule;
  /**
   * Typical / expected audience age from the source only.
   * Used for preference ranking. Shown in UI only when audienceAgeFromSource.
   */
  preferredAudienceAgeMin: number | null;
  preferredAudienceAgeMax: number | null;
  audienceAgeFromSource: boolean;
  /**
   * Known audience gender mix from the source.
   * null = source says nothing reliable; never invent a match.
   */
  knownAudienceGenders: ParticipantGender[] | null;
  singlesOnly: boolean | null;
  genderAvailability: string | null;
  capacityStatus: CapacityStatus;
  spotsRemaining: number | null;
  registrationDeadline: string | null;
  socialSuitability: SocialSuitability;
  sourceType: SourceType;
  sourceName: string;
  officialUrl: string;
  ticketUrl: string | null;
  instagramUrl: string | null;
  lastCheckedAt: string;
  addedAt: string;
  imageUrl: string | null;
  tags: string[];
  activities: ActivityId[];
  practicalInfo: string[];
};

export function band(
  ageMin: number | null,
  ageMax: number | null,
  ageRule: EligibilityAgeRule,
): AgeEligibilityBand {
  return { ageMin, ageMax, ageRule };
}
