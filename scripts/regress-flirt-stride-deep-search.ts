/**
 * Live regression: Flirt & Stride – The Breakfast Edition deep search.
 * Requires OFFLINERADAR_DATABASE_URL; ANTHROPIC_API_KEY strongly preferred.
 *
 * Usage: node --env-file=.env.local --import tsx scripts/regress-flirt-stride-deep-search.ts
 */
import assert from "node:assert/strict";
import {
  buildDeepSearchQueries,
  runDeepVerification,
} from "../lib/aanvoer/deep-verify";
import { blankProposal } from "../lib/aanvoer/types";
import { getEventsSql } from "../lib/events/db";

async function main() {
  const proposal = blankProposal({
    title: {
      value: "Flirt & Stride – The Breakfast Edition",
      status: "found",
      evidence: "catalog",
    },
    organizer: {
      value: "Flirt & Stride",
      status: "found",
      evidence: "catalog",
    },
    city: { value: "Gent", status: "uncertain", evidence: "partial" },
    venue: { value: null, status: "unknown", evidence: null },
    startDate: { value: null, status: "unknown", evidence: null },
    startTime: { value: null, status: "unknown", evidence: null },
    endTime: { value: null, status: "unknown", evidence: null },
    singlesOriented: {
      value: "true",
      status: "found",
      evidence: "singles running",
    },
    routeAdvice: "route_a",
    routeReason: "singles breakfast run",
    sourceUrl: {
      value: "https://www.instagram.com/flirtandstride/",
      status: "found",
      evidence: "known social",
    },
    sourceKindHint: "social_first",
    needsSourceVerification: true,
  });

  const queries = buildDeepSearchQueries(proposal);
  console.log("queries:", queries);

  const deep = await runDeepVerification({
    proposal,
    seedUrl: proposal.sourceUrl.value,
    force: true,
  });

  console.log(
    JSON.stringify(
      {
        outcome: deep.report.outcome,
        outcomeMessage: deep.report.outcomeMessage,
        searchResultCount: deep.report.searchResultCount,
        queries: deep.report.queries,
        sourcesChecked: deep.report.sourcesChecked,
        fieldsConfirmed: deep.report.fieldsConfirmed,
        fieldsAfter: deep.report.fieldsAfter,
        startDate: deep.proposal.startDate,
        startTime: deep.proposal.startTime,
        endTime: deep.proposal.endTime,
        city: deep.proposal.city,
        venue: deep.proposal.venue,
        singlesOriented: deep.proposal.singlesOriented,
      },
      null,
      2,
    ),
  );

  assert.equal(
    deep.proposal.startDate.value,
    "2026-10-10",
    `expected date 2026-10-10, got ${deep.proposal.startDate.value}`,
  );
  assert.ok(
    deep.proposal.startTime.value?.startsWith("09:00"),
    `expected start 09:00, got ${deep.proposal.startTime.value}`,
  );
  if (deep.proposal.endTime.value) {
    assert.ok(
      deep.proposal.endTime.value.startsWith("12:30"),
      `expected end 12:30, got ${deep.proposal.endTime.value}`,
    );
  }
  assert.match(deep.proposal.city.value ?? "", /gent/i);
  assert.match(
    `${deep.proposal.venue.value ?? ""} ${deep.proposal.location.value ?? ""}`,
    /alix|amis/i,
  );

  const sql = getEventsSql();
  if (sql) {
    const rows = (await sql`
      SELECT id, tags FROM event_editions
      WHERE title ILIKE '%Flirt%Stride%Breakfast%'
      ORDER BY updated_at DESC
      LIMIT 2
    `) as { id: string; tags: unknown }[];
    const venue =
      deep.proposal.venue.value ?? "Alix – Maison d'Amis";
    const city = deep.proposal.city.value ?? "Gent";
    const stamp = [
      `deep_rescan_at=${deep.report.completedAt}`,
      `deep_scan_outcome=${deep.report.outcome}`,
      `deep_scan_queries=${deep.report.queries.join(" || ")}`,
    ].join("\n");
    for (const row of rows) {
      const tags = Array.isArray(row.tags)
        ? row.tags.filter((t) => t !== "date_unknown")
        : [];
      const existing = (await sql`
        SELECT coalesce(internal_notes, '') AS notes
        FROM event_editions WHERE id = ${row.id}::uuid LIMIT 1
      `) as { notes: string }[];
      const nextNotes = `${existing[0]?.notes ?? ""}\n${stamp}`.trim();
      await sql`
        UPDATE event_editions SET
          starts_at = ${"2026-10-10T09:00:00+02:00"}::timestamptz,
          city = ${city},
          venue_name = ${venue},
          singles_oriented = ${true},
          tags = ${JSON.stringify(tags)}::jsonb,
          internal_notes = ${nextNotes},
          updated_at = now()
        WHERE id = ${row.id}::uuid
      `;
      console.log("updated edition", row.id);
    }
  }

  console.log("\nPASS Flirt & Stride deep search regression");
}

main().catch((err) => {
  console.error("FAIL", err);
  process.exit(1);
});
