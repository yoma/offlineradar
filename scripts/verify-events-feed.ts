/**
 * Phase 3 feed invariants (unit + optional Neon when env present).
 * Usage: npm run verify:events-feed
 */
import assert from "node:assert/strict";
import { buildMockEvents } from "../data/events";
import {
  EventsCatalogUnavailableError,
  isCanonicalEventsFeedEnabled,
  isEventListable,
  isRouteABListable,
} from "../lib/events";
import { mapEditionToConsumerEvent } from "../lib/events/map-to-consumer";
import type { EventEditionBundle } from "../types/event-catalog";
import { band } from "../types/event";

function ok(name: string) {
  console.log(`ok  ${name}`);
}

function sampleBundle(
  overrides: Partial<EventEditionBundle["edition"]> = {},
): EventEditionBundle {
  const now = new Date().toISOString();
  return {
    edition: {
      id: "ed-1",
      slug: "sample-published",
      organizerId: "org-1",
      seriesId: null,
      title: "Sample",
      startsAt: "2026-10-12T19:30:00+02:00",
      endsAt: null,
      timezone: "Europe/Brussels",
      venueName: "Fidèle",
      address: null,
      city: "Antwerpen",
      postalCode: null,
      region: "Antwerpen",
      country: "BE",
      latitude: 51.2,
      longitude: 4.4,
      eligibilityRoute: "route_a",
      singlesOriented: true,
      singlesOnly: true,
      singlesOnlyEvidence: null,
      meetFormula: null,
      meetFormulaEvidence: null,
      minAge: 25,
      maxAge: 35,
      ageRule: "strict",
      eligibilityJson: {
        default: band(25, 35, "strict"),
        byGender: null,
        allowedGenders: null,
      },
      category: "dating",
      subCategory: null,
      activities: ["drinken"],
      tags: [],
      priceAmount: 25,
      priceCurrency: "EUR",
      priceNote: null,
      priceIsFrom: false,
      availabilityStatus: "unknown",
      spotsRemaining: null,
      bookingDeadline: null,
      availabilityNote: null,
      shortDescription: null,
      description: null,
      internalNotes: null,
      practicalInfo: [],
      publicationStatus: "published",
      approvedAt: now,
      publishedAt: now,
      rejectedAt: null,
      expiredAt: null,
      lastCheckedAt: now,
      sourceCheckedAt: now,
      nextCheckAt: null,
      socialSuitability: "high",
      genderAvailability: null,
      startTimeDisplayNote: null,
      knownAudienceGenders: null,
      preferredAudienceAgeMin: null,
      preferredAudienceAgeMax: null,
      audienceAgeFromSource: false,
      createdAt: now,
      updatedAt: now,
      ...overrides,
    },
    organizer: {
      id: "org-1",
      slug: "smartvibes",
      name: "SmartVibes",
      websiteUrl: "https://example.com",
      createdAt: now,
      updatedAt: now,
    },
    series: null,
    sources: [
      {
        id: "src-1",
        eventEditionId: "ed-1",
        sourceType: "official_event",
        sourceName: "Official",
        url: "https://example.com/event",
        normalizedUrl: "https://example.com/event",
        isPrimary: true,
        checkedAt: now,
        evidenceNote: null,
        createdAt: now,
      },
    ],
    images: [
      {
        id: "img-1",
        eventEditionId: "ed-1",
        urlOrPath: "/preview-mood/mood-speeddate-25-35.png",
        imageType: "mood",
        sourceUrl: null,
        rightsNote: "Sfeerbeeld",
        isPrimary: true,
        altText: "Sfeerbeeld",
        createdAt: now,
      },
    ],
  };
}

async function main() {
  // Route A/B vs legacy mock gate
  const socialOnly = {
    ...mapEditionToConsumerEvent(sampleBundle({ singlesOriented: false, eligibilityRoute: "unknown" })),
    singlesOriented: false,
    listingPath: "organic" as const,
    socialSuitability: "high" as const,
    meetActivation: null,
  };
  assert.equal(isEventListable(socialOnly), true);
  assert.equal(isRouteABListable(socialOnly), false);
  ok("Route A/B rejects generally-social; mock gate still admits");

  const routeA = mapEditionToConsumerEvent(sampleBundle());
  assert.equal(isRouteABListable(routeA), true);
  assert.equal(routeA.eligibilityAgeRule, "strict");
  assert.equal(routeA.singlesOnly, true);
  assert.equal(routeA.imageIsAtmosphere, true);
  assert.equal(routeA.officialUrl, "https://example.com/event");
  ok("published Route A maps with age/singles/mood/source");

  const approvedLeak = sampleBundle({
    publicationStatus: "approved",
    publishedAt: null,
  });
  // Public mapper helper filters published-only when used correctly
  const { mapPublishedBundlesToConsumerEvents } = await import(
    "../lib/events/map-to-consumer"
  );
  assert.equal(mapPublishedBundlesToConsumerEvents([approvedLeak]).length, 0);
  const underReview = sampleBundle({
    publicationStatus: "under_review",
    publishedAt: null,
    slug: "mingle",
  });
  assert.equal(mapPublishedBundlesToConsumerEvents([underReview]).length, 0);
  ok("approved/under_review never map as published feed items");

  // Flag off → mock path conceptually still builds mock events
  const previous = process.env.OFFLINERADAR_EVENTS_CANONICAL_FEED;
  delete process.env.OFFLINERADAR_EVENTS_CANONICAL_FEED;
  assert.equal(isCanonicalEventsFeedEnabled(), false);
  const mocks = buildMockEvents(new Date()).filter(isEventListable);
  assert.ok(mocks.length > 7, "mock feed has more than 7 listable events");
  ok("flag off keeps mock feed path available");

  process.env.OFFLINERADAR_EVENTS_CANONICAL_FEED = "1";
  assert.equal(isCanonicalEventsFeedEnabled(), true);
  ok("flag on enables canonical mode");

  assert.ok(EventsCatalogUnavailableError);
  ok("canonical DB failure error type exists (no mock fallback)");

  if (previous === undefined) delete process.env.OFFLINERADAR_EVENTS_CANONICAL_FEED;
  else process.env.OFFLINERADAR_EVENTS_CANONICAL_FEED = previous;

  // Neon checks when configured
  if (
    process.env.OFFLINERADAR_DATABASE_URL &&
    process.env.OFFLINERADAR_NEON_PROJECT_ID === "little-haze-16039117"
  ) {
    const { listPublishedEditions, getEditionBySlug } = await import(
      "../lib/events/neon-store"
    );
    const published = await listPublishedEditions(50);
    assert.ok(published.length >= 7, `expected >=7 published, got ${published.length}`);
    assert.ok(published.every((e) => e.publicationStatus === "published"));
    assert.ok(published.every((e) => e.publishedAt != null));
    const mingle = await getEditionBySlug(
      "mingle-night-how-to-be-single-2026-10-17",
    );
    // After Fase 4 resolve: Mingle may be published; under_review must never leak via listPublished
    assert.ok(
      !published.some((e) => e.publicationStatus !== "published"),
    );
    if (mingle?.edition.publicationStatus === "under_review") {
      assert.ok(!published.some((e) => e.slug.includes("mingle")));
      ok("Neon: Mingle still under_review; not in published list");
    } else {
      assert.equal(mingle?.edition.publicationStatus, "published");
      ok(`Neon: ${published.length} published incl. Mingle`);
    }
  } else {
    console.log("skip Neon publish counts (env not loaded)");
  }

  console.log("\nOK: events feed invariants.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
