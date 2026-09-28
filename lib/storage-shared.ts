/**
 * Shared profile defaults (safe for client + server imports).
 * Keep browser localStorage helpers in lib/storage.ts.
 */
import type { StoredProfile } from "@/types/search";

export const emptyProfile: StoredProfile = {
  age: null,
  gender: null,
  placeId: "antwerpen",
  maxDistanceKm: 25,
  preferredAgeMin: null,
  preferredAgeMax: null,
  preferredMeetGender: "anyone",
  interests: [],
};
