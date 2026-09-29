/**
 * Fase 26.5: result refinement (text / date / sort) on top of main filters.
 * Usage: npx tsx scripts/verify-result-refinement.ts
 */
import assert from "node:assert/strict";
import {
  applyResultRefinement,
  defaultResultRefinement,
  matchesTextQuery,
  parseResultRefinement,
  refineDateRange,
  refinementFiltersActive,
  refinementIsActive,
  serializeResultRefinement,
  type ResultRefinement,
} from "../lib/result-refinement";
import { profileFromSearch } from "../lib/search-state";
import type { Event } from "../types/event";
import { band } from "../types/event";

const TODAY = "2026-09-29"; // Tuesday

function ok(name: string) {
  console.log(`ok  ${name}`);
}

function stub(
  partial: Partial<Event> & Pick<Event, "id" | "slug" | "startDate">,
): Event {
  return {
    title: partial.title ?? partial.slug,
    shortDescription: partial.shortDescription ?? "",
    description: null,
    category: partial.category ?? "dating",
    subCategory: partial.subCategory ?? "",
    organizerName: partial.organizerName ?? "Org",
    organizerId: null,
    city: partial.city ?? "Antwerpen",
    region: partial.region ?? "Antwerpen",
    venue: partial.venue ?? null,
    venueId: null,
    latitude: 51.22,
    longitude: 4.4,
    distanceKm: 5,
    endDate: partial.endDate ?? null,
    startTime: partial.startTime ?? "19:00",
    endTime: null,
    price: 25,
    currency: "EUR",
    eligibility: {
      default: band(25, 55, "guideline"),
      byGender: null,
      allowedGenders: null,
    },
    eligibilityAgeMin: 25,
    eligibilityAgeMax: 55,
    eligibilityAgeRule: "guideline",
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
    lastCheckedAt: "2026-09-20T12:00:00.000Z",
    addedAt: partial.addedAt ?? "2026-09-01T12:00:00.000Z",
    imageUrl: null,
    imageAlt: null,
    tags: partial.tags ?? [],
    activities: partial.activities ?? [],
    practicalInfo: [],
    ...partial,
  };
}

const catalog: Event[] = [
  stub({
    id: "1",
    slug: "karaoke-antwerp",
    title: "Karaoke Night Singles",
    organizerName: "FunFactory",
    city: "Antwerpen",
    venue: "Cafe Central",
    tags: ["karaoke", "avond"],
    activities: ["party"],
    startDate: "2026-09-29",
    addedAt: "2026-09-10T10:00:00.000Z",
  }),
  stub({
    id: "2",
    slug: "bowling-mechelen",
    title: "Bowling avond",
    organizerName: "Strike Club",
    city: "Mechelen",
    tags: ["bowling"],
    activities: ["sport"],
    startDate: "2026-10-03", // Friday → next weekend Sat/Sun is Oct 3-4? Oct 3 is Saturday in 2026
    addedAt: "2026-09-20T10:00:00.000Z",
  }),
  stub({
    id: "3",
    slug: "wandelen-gent",
    title: "Singles wandeling",
    organizerName: "Thursday Walks",
    city: "Gent",
    tags: ["wandelen"],
    activities: ["wandelen"],
    startDate: "2026-10-15",
    addedAt: "2026-08-01T10:00:00.000Z",
  }),
  stub({
    id: "4",
    slug: "dinner-far",
    title: "Dinner date",
    organizerName: "Tomeeto",
    city: "Brussel",
    startDate: "2026-11-01",
    addedAt: "2026-09-25T10:00:00.000Z",
  }),
];

// 1 title
assert.equal(matchesTextQuery(catalog[0], "karaoke"), true);
ok("1 text title search");

// 2 organizer
assert.equal(matchesTextQuery(catalog[1], "strike"), true);
ok("2 organizer search");

// 3 city
assert.equal(matchesTextQuery(catalog[2], "gent"), true);
ok("3 city search");

// 4 tag / activity label
assert.equal(matchesTextQuery(catalog[0], "PARTY"), true);
assert.equal(matchesTextQuery(catalog[1], "bowling"), true);
ok("4 keyword/tag search case-insensitive");

function refine(partial: Partial<ResultRefinement>): ResultRefinement {
  return { ...defaultResultRefinement(), ...partial };
}

// 5 today
{
  const out = applyResultRefinement(
    catalog,
    refine({ datePreset: "today" }),
    TODAY,
  );
  assert.deepEqual(
    out.map((e) => e.id),
    ["1"],
  );
  ok("5 today");
}

// 6 weekend — Mon 29 Sep → Sat 3 Oct + Sun 4 Oct
{
  const range = refineDateRange(refine({ datePreset: "weekend" }), TODAY);
  assert.deepEqual(range, { start: "2026-10-03", end: "2026-10-04" });
  const out = applyResultRefinement(
    catalog,
    refine({ datePreset: "weekend" }),
    TODAY,
  );
  assert.deepEqual(
    out.map((e) => e.id),
    ["2"],
  );
  ok("6 weekend");
}

