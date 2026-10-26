/**
 * Distance / geo safety checks (no Neon).
 * Usage: npx tsx scripts/verify-geo-distance.ts
 */
import assert from "node:assert/strict";
import {
  distanceKmBetween,
  distanceOrigin,
  isInBelgiumArea,
  withUserDistance,
} from "../lib/distance";
import { isTripEvent, matchingEvents } from "../lib/filters";
import { findBelgianPlace } from "../lib/be-places";
import {
  defaultSearchState,
  parseSearchState,
  serializeSearchState,
} from "../lib/search-state";
import {
  coordsForCity,
  editionLocationIsDiscoverable,
  editionLocationIsPublishable,
  isWeakLocationCity,
  resolveEditionCoords,
} from "../lib/geo-cities";
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

check("english Antwerp resolves like Antwerpen", () => {
  const nl = coordsForCity("Antwerpen");
  const en = coordsForCity("Antwerp");
  assert.ok(nl);
  assert.ok(en);
  assert.equal(en!.lat, nl!.lat);
  assert.equal(en!.lng, nl!.lng);
  const resolved = resolveEditionCoords({
    latitude: null,
    longitude: null,
    city: "Antwerp",
  });
  assert.equal(resolved.known, true);
});

check("venue-only is not discoverable without city/coords", () => {
  assert.equal(
    editionLocationIsDiscoverable({ city: null, latitude: null, longitude: null }),
    false,
  );
  assert.equal(
    editionLocationIsDiscoverable({ city: "Onbekend", latitude: null, longitude: null }),
    false,
  );
  assert.equal(
    editionLocationIsDiscoverable({ city: "Antwerp", latitude: null, longitude: null }),
    true,
  );
  assert.equal(
    editionLocationIsDiscoverable({
      city: "Atlantis",
      latitude: 51.2,
      longitude: 4.4,
    }),
    true,
  );
  // Coords alone with unknown/weak city: discoverable for distance math,
  // but never publishable via ordinary override.
  assert.equal(
    editionLocationIsPublishable({
      city: "Atlantis",
      latitude: 51.2,
      longitude: 4.4,
    }),
    false,
  );
  assert.equal(
    editionLocationIsPublishable({
      city: "Onbekend",
      latitude: 51.2,
      longitude: 4.4,
    }),
    false,
  );
  assert.equal(
    editionLocationIsPublishable({
      city: "België",
      latitude: null,
      longitude: null,
    }),
    false,
  );
  assert.equal(
    editionLocationIsPublishable({
      city: "Gent",
      latitude: 51.05,
      longitude: 3.72,
    }),
    true,
  );
  assert.equal(isWeakLocationCity("België"), true);
  assert.equal(isWeakLocationCity("Gent"), false);
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
    trips: true,
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
    trips: true,
    availability: "any",
    strictOnly: false,
    sort: "match",
  } satisfies SearchState;
  const { visible } = matchingEvents([unknown], state, new Date("2026-09-28T12:00:00Z"));
  assert.equal(visible.length, 0);
});

// ── Haversine: fixed pairs, checkable by hand ─────────────────────────────
// Expected values are great-circle km (as the crow flies), rounded.
// Road distance is longer: Antwerpen–Aalst is ~50 km by car, 40 km straight.
const ANTWERPEN = { lat: 51.2194, lng: 4.4025 };
const AALST = { lat: 50.9372, lng: 4.0403 };

check("haversine: Antwerpen–Aalst is 40 km", () => {
  assert.equal(distanceKmBetween(ANTWERPEN, AALST), 40);
});

check("haversine: reference pairs", () => {
  assert.equal(distanceKmBetween(ANTWERPEN, { lat: 50.8503, lng: 4.3517 }), 41); // Brussel
  assert.equal(distanceKmBetween(ANTWERPEN, { lat: 51.0543, lng: 3.7174 }), 51); // Gent
  assert.equal(distanceKmBetween(ANTWERPEN, { lat: 51.0257, lng: 4.4776 }), 22); // Mechelen
  // Paris–London, the textbook haversine example (≈ 343.6 km).
  assert.equal(
    distanceKmBetween({ lat: 48.8566, lng: 2.3522 }, { lat: 51.5074, lng: -0.1278 }),
    344,
  );
});

check("haversine: zero and symmetric", () => {
  assert.equal(distanceKmBetween(ANTWERPEN, ANTWERPEN), 0);
  assert.equal(distanceKmBetween(ANTWERPEN, AALST), distanceKmBetween(AALST, ANTWERPEN));
});

// ── Geocoding from the Belgian place list ────────────────────────────────
check("towns outside the hand list now geocode", () => {
  for (const city of ["Zottegem", "Dendermonde", "Arlon", "De Panne", "Knokke-Heist"]) {
    const coords = coordsForCity(city);
    assert.ok(coords, city);
    assert.ok(isInBelgiumArea(coords!), city);
    assert.equal(editionLocationIsPublishable({ city }), true, city);
  }
});

check("postcodes pick the right one of two same-name places", () => {
  assert.equal(findBelgianPlace("9300 Aalst")?.postcode, "9300");
  assert.equal(findBelgianPlace("Aalst (3800)")?.postcode, "3800");
  // A bare ambiguous name goes to the municipality people mean.
  assert.equal(findBelgianPlace("Aalst")?.postcode, "9300");
  assert.deepEqual(coordsForCity("Aalst"), AALST);
  // A bare postcode is the town, not a deelgemeente at its edge.
  assert.equal(findBelgianPlace("9620")?.name, "Zottegem");
  // Postcode and name that do not belong together: no guess.
  assert.equal(findBelgianPlace("9300 Zottegem"), null);
  assert.equal(coordsForCity("Atlantis"), null);
});

