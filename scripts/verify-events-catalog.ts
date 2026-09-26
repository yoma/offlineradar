/**
 * Unit tests for events catalog adapter + SQL split (no paid APIs).
 * Neon integration: scripts/verify-events-neon.ts
 */
import assert from "node:assert/strict";
import { mapEditionToConsumerEvent } from "@/lib/events/map-to-consumer";
import { mapConsumerEventToCatalogDraft } from "@/lib/events/from-preview";
import { splitSqlStatements } from "@/lib/events/sql-split";
import type { EventEditionBundle } from "@/types/event-catalog";
import { band } from "@/types/event";
import { readFileSync } from "node:fs";
import path from "node:path";

function ok(name: string) {
  console.log(`ok  ${name}`);
}

function sampleBundle(
  overrides: Partial<EventEditionBundle["edition"]> = {},
): EventEditionBundle {
  const edition = {
    id: "11111111-1111-1111-1111-111111111111",
    slug: "test-speeddate-antwerpen",
    organizerId: "22222222-2222-2222-2222-222222222222",
    seriesId: null,
    title: "Speeddate Antwerpen",
    startsAt: "2026-10-12T17:30:00.000Z",
    endsAt: null,
    timezone: "Europe/Brussels",
    venueName: "Fidèle",
    address: "Wapenstraat 18",
    city: "Antwerpen",
    postalCode: "2000",
    region: "Antwerpen",
    country: "BE",
    latitude: 51.2194,
    longitude: 4.4025,
    eligibilityRoute: "route_a" as const,
    singlesOriented: true,
    singlesOnly: false,
    singlesOnlyEvidence: null,
    meetFormula: null,
    meetFormulaEvidence: null,
    minAge: 53,
    maxAge: 65,
    ageRule: "guideline" as const,
    eligibilityJson: null,
    category: "dating" as const,
    subCategory: "speeddate",
    activities: ["drinken" as const],
    tags: ["speeddate"],
    priceAmount: 29,
    priceCurrency: "EUR",
    priceNote: null,
    priceIsFrom: false,
    availabilityStatus: "available" as const,
    spotsRemaining: null,
    bookingDeadline: null,
    availabilityNote: null,
    shortDescription: "Speeddate voor singles.",
    description: null,
    internalNotes: null,
    practicalInfo: [],
    publicationStatus: "approved" as const,
    approvedAt: "2026-09-26T10:00:00.000Z",
    publishedAt: null,
    rejectedAt: null,
    expiredAt: null,
    lastCheckedAt: "2026-09-26T10:00:00.000Z",
    sourceCheckedAt: "2026-09-26T10:00:00.000Z",
    nextCheckAt: null,
    socialSuitability: "high" as const,
    genderAvailability: null,
    startTimeDisplayNote: null,
    knownAudienceGenders: null,
    preferredAudienceAgeMin: null,
    preferredAudienceAgeMax: null,
    audienceAgeFromSource: false,
    createdAt: "2026-09-26T09:00:00.000Z",
    updatedAt: "2026-09-26T09:00:00.000Z",
    ...overrides,
  };

  return {
    edition,
    organizer: {
      id: edition.organizerId!,
      slug: "speeddaten-be",
      name: "Speeddaten.be",
      websiteUrl: "https://www.speeddaten.be",
      createdAt: edition.createdAt,
      updatedAt: edition.updatedAt,
    },
    series: null,
    sources: [
      {
        id: "33333333-3333-3333-3333-333333333333",
        eventEditionId: edition.id,
        sourceType: "official_event",
        sourceName: "Speeddaten Antwerpen",
        url: "https://www.speeddaten.be/nl/antwerpen-8217.htm",
        normalizedUrl: "https://www.speeddaten.be/nl/antwerpen-8217.htm",
        isPrimary: true,
        checkedAt: edition.lastCheckedAt,
        evidenceNote: null,
        createdAt: edition.createdAt,
      },
      {
        id: "44444444-4444-4444-4444-444444444444",
        eventEditionId: edition.id,
        sourceType: "ticket",
        sourceName: null,
        url: "https://www.speeddaten.be/tickets",
        normalizedUrl: "https://www.speeddaten.be/tickets",
        isPrimary: false,
        checkedAt: null,
        evidenceNote: null,
        createdAt: edition.createdAt,
      },
    ],
    images: [
      {
        id: "55555555-5555-5555-5555-555555555555",
        eventEditionId: edition.id,
        urlOrPath: "/preview-mood/speeddate.png",
        imageType: "mood",
        sourceUrl: null,
        rightsNote: "Sfeerbeeld",
        isPrimary: true,
        altText: "Sfeerbeeld speeddate",
        createdAt: edition.createdAt,
      },
    ],
  };
}

