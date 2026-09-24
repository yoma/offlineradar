import type { ActivityId, EventCategory } from "@/types/event";

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

export type SearchState = {
  age: number | null;
  placeId: string;
  maxDistanceKm: number;
  preferredAgeMin: number | null;
  preferredAgeMax: number | null;
  when: WhenFilter;
  date: string | null;
  categories: EventCategory[];
  activities: ActivityId[];
  price: PriceFilter;
  singlesOnly: boolean;
  availability: AvailabilityFilter;
  strictOnly: boolean;
  sort: SortKey;
};

export type StoredProfile = {
  age: number | null;
  placeId: string;
  maxDistanceKm: number;
  preferredAgeMin: number | null;
  preferredAgeMax: number | null;
  interests: ActivityId[];
};
