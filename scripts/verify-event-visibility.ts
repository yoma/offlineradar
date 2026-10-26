/**
 * Current-event visibility and location picker.
 * Usage: npx tsx scripts/verify-event-visibility.ts
 */
import assert from "node:assert/strict";
import { matchingEvents } from "../lib/filters";
import { distanceOrigin, placeLabel, withUserDistance } from "../lib/distance";
import {
  endOfBrusselsDayInstant,
  isCurrentEvent,
  isStoredEditionCurrent,
} from "../lib/event-visibility";
import { inferKnownCityLabel } from "../lib/geo-cities";
import {
  ALL_LOCATIONS_ID,
  locationSuggestions,
  resolveLocationInput,
} from "../lib/location-options";
import { selectUpcomingEvents } from "../lib/upcoming";
import { parseSearchState, serializeSearchState } from "../lib/search-state";
import { matchCandidate, type MatchableEdition } from "../lib/source-refresh/match";
import { REFRESH_MATCH_LOOKBACK_DAYS } from "../lib/source-refresh/store";
import type { RefreshNormalizedCandidate } from "../lib/source-refresh/types";
import type { EventEditionRecord } from "../types/event-catalog";
import type { Event } from "../types/event";
import { defaultSearchState } from "../lib/search-state";

const WINTER_MORNING = new Date("2026-10-25T09:00:00.000Z"); // 10:00 Europe/Brussels

function stub(partial: Partial<Event> & Pick<Event, "id" | "startDate" | "city">): Event {
  return {
    slug: partial.id,
    title: partial.title ?? partial.id,
    shortDescription: "",
    description: null,
    category: "dating",
    subCategory: "",
    organizerName: "Org",
    organizerId: null,
    region: partial.city,
    venue: null,
    venueId: null,
    latitude: 51.22,
    longitude: 4.4,
    distanceKm: 1,
    endDate: null,
    startTime: "19:00",
    endTime: null,
    price: 20,
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
    addedAt: "2026-10-01T00:00:00.000Z",
    imageUrl: null,
    imageAlt: null,
    imageIsAtmosphere: undefined,
    tags: [],
    activities: ["speeddate"],
    practicalInfo: [],
    ...partial,
  };
}

function minimalEdition(
  partial: Partial<EventEditionRecord> &
    Pick<EventEditionRecord, "id" | "title" | "startsAt" | "city">,
): EventEditionRecord {
  return {
    slug: "past-edition",
    organizerId: null,
    seriesId: null,
    endsAt: null,
    timezone: "Europe/Brussels",
    venueName: null,
    address: null,
    postalCode: null,
    region: null,
    country: "BE",
    latitude: null,
    longitude: null,
    eligibilityRoute: "route_a",
    singlesOriented: true,
    singlesOnly: true,
    singlesOnlyEvidence: null,
    meetFormula: null,
    meetFormulaEvidence: null,
    minAge: null,
    maxAge: null,
    ageRule: "guideline",
    eligibilityJson: null,
    category: "dating",
    subCategory: null,
    activities: [],
    tags: [],
    priceAmount: null,
    priceCurrency: "EUR",
    priceNote: null,
    priceIsFrom: false,
    availabilityStatus: null,
    spotsRemaining: null,
    bookingDeadline: null,
    availabilityNote: null,
    shortDescription: null,
    description: null,
    internalNotes: null,
    practicalInfo: [],
    publicationStatus: "published",
    approvedAt: null,
    publishedAt: null,
    rejectedAt: null,
    expiredAt: null,
    lastCheckedAt: null,
    sourceCheckedAt: null,
    nextCheckAt: null,
    socialSuitability: null,
    genderAvailability: null,
    startTimeDisplayNote: null,
    knownAudienceGenders: null,
    preferredAudienceAgeMin: null,
    preferredAudienceAgeMax: null,
    audienceAgeFromSource: false,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...partial,
  };
}

