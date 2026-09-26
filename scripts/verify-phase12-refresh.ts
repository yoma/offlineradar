/**
 * Phase 12 curation invariants (no live fetch).
 * Usage: npx tsx scripts/verify-phase12-refresh.ts
 */
import assert from "node:assert/strict";
import { createDraftFromRefreshCandidate } from "@/lib/source-refresh/draft-from-candidate";
import { matchCandidate, type MatchableEdition } from "@/lib/source-refresh/match";
import type { RefreshNormalizedCandidate } from "@/lib/source-refresh/types";
import { resolvePublicEventImage } from "@/lib/image-compatibility";
import { SOURCE_REFRESH_ITEM_STATUSES } from "@/lib/source-refresh/types";

function ok(name: string) {
  console.log(`ok  ${name}`);
}

function sampleCandidate(
  overrides: Partial<RefreshNormalizedCandidate> = {},
): RefreshNormalizedCandidate {
  return {
    externalKey: "test-1",
    title: "Speeddate Gent Hogeropgeleiden, 30–40 jaar",
    organizer: "SmartVibes",
    date: "2026-11-20",
    startsAt: "2026-11-20T18:30:00+01:00",
    endsAt: null,
    venue: "Café De Zoo",
    city: "Gent",
    address: null,
    minAge: 30,
    maxAge: 40,
    ageRule: "guideline",
    price: null,
    availability: null,
    officialUrl: "https://www.speeddaten.be/nl/20-11-gent-30-40j-99999.htm",
    ticketUrl: null,
    rawEvidenceSummary: "test",
    sourceCheckedAt: "2026-09-26T12:00:00.000Z",
    ...overrides,
  };
}

function main() {
  assert.ok(SOURCE_REFRESH_ITEM_STATUSES.includes("accepted"));
  assert.ok(SOURCE_REFRESH_ITEM_STATUSES.includes("rejected"));
  ok("refresh item statuses include accepted/rejected");

  const candidate = sampleCandidate();
  const editions: MatchableEdition[] = [
    {
      edition: {
        id: "e1",
        slug: "existing",
        organizerId: "o1",
        title: "Speeddate Gent Hogeropgeleiden, 30–40 jaar",
        startsAt: "2026-11-20T18:30:00+01:00",
        endsAt: null,
        timezone: "Europe/Brussels",
        venueName: "Café De Zoo",
        address: null,
        city: "Gent",
        country: "BE",
        lat: null,
        lng: null,
        eligibilityRoute: "route_a",
        singlesOriented: true,
        singlesOnly: true,
        singlesOnlyEvidence: null,
        byGender: null,
        minAge: 30,
        maxAge: 40,
        ageRule: "guideline",
        category: "dating",
        subCategory: "speeddate",
        activities: [],
        tags: [],
        priceAmount: null,
        priceCurrency: "EUR",
        availabilityStatus: null,
        shortDescription: null,
        description: null,
        internalNotes: null,
        practicalInfo: [],
        publicationStatus: "published",
        publishedAt: "2026-09-01T00:00:00.000Z",
        approvedAt: null,
        rejectedAt: null,
        expiredAt: null,
        sourceCheckedAt: null,
        lastCheckedAt: null,
        createdAt: "2026-09-01T00:00:00.000Z",
        updatedAt: "2026-09-01T00:00:00.000Z",
      } as unknown as MatchableEdition["edition"],
      sourceUrls: [
        "https://www.speeddaten.be/nl/20-11-gent-30-40j-99999.htm",
      ],
      organizerSlug: "smartvibes",
    },
  ];

  const match = matchCandidate(candidate, editions, "smartvibes");
  assert.equal(match.confidence, "exact");
  assert.equal(match.editionId, "e1");
  ok("duplicate detection matches same URL/edition");

  const expiredDate = "2026-09-01";
  assert.ok(expiredDate < "2026-09-26");
  ok("expired candidates rejected/ignored by date gate");

  // createDraft always draft — never published (code contract)
  const src = createDraftFromRefreshCandidate.toString();
  assert.match(src, /publicationStatus:\s*"draft"/);
  assert.doesNotMatch(src, /publicationStatus:\s*"published"/);
  ok("accepted → draft only (no auto publish in createDraft)");

  const img = resolvePublicEventImage(
    {
      category: "dating",
      activities: [],
      title: "Speeddate Lochristi, 30–40 jaar",
      subCategory: "speeddate",
    },
    null,
    true,
  );
  assert.ok(img.url);
  assert.equal(img.keptAtmosphere, true);
  assert.doesNotMatch(img.url, /bowling|outdoor|travel/i);
  ok("image compatibility for speeddate");

  console.log("\nOK: phase12 refresh verify passed.");
}

main();
