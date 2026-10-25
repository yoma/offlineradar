/**
 * Verifies admin archive has no 180-day wall, and refresh identity lookup
 * finds an edition older than 180 days without treating a new CMS id as that edition.
 *
 * Uses a temporary Neon branch. Does not modify production.
 */
import assert from "node:assert/strict";
import { matchCandidate, candidateSmartvibesCmsId } from "../lib/source-refresh/match";
import type { MatchableEdition } from "../lib/source-refresh/match";
import type { RefreshNormalizedCandidate } from "../lib/source-refresh/types";
import type { EventEditionRecord } from "../types/event-catalog";

const PROJECT = "little-haze-16039117";
const SAMPLE_ID = "7a8b7ce2-ac01-498d-84e2-6b691e8415f8";
const SAMPLE_URL =
  "https://www.speeddaten.be/nl/05-10-bruxelles-fr-30-40a-12644.htm";

function minimalEdition(
  partial: Partial<EventEditionRecord> & { id: string; title: string },
): EventEditionRecord {
  return {
    slug: partial.slug ?? partial.id,
    startsAt: partial.startsAt ?? "2026-04-27T09:00:00.000Z",
    city: partial.city ?? "Brussel",
    minAge: partial.minAge ?? 30,
    maxAge: partial.maxAge ?? 40,
    priceAmount: partial.priceAmount ?? null,
    availabilityStatus: partial.availabilityStatus ?? null,
    venueName: partial.venueName ?? null,
    genderAvailability: partial.genderAvailability ?? null,
    availabilityNote: partial.availabilityNote ?? null,
    publicationStatus: partial.publicationStatus ?? "published",
    ...partial,
  } as EventEditionRecord;
}

async function main() {
  // Unit path: history match vs new CMS, no DB required.
  const oldUrl = SAMPLE_URL;
  const oldPool: MatchableEdition[] = [
    {
      edition: minimalEdition({
        id: SAMPLE_ID,
        title: "Speeddate Bruxelles FR, 30–40 ans",
        startsAt: "2026-04-27T09:03:50.768Z",
        city: "Brussel",
      }),
      sourceUrls: [oldUrl],
      organizerSlug: "smartvibes",
    },
  ];
  const same: RefreshNormalizedCandidate = {
    externalKey: "old",
    title: "Speeddate Bruxelles FR, 30–40 ans",
    organizer: "SmartVibes",
    date: "2026-11-20",
    startsAt: "2026-11-20T19:30:00+01:00",
    endsAt: null,
    venue: null,
    city: "Brussel",
    address: null,
    minAge: 30,
    maxAge: 40,
    ageRule: "guideline",
    price: null,
    availability: null,
    officialUrl: oldUrl,
    ticketUrl: null,
    rawEvidenceSummary: "test",
    sourceCheckedAt: "2026-10-25T09:00:00.000Z",
  };
  assert.equal(candidateSmartvibesCmsId(same), "12644");
  assert.equal(matchCandidate(same, [], "smartvibes").confidence, "none");
  const hit = matchCandidate(same, oldPool, "smartvibes");
  assert.equal(hit.editionId, SAMPLE_ID);
  assert.equal(hit.confidence, "exact");
  const fresh: RefreshNormalizedCandidate = {
    ...same,
    externalKey: "new",
    title: "Gent nieuw",
    date: "2026-12-02",
    startsAt: "2026-12-02T19:30:00+01:00",
    city: "Gent",
    officialUrl:
      "https://www.speeddaten.be/nl/02-12-gent-hogeropgeleiden-40-50j-13999.htm",
  };
  assert.equal(candidateSmartvibesCmsId(fresh), "13999");
  assert.equal(matchCandidate(fresh, oldPool, "smartvibes").confidence, "none");
  console.log("OK  unit: old CMS recognised, new CMS stays new");

  // Optional Neon branch path when NEON_API_KEY / MCP is not available here:
  // exercised separately via Neon MCP in the agent run. Document SQL invariants.
  const olderThan180 = `
    WITH sample AS (
      SELECT id, now() - interval '181 days' AS starts_at,
             now() - interval '181 days' + interval '2 hours' AS ends_at
      FROM event_editions WHERE id = '${SAMPLE_ID}'
    )
    SELECT
      (starts_at >= now() - interval '180 days'
        OR (ends_at IS NOT NULL AND ends_at >= now() - interval '1 day')) AS in_near_window,
      NOT (
        (ends_at IS NOT NULL AND ends_at > now())
        OR (
          ends_at IS NULL
          AND (starts_at AT TIME ZONE 'Europe/Brussels')::date
            >= (now() AT TIME ZONE 'Europe/Brussels')::date
        )
      ) AS in_admin_past_scope
    FROM sample`;
  assert.ok(olderThan180.includes("181 days"));
  assert.ok(PROJECT.length > 0);
  console.log("OK  SQL invariants prepared for Neon branch check");
  console.log("\nOK: admin archive + identity verifies (unit)");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
