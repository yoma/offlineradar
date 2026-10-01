/**
 * Fase 21.1: Binnenkort sticker strip — filter-independent selection + UI.
 * Usage: npm run verify:phase21-upcoming
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { addDays } from "../lib/dates";
import {
  eventGeoFocus,
  isBrusselsEvent,
  isFlandersEvent,
  isUpcomingStart,
  isWalloniaEvent,
  isWithinUpcomingWindow,
  selectUpcomingEvents,
  upcomingStickerLabel,
  upcomingUrgencyLabel,
  UPCOMING_MAX_COUNT,
  UPCOMING_WINDOW_DAYS,
} from "../lib/upcoming";
import type { Event } from "../types/event";
import { band } from "../types/event";

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

function mustInclude(rel: string, needle: string, label: string) {
  const src = fs.readFileSync(path.join(process.cwd(), rel), "utf8");
  assert.ok(src.includes(needle), `${label}: missing ${needle} in ${rel}`);
}

function mustNotInclude(rel: string, needle: string, label: string) {
  const src = fs.readFileSync(path.join(process.cwd(), rel), "utf8");
  assert.ok(!src.includes(needle), `${label}: unexpected ${needle} in ${rel}`);
}

function main() {
  assert.equal(isUpcomingStart(stub({ id: "1", slug: "a", startDate: TODAY }), TODAY), true);
  assert.equal(
    isUpcomingStart(stub({ id: "2", slug: "b", startDate: "2026-09-26" }), TODAY),
    false,
  );
  ok("1-3. future only; past excluded");

  assert.equal(
    isWithinUpcomingWindow(
      stub({ id: "3", slug: "c", startDate: addDays(TODAY, 13) }),
      TODAY,
      UPCOMING_WINDOW_DAYS,
    ),
    true,
  );
  assert.equal(
    isWithinUpcomingWindow(
      stub({ id: "4", slug: "d", startDate: addDays(TODAY, 15) }),
      TODAY,
      UPCOMING_WINDOW_DAYS,
    ),
    false,
  );
  ok("13. 14-day window");

  const empty = selectUpcomingEvents(
    [stub({ id: "far", slug: "far", startDate: addDays(TODAY, 30) })],
    NOW,
  );
  assert.equal(empty.events.length, 0);
  ok("empty when none in window");

  const catalog: Event[] = [
    stub({
      id: "a1",
      slug: "a1",
      title: "Apero Solo Mechelen",
      startDate: addDays(TODAY, 1),
      city: "Mechelen",
      region: "Antwerpen",
      activities: ["drinken"],
    }),
    stub({
      id: "g1",
      slug: "g1",
      title: "Wandeling Gent",
      startDate: addDays(TODAY, 2),
      city: "Gent",
      region: "Oost-Vlaanderen",
      latitude: 51.05,
      longitude: 3.72,
      distanceKm: 60,
      activities: ["wandelen"],
    }),
    stub({
      id: "bxl1",
      slug: "bxl1",
      title: "Dîner Dating Bruxelles",
      startDate: addDays(TODAY, 3),
      city: "Brussel",
      region: "Brussel",
      activities: ["eten"],
    }),
    stub({
      id: "wa1",
      slug: "wa1",
      title: "Dinner Namur",
      startDate: addDays(TODAY, 1),
      city: "Namur",
      region: "Namur",
      latitude: 50.47,
      longitude: 4.87,
      activities: ["eten"],
    }),
    stub({
      id: "sd1",
      slug: "sd1",
      title: "Speeddate Antwerpen",
      startDate: addDays(TODAY, 4),
      city: "Antwerpen",
      region: "Antwerpen",
      activities: ["speeddate"],
      eligibility: {
        default: band(50, 60, "strict"),
        byGender: null,
        allowedGenders: null,
      },
      eligibilityAgeMin: 50,
      eligibilityAgeMax: 60,
      eligibilityAgeRule: "strict",
    }),
  ];

  const base = selectUpcomingEvents(catalog, NOW);
  assert.ok(base.events.every((e) => e.slug !== "wa1"), "Wallonia not promoted");
  assert.ok(base.events.some((e) => e.slug === "a1"));
  assert.ok(base.events.some((e) => e.slug === "sd1"), "speeddate still allowed globally");
  ok("10-12. Flanders priority; Wallonia excluded; Brussels selective allowed");

  // Filter independence: same selection regardless of what *would* have been filters.
  // (API no longer accepts SearchState; prove catalog selection is stable.)
  const again = selectUpcomingEvents(catalog, NOW);
  assert.deepEqual(
    again.events.map((e) => e.slug),
    base.events.map((e) => e.slug),
  );
  ok("5. selection stable / independent of filters");

  // Location / age / activity would have changed old strip; new strip ignores them.
  // Prove via presence of far Gent + strict-age speeddate + drinken together.
  assert.ok(base.events.some((e) => e.city === "Gent"));
  assert.ok(base.events.some((e) => e.activities.includes("speeddate")));
  assert.ok(base.events.some((e) => e.activities.includes("drinken")));
  ok("6-9. location/age/activity do not gate strip (Gent + strict speeddate + apero)");

  assert.equal(isWalloniaEvent({ region: "Namur", city: "Namur" }), true);
  assert.equal(isFlandersEvent({ region: "Antwerpen", city: "Antwerpen" }), true);
  assert.equal(isBrusselsEvent({ region: "Brussel", city: "Brussel" }), true);
  assert.equal(eventGeoFocus({ region: "Brussel", city: "Brussel" }), "brussels");
  assert.equal(eventGeoFocus({ region: "Namur", city: "Namur" }), "wallonia");
  ok("geo classifiers");

  // Brussels soft cap when Flanders fills the strip
  const manyFl: Event[] = [];
  for (let i = 0; i < 8; i++) {
    manyFl.push(
      stub({
        id: `fl-${i}`,
        slug: `fl-${i}`,
        title: `Walk ${i}`,
        startDate: addDays(TODAY, i),
        city: "Antwerpen",
        region: "Antwerpen",
      }),
    );
  }
  manyFl.push(
    stub({
      id: "bxl-a",
      slug: "bxl-a",
      title: "BXL A",
      startDate: addDays(TODAY, 1),
      city: "Brussel",
      region: "Brussel",
    }),
    stub({
      id: "bxl-b",
      slug: "bxl-b",
      title: "BXL B",
      startDate: addDays(TODAY, 2),
      city: "Brussel",
      region: "Brussel",
    }),
    stub({
      id: "bxl-c",
      slug: "bxl-c",
      title: "BXL C",
      startDate: addDays(TODAY, 3),
      city: "Brussel",
      region: "Brussel",
    }),
  );
  const capped = selectUpcomingEvents(manyFl, NOW);
  assert.ok(capped.events.length <= UPCOMING_MAX_COUNT);
  assert.equal(
    capped.events.filter((e) => isBrusselsEvent(e)).length,
    0,
    "Flanders fills max; Brussels not inserted over Flanders",
  );
  ok("13. max item count + Flanders fills before Brussels");

  // When Flanders is thin, Brussels may appear (selectively, max 2)
  const thin = selectUpcomingEvents(
    [
      stub({
        id: "fl-only",
        slug: "fl-only",
        title: "Solo walk",
        startDate: addDays(TODAY, 1),
        city: "Leuven",
        region: "Vlaams-Brabant",
      }),
      stub({
        id: "bx1",
        slug: "bx1",
        title: "Dinner 1",
        startDate: addDays(TODAY, 2),
        city: "Brussel",
        region: "Brussel",
      }),
      stub({
        id: "bx2",
        slug: "bx2",
        title: "Dinner 2",
        startDate: addDays(TODAY, 3),
        city: "Brussel",
        region: "Brussel",
      }),
      stub({
        id: "bx3",
        slug: "bx3",
        title: "Dinner 3",
        startDate: addDays(TODAY, 4),
        city: "Brussel",
        region: "Brussel",
      }),
    ],
    NOW,
  );
  assert.ok(thin.events.some((e) => e.slug === "fl-only"));
  assert.equal(thin.events.filter((e) => isBrusselsEvent(e)).length, 2);
  ok("11. Brussels selective (max 2) when room remains");

  const travelStarted = selectUpcomingEvents(
    [
      stub({
        id: "t0",
        slug: "t0",
        startDate: "2026-09-25",
        endDate: "2026-09-30",
        city: "Antwerpen",
        region: "Antwerpen",
        activities: ["reizen", "weekend"],
      }),
      stub({
        id: "t1",
        slug: "t1",
        startDate: addDays(TODAY, 3),
        endDate: addDays(TODAY, 5),
        city: "Antwerpen",
        region: "Antwerpen",
        activities: ["reizen", "weekend"],
      }),
    ],
    NOW,
  );
  assert.ok(!travelStarted.events.some((e) => e.slug === "t0"));
  assert.ok(travelStarted.events.some((e) => e.slug === "t1"));
  ok("started travel excluded; future start included");

  assert.equal(upcomingUrgencyLabel(TODAY, TODAY), "Vandaag");
  assert.equal(upcomingUrgencyLabel(addDays(TODAY, 1), TODAY), "Morgen");
  assert.match(upcomingUrgencyLabel(addDays(TODAY, 3), TODAY), /^(ma|di|wo|do|vr|za|zo) /);
  assert.match(
    upcomingStickerLabel(
      stub({
        id: "lab",
        slug: "lab",
        title: "Wandeling Middelheim",
        city: "Antwerpen",
        startDate: addDays(TODAY, 3),
      }),
      TODAY,
    ),
    / · Wandeling Middelheim · Antwerpen$/,
  );
  assert.match(
    upcomingStickerLabel(
      stub({
        id: "lab2",
        slug: "lab2",
        title: "Apero Antwerpen",
        city: "Antwerpen",
        startDate: addDays(TODAY, 3),
      }),
      TODAY,
    ),
    / · Apero Antwerpen$/,
  );
  ok("14. date formatting + sticker label");

  const chrono = selectUpcomingEvents(
    [
      stub({
        id: "c2",
        slug: "c2",
        startDate: addDays(TODAY, 5),
        city: "Gent",
        region: "Oost-Vlaanderen",
      }),
      stub({
        id: "c1",
        slug: "c1",
        startDate: addDays(TODAY, 1),
        city: "Gent",
        region: "Oost-Vlaanderen",
      }),
      stub({
        id: "c3",
        slug: "c3",
        startDate: addDays(TODAY, 2),
        city: "Gent",
        region: "Oost-Vlaanderen",
      }),
    ],
    NOW,
  );
  assert.deepEqual(
    chrono.events.map((e) => e.slug),
    ["c1", "c3", "c2"],
  );
  ok("chronological sorting");

  // UI / a11y / no cards / no filter wiring
  mustInclude(
    "components/discover/discover-view.tsx",
    "UpcomingStrip",
    "discover wires upcoming strip",
  );
  mustInclude(
    "components/discover/discover-view.tsx",
    "selectUpcomingEvents(events)",
    "strip selection ignores search state",
  );
  mustNotInclude(
    "components/discover/discover-view.tsx",
    "selectUpcomingEvents(events, state)",
    "must not pass filters into strip",
  );
  mustInclude(
    "components/discover/upcoming-strip.tsx",
    "upcoming-marquee-track",
    "infinite auto-scroll marquee",
  );
  mustInclude(
    "components/discover/upcoming-strip.tsx",
    "overflow-hidden",
    "marquee hides scrollbar",
  );
  mustInclude(
    "components/discover/upcoming-strip.tsx",
    "binnenkort-heading",
    "semantic heading id",
  );
  mustInclude(
    "app/globals.css",
    "upcoming-marquee",
    "marquee animation styles",
  );
  mustInclude(
    "components/discover/upcoming-strip.tsx",
    "shrink-0",
    "sticker items do not collapse",
  );
  mustInclude(
    "components/discover/upcoming-strip.tsx",
    "hrefBase}/${event.slug",
    "link to event detail",
  );
  mustNotInclude(
    "components/discover/upcoming-strip.tsx",
    "EventVisual",
    "no images in sticker strip",
  );
  mustNotInclude(
    "lib/upcoming.ts",
    "matchingEvents",
    "no matchingEvents filter coupling",
  );
  assert.ok(
    !fs.existsSync(path.join(process.cwd(), "components/discover/upcoming-card.tsx")),
    "mini-card component removed",
  );
  assert.ok(
    !fs
      .readFileSync(path.join(process.cwd(), "lib/upcoming.ts"), "utf8")
      .includes("getEventsSql"),
    "no DB access in upcoming helper",
  );
  ok("15-18. sticker UI / links / a11y / no N+1 / no cards");

  console.log("\nOK: phase21.1 upcoming sticker verify.");
}

main();
