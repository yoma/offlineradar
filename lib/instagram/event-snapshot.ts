/**
 * Frozen event fields bound into Instagram approvals / Meta media tickets.
 * Prevents title/date/city/render/image-selection drift after approval,
 * including late Meta image fetches.
 */

import type {
  ActivityId,
  EligibilityAgeRule,
  Event,
  EventCategory,
} from "@/types/event";

export type InstagramEventSnapshot = {
  id: string;
  title: string;
  startDate: string;
  startTime: string | null;
  city: string;
  region: string;
  venue: string | null;
  organizerName: string;
  organizerId: string | null;
  organizerSlug: string | null;
  /** Stored image URL at approval time (may be null). */
  imageUrl: string | null;
  imageIsAtmosphere: boolean;
  shortDescription: string;
  description: string | null;
  category: EventCategory;
  subCategory: string;
  eligibilityAgeMin: number | null;
  eligibilityAgeMax: number | null;
  eligibilityAgeRule: EligibilityAgeRule;
  activities: ActivityId[];
  tags: string[];
};

const ACTIVITY_IDS = new Set<string>([
  "speeddate",
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
]);

const CATEGORIES = new Set<string>(["dating", "meet_new_people", "social"]);
const AGE_RULES = new Set<string>(["strict", "guideline", "unknown"]);

function asActivityId(value: unknown): ActivityId | null {
  const id = String(value ?? "").trim();
  return ACTIVITY_IDS.has(id) ? (id as ActivityId) : null;
}

function asCategory(value: unknown): EventCategory {
  const c = String(value ?? "").trim();
  return CATEGORIES.has(c) ? (c as EventCategory) : "dating";
}

function asAgeRule(value: unknown): EligibilityAgeRule {
  const r = String(value ?? "").trim();
  return AGE_RULES.has(r) ? (r as EligibilityAgeRule) : "unknown";
}

function asAge(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(120, Math.trunc(n)));
}

export function snapshotFromEvent(event: Event): InstagramEventSnapshot {
  return {
    id: event.id,
    title: (event.title ?? "").trim(),
    startDate: (event.startDate ?? "").trim(),
    startTime: event.startTime?.trim() || null,
    city: (event.city ?? "").trim(),
    region: (event.region ?? event.city ?? "").trim(),
    venue: event.venue?.trim() || null,
    organizerName: (event.organizerName ?? "").trim(),
    organizerId: event.organizerId?.trim() || null,
    organizerSlug: event.organizerSlug?.trim() || null,
    imageUrl: event.imageUrl?.trim() || null,
    imageIsAtmosphere: event.imageIsAtmosphere === true,
    shortDescription: (event.shortDescription ?? "").trim(),
    description: event.description?.trim() || null,
    category: asCategory(event.category),
    subCategory: (event.subCategory ?? "").trim(),
    eligibilityAgeMin: asAge(event.eligibilityAgeMin),
    eligibilityAgeMax: asAge(event.eligibilityAgeMax),
    eligibilityAgeRule: asAgeRule(event.eligibilityAgeRule),
    activities: (event.activities ?? [])
      .map(asActivityId)
      .filter((a): a is ActivityId => a != null),
    tags: (event.tags ?? [])
      .map((t) => String(t ?? "").trim())
      .filter(Boolean)
      .slice(0, 40),
  };
}

export function canonicalizeEventSnapshots(
  snapshots: readonly InstagramEventSnapshot[],
): InstagramEventSnapshot[] {
  return snapshots.map((raw) => {
    const s = raw as Partial<InstagramEventSnapshot>;
    return {
      id: String(s.id ?? "").trim().slice(0, 120),
      title: String(s.title ?? "").trim().slice(0, 300),
      startDate: String(s.startDate ?? "").trim().slice(0, 32),
      startTime: s.startTime ? String(s.startTime).trim().slice(0, 16) : null,
      city: String(s.city ?? "").trim().slice(0, 120),
      region: String(s.region ?? s.city ?? "").trim().slice(0, 120),
      venue: s.venue ? String(s.venue).trim().slice(0, 200) : null,
      organizerName: String(s.organizerName ?? "").trim().slice(0, 200),
      organizerId: s.organizerId
        ? String(s.organizerId).trim().slice(0, 120)
        : null,
      organizerSlug: s.organizerSlug
        ? String(s.organizerSlug).trim().slice(0, 120)
        : null,
      imageUrl: s.imageUrl ? String(s.imageUrl).trim().slice(0, 2000) : null,
      imageIsAtmosphere: s.imageIsAtmosphere === true,
      shortDescription: String(s.shortDescription ?? "").trim().slice(0, 500),
      description: s.description
        ? String(s.description).trim().slice(0, 4000)
        : null,
      category: asCategory(s.category),
      subCategory: String(s.subCategory ?? "").trim().slice(0, 120),
      eligibilityAgeMin: asAge(s.eligibilityAgeMin),
      eligibilityAgeMax: asAge(s.eligibilityAgeMax),
      eligibilityAgeRule: asAgeRule(s.eligibilityAgeRule),
      activities: (Array.isArray(s.activities) ? s.activities : [])
        .map(asActivityId)
        .filter((a): a is ActivityId => a != null)
        .slice(0, 20),
      tags: (Array.isArray(s.tags) ? s.tags : [])
        .map((t) => String(t ?? "").trim().slice(0, 80))
        .filter(Boolean)
        .slice(0, 40),
    };
  });
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
 * Event objects for rendering approved slides without the live catalog.
 * Restores every field used by templates and website-visible image selection.
 */
export function eventsFromSnapshots(
  snapshots: readonly InstagramEventSnapshot[],
): Event[] {
  return canonicalizeEventSnapshots(snapshots).map((s) => ({
    id: s.id,
    title: s.title,
    slug: s.id,
    shortDescription: s.shortDescription,
    description: s.description,
    category: s.category,
    subCategory: s.subCategory,
    organizerName: s.organizerName,
    organizerId: s.organizerId,
    organizerSlug: s.organizerSlug,
    city: s.city,
    region: s.region || s.city,
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
    eligibilityAgeMin: s.eligibilityAgeMin,
    eligibilityAgeMax: s.eligibilityAgeMax,
    eligibilityAgeRule: s.eligibilityAgeRule,
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
    imageIsAtmosphere: s.imageIsAtmosphere,
    tags: s.tags,
    activities: s.activities,
    practicalInfo: [],
  }));
}
