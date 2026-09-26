/**
 * Fase 16: public activity taxonomy + golden filter matrix.
 * Usage: npm run verify:phase16-taxonomy
 */
import assert from "node:assert/strict";
import { matchingEvents } from "../lib/filters";
import {
  expandActivityFilterSelection,
  isPublicActivityGroupSelected,
  publicGroupsForEventActivities,
  SPORT_ACTIVE_ACTIVITIES,
  togglePublicActivityGroup,
} from "../lib/public-activity-groups";
import {
  defaultSearchState,
  parseSearchState,
  serializeSearchState,
} from "../lib/search-state";
import type { Event } from "../types/event";
import { band } from "../types/event";

function ok(name: string) {
  console.log(`ok  ${name}`);
}

function stub(
  partial: Partial<Event> &
    Pick<Event, "id" | "slug" | "title" | "startDate" | "activities">,
): Event {
  return {
    shortDescription: "",
    description: null,
    category: "meet_new_people",
    subCategory: "",
    organizerName: "Org",
    organizerId: null,
    city: "Antwerpen",
    region: "Antwerpen",
    venue: null,
    venueId: null,
    latitude: 51.22,
    longitude: 4.4,
    distanceKm: 2,
    endDate: null,
    startTime: "10:00",
    endTime: null,
    price: 20,
    currency: "EUR",
    eligibility: {
      default: band(null, null, "unknown"),
      byGender: null,
      allowedGenders: null,
    },
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
    sourceName: "Test",
    officialUrl: "https://example.com",
    ticketUrl: null,
    instagramUrl: null,
    lastCheckedAt: new Date().toISOString(),
    addedAt: new Date().toISOString(),
    imageUrl: null,
    imageAlt: null,
    tags: [],
    practicalInfo: [],
    ...partial,
  };
}

/** Golden matrix fixtures mirroring real catalog shapes. */
const BOWLING = stub({
  id: "bowling",
  slug: "singles-bowling-antwerpen-2026-10-24",
  title: "Singles Bowling in Antwerpen",
  startDate: "2026-10-24",
  activities: ["sport", "drinken"],
  category: "dating",
  subCategory: "singles bowling",
  distanceKm: 1,
});

const WALK = stub({
  id: "walk",
  slug: "sportieve-singles-middelheim-antwerpen-2026-10-03",
  title: "Wandeling Antwerpse parken & Middelheim",
  startDate: "2026-10-03",
  activities: ["wandelen"],
  category: "meet_new_people",
  subCategory: "singles hike",
  distanceKm: 3,
});

const SPEEDDATE = stub({
  id: "sd",
  slug: "speeddate-antwerpen",
  title: "Speeddate Antwerpen",
  startDate: "2026-10-15",
  activities: ["speeddate"],
  category: "dating",
  subCategory: "speeddate",
  distanceKm: 2,
});

const DINNER = stub({
  id: "dinner",
  slug: "singles-dinner",
  title: "Singles Dinner",
  startDate: "2026-10-20",
  activities: ["eten"],
  category: "dating",
  subCategory: "singles dinner",
  distanceKm: 4,
});

const SKI = stub({
  id: "ski",
  slug: "tomeeto-skiweek-40-55-2027-03-21",
  title: "Tomeeto — Skiweek Kronplatz (40–55)",
  startDate: "2027-03-21",
  endDate: "2027-03-27",
  activities: ["reizen", "sport"],
  category: "meet_new_people",
  subCategory: "singles ski",
  distanceKm: 743,
  eligibility: {
    default: band(40, 55, "strict"),
    byGender: null,
    allowedGenders: null,
  },
  eligibilityAgeMin: 40,
  eligibilityAgeMax: 55,
  eligibilityAgeRule: "strict",
});

const PARTY = stub({
  id: "party",
  slug: "singles-party",
  title: "Singles Party Night",
  startDate: "2026-11-01",
  activities: ["party"],
  distanceKm: 5,
});

const WORKSHOP = stub({
  id: "ws",
  slug: "connection-workshop",
  title: "Connection Workshop",
  startDate: "2026-11-05",
  activities: ["workshop"],
  distanceKm: 6,
});

const CATALOG = [BOWLING, WALK, SPEEDDATE, DINNER, SKI, PARTY, WORKSHOP];
const NOW = new Date("2026-09-26T12:00:00+02:00");

type Expect = {
  speeddate: boolean;
  sport_active: boolean;
  outdoor_narrow: boolean;
  dinner: boolean;
  party: boolean;
  travel: boolean;
  workshop: boolean;
};

const MATRIX: { event: Event; expect: Expect }[] = [
  {
    event: BOWLING,
    expect: {
      speeddate: false,
      sport_active: true,
      outdoor_narrow: false,
      dinner: false,
      party: false,
      travel: false,
      workshop: false,
    },
  },
  {
    event: WALK,
    expect: {
      speeddate: false,
      sport_active: true,
      outdoor_narrow: false,
      dinner: false,
      party: false,
      travel: false,
      workshop: false,
    },
  },
  {
    event: SPEEDDATE,
    expect: {
      speeddate: true,
      sport_active: false,
      outdoor_narrow: false,
      dinner: false,
      party: false,
      travel: false,
      workshop: false,
    },
  },
  {
    event: DINNER,
    expect: {
      speeddate: false,
      sport_active: false,
      outdoor_narrow: false,
      dinner: true,
      party: false,
      travel: false,
      workshop: false,
    },
  },
  {
    event: SKI,
    expect: {
      speeddate: false,
      sport_active: true,
      outdoor_narrow: false,
      dinner: false,
      party: false,
      travel: true,
      workshop: false,
    },
  },
  {
    event: PARTY,
    expect: {
      speeddate: false,
      sport_active: false,
      outdoor_narrow: false,
      dinner: false,
      party: true,
      travel: false,
      workshop: false,
    },
  },
  {
    event: WORKSHOP,
    expect: {
      speeddate: false,
      sport_active: false,
      outdoor_narrow: false,
      dinner: false,
      party: false,
      travel: false,
      workshop: true,
    },
  },
];

