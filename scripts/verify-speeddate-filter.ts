/**
 * Fase 13: speeddate filter category + empty=all / selected=only semantics.
 * Usage: npm run verify:speeddate-filter
 */
import assert from "node:assert/strict";
import {
  canonicalizeActivityId,
  isClassicSpeeddate,
  normalizeEventActivities,
} from "../lib/event-category";
import { matchingEvents } from "../lib/filters";
import {
  defaultSearchState,
  parseSearchState,
  serializeSearchState,
} from "../lib/search-state";
import { ACTIVITY_LABEL } from "../lib/format";
import type { Event } from "../types/event";
import { band } from "../types/event";

function ok(name: string) {
  console.log(`ok  ${name}`);
}

function stub(
  partial: Partial<Event> & Pick<Event, "id" | "slug" | "startDate" | "activities" | "subCategory" | "title">,
): Event {
  return {
    shortDescription: "",
    description: null,
    category: "dating",
    organizerName: "Org",
    organizerId: null,
    city: "Antwerpen",
    region: "Antwerpen",
    venue: null,
    venueId: null,
    latitude: 51.22,
    longitude: 4.4,
    distanceKm: 1,
    endDate: null,
    startTime: "19:00",
    endTime: null,
    price: 25,
    currency: "EUR",
    eligibility: {
      default: band(25, 35, "strict"),
      byGender: null,
      allowedGenders: null,
    },
    eligibilityAgeMin: 25,
    eligibilityAgeMax: 35,
    eligibilityAgeRule: "strict",
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

function main() {
  assert.equal(ACTIVITY_LABEL.speeddate, "Speeddate");
  ok("1. speeddate is explicit activity label");

  assert.equal(isClassicSpeeddate({ subCategory: "speeddating" }), true);
  assert.equal(isClassicSpeeddate({ title: "Speed Dating Brussel 30+" }), true);
  assert.equal(
    isClassicSpeeddate({ title: "Dîner Dating Bruxelles 25-34" }),
    false,
  );
  assert.equal(
    isClassicSpeeddate({ title: "Conscious Dating Workshop" }),
    false,
  );
  assert.equal(isClassicSpeeddate({ title: "Singles Apero Mechelen" }), false);
  ok("taxonomy: classic speeddate vs dinner/workshop/apero");

  const speedActs = normalizeEventActivities({
    activities: ["drinken"],
    subCategory: "speeddate",
    title: "SmartVibes Speeddate Antwerpen",
  });
  assert.deepEqual(speedActs, ["speeddate"]);
  ok("normalize strips misleading drinken → speeddate");

  const dinnerActs = normalizeEventActivities({
    activities: ["eten"],
    subCategory: "singles dinner",
    title: "Dîner Dating Bruxelles",
  });
  assert.deepEqual(dinnerActs, ["eten"]);
  ok("dinner stays eten, not speeddate");

  assert.equal(canonicalizeActivityId("speeddating"), "speeddate");
  assert.equal(canonicalizeActivityId("speed"), "speeddate");
  assert.equal(canonicalizeActivityId("drinks"), "drinken");
  ok("legacy aliases canonicalize");

  const catalog = [
    stub({
      id: "sd",
      slug: "speeddate-a",
      title: "Speeddate Antwerpen",
      subCategory: "speeddate",
      startDate: "2026-10-15",
      activities: normalizeEventActivities({
        activities: ["speeddate"],
        subCategory: "speeddate",
        title: "Speeddate Antwerpen",
      }),
    }),
    stub({
      id: "out",
      slug: "hike-a",
      title: "Singles wandeling",
      subCategory: "singles hike",
      startDate: "2026-10-16",
      activities: ["wandelen", "outdoor"],
      category: "meet_new_people",
    }),
    stub({
      id: "drink",
      slug: "apero-a",
      title: "Singles Apero",
      subCategory: "apero",
      startDate: "2026-10-17",
      activities: ["drinken"],
    }),
  ];

  const base = { ...defaultSearchState(), age: 30 };
  const now = new Date("2026-09-26T12:00:00+02:00");

  const all = matchingEvents(catalog, base, now);
  assert.equal(all.visible.length, 3);
  assert.ok(all.visible.some((e) => e.id === "sd"));
  ok("2. default (no activities) shows speeddate");

  const outdoorOnly = matchingEvents(
    catalog,
    { ...base, activities: ["outdoor"] },
    now,
  );
  assert.equal(outdoorOnly.visible.length, 1);
  assert.equal(outdoorOnly.visible[0].id, "out");
  assert.ok(!outdoorOnly.visible.some((e) => e.id === "sd"));
  ok("3. outdoor only excludes speeddate");

  const multi = matchingEvents(
    catalog,
    { ...base, activities: ["outdoor", "speeddate"] },
    now,
  );
  assert.equal(multi.visible.length, 2);
  assert.ok(multi.visible.some((e) => e.id === "sd"));
  assert.ok(multi.visible.some((e) => e.id === "out"));
  ok("5. multi-select outdoor + speeddate");

  const speedOnly = matchingEvents(
    catalog,
    { ...base, activities: ["speeddate"] },
    now,
  );
  assert.equal(speedOnly.visible.length, 1);
  assert.equal(speedOnly.visible[0].id, "sd");
  ok("4. speeddate only");

  const drinksOnly = matchingEvents(
    catalog,
    { ...base, activities: ["drinken"] },
    now,
  );
  assert.equal(drinksOnly.visible.length, 1);
  assert.equal(drinksOnly.visible[0].id, "drink");
  assert.ok(!drinksOnly.visible.some((e) => e.id === "sd"));
  ok("drinks without speeddate excludes classic speeddate");

  const alleSoorten = matchingEvents(
    catalog,
    { ...base, activities: [], categories: [] },
    now,
  );
  assert.equal(alleSoorten.visible.length, 3);
  ok("6. Alle soorten = no type filter (not select-all)");

  const urlState = parseSearchState({ act: "speeddate" });
  assert.deepEqual(urlState.activities, ["speeddate"]);
  const qs = serializeSearchState(urlState);
  assert.ok(qs.includes("act=speeddate"));
  const restored = parseSearchState(
    Object.fromEntries(new URLSearchParams(qs).entries()),
  );
  assert.deepEqual(restored.activities, ["speeddate"]);
  ok("7. URL act=speeddate restore");

  const legacy = parseSearchState({ act: "speeddating" });
  assert.deepEqual(legacy.activities, ["speeddate"]);
  ok("legacy URL act=speeddating → speeddate");

  console.log("\nOK: speeddate filter semantics.");
}

main();