let failed = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    console.log(`OK  ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${name}:`, error instanceof Error ? error.message : error);
  }
}

check("brussels end of day follows summer, winter and the October fallback", () => {
  assert.equal(
    endOfBrusselsDayInstant("2026-07-15").toISOString(),
    "2026-07-15T22:00:00.000Z",
  );
  assert.equal(
    endOfBrusselsDayInstant("2026-10-25").toISOString(),
    "2026-10-25T23:00:00.000Z",
  );
  assert.equal(
    endOfBrusselsDayInstant("2026-10-24").toISOString(),
    "2026-10-24T22:00:00.000Z",
  );
  assert.equal(
    endOfBrusselsDayInstant("2026-03-28").toISOString(),
    "2026-03-28T23:00:00.000Z",
  );
  assert.equal(
    endOfBrusselsDayInstant("2026-03-29").toISOString(),
    "2026-03-29T22:00:00.000Z",
  );
});

check("yesterday, today, tomorrow, ended today, unknown end, multi-day", () => {
  const yesterday = { startDate: "2026-10-24", endDate: null, endTime: null };
  const today = { startDate: "2026-10-25", endDate: null, endTime: null };
  const tomorrow = { startDate: "2026-10-26", endDate: null, endTime: null };
  const endedToday = { startDate: "2026-10-25", endDate: null, endTime: "08:00" };
  const laterToday = { startDate: "2026-10-25", endDate: null, endTime: "18:00" };
  const multi = { startDate: "2026-10-23", endDate: "2026-10-26", endTime: null };
  const multiDone = { startDate: "2026-10-20", endDate: "2026-10-24", endTime: null };
  assert.equal(isCurrentEvent(yesterday, WINTER_MORNING), false);
  assert.equal(isCurrentEvent(today, WINTER_MORNING), true);
  assert.equal(isCurrentEvent(tomorrow, WINTER_MORNING), true);
  assert.equal(isCurrentEvent(endedToday, WINTER_MORNING), false);
  assert.equal(isCurrentEvent(laterToday, WINTER_MORNING), true);
  assert.equal(isCurrentEvent(multi, WINTER_MORNING), true);
  assert.equal(isCurrentEvent(multiDone, WINTER_MORNING), false);
});

check("summer end instant is exclusive", () => {
  const event = { startDate: "2026-07-15", endDate: null, endTime: null };
  assert.equal(isCurrentEvent(event, new Date("2026-07-15T21:59:00.000Z")), true);
  assert.equal(isCurrentEvent(event, new Date("2026-07-15T22:00:00.000Z")), false);
  const timed = { startDate: "2026-07-15", endDate: null, endTime: "18:00" };
  assert.equal(isCurrentEvent(timed, new Date("2026-07-15T15:59:00.000Z")), true);
  assert.equal(isCurrentEvent(timed, new Date("2026-07-15T16:00:00.000Z")), false);
});

check("stored edition uses endsAt and otherwise the start day", () => {
  assert.equal(
    isStoredEditionCurrent(
      { startsAt: "2026-10-25T18:00:00+01:00", endsAt: "2026-10-25T08:00:00+01:00" },
      WINTER_MORNING,
    ),
    false,
  );
  assert.equal(
    isStoredEditionCurrent(
      { startsAt: "2026-10-25T12:00:00+01:00", endsAt: null },
      WINTER_MORNING,
    ),
    true,
  );
  assert.equal(
    isStoredEditionCurrent(
      { startsAt: "2026-10-24T12:00:00+02:00", endsAt: null },
      WINTER_MORNING,
    ),
    false,
  );
});