function main() {
  {
    const sql = readFileSync(
      path.join(process.cwd(), "db/migrations/20260926_events_catalog_v1.sql"),
      "utf8",
    );
    assert.match(sql, /CREATE TABLE IF NOT EXISTS organizers/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS event_editions/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS event_sources/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS event_images/);
    assert.doesNotMatch(sql, /DROP TABLE\s+tips/i);
    assert.doesNotMatch(sql, /ALTER TABLE\s+tips/i);
    const statements = splitSqlStatements(sql);
    assert.ok(statements.length >= 10);
    ok("migration SQL present and tip-safe");
  }

  {
    const event = mapEditionToConsumerEvent(sampleBundle());
    assert.equal(event.slug, "test-speeddate-antwerpen");
    assert.equal(event.eligibilityAgeRule, "guideline");
    assert.equal(event.singlesOnly, false);
    assert.equal(event.singlesOriented, true);
    assert.equal(event.listingPath, "organic");
    assert.equal(event.officialUrl.includes("speeddaten.be"), true);
    assert.equal(event.ticketUrl?.includes("tickets"), true);
    assert.equal(event.imageIsAtmosphere, true);
    assert.equal(event.lastCheckedAt, "2026-09-26T10:00:00.000Z");
    assert.equal(event.startDate, "2026-10-12");
    assert.ok(event.startTime);
    ok("DB bundle → consumer Event mapping");
  }

  {
    const approved = mapEditionToConsumerEvent(
      sampleBundle({ publicationStatus: "approved", publishedAt: null }),
    );
    assert.ok(approved);
    // Adapter itself does not enforce publication; callers must filter.
    const publishedOnly = [sampleBundle({ publicationStatus: "approved" })]
      .filter((b) => b.edition.publicationStatus === "published")
      .map(mapEditionToConsumerEvent);
    assert.equal(publishedOnly.length, 0);
    ok("approved is not treated as published by list filter");
  }

  {
    const routeB = mapEditionToConsumerEvent(
      sampleBundle({
        eligibilityRoute: "route_b",
        singlesOriented: null,
        meetFormula: "singles meet zone",
      }),
    );
    assert.equal(routeB.listingPath, "meet_activation");
    assert.equal(routeB.meetActivation, null);
    ok("Route B maps to meet_activation listingPath");
  }

  {
    for (const rule of ["strict", "guideline", "unknown"] as const) {
      const mapped = mapEditionToConsumerEvent(
        sampleBundle({
          ageRule: rule,
          eligibilityJson: {
            default: band(40, 50, rule),
            byGender: null,
            allowedGenders: null,
          },
        }),
      );
      assert.equal(mapped.eligibilityAgeRule, rule);
      assert.equal(mapped.eligibility.default?.ageRule, rule);
    }
    ok("ageRule strict/guideline/unknown preserved");
  }

  {
    for (const value of [true, false, null] as const) {
      const mapped = mapEditionToConsumerEvent(
        sampleBundle({ singlesOnly: value }),
      );
      assert.equal(mapped.singlesOnly, value);
    }
    ok("singlesOnly true/false/null preserved");
  }

  {
    const previewLike = mapEditionToConsumerEvent(sampleBundle());
    const draft = mapConsumerEventToCatalogDraft(previewLike);
    assert.equal(draft.edition.publicationStatus, "draft");
    assert.equal(draft.edition.publishedAt, null);
    assert.equal(draft.edition.eligibilityRoute, "route_a");
    assert.ok(draft.sources.length >= 1);
    assert.ok(draft.images.length >= 1);
    ok("preview Event → catalog draft (no persist, not published)");
  }

  {
    const withJson = mapEditionToConsumerEvent(
      sampleBundle({
        eligibilityJson: {
          default: null,
          byGender: {
            man: band(30, 45, "strict"),
            woman: band(28, 42, "strict"),
          },
          allowedGenders: ["man", "woman"],
        },
      }),
    );
    assert.ok(withJson.eligibility.byGender?.man);
    assert.equal(withJson.eligibility.byGender?.man?.ageRule, "strict");
    ok("eligibility_json byGender maps through");
  }

  console.log("\nOK: events catalog unit invariants.");
}

main();
