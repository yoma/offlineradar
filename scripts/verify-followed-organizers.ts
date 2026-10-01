/**
 * FASE 26.14 followed organizers — structural + unit checks.
 * Usage: npm run verify:followed-organizers
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  applyResultRefinement,
  defaultResultRefinement,
  FOLLOWED_ORGANIZERS_FILTER,
  organizersFromEvents,
  parseResultRefinement,
  serializeResultRefinement,
} from "../lib/result-refinement";
import type { Event } from "../types/event";
import { band } from "../types/event";

function ok(name: string) {
  console.log(`ok  ${name}`);
}

function mustInclude(rel: string, needle: string) {
  const src = fs.readFileSync(path.join(process.cwd(), rel), "utf8");
  assert.ok(src.includes(needle), `missing ${needle} in ${rel}`);
}

function mustNotInclude(rel: string, needle: string) {
  const src = fs.readFileSync(path.join(process.cwd(), rel), "utf8");
  assert.ok(!src.includes(needle), `unexpected ${needle} in ${rel}`);
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
    organizerName: partial.organizerName ?? "Org",
    organizerId: partial.organizerId ?? null,
    organizerSlug: partial.organizerSlug ?? null,
    city: partial.city ?? "Antwerpen",
    region: "Antwerpen",
    venue: null,
    venueId: null,
    latitude: 51.22,
    longitude: 4.4,
    distanceKm: 5,
    endDate: null,
    startTime: "19:00",
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
    addedAt: "2026-09-01T12:00:00.000Z",
    imageUrl: null,
    imageAlt: null,
    tags: [],
    activities: [],
    practicalInfo: [],
    ...partial,
  };
}

const events = [
  stub({
    id: "a",
    slug: "p4s",
    title: "Party4singles Night",
    organizerName: "Party4singles",
    organizerId: "id-p4s",
    organizerSlug: "party4singles",
    startDate: "2026-10-10",
  }),
  stub({
    id: "b",
    slug: "tomeeto-1",
    title: "Tomeeto diner",
    organizerName: "Tomeeto",
    organizerId: "id-tomeeto",
    organizerSlug: "tomeeto",
    startDate: "2026-10-11",
  }),
  stub({
    id: "c",
    slug: "p4s-2",
    title: "Another P4S",
    organizerName: "Party4singles",
    organizerId: "id-p4s",
    organizerSlug: "party4singles",
    startDate: "2026-10-12",
  }),
];

const options = organizersFromEvents(events);
assert.equal(options.length, 2);
assert.deepEqual(
  options.map((o) => o.slug).sort(),
  ["party4singles", "tomeeto"],
);
ok("1 organizer options dedupe by id");

const filtered = applyResultRefinement(
  events,
  { ...defaultResultRefinement(), organizer: "party4singles" },
  "2026-10-01",
);
assert.equal(filtered.length, 2);
ok("2 organizer slug filter");

const followed = applyResultRefinement(
  events,
  { ...defaultResultRefinement(), organizer: FOLLOWED_ORGANIZERS_FILTER },
  "2026-10-01",
  { followedOrganizerIds: ["id-tomeeto"] },
);
assert.deepEqual(
  followed.map((e) => e.id),
  ["b"],
);
ok("3 followed filter");

const params = serializeResultRefinement({
  ...defaultResultRefinement(),
  organizer: "party4singles",
});
assert.equal(params.get("organizer"), "party4singles");
assert.equal(parseResultRefinement(params).organizer, "party4singles");
ok("4 organizer URL state");

mustInclude(
  "db/migrations/20261001_user_followed_organizers_v1.sql",
  "user_followed_organizers",
);
mustInclude(
  "db/migrations/20261001_user_followed_organizers_v1.sql",
  "ON DELETE CASCADE",
);
mustInclude("lib/users/store.ts", "setFollowedOrganizer");
mustInclude("app/account/actions.ts", "toggleFollowOrganizerAction");
mustInclude("components/events/follow-organizer-button.tsx", "Volg");
mustInclude(
  "components/discover/result-refinement.tsx",
  "Zoek op event, organisator of plaats",
);
mustInclude(
  "components/discover/result-refinement.tsx",
  "Organisatoren die ik volg",
);
mustInclude("components/account/account-view.tsx", "Organisatoren die je volgt");
mustNotInclude("components/discover/result-refinement.tsx", "catalog_sources");
mustNotInclude("app/account/actions.ts", "clientUserId");
ok("5 structural strings");

console.log("\nAll followed-organizers checks passed.");
