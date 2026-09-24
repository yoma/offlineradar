import type { StoredProfile } from "@/types/search";

const PROFILE_KEY = "offlineradar.profile.v1";
const FAVORITES_KEY = "offlineradar.favorites.v1";

export const emptyProfile: StoredProfile = {
  age: null,
  placeId: "antwerpen",
  maxDistanceKm: 25,
  preferredAgeMin: null,
  preferredAgeMax: null,
  interests: [],
};

export function readProfile(): StoredProfile {
  if (typeof window === "undefined") return emptyProfile;
  try {
    const raw = window.localStorage.getItem(PROFILE_KEY);
    if (!raw) return emptyProfile;
    const parsed = JSON.parse(raw) as Partial<StoredProfile>;
    return {
      ...emptyProfile,
      ...parsed,
      interests: Array.isArray(parsed.interests) ? parsed.interests : [],
    };
  } catch {
    return emptyProfile;
  }
}

export function writeProfile(profile: StoredProfile): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  window.dispatchEvent(new Event("offlineradar-store"));
}

export function readFavorites(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(FAVORITES_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === "string")
      : [];
  } catch {
    return [];
  }
}

export function writeFavorites(ids: string[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(ids));
  window.dispatchEvent(new Event("offlineradar-store"));
}
