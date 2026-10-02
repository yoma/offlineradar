import type { ActivityId, EventCategory, PreferredMeetGender, UserGender } from "@/types/event";

export type WhenFilter =
  | "any"
  | "today"
  | "tomorrow"
  | "weekend"
  | "next_week"
  | "month"
  | "date";

export type PriceFilter = "any" | "free" | "lt25" | "mid" | "gt50";

export type AvailabilityFilter = "any" | "open" | "almost_full" | "waitlist";

export type SortKey = "match" | "soon" | "distance" | "newest";

/**
 * How category/activity filters apply:
 * - all: no type restriction (Alle soorten)
 * - none: no types selected → match nothing
 * - pick: use categories[] / activities[]
 */
export type TypesFilterMode = "all" | "none" | "pick";

export type SearchState = {
  age: number | null;
  gender: UserGender | null;
  placeId: string;
  maxDistanceKm: number;
  preferredAgeMin: number | null;
  preferredAgeMax: number | null;
  preferredMeetGender: PreferredMeetGender;
  when: WhenFilter;
  date: string | null;
  categories: EventCategory[];
  activities: ActivityId[];
  /** Default "all". Empty arrays only mean “all types” when this is "all". */
  typesMode: TypesFilterMode;
  price: PriceFilter;
  singlesOnly: boolean;
  availability: AvailabilityFilter;
  strictOnly: boolean;
  sort: SortKey;
};

export type StoredProfile = {
  age: number | null;
  gender: UserGender | null;
  placeId: string;
  maxDistanceKm: number;
  preferredAgeMin: number | null;
  preferredAgeMax: number | null;
  preferredMeetGender: PreferredMeetGender;
  interests: ActivityId[];
};
