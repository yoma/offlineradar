/**
 * Fase 21: Binnenkort / upcoming strip selection + UI invariants.
 * Usage: npm run verify:phase21-upcoming
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { addDays } from "../lib/dates";
import { defaultSearchState } from "../lib/search-state";
import {
  applyFormatDiversity,
  isUpcomingStart,
  isWalloniaEvent,
  isWithinUpcomingWindow,
  primaryFormatId,
  selectUpcomingEvents,
  shouldExcludeWalloniaFromStrip,
  upcomingUrgencyLabel,
  UPCOMING_MAX_COUNT,
} from "../lib/upcoming";
import type { Event } from "../types/event";
import { band } from "../types/event";
import type { PreparedEvent } from "../lib/filters";
import type { SearchState } from "../types/search";

const NOW = new Date("2026-09-27T12:00:00+02:00");
const TODAY = "2026-09-27";

function ok(name: string) {
  console.log(`ok  ${name}`);
}

function stub(
  partial: Partial<Event> & Pick<Event, "id" | "slug" | "startDate">,
): Event {
  return {
    title: partial.title ?? partial.slug,
    shortDescription: "",
    description: null,
    category: "dating",
    subCategory: "",
    organizerName: "Org",
    organizerId: null,
    city: partial.city ?? "Antwerpen",
    region: partial.region ?? "Antwerpen",
    venue: null,
    venueId: null,
    latitude: 51.22,
    longitude: 4.4,
    distanceKm: partial.distanceKm ?? 5,
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
    lastCheckedAt: new Date().toISOString(),
    addedAt: new Date().toISOString(),
    imageUrl: null,
    imageAlt: null,
    tags: [],
    activities: partial.activities ?? ["wandelen"],
    practicalInfo: [],
    ...partial,
  };
}

function asPrepared(event: Event): PreparedEvent {
  return {
    ...event,
    participation: {
      status: "eligible",
      includedByDefault: true,
      inRange: true,
      title: "",
      detail: "",
      appliedBand: null,
    },
  };
}

function baseState(patch: Partial<SearchState> = {}): SearchState {
  return {
    ...defaultSearchState(),
    age: 35,
    placeId: "antwerpen",
    maxDistanceKm: 100,
    ...patch,
  };
}

function mustInclude(rel: string, needle: string, label: string) {
  const src = fs.readFileSync(path.join(process.cwd(), rel), "utf8");
  assert.ok(src.includes(needle), `${label}: missing ${needle} in ${rel}`);
}

function main() {
  assert.equal(isUpcomingStart(stub({ id: "1", slug: "a", startDate: TODAY }), TODAY), true);
  assert.equal(
    isUpcomingStart(stub({ id: "2", slug: "b", startDate: "2026-09-26" }), TODAY),
    false,
  );
  ok("1-4. upcoming start excludes past");

  assert.equal(
    isWithinUpcomingWindow(
      stub({ id: "3", slug: "c", startDate: addDays(TODAY, 6) }),
      TODAY,
      7,
    ),
    true,
  );
  assert.equal(
    isWithinUpcomingWindow(
      stub({ id: "4", slug: "d", startDate: addDays(TODAY, 8) }),
      TODAY,
      7,
    ),
    false,
  );
  assert.equal(
    isWithinUpcomingWindow(
      stub({ id: "5", slug: "e", startDate: addDays(TODAY, 13) }),
      TODAY,
      14,
    ),
    true,
  );
  ok("5-6. 7-day and 14-day window bounds");

  const near: Event[] = [
    stub({
      id: "w1",
      slug: "walk-1",
      startDate: addDays(TODAY, 1),
      activities: ["wandelen"],
      title: "Wandeling A",
    }),
    stub({
      id: "w2",
      slug: "walk-2",
      startDate: addDays(TODAY, 2),
      activities: ["wandelen"],
      title: "Wandeling B",
    }),
  ];
  const nearSel = selectUpcomingEvents(near, baseState(), NOW);
  assert.equal(nearSel.windowDays, 14, "fallback to 14 when <3 in 7 days");
  assert.equal(nearSel.events.length, 2);
  ok("6. fallback max 14 days when fewer than 3");

  const empty = selectUpcomingEvents(
    [
      stub({
        id: "far",
        slug: "far",
        startDate: addDays(TODAY, 30),
        activities: ["wandelen"],
      }),
    ],
    baseState(),
    NOW,
  );
  assert.equal(empty.events.length, 0);
  ok("7. empty selection when none in 14 days");

  const antwerp = selectUpcomingEvents(
    [
      stub({
        id: "a1",
        slug: "a1",
        startDate: addDays(TODAY, 1),
        city: "Antwerpen",
        region: "Antwerpen",
        distanceKm: 3,
        activities: ["wandelen"],
      }),
      stub({
        id: "g1",
        slug: "g1",
        startDate: addDays(TODAY, 1),
        city: "Gent",
        region: "Oost-Vlaanderen",
        latitude: 51.05,
        longitude: 3.72,
        distanceKm: 60,
        activities: ["wandelen"],
      }),
    ],
    baseState({ placeId: "antwerpen", maxDistanceKm: 20 }),
    NOW,
  );
  assert.ok(antwerp.events.every((e) => e.city === "Antwerpen"));
  ok("8. location / distance respected");

  const ageHard = selectUpcomingEvents(
    [
      stub({
        id: "age1",
        slug: "age1",
        startDate: addDays(TODAY, 1),
        activities: ["eten"],
        eligibility: {
          default: band(50, 60, "strict"),
          byGender: null,
          allowedGenders: null,
        },
        eligibilityAgeMin: 50,
        eligibilityAgeMax: 60,
        eligibilityAgeRule: "strict",
      }),
      stub({
        id: "age2",
        slug: "age2",
        startDate: addDays(TODAY, 2),
        activities: ["eten"],
      }),
    ],
    baseState({ age: 35 }),
    NOW,
  );
  assert.ok(!ageHard.events.some((e) => e.slug === "age1"));
  assert.ok(ageHard.events.some((e) => e.slug === "age2"));
  ok("9+11. age eligibility respected");

  const sport = selectUpcomingEvents(
    [
      stub({
        id: "s1",
        slug: "s1",
        startDate: addDays(TODAY, 1),
        activities: ["wandelen"],
        title: "Walk",
      }),
      stub({
        id: "sd1",
        slug: "sd1",
        startDate: addDays(TODAY, 1),
        activities: ["speeddate"],
        title: "Speeddate",
      }),
    ],
    baseState({ activities: ["sport"] }),
    NOW,
  );
  assert.ok(sport.events.every((e) => !e.activities.includes("speeddate")));
  assert.ok(sport.events.some((e) => e.slug === "s1"));
  ok("10. speeddate excluded when Sport & actief selected");

  const multi = selectUpcomingEvents(
    [
      stub({
        id: "m1",
        slug: "m1",
        startDate: addDays(TODAY, 1),
        activities: ["eten"],
      }),
      stub({
        id: "m2",
        slug: "m2",
        startDate: addDays(TODAY, 2),
        activities: ["drinken"],
      }),
      stub({
        id: "m3",
        slug: "m3",
        startDate: addDays(TODAY, 3),
        activities: ["wandelen"],
      }),
    ],
    baseState({ activities: ["eten", "drinken"] }),
    NOW,
  );
  const multiSlugs = multi.events.map((e) => e.slug);
  assert.ok(multiSlugs.includes("m1"));
  assert.ok(multiSlugs.includes("m2"));
  assert.ok(!multiSlugs.includes("m3"));
  ok("10b. multi-select activity OR respected");

  const travelStarted = selectUpcomingEvents(
    [
      stub({
        id: "t0",
        slug: "t0",
        startDate: "2026-09-25",
        endDate: "2026-09-30",
        activities: ["reizen", "weekend"],
        distanceKm: 200,
      }),
      stub({
        id: "t1",
        slug: "t1",
        startDate: addDays(TODAY, 3),
        endDate: addDays(TODAY, 5),
        activities: ["reizen", "weekend"],
        distanceKm: 200,
      }),
    ],
    baseState(),
    NOW,
  );
  assert.ok(!travelStarted.events.some((e) => e.slug === "t0"));
  assert.ok(travelStarted.events.some((e) => e.slug === "t1"));
  ok("11. travel: started excluded, future start included");

  assert.equal(upcomingUrgencyLabel(TODAY, TODAY), "Vandaag");
  assert.equal(upcomingUrgencyLabel(addDays(TODAY, 1), TODAY), "Morgen");
  // 2026-09-27 is Sunday → weekend label for today
  assert.equal(upcomingUrgencyLabel(TODAY, TODAY), "Vandaag");
  const wed = addDays(TODAY, 3);
  assert.match(upcomingUrgencyLabel(wed, TODAY), /^(ma|di|wo|do|vr|za|zo) /);
  ok("12. today/tomorrow/weekday labels");

  const chrono = selectUpcomingEvents(
    [
      stub({
        id: "c2",
        slug: "c2",
        startDate: addDays(TODAY, 5),
        activities: ["eten"],
      }),
      stub({
        id: "c1",
        slug: "c1",
        startDate: addDays(TODAY, 1),
        activities: ["eten"],
      }),
      stub({
        id: "c3",
        slug: "c3",
        startDate: addDays(TODAY, 2),
        activities: ["eten"],
      }),
    ],
    baseState(),
    NOW,
  );
  assert.deepEqual(
    chrono.events.map((e) => e.slug),
    ["c1", "c3", "c2"],
  );
  ok("13. chronological sorting");

  const manySpeed: PreparedEvent[] = [];
  for (let i = 0; i < 6; i++) {
    manySpeed.push(
      asPrepared(
        stub({
          id: `sd-${i}`,
          slug: `sd-${i}`,
          startDate: addDays(TODAY, i),
          activities: ["speeddate"],
        }),
      ),
    );
  }
  manySpeed.push(
    asPrepared(
      stub({
        id: "walk-alt",
        slug: "walk-alt",
        startDate: addDays(TODAY, 1),
        activities: ["wandelen"],
      }),
    ),
  );
  manySpeed.sort((a, b) => a.startDate.localeCompare(b.startDate));
  const div = applyFormatDiversity(manySpeed, baseState(), 3, 8);
  const speedCount = div.filter((e) => primaryFormatId(e.activities) === "speeddate")
    .length;
  assert.ok(speedCount <= 3 || !div.some((e) => e.slug === "walk-alt"));
  assert.ok(div.some((e) => e.slug === "walk-alt"));
  assert.ok(div.length <= UPCOMING_MAX_COUNT);
  ok("14. format diversity caps speeddate when alternatives exist");

  const onlySpeed = applyFormatDiversity(
    manySpeed.filter((e) => e.activities.includes("speeddate")),
    baseState(),
    3,
    8,
  );
  assert.ok(onlySpeed.length > 3, "speeddate may dominate if no alternatives");
  ok("14b. speeddate can dominate without alternatives");

  assert.equal(isWalloniaEvent({ region: "Namur", city: "Namur" }), true);
  assert.equal(isWalloniaEvent({ region: "Antwerpen", city: "Antwerpen" }), false);
  assert.equal(shouldExcludeWalloniaFromStrip(baseState({ placeId: "antwerpen" })), true);
  assert.equal(shouldExcludeWalloniaFromStrip(baseState({ placeId: "brussel" })), true);

  const walloniaFiltered = selectUpcomingEvents(
    [
      stub({
        id: "wa1",
        slug: "wa1",
        startDate: addDays(TODAY, 1),
        city: "Namur",
        region: "Namur",
        latitude: 50.47,
        longitude: 4.87,
        distanceKm: 80,
        activities: ["eten"],
      }),
      stub({
        id: "fl1",
        slug: "fl1",
        startDate: addDays(TODAY, 2),
        city: "Antwerpen",
        region: "Antwerpen",
        activities: ["eten"],
      }),
    ],
    baseState({ placeId: "antwerpen" }),
    NOW,
  );
  assert.ok(!walloniaFiltered.events.some((e) => e.slug === "wa1"));
  assert.ok(walloniaFiltered.events.some((e) => e.slug === "fl1"));
  ok("26-28. Flanders priority; Wallonia not pushed from Flanders place");

  // UI / overflow / a11y static checks
  mustInclude(
    "components/discover/discover-view.tsx",
    "UpcomingStrip",
    "discover wires upcoming strip",
  );
  mustInclude(
    "components/discover/discover-view.tsx",
    "selectUpcomingEvents",
    "discover uses selectUpcomingEvents",
  );
  mustInclude(
    "components/discover/upcoming-strip.tsx",
    "overflow-x-auto",
    "horizontal scroll container",
  );
  mustInclude(
    "components/discover/upcoming-strip.tsx",
    "snap-x",
    "scroll snap",
  );
  mustInclude(
    "components/discover/upcoming-strip.tsx",
    "binnenkort-heading",
    "semantic heading id",
  );
  mustInclude(
    "components/discover/upcoming-strip.tsx",
    "tabIndex={0}",
    "keyboard focusable strip",
  );
  mustInclude(
    "components/discover/upcoming-card.tsx",
    "min-w-0",
    "upcoming card text/image can shrink inside fixed width",
  );
  mustInclude(
    "components/discover/upcoming-card.tsx",
    "EventVisual",
    "reuses EventVisual",
  );
  mustInclude(
    "components/discover/upcoming-strip.tsx",
    "shrink-0",
    "list items do not collapse; horizontal peek scroll",
  );
  mustInclude(
    "lib/upcoming.ts",
    "matchingEvents",
    "reuses matchingEvents (no second filter engine)",
  );
  assert.ok(
    !fs
      .readFileSync(path.join(process.cwd(), "lib/upcoming.ts"), "utf8")
      .includes("getEventsSql"),
    "no DB access in upcoming helper",
  );
  ok("15-19+23. mobile strip / a11y / no N+1 static checks");

  console.log("\nOK: phase21 upcoming verify.");
}

main();
