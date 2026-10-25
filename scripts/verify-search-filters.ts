/**
 * Phase 3.1 filter + public card copy invariants.
 * Usage: npm run verify:search-filters
 */
import assert from "node:assert/strict";
import {
  applyCategoryChipPatch,
  CATEGORY_CHIPS,
} from "../components/filters/category-filter-chips";
import { matchingEvents } from "../lib/filters";
import { activeFilterChips, removeChipFromState } from "../lib/search-chips";
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

  // Matching: late Sept "Deze maand" includes October
  const events = [
    stub({ id: "a", slug: "weekend-ev", startDate: "2026-09-26" }),
    stub({ id: "b", slug: "midweek-ev", startDate: "2026-09-29" }),
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
    "'Deze maand' includes next calendar month",
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
    publicCapacityBadge(
      "waitlist",
      "Vrouwen: volzet (reservelijst) · Mannen: laatste plaatsen",
    ),
    "Beperkte plaatsen",
  );
  assert.equal(
    publicCapacityBadge("sold_out", "Vrouwen: nog plaats · Mannen: volzet"),
    null,
  );
  assert.equal(
    formatConsumerAvailabilityDetail(
      "unknown",
      "RSVP niet betrouwbaar afleesbaar; host niet gegarandeerd.",
    ),
    "Beschikbaarheid onbekend — controleer bij de organisator.",
  );
  assert.equal(
    formatConsumerAvailabilityDetail(
      "available",
      "Vrouwen: Vrouwen /site/img/speeddatenbe/table/ja.png Nog plaats | Mannen: Mannen /site/img/speeddatenbe/table/nee.png Volzet, reservelijst beschikbaar",
    ),
    null,
  );
  assert.equal(
    formatConsumerAvailabilityDetail(
      "limited",
      "Vrouwen: /site/img/speeddatenbe/table/nee.png Volzet, reservelijst beschikbaar | Mannen: bijna.png Laatste plaatsen",
    ),
    "Nog beperkte plaatsen. Controleer bij de organisator.",
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
  assert.deepEqual(labels.map((l) => l.text), []);
  const only = eventLabels({
    singlesOnly: true,
    singlesOriented: true,
    singlesFriendly: false,
    meetActivation: null,
  });
  assert.deepEqual(only.map((l) => l.text), ["Singles only"]);
  const review = eventLabels(
    {
      singlesOnly: false,
      singlesOriented: true,
      singlesFriendly: false,
      meetActivation: null,
    },
    "review",
  );
  assert.deepEqual(review.map((l) => l.text), ["Singlesgericht"]);
  ok("public omits Singlesgericht; Singles only + review labels ok");

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

  // Extra filters must not false-zero on sparse catalog fields.
  const sparse = [
    stub({
      id: "p1",
      slug: "unknown-price",
      startDate: "2026-10-15",
      price: null,
      capacityStatus: "unknown",
      singlesOnly: false,
      singlesOriented: true,
    }),
    stub({
      id: "p2",
      slug: "paid-known",
      startDate: "2026-10-16",
      price: 30,
      capacityStatus: "available",
      singlesOnly: true,
    }),
  ];
  const nowSparse = new Date("2026-10-10T12:00:00+02:00");
  const priceFilter = matchingEvents(
    sparse,
    { ...defaultSearchState(), age: 30, price: "mid" },
    nowSparse,
  );
  assert.ok(
    priceFilter.visible.some((e) => e.slug === "unknown-price"),
    "unknown price stays visible under price chip",
  );
  assert.ok(priceFilter.visible.some((e) => e.slug === "paid-known"));
  const openFilter = matchingEvents(
    sparse,
    { ...defaultSearchState(), age: 30, availability: "open" },
    nowSparse,
  );
  assert.ok(
    openFilter.visible.some((e) => e.slug === "unknown-price"),
    "unknown capacity stays visible under open availability",
  );
  const singlesFilter = matchingEvents(
    sparse,
    { ...defaultSearchState(), age: 30, singlesOnly: true },
    nowSparse,
  );
  assert.ok(
    singlesFilter.visible.some((e) => e.slug === "unknown-price"),
    "singlesOriented matches Alleen singles",
  );
  ok("extra filters keep sparse catalog events");

  {
    const chip = (match: (c: (typeof CATEGORY_CHIPS)[number]) => boolean) =>
      CATEGORY_CHIPS.find(match)!;
    const allChip = chip((c) => c.kind === "all");
    const dating = chip((c) => c.kind === "category" && c.id === "dating");
    const party = chip((c) => c.kind === "activity" && c.id === "party");
    const speeddate = chip((c) => c.kind === "activity" && c.id === "speeddate");
    const tap = (state: ReturnType<typeof defaultSearchState>, c: typeof allChip) =>
      applySearchPatch(state, applyCategoryChipPatch(state, c));

    const all = defaultSearchState();
    assert.equal(all.typesMode, "all");

    // Alle soorten = every chip on; tapping one switches only that one off.
    const noDating = tap(all, dating);
    assert.equal(noDating.typesMode, "pick");
    assert.deepEqual(noDating.categories, ["meet_new_people"]);
    assert.ok(noDating.activities.includes("speeddate"));
    assert.ok(noDating.activities.includes("party"));

    // Switching it back on returns to Alle soorten.
    assert.equal(tap(noDating, dating).typesMode, "all");
    // Alle soorten from a pick turns everything on again.
    assert.equal(tap(noDating, allChip).typesMode, "all");

    // Alle soorten while all on clears the row; then pick just one.
    const cleared = tap(all, allChip);
    assert.equal(cleared.typesMode, "none");
    const onlySpeeddate = tap(cleared, speeddate);
    assert.equal(onlySpeeddate.typesMode, "pick");
    assert.deepEqual(onlySpeeddate.categories, []);
    assert.deepEqual(onlySpeeddate.activities, ["speeddate"]);
    ok("category chips: all on → tap to exclude → Alle restores; Alle again clears");

    // Excluding Party hides a party-only event but keeps chip-less categories.
    const now = new Date("2026-10-10T12:00:00+02:00");
    const typed = [
      stub({ id: "t1", slug: "party-night", startDate: "2026-10-16", activities: ["party"] }),
      stub({ id: "t2", slug: "social-walk", startDate: "2026-10-16", category: "social", activities: ["wandelen"] }),
      stub({ id: "t3", slug: "apero", startDate: "2026-10-16", activities: ["drinken"] }),
    ];
    const noParty = tap({ ...all, age: 30 }, party);
    const visible = matchingEvents(typed, noParty, now).visible.map((e) => e.slug);
    assert.ok(!visible.includes("party-night"), "Party off hides party-only event");
    assert.ok(visible.includes("social-walk"), "category without chip stays");
    assert.ok(visible.includes("apero"), "other types stay");
    ok("excluding one activity keeps everything else");

    const offChips = activeFilterChips(noParty).filter((c) => c.id.startsWith("no-"));
    assert.deepEqual(offChips.map((c) => c.label), ["Zonder party"]);
    const restored = removeChipFromState(noParty, offChips[0]!.id);
    assert.equal(restored.typesMode, "all");
    ok("active chips name the excluded type; removing it restores Alle soorten");
  }

  console.log("\nOK: search filter + public card invariants.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
