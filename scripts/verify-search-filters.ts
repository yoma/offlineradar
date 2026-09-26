/**
 * Phase 3.1 filter + public card copy invariants.
 * Usage: npm run verify:search-filters
 */
import assert from "node:assert/strict";
import { matchingEvents } from "../lib/filters";
import {
  applySearchPatch,
  defaultSearchState,
  withWhenFilter,
} from "../lib/search-state";
import {
  formatCardAgeLine,
  formatConsumerAvailabilityDetail,
  formatPublicAvailabilityStatus,
  publicCapacityBadge,
} from "../lib/public-copy";
import { eventLabels } from "../lib/event-labels";
import type { Event } from "../types/event";
import { band } from "../types/event";

function ok(name: string) {
  console.log(`ok  ${name}`);
}

function stub(partial: Partial<Event> & Pick<Event, "id" | "slug" | "startDate">): Event {
  return {
    title: partial.title ?? partial.slug,
    shortDescription: "",
    description: null,
    category: "dating",
    subCategory: "",
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
    activities: ["drinken"],
    practicalInfo: [],
    ...partial,
  };
}

async function main() {
  const base = defaultSearchState();
  assert.equal(base.when, "any");
  assert.equal(base.date, null);

  const weekend = withWhenFilter(base, "weekend");
  assert.equal(weekend.when, "weekend");
  assert.equal(weekend.date, null);
  ok("weekend sets single when mode");

  const month = withWhenFilter(weekend, "month");
  assert.equal(month.when, "month");
  assert.equal(month.date, null);
  ok("month replaces weekend");

  const backToWeekend = applySearchPatch(month, { when: "weekend" });
  assert.equal(backToWeekend.when, "weekend");
  assert.equal(backToWeekend.date, null);
  ok("weekend replaces month via patch");

  const cleared = applySearchPatch(backToWeekend, { when: "any" });
  assert.equal(cleared.when, "any");
  assert.equal(cleared.date, null);
  ok("clearing date mode leaves no constraint");

  const nextWeek = applySearchPatch(
    { ...month, activities: ["sport"], maxDistanceKm: 50 },
    { when: "next_week", date: null },
  );
  assert.equal(nextWeek.when, "next_week");
  assert.equal(nextWeek.activities.join(","), "sport");
  assert.equal(nextWeek.maxDistanceKm, 50);
  ok("empty-state next-week replaces date only");

  const activitiesCleared = applySearchPatch(nextWeek, { activities: [] });
  assert.equal(activitiesCleared.when, "next_week");
  assert.deepEqual(activitiesCleared.activities, []);
  ok("category/activity reset does not reset date");

  const distanceOnly = applySearchPatch(nextWeek, { maxDistanceKm: 100 });
  assert.equal(distanceOnly.when, "next_week");
  assert.equal(distanceOnly.maxDistanceKm, 100);
  ok("distance change does not alter date");

  // Matching exclusivity with sample events (late Sept → month includes October)
  const events = [
    stub({ id: "a", slug: "weekend-ev", startDate: "2026-09-26" }), // Sat
    stub({ id: "b", slug: "midweek-ev", startDate: "2026-09-29" }), // Tue
    stub({ id: "c", slug: "later-ev", startDate: "2026-10-20" }),
  ];
  const now = new Date("2026-09-26T12:00:00+02:00");
  const weekendMatch = matchingEvents(
    events,
    { ...defaultSearchState(), age: 30, when: "weekend" },
    now,
  );
  assert.ok(weekendMatch.visible.every((e) => e.startDate <= "2026-09-27"));
  const monthMatch = matchingEvents(
    events,
    { ...defaultSearchState(), age: 30, when: "month" },
    now,
  );
  assert.ok(monthMatch.visible.some((e) => e.slug === "midweek-ev"));
  assert.ok(
    monthMatch.visible.some((e) => e.slug === "later-ev"),
    "late-month 'Deze maand' includes next calendar month",
  );
  ok("matching weekend vs month exclusive");

  const clearWhen = applySearchPatch(
    { ...defaultSearchState(), when: "month", activities: ["sport"] },
    { when: "any", date: null },
  );
  assert.equal(clearWhen.when, "any");
  assert.deepEqual(clearWhen.activities, ["sport"]);
  ok("clear date keeps other filters");

  assert.equal(
    formatPublicAvailabilityStatus("unknown"),
    "Beschikbaarheid onbekend",
  );
  assert.equal(publicCapacityBadge("waitlist"), "Wachtlijst");
  assert.equal(publicCapacityBadge("available"), null);
  assert.equal(
    formatConsumerAvailabilityDetail(
      "unknown",
      "RSVP niet betrouwbaar afleesbaar; host niet gegarandeerd.",
    ),
    "Beschikbaarheid onbekend — controleer bij de organisator.",
  );
  assert.equal(
    formatCardAgeLine("guideline", "50+"),
    "Richtleeftijd 50+",
  );
  assert.equal(formatCardAgeLine("strict", "53–65 jaar"), "53–65 jaar");
  ok("public availability + age formatters");

  const labels = eventLabels({
    singlesOnly: false,
    singlesOriented: true,
    singlesFriendly: true,
    meetActivation: null,
  });
  assert.deepEqual(
    labels.map((l) => l.text),
    ["Singlesgericht"],
  );
  ok("no singlesFriendly marketing badge");

  const cardFields = [
    "availabilityNote",
    "internalNotes",
    "internalPreviewWarnings",
    "internalSourceConflicts",
  ];
  // EventCard source must not reference these as rendered body text — checked via import graph smoke
  const fs = await import("node:fs");
  const cardSrc = fs.readFileSync("components/events/event-card.tsx", "utf8");
  for (const field of cardFields) {
    assert.equal(cardSrc.includes(field), false, `EventCard must not use ${field}`);
  }
  assert.equal(cardSrc.includes("Deelname buiten de richtleeftijd"), false);
  ok("EventCard hides internal/technical copy");

  console.log("\nOK: search filter + public card invariants.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
