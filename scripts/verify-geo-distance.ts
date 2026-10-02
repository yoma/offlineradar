/**
 * Distance / geo safety checks (no Neon).
 * Usage: npx tsx scripts/verify-geo-distance.ts
 */
import assert from "node:assert/strict";
import { distanceKmBetween, withUserDistance } from "../lib/distance";
import { matchingEvents } from "../lib/filters";
import { coordsForCity, resolveEditionCoords } from "../lib/geo-cities";
import type { Event } from "../types/event";
import type { SearchState } from "../types/search";

let failed = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    console.log(`OK  ${name}`);
  } catch (error) {
    failed++;
    console.error(
      `FAIL ${name}:`,
      error instanceof Error ? error.message : error,
    );
  }
}

check("wavre city coords known", () => {
  const c = coordsForCity("Wavre");
  assert.ok(c);
  assert.equal(distanceKmBetween({ lat: 51.2194, lng: 4.4025 }, c!), 58);
});

check("missing coords resolve via city, not Antwerp", () => {
  const resolved = resolveEditionCoords({
    latitude: null,
    longitude: null,
    city: "Wavre",
  });
  assert.equal(resolved.known, true);
  assert.equal(resolved.lat, 50.7172);
});

check("unknown city stays unknown", () => {
  const resolved = resolveEditionCoords({
    latitude: null,
    longitude: null,
    city: "Atlantis-on-Sea",
  });
  assert.equal(resolved.known, false);
  assert.equal(Number.isFinite(resolved.lat), false);
});

function fakeEvent(partial: Partial<Event> & Pick<Event, "id" | "city" | "latitude" | "longitude">): Event {
  return {
    title: partial.title ?? "Test",
    slug: partial.id,
    shortDescription: "",
    description: null,
    category: "dating",
    subCategory: "speeddate",
    organizerName: "Test",
    organizerId: null,
    region: partial.city,
    venue: null,
    venueId: null,
    distanceKm: partial.distanceKm ?? 0,
    startDate: "2026-12-01",
    endDate: null,
    startTime: "19:00",
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
    singlesOnly: true,
    singlesOriented: true,
    singlesFriendly: false,
      listingPath: "organic",
    meetActivation: null,
    genderAvailability: null,
    capacityStatus: "unknown",
    spotsRemaining: null,
    registrationDeadline: null,
    socialSuitability: "high",
    sourceType: "official_website",
    sourceName: "test",
    officialUrl: "https://example.com",
    ticketUrl: null,
    instagramUrl: null,
    lastCheckedAt: null,
    addedAt: "2026-09-28T00:00:00.000Z",
    imageUrl: null,
    imageAlt: null,
    imageIsAtmosphere: undefined,
    tags: [],
    activities: ["speeddate"],
    practicalInfo: [],
    ...partial,
  };
}

check("wavre excluded within 25km of antwerpen", () => {
  const wavre = withUserDistance(
    fakeEvent({
      id: "wavre-1",
      city: "Wavre",
      latitude: 50.7172,
      longitude: 4.6093,
      title: "Speed Dating, Wavre, 45–55 ans",
    }),
    "antwerpen",
  );
  assert.equal(wavre.distanceKm, 58);
  const state = {
    age: 45,
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
    typesMode: "all",
    price: "any",
    singlesOnly: false,
    availability: "any",
    strictOnly: false,
    sort: "match",
  } satisfies SearchState;
  const { visible } = matchingEvents([wavre], state, new Date("2026-09-28T12:00:00Z"));
  assert.equal(visible.length, 0);
});

check("unknown coords excluded from radius search", () => {
  const unknown = withUserDistance(
    fakeEvent({
      id: "unk-1",
      city: "Somewhere",
      latitude: Number.NaN,
      longitude: Number.NaN,
    }),
    "antwerpen",
  );
  assert.equal(unknown.distanceKm, Number.POSITIVE_INFINITY);
  const state = {
    age: 45,
    gender: null,
    placeId: "antwerpen",
    maxDistanceKm: 100,
    preferredAgeMin: null,
    preferredAgeMax: null,
    preferredMeetGender: "anyone",
    when: "any",
    date: null,
    categories: [],
    activities: [],
    typesMode: "all",
    price: "any",
    singlesOnly: false,
    availability: "any",
    strictOnly: false,
    sort: "match",
  } satisfies SearchState;
  const { visible } = matchingEvents([unknown], state, new Date("2026-09-28T12:00:00Z"));
  assert.equal(visible.length, 0);
});

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log("\nOK: geo distance verifies");
