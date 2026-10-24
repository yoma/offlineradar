/**
 * Frozen event fields bound into Instagram approvals / Meta media tickets.
 * Prevents title/date/city drift after approval, including late Meta image fetches.
 */

import type { Event } from "@/types/event";

export type InstagramEventSnapshot = {
  id: string;
  title: string;
  startDate: string;
  startTime: string | null;
  city: string;
  venue: string | null;
  organizerName: string;
  /** Stored image URL at approval time (may be null). */
  imageUrl: string | null;
};

export function snapshotFromEvent(event: Event): InstagramEventSnapshot {
  return {
    id: event.id,
    title: (event.title ?? "").trim(),
    startDate: (event.startDate ?? "").trim(),
    startTime: event.startTime?.trim() || null,
    city: (event.city ?? "").trim(),
    venue: event.venue?.trim() || null,
    organizerName: (event.organizerName ?? "").trim(),
    imageUrl: event.imageUrl?.trim() || null,
  };
}

export function canonicalizeEventSnapshots(
  snapshots: readonly InstagramEventSnapshot[],
): InstagramEventSnapshot[] {
  return snapshots.map((s) => ({
    id: String(s.id ?? "").trim().slice(0, 120),
    title: String(s.title ?? "").trim().slice(0, 300),
    startDate: String(s.startDate ?? "").trim().slice(0, 32),
    startTime: s.startTime ? String(s.startTime).trim().slice(0, 16) : null,
    city: String(s.city ?? "").trim().slice(0, 120),
    venue: s.venue ? String(s.venue).trim().slice(0, 200) : null,
    organizerName: String(s.organizerName ?? "").trim().slice(0, 200),
    imageUrl: s.imageUrl ? String(s.imageUrl).trim().slice(0, 2000) : null,
  }));
}

export function eventSnapshotsEqual(
  a: readonly InstagramEventSnapshot[],
  b: readonly InstagramEventSnapshot[],
): boolean {
  const ca = canonicalizeEventSnapshots(a);
  const cb = canonicalizeEventSnapshots(b);
  if (ca.length !== cb.length) return false;
  for (let i = 0; i < ca.length; i++) {
    if (JSON.stringify(ca[i]) !== JSON.stringify(cb[i])) return false;
  }
  return true;
}

/** Compare approved snapshots to live catalog events (order of eventIds). */
export function liveEventsMatchSnapshots(
  live: readonly Event[],
  snapshots: readonly InstagramEventSnapshot[],
  eventIds: readonly string[],
): boolean {
  const byId = new Map(live.map((e) => [e.id, e]));
  const ordered: Event[] = [];
  for (const id of eventIds) {
    const event = byId.get(id);
    if (!event) return false;
    ordered.push(event);
  }
  if (ordered.length !== snapshots.length) return false;
  return eventSnapshotsEqual(ordered.map(snapshotFromEvent), snapshots);
}

/**
 * Minimal Event objects for rendering approved slides without the live catalog.
 */
export function eventsFromSnapshots(
  snapshots: readonly InstagramEventSnapshot[],
): Event[] {
  return canonicalizeEventSnapshots(snapshots).map((s) => ({
    id: s.id,
    title: s.title,
    slug: s.id,
    shortDescription: "",
    description: null,
    category: "dating",
    subCategory: "",
    organizerName: s.organizerName,
    organizerId: null,
    city: s.city,
    region: s.city,
    venue: s.venue,
    venueId: null,
    latitude: 0,
    longitude: 0,
    distanceKm: 0,
    startDate: s.startDate,
    endDate: null,
    startTime: s.startTime,
    endTime: null,
    price: null,
    currency: "EUR",
    eligibility: { default: null, byGender: null, allowedGenders: null },
    eligibilityAgeMin: null,
    eligibilityAgeMax: null,
    eligibilityAgeRule: "unknown",
    preferredAudienceAgeMin: null,
    preferredAudienceAgeMax: null,
    audienceAgeFromSource: false,
    knownAudienceGenders: null,
    singlesOnly: null,
    singlesFriendly: false,
    listingPath: "organic",
    meetActivation: null,
    genderAvailability: null,
    capacityStatus: "unknown",
    spotsRemaining: null,
    registrationDeadline: null,
    socialSuitability: "medium",
    sourceType: "unknown",
    sourceName: "",
    officialUrl: "",
    ticketUrl: null,
    instagramUrl: null,
    lastCheckedAt: null,
    addedAt: "1970-01-01T00:00:00.000Z",
    imageUrl: s.imageUrl,
    tags: [],
    activities: [],
    practicalInfo: [],
  }));
}
