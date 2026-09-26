import type {
  ActivityId,
  EventCategory,
  PreferredMeetGender,
  UserGender,
} from "@/types/event";
import type {
  AvailabilityFilter,
  PriceFilter,
  SearchState,
  SortKey,
  StoredProfile,
  WhenFilter,
} from "@/types/search";

const CATEGORIES: EventCategory[] = ["dating", "meet_new_people", "social"];
const ACTIVITIES: ActivityId[] = [
  "eten",
  "drinken",
  "wandelen",
  "lopen",
  "sport",
  "padel",
  "party",
  "dans",
  "workshop",
  "reizen",
  "weekend",
  "outdoor",
];
const WHENS: WhenFilter[] = [
  "any",
  "today",
  "tomorrow",
  "weekend",
  "next_week",
  "month",
  "date",
];
const PRICES: PriceFilter[] = ["any", "free", "lt25", "mid", "gt50"];
const AVAILABILITY: AvailabilityFilter[] = [
  "any",
  "open",
  "almost_full",
  "waitlist",
];
const SORTS: SortKey[] = ["match", "soon", "distance", "newest"];
const GENDERS: UserGender[] = ["man", "woman", "other", "prefer_not"];
const MEET_GENDERS: PreferredMeetGender[] = ["women", "men", "anyone"];

export function defaultSearchState(): SearchState {
  return {
    age: null,
    gender: null,
    placeId: "antwerpen",
    maxDistanceKm: 25,
    preferredAgeMin: null,
    preferredAgeMax: null,
    preferredMeetGender: "anyone",
    when: "any",
    date: null,
    categories: [],
    activities: [],
    price: "any",
    singlesOnly: false,
    availability: "any",
    strictOnly: false,
    sort: "match",
  };
}

/**
 * Canonical date filter: exactly one when-mode at a time.
 * Choosing month/weekend/next_week/etc. always clears an explicit date.
 */
export function withWhenFilter(
  state: SearchState,
  when: WhenFilter,
  date: string | null = null,
): SearchState {
  if (when === "date") {
    return { ...state, when: "date", date: date || state.date };
  }
  return { ...state, when, date: null };
}

/** Merge a patch while keeping when/date mutually exclusive. */
export function applySearchPatch(
  state: SearchState,
  patch: Partial<SearchState>,
): SearchState {
  const next = { ...state, ...patch };
  if (Object.prototype.hasOwnProperty.call(patch, "when")) {
    return withWhenFilter(next, patch.when ?? "any", patch.date ?? null);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "date") && next.when !== "date") {
    return { ...next, date: null };
  }
  if (next.when !== "date") {
    return { ...next, date: null };
  }
  return next;
}

function one(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function asNumber(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function oneOf<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
  fallback: T,
): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function manyOf<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
): T[] {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item): item is T => allowed.includes(item as T));
}

export function parseSearchState(
  raw: Record<string, string | string[] | undefined>,
): SearchState {
  const base = defaultSearchState();
  const age = asNumber(one(raw.age));
  const distance = asNumber(one(raw.distance));
  const genderRaw = one(raw.gender);
  return {
    ...base,
    age: age != null && age >= 18 && age <= 99 ? age : null,
    gender: genderRaw
      ? oneOf(genderRaw, GENDERS, "prefer_not")
      : null,
    placeId: one(raw.place) || base.placeId,
    maxDistanceKm:
      distance === 10 || distance === 25 || distance === 50 || distance === 100
        ? distance
        : base.maxDistanceKm,
    preferredAgeMin: asNumber(one(raw.prefMin)),
    preferredAgeMax: asNumber(one(raw.prefMax)),
    preferredMeetGender: oneOf(one(raw.meet), MEET_GENDERS, "anyone"),
    when: oneOf(one(raw.when), WHENS, "any"),
    date:
      oneOf(one(raw.when), WHENS, "any") === "date"
        ? one(raw.date) || null
        : null,
    categories: manyOf(one(raw.cat), CATEGORIES),
    activities: manyOf(one(raw.act), ACTIVITIES),
    price: oneOf(one(raw.price), PRICES, "any"),
    singlesOnly: one(raw.singles) === "1",
    availability: oneOf(one(raw.avail), AVAILABILITY, "any"),
    strictOnly: one(raw.strict) === "1",
    sort: oneOf(one(raw.sort), SORTS, "match"),
  };
}

export function serializeSearchState(state: SearchState): string {
  const params = new URLSearchParams();
  if (state.age != null) params.set("age", String(state.age));
  if (state.gender) params.set("gender", state.gender);
  if (state.placeId) params.set("place", state.placeId);
  params.set("distance", String(state.maxDistanceKm));
  if (state.preferredAgeMin != null) {
    params.set("prefMin", String(state.preferredAgeMin));
  }
  if (state.preferredAgeMax != null) {
    params.set("prefMax", String(state.preferredAgeMax));
  }
  if (state.preferredMeetGender !== "anyone") {
    params.set("meet", state.preferredMeetGender);
  }
  if (state.when !== "any") params.set("when", state.when);
  if (state.when === "date" && state.date) params.set("date", state.date);
  if (state.categories.length) params.set("cat", state.categories.join(","));
  if (state.activities.length) params.set("act", state.activities.join(","));
  if (state.price !== "any") params.set("price", state.price);
  if (state.singlesOnly) params.set("singles", "1");
  if (state.availability !== "any") params.set("avail", state.availability);
  if (state.strictOnly) params.set("strict", "1");
  if (state.sort !== "match") params.set("sort", state.sort);
  return params.toString();
}

export function profileFromSearch(state: SearchState): StoredProfile {
  return {
    age: state.age,
    gender: state.gender,
    placeId: state.placeId,
    maxDistanceKm: state.maxDistanceKm,
    preferredAgeMin: state.preferredAgeMin,
    preferredAgeMax: state.preferredAgeMax,
    preferredMeetGender: state.preferredMeetGender,
    interests: state.activities,
  };
}

export function applyStoredProfile(
  state: SearchState,
  profile: StoredProfile,
): SearchState {
  if (state.age != null) {
    return {
      ...state,
      gender: state.gender ?? profile.gender,
      preferredMeetGender:
        state.preferredMeetGender !== "anyone"
          ? state.preferredMeetGender
          : profile.preferredMeetGender,
      preferredAgeMin: state.preferredAgeMin ?? profile.preferredAgeMin,
      preferredAgeMax: state.preferredAgeMax ?? profile.preferredAgeMax,
    };
  }
  return {
    ...state,
    age: profile.age,
    gender: profile.gender,
    placeId: profile.placeId || state.placeId,
    maxDistanceKm: profile.maxDistanceKm || state.maxDistanceKm,
    preferredAgeMin: profile.preferredAgeMin,
    preferredAgeMax: profile.preferredAgeMax,
    preferredMeetGender: profile.preferredMeetGender,
    activities: state.activities.length ? state.activities : profile.interests,
  };
}