check("public match and ticker hide past events", () => {
  const events = [
    stub({ id: "y", startDate: "2026-10-24", city: "Antwerpen" }),
    stub({ id: "ended", startDate: "2026-10-25", endTime: "08:00", city: "Antwerpen" }),
    stub({ id: "today", startDate: "2026-10-25", city: "Antwerpen" }),
    stub({ id: "tom", startDate: "2026-10-26", city: "Gent" }),
    stub({
      id: "span",
      startDate: "2026-10-23",
      endDate: "2026-10-26",
      city: "Leuven",
      activities: ["reizen", "weekend"],
    }),
  ];
  const state = { ...defaultSearchState(), placeId: "all", age: 40 };
  const { visible } = matchingEvents(events, state, WINTER_MORNING);
  assert.deepEqual(
    visible.map((event) => event.id).sort(),
    ["span", "today", "tom"],
  );
  const todayOnly = matchingEvents(
    events,
    { ...state, when: "today" },
    WINTER_MORNING,
  );
  assert.deepEqual(
    todayOnly.visible.map((event) => event.id).sort(),
    ["span", "today"],
  );
  const upcoming = selectUpcomingEvents(events, WINTER_MORNING);
  assert.ok(upcoming.events.some((event) => event.id === "today"));
  assert.ok(upcoming.events.some((event) => event.id === "tom"));
  assert.equal(
    upcoming.events.some((event) => event.id === "span" || event.id === "ended"),
    false,
  );
});