check("exonyms and Brussels names resolve", () => {
  assert.equal(findBelgianPlace("Luik")?.name, "Liège");
  assert.equal(findBelgianPlace("Doornik")?.name, "Tournai");
  assert.equal(findBelgianPlace("Ixelles")?.name, "Elsene");
  assert.equal(findBelgianPlace("Bruxelles")?.name, "Brussel");
});

// ── Radius filter ────────────────────────────────────────────────────────
const RADIUS_NOW = new Date("2026-09-28T12:00:00Z");

check("radius: Aalst out at 25 km, in at 50 km from Antwerpen", () => {
  const aalst = fakeEvent({ id: "aalst", city: "Aalst", latitude: AALST.lat, longitude: AALST.lng });
  const base = { ...defaultSearchState(), age: 45, placeId: "antwerpen" };
  const at25 = matchingEvents([aalst], { ...base, maxDistanceKm: 25 }, RADIUS_NOW);
  const at50 = matchingEvents([aalst], { ...base, maxDistanceKm: 50 }, RADIUS_NOW);
  assert.equal(at25.visible.length, 0);
  assert.equal(at50.visible.length, 1);
  assert.equal(at50.visible[0]!.distanceKm, 40);
});

check("radius: the edge is inclusive on the shown km", () => {
  // Mechelen is 22 km from Antwerpen: in at 25, out at 10.
  const mechelen = fakeEvent({ id: "mech", city: "Mechelen", latitude: 51.0257, longitude: 4.4776 });
  const base = { ...defaultSearchState(), age: 45, placeId: "antwerpen" };
  assert.equal(matchingEvents([mechelen], { ...base, maxDistanceKm: 25 }, RADIUS_NOW).visible.length, 1);
  assert.equal(matchingEvents([mechelen], { ...base, maxDistanceKm: 10 }, RADIUS_NOW).visible.length, 0);
});

check("radius: any Belgian place can be the origin", () => {
  const origin = distanceOrigin("zottegem");
  assert.equal(origin?.label, "Zottegem");
  assert.equal(distanceOrigin("aalst-3800")?.label, "Aalst (3800)");
  const aalst = fakeEvent({ id: "aalst", city: "Aalst", latitude: AALST.lat, longitude: AALST.lng });
  const fromZottegem = matchingEvents(
    [aalst],
    { ...defaultSearchState(), age: 45, placeId: "zottegem", maxDistanceKm: 25 },
    RADIUS_NOW,
  );
  assert.equal(fromZottegem.visible.length, 1);
  assert.equal(fromZottegem.visible[0]!.distanceKm, distanceKmBetween(origin!, AALST));
});

// ── Local or trip ────────────────────────────────────────────────────────
check("trip: tagged reizen, or abroad without a tag", () => {
  const local = fakeEvent({ id: "local", city: "Gent", latitude: 51.0543, longitude: 3.7174 });
  const tagged = fakeEvent({ id: "durbuy", city: "Durbuy", latitude: 50.3351, longitude: 5.4346, activities: ["weekend"] });
  const abroad = fakeEvent({ id: "tfe", city: "Tenerife", latitude: 28.2916, longitude: -16.6291, activities: ["wandelen"] });
  const unknown = fakeEvent({ id: "unk", city: "Somewhere", latitude: Number.NaN, longitude: Number.NaN });
  assert.equal(isTripEvent(local), false);
  assert.equal(isTripEvent(tagged), true);
  assert.equal(isTripEvent(abroad), true);
  assert.equal(isTripEvent(unknown), false);
});

check("trips ignore the radius and hide with Reizen tonen off", () => {
  const near = fakeEvent({ id: "near", city: "Antwerpen", latitude: 51.2194, longitude: 4.4025 });
  const abroad = fakeEvent({ id: "tfe", city: "Tenerife", latitude: 28.2916, longitude: -16.6291, activities: ["wandelen"] });
  const base = { ...defaultSearchState(), age: 45, placeId: "antwerpen", maxDistanceKm: 10 };
  const withTrips = matchingEvents([near, abroad], base, RADIUS_NOW);
  assert.deepEqual(withTrips.visible.map((event) => event.id).sort(), ["near", "tfe"]);
  const withoutTrips = matchingEvents([near, abroad], { ...base, trips: false }, RADIUS_NOW);
  assert.deepEqual(withoutTrips.visible.map((event) => event.id), ["near"]);
  const allWithout = matchingEvents(
    [near, abroad],
    { ...base, placeId: "all", trips: false },
    RADIUS_NOW,
  );
  assert.deepEqual(allWithout.visible.map((event) => event.id), ["near"]);
});

check("Reizen tonen survives the URL", () => {
  const off = parseSearchState({ trips: "0" });
  assert.equal(off.trips, false);
  assert.ok(serializeSearchState(off).includes("trips=0"));
  assert.equal(parseSearchState({}).trips, true);
  assert.equal(serializeSearchState(defaultSearchState()).includes("trips"), false);
});

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log("\nOK: geo distance verifies");