function main() {
  const sportActive = expandActivityFilterSelection(["sport"]);
  assert.ok(SPORT_ACTIVE_ACTIVITIES.every((a) => sportActive.includes(a)));
  assert.ok(sportActive.includes("wandelen"));
  assert.ok(sportActive.includes("outdoor"));
  assert.ok(sportActive.includes("padel"));
  assert.ok(!sportActive.includes("speeddate"));
  assert.ok(!sportActive.includes("eten"));
  ok("1-7. sport expands to Sport & actief; excludes speeddate/dinner");

  assert.deepEqual(expandActivityFilterSelection(["wandelen"]), ["wandelen"]);
  assert.deepEqual(expandActivityFilterSelection(["hiking"]), ["wandelen"]);
  assert.ok(
    expandActivityFilterSelection(["sport_active"]).includes("wandelen"),
  );
  ok("walking/hiking/sport_active tokens");

  const skiGroups = publicGroupsForEventActivities(["reizen", "sport"]);
  assert.ok(skiGroups.includes("sport_active"));
  assert.ok(skiGroups.includes("travel"));
  ok("8. travel ski may match travel + sport_active");

  for (const row of MATRIX) {
    const groups = publicGroupsForEventActivities(row.event.activities);
    assert.equal(
      groups.includes("speeddate"),
      row.expect.speeddate,
      `${row.event.slug} speeddate`,
    );
    assert.equal(
      groups.includes("sport_active"),
      row.expect.sport_active,
      `${row.event.slug} sport_active`,
    );
    assert.equal(
      groups.includes("eten"),
      row.expect.dinner,
      `${row.event.slug} dinner`,
    );
    assert.equal(
      groups.includes("party"),
      row.expect.party,
      `${row.event.slug} party`,
    );
    assert.equal(
      groups.includes("travel"),
      row.expect.travel,
      `${row.event.slug} travel`,
    );
    assert.equal(
      groups.includes("workshop"),
      row.expect.workshop,
      `${row.event.slug} workshop`,
    );
  }
  ok("golden matrix public group membership");

  const base = {
    ...defaultSearchState(),
    age: 47,
    placeId: "antwerpen",
    maxDistanceKm: 10,
  };

  const none = matchingEvents(CATALOG, base, NOW);
  assert.equal(none.visible.length, CATALOG.length);
  ok("9. no category → all");

  const speedOnly = matchingEvents(
    CATALOG,
    { ...base, activities: ["speeddate"] },
    NOW,
  );
  assert.deepEqual(
    speedOnly.visible.map((e) => e.id),
    ["sd"],
  );
  ok("10. speeddate only");

  const activeOnly = matchingEvents(
    CATALOG,
    { ...base, activities: ["sport"] },
    NOW,
  );
  const activeIds = activeOnly.visible.map((e) => e.id).sort();
  assert.deepEqual(activeIds, ["bowling", "ski", "walk"]);
  assert.ok(!activeOnly.visible.some((e) => e.id === "sd"));
  ok("11. Sport & actief includes bowling + walk + ski; no speeddate");

  const multi = matchingEvents(
    CATALOG,
    { ...base, activities: ["sport", "eten"] },
    NOW,
  );
  assert.ok(multi.visible.some((e) => e.id === "walk"));
  assert.ok(multi.visible.some((e) => e.id === "dinner"));
  ok("12. multi-select");

  const travelOnly = matchingEvents(
    CATALOG,
    { ...base, activities: ["reizen", "weekend"], maxDistanceKm: 10 },
    NOW,
  );
  assert.ok(travelOnly.visible.some((e) => e.id === "ski"));
  ok("17+13 travel. multi-day travel exempt from distance");

  const dinnerOnly = matchingEvents(
    CATALOG,
    { ...base, activities: ["eten"] },
    NOW,
  );
  assert.deepEqual(
    dinnerOnly.visible.map((e) => e.id),
    ["dinner"],
  );
  ok("dinner only");

  const toggled = togglePublicActivityGroup([], "sport_active");
  assert.ok(isPublicActivityGroupSelected(toggled, "sport_active"));
  assert.equal(
    togglePublicActivityGroup(toggled, "sport_active").length,
    0,
  );
  ok("group toggle");

  const url = parseSearchState({ act: "sport", age: "47", distance: "10" });
  assert.ok(url.activities.includes("wandelen"));
  assert.ok(url.activities.includes("sport"));
  const qs = serializeSearchState(url);
  assert.ok(qs.includes("act=sport_active") || qs.includes("wandelen"));
  const restored = parseSearchState(
    Object.fromEntries(new URLSearchParams(qs).entries()),
  );
  assert.ok(restored.activities.includes("wandelen"));
  ok("21. URL sport → Sport & actief restore");

  const legacyWalk = parseSearchState({ act: "wandelen" });
  assert.deepEqual(legacyWalk.activities, ["wandelen"]);
  ok("legacy narrow wandelen preserved");

  console.log(`\nOK: phase16 taxonomy (${MATRIX.length} golden events).`);
}

main();
