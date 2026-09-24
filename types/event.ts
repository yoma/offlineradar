export type EventCategory = "dating" | "meet_new_people" | "social";

export type EligibilityAgeRule = "strict" | "guideline" | "unknown";

export type GenderRule = "any" | "women" | "men" | "mixed" | "unknown";

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
  eligibilityAgeMin: number | null;
  eligibilityAgeMax: number | null;
  eligibilityAgeRule: EligibilityAgeRule;
  preferredAudienceAgeMin: number | null;
  preferredAudienceAgeMax: number | null;
  singlesOnly: boolean | null;
  genderRule: GenderRule | null;
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