check("location picker offers any Belgian place, without counts", () => {
  const empty = locationSuggestions("");
  assert.equal(empty[0]?.id, ALL_LOCATIONS_ID);
  assert.equal(empty[0]?.label, "Alle locaties");
  assert.ok(empty.some((option) => option.id === "turnhout"));
  assert.ok(empty.every((option) => !/\(\d+ /.test(option.label)));
  const zot = locationSuggestions("zotte");
  assert.equal(zot[0]?.label, "Zottegem");
  const aalst = locationSuggestions("aalst").map((option) => option.label);
  assert.ok(aalst.includes("Aalst (9300)"));
  assert.ok(aalst.includes("Aalst (3800)"));
  assert.equal(resolveLocationInput("Alle locaties"), ALL_LOCATIONS_ID);
  assert.equal(resolveLocationInput("Zottegem"), "zottegem");
  assert.equal(resolveLocationInput("Aalst (3800)"), "aalst-3800");
  assert.equal(resolveLocationInput("Aalst"), "aalst-9300");
  assert.equal(resolveLocationInput("9620"), "zottegem");
  assert.equal(resolveLocationInput("Luik"), "liege");
  assert.equal(resolveLocationInput("Turnhout"), "turnhout");
  assert.equal(resolveLocationInput("Zaal De Roma"), null);
  assert.equal(resolveLocationInput("St"), null);
  assert.equal(inferKnownCityLabel("St"), null);
  assert.equal(inferKnownCityLabel("St-Niklaas"), "Sint-Niklaas");
  assert.equal(inferKnownCityLabel("Geel"), "Geel");
  assert.equal(inferKnownCityLabel("Bruxelles"), "Brussel");
  assert.equal(inferKnownCityLabel("Zottegem"), "Zottegem");
  assert.equal(inferKnownCityLabel("Cyprus"), "Cyprus");
  assert.equal(inferKnownCityLabel("1000"), null);
});

check("existing place links stay, unknown places are not rewritten", () => {
  const antwerp = parseSearchState({ place: "antwerpen" });
  const alias = parseSearchState({ place: "sint-niklaas" });
  const all = parseSearchState({ place: "all" });
  const unknown = parseSearchState({ place: "zzz-dorp" });
  assert.equal(antwerp.placeId, "antwerpen");
  assert.equal(alias.placeId, "sint-niklaas");
  assert.equal(all.placeId, "all");
  assert.equal(unknown.placeId, "zzz-dorp");
  assert.ok(serializeSearchState(alias).includes("place=sint-niklaas"));
  assert.equal(placeLabel("all"), "Alle locaties");
  assert.equal(placeLabel("sint-niklaas"), "Sint-Niklaas");
  assert.equal(placeLabel("zzz-dorp"), "zzz-dorp");
  assert.equal(distanceOrigin("zzz-dorp"), null);
  assert.ok(distanceOrigin("sint-niklaas"));
  assert.ok(distanceOrigin("turnhout"));

  const near = stub({
    id: "near",
    startDate: "2026-11-01",
    city: "Antwerpen",
    latitude: 51.2194,
    longitude: 4.4025,
  });
  const far = stub({
    id: "far",
    startDate: "2026-11-01",
    city: "Wavre",
    latitude: 50.7172,
    longitude: 4.6093,
  });
  const fromAntwerp = matchingEvents(
    [near, far],
    { ...defaultSearchState(), placeId: "antwerpen", maxDistanceKm: 25, age: 40 },
    WINTER_MORNING,
  );
  assert.deepEqual(
    fromAntwerp.visible.map((event) => event.id),
    ["near"],
  );
  const everywhere = matchingEvents(
    [near, far],
    { ...defaultSearchState(), placeId: "all", maxDistanceKm: 10, age: 40 },
    WINTER_MORNING,
  );
  assert.deepEqual(
    everywhere.visible.map((event) => event.id).sort(),
    ["far", "near"],
  );
  const nowhere = matchingEvents(
    [near, far],
    { ...defaultSearchState(), placeId: "zzz-dorp", age: 40 },
    WINTER_MORNING,
  );
  assert.equal(nowhere.visible.length, 0);
  const departure = withUserDistance(near, "turnhout");
  assert.ok(Number.isFinite(departure.distanceKm));
  assert.equal(withUserDistance(near, "zzz-dorp").distanceKm, Number.POSITIVE_INFINITY);
});

check("refresh still recognises a past edition and a new date stays new", () => {
  assert.ok(REFRESH_MATCH_LOOKBACK_DAYS >= 180);
  const pastUrl =
    "https://www.speeddaten.be/nl/12-09-antwerpen-hogeropgeleiden-30-40j-12400.htm";
  // Older than the near lookback window (181+ days before the scan clock).
  const editions: MatchableEdition[] = [
    {
      edition: minimalEdition({
        id: "ed-past",
        title: "Antwerpen Hogeropgeleiden 30-40",
        startsAt: "2026-04-20T19:30:00+02:00",
        city: "Antwerpen",
      }),
      sourceUrls: [pastUrl],
      organizerSlug: "smartvibes",
    },
  ];
  const sameCms: RefreshNormalizedCandidate = {
    externalKey: "moved",
    title: "Antwerpen Hogeropgeleiden 30-40",
    organizer: "SmartVibes",
    date: "2026-11-20",
    startsAt: "2026-11-20T19:30:00+01:00",
    endsAt: null,
    venue: null,
    city: "Antwerpen",
    address: null,
    minAge: 30,
    maxAge: 40,
    ageRule: "guideline",
    price: null,
    availability: null,
    officialUrl: pastUrl,
    ticketUrl: null,
    rawEvidenceSummary: "test",
    sourceCheckedAt: "2026-10-25T04:28:41.000Z",
  };
  // Near pool empty (outside 180d) → no match until history is supplied.
  assert.equal(
    matchCandidate(sameCms, [], "smartvibes").confidence,
    "none",
  );
  const recognised = matchCandidate(sameCms, editions, "smartvibes");
  assert.equal(recognised.editionId, "ed-past");
  assert.equal(recognised.confidence, "exact");

  const fresh: RefreshNormalizedCandidate = {
    ...sameCms,
    externalKey: "new-date",
    title: "Gent Hogeropgeleiden 40-50",
    date: "2026-12-02",
    startsAt: "2026-12-02T19:30:00+01:00",
    city: "Gent",
    officialUrl:
      "https://www.speeddaten.be/nl/02-12-gent-hogeropgeleiden-40-50j-13999.htm",
  };
  const discovered = matchCandidate(fresh, editions, "smartvibes");
  assert.equal(discovered.confidence, "none");
  assert.equal(discovered.editionId, null);
});

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log("\nOK: event visibility verifies");