// 7 7 days: 29 Sep .. 5 Oct
{
  const range = refineDateRange(refine({ datePreset: "7d" }), TODAY);
  assert.deepEqual(range, { start: "2026-09-29", end: "2026-10-05" });
  const out = applyResultRefinement(
    catalog,
    refine({ datePreset: "7d" }),
    TODAY,
  );
  assert.deepEqual(
    out.map((e) => e.id),
    ["1", "2"],
  );
  ok("7 7 days");
}

// 8 30 days: 29 Sep .. 28 Oct
{
  const range = refineDateRange(refine({ datePreset: "30d" }), TODAY);
  assert.deepEqual(range, { start: "2026-09-29", end: "2026-10-28" });
  const out = applyResultRefinement(
    catalog,
    refine({ datePreset: "30d" }),
    TODAY,
  );
  assert.deepEqual(
    out.map((e) => e.id).sort(),
    ["1", "2", "3"],
  );
  ok("8 30 days");
}

// 9 custom from/to
{
  const out = applyResultRefinement(
    catalog,
    refine({
      datePreset: "custom",
      dateFrom: "2026-10-01",
      dateTo: "2026-10-31",
    }),
    TODAY,
  );
  assert.deepEqual(
    out.map((e) => e.id).sort(),
    ["2", "3"],
  );
  ok("9 custom from/to");
}

// 10 soonest sort
{
  const out = applyResultRefinement(
    catalog,
    refine({ sort: "soonest" }),
    TODAY,
  );
  assert.deepEqual(
    out.map((e) => e.id),
    ["1", "2", "3", "4"],
  );
  ok("10 first upcoming sort");
}

// 11 newest sort
{
  const out = applyResultRefinement(catalog, refine({ sort: "newest" }), TODAY);
  assert.deepEqual(
    out.map((e) => e.id),
    ["4", "2", "1", "3"],
  );
  ok("11 newest added sort");
}

// 12 clear refinement
{
  const active = refine({ q: "karaoke", datePreset: "7d", sort: "newest" });
  assert.equal(refinementIsActive(active), true);
  assert.equal(refinementIsActive(defaultResultRefinement()), false);
  ok("12 clear refinement resets to inactive");
}

// 13 main filters unchanged conceptually: refinement only subsets input list
{
  const subset = catalog.slice(0, 2);
  const out = applyResultRefinement(
    subset,
    refine({ q: "bowling" }),
    TODAY,
  );
  assert.equal(out.length, 1);
  assert.equal(out[0].id, "2");
  // Event outside the main-filter set never reappears
  assert.equal(
    applyResultRefinement(subset, refine({ q: "gent" }), TODAY).length,
    0,
  );
  ok("13 main filter set preserved");
}

// 14 zero refinement state
{
  const out = applyResultRefinement(
    catalog,
    refine({ q: "zzzz-no-match" }),
    TODAY,
  );
  assert.equal(out.length, 0);
  assert.equal(refinementFiltersActive(refine({ q: "zzzz" })), true);
  ok("14 zero-result refinement");
}

// URL roundtrip
{
  const state = refine({
    q: "karaoke",
    datePreset: "30d",
    sort: "newest",
  });
  const params = serializeResultRefinement(state);
  assert.equal(params.get("q"), "karaoke");
  assert.equal(params.get("datePreset"), "30d");
  assert.equal(params.get("rsort"), "newest");
  const parsed = parseResultRefinement(params);
  assert.equal(parsed.q, "karaoke");
  assert.equal(parsed.datePreset, "30d");
  assert.equal(parsed.sort, "newest");
  ok("15 URL serialize/parse");
}

// Custom URL
{
  const params = serializeResultRefinement(
    refine({
      datePreset: "custom",
      dateFrom: "2026-10-01",
      dateTo: "2026-10-31",
    }),
  );
  assert.equal(params.get("dateFrom"), "2026-10-01");
  assert.equal(params.get("dateTo"), "2026-10-31");
  const parsed = parseResultRefinement(params);
  assert.equal(parsed.datePreset, "custom");
  ok("16 custom date URL");
}

// Preferences ignore refinement
{
  const profile = profileFromSearch({
    age: 40,
    gender: null,
    placeId: "antwerpen",
    maxDistanceKm: 50,
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
  });
  assert.equal("q" in profile, false);
  ok("17 saved preferences untouched by refinement keys");
}

// Saturday today → current weekend
{
  const sat = "2026-10-03";
  const range = refineDateRange(refine({ datePreset: "weekend" }), sat);
  assert.deepEqual(range, { start: "2026-10-03", end: "2026-10-04" });
  ok("18 weekend on Saturday is current weekend");
}

console.log("\nAll result-refinement checks passed.");
