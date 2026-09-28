/**
 * Fase 24: upsert Source Map for Vlaamse gap discovery.
 * Does NOT publish events.
 * Usage: npm run seed:phase24-discovery
 */
import {
  assertOfflineRadarDbConfig,
  expectedNeonProjectId,
  getEventsSql,
} from "../lib/events/db";
import { upsertCatalogSourceByUrl } from "../lib/events/catalog-sources";
import { isUserSuppliedNotes } from "../lib/discovery/user-supplied";
import {
  PHASE24_NL_EXPANSION_NOTES,
  PHASE24_REJECTED,
  PHASE24_RESEARCHED,
  PHASE24_SOURCE_UPSERTS,
} from "../data/pilot/phase24-vlaamse-discovery";

async function main() {
  const check = assertOfflineRadarDbConfig();
  if (!check.ok) {
    console.error(`FAIL ${check.error}`);
    process.exit(1);
  }
  if (process.env.OFFLINERADAR_NEON_PROJECT_ID?.trim() !== expectedNeonProjectId()) {
    console.error(`FAIL project must be ${expectedNeonProjectId()}`);
    process.exit(1);
  }
  const sql = getEventsSql();
  if (!sql) {
    console.error("FAIL SQL unavailable");
    process.exit(1);
  }

  const tipBefore = await sql`SELECT count(*)::int AS n FROM tips`;
  const tipBeforeN = (tipBefore[0] as { n: number }).n;
  const publishedBefore = await sql`
    SELECT count(*)::int AS n FROM event_editions WHERE publication_status = 'published'
  `;
  const publishedBeforeN = (publishedBefore[0] as { n: number }).n;

  const userSourcesBefore = await sql`
    SELECT count(*)::int AS n FROM catalog_sources
    WHERE notes ILIKE '%discovered_by=user%'
  `;
  const userSourcesBeforeN = (userSourcesBefore[0] as { n: number }).n;

  let created = 0;
  let updated = 0;
  for (const seed of PHASE24_SOURCE_UPSERTS) {
    const result = await upsertCatalogSourceByUrl(seed);
    if (!result) throw new Error(`upsert failed ${seed.name}`);
    if (result.created) created += 1;
    else updated += 1;
    console.log(
      `${result.created ? "source+" : "source~"} ${seed.name} [${seed.status}]`,
    );
  }

  const userSourcesAfter = await sql`
    SELECT count(*)::int AS n FROM catalog_sources
    WHERE notes ILIKE '%discovered_by=user%'
  `;
  const userSourcesAfterN = (userSourcesAfter[0] as { n: number }).n;
  if (userSourcesAfterN < userSourcesBeforeN) {
    console.error(
      `FAIL user-supplied sources decreased ${userSourcesBeforeN} → ${userSourcesAfterN}`,
    );
    process.exit(1);
  }

  // Party4singles provenance must remain
  const party = await sql`
    SELECT notes FROM catalog_sources
    WHERE normalized_url LIKE '%party4singles.be%'
      AND name = 'Party4singles'
    LIMIT 1
  `;
  const partyNotes = (party[0] as { notes: string } | undefined)?.notes;
  if (!isUserSuppliedNotes(partyNotes)) {
    console.error("FAIL Party4singles discovered_by=user provenance missing");
    process.exit(1);
  }

  const tipAfter = await sql`SELECT count(*)::int AS n FROM tips`;
  const tipAfterN = (tipAfter[0] as { n: number }).n;
  if (tipAfterN !== tipBeforeN) {
    console.error(`FAIL tip count changed ${tipBeforeN} → ${tipAfterN}`);
    process.exit(1);
  }
  const publishedAfter = await sql`
    SELECT count(*)::int AS n FROM event_editions WHERE publication_status = 'published'
  `;
  const publishedAfterN = (publishedAfter[0] as { n: number }).n;
  if (publishedAfterN !== publishedBeforeN) {
    console.error("FAIL published count changed during source seed");
    process.exit(1);
  }

  console.log(
    JSON.stringify(
      {
        tipCount: tipAfterN,
        publishedTotal: publishedAfterN,
        sourcesCreated: created,
        sourcesUpdated: updated,
        userSuppliedSources: userSourcesAfterN,
        researched: PHASE24_RESEARCHED.length,
        rejectedNotStored: PHASE24_REJECTED.length,
        nlExpansionNotes: PHASE24_NL_EXPANSION_NOTES.length,
      },
      null,
      2,
    ),
  );
  console.log("\nOK: phase24 discovery Source Map seed (no publish).");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
