/**
 * Fase 14: upsert discovery Source Map + user-supplied provenance.
 * Does NOT publish events.
 * Usage: npm run seed:phase14-discovery
 */
import {
  assertOfflineRadarDbConfig,
  expectedNeonProjectId,
  getEventsSql,
} from "../lib/events/db";
import { upsertCatalogSourceByUrl } from "../lib/events/catalog-sources";
import {
  PHASE14_REJECTED,
  PHASE14_RESEARCHED_CANDIDATE_NAMES,
  PHASE14_SOURCE_UPSERTS,
  PHASE14_USER_SUPPLIED_AUDIT,
} from "../data/pilot/phase14-discovery-sources";
import { isUserSuppliedNotes } from "../lib/discovery/user-supplied";

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

  let created = 0;
  let updated = 0;
  for (const seed of PHASE14_SOURCE_UPSERTS) {
    const result = await upsertCatalogSourceByUrl(seed);
    if (!result) throw new Error(`upsert failed ${seed.name}`);
    if (result.created) created += 1;
    else updated += 1;
    console.log(
      `${result.created ? "source+" : "source~"} ${seed.name} [${seed.status}] user=${isUserSuppliedNotes(seed.notes)}`,
    );
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
    console.error("FAIL published count changed (no auto-publish expected)");
    process.exit(1);
  }

  const userRows = await sql`
    SELECT count(*)::int AS n FROM catalog_sources
    WHERE notes ILIKE '%discovered_by=user%'
       OR notes ILIKE '%source_origin=user_supplied%'
       OR notes ILIKE '%door youri aangebracht%'
  `;

  console.log(
    JSON.stringify(
      {
        tipCount: tipAfterN,
        publishedTotal: publishedAfterN,
        sourcesCreated: created,
        sourcesUpdated: updated,
        userSuppliedTagged: (userRows[0] as { n: number }).n,
        userSuppliedAudit: PHASE14_USER_SUPPLIED_AUDIT.length,
        researchedCandidates: PHASE14_RESEARCHED_CANDIDATE_NAMES.length,
        rejectedNotStored: PHASE14_REJECTED.length,
      },
      null,
      2,
    ),
  );
  console.log("\nOK: phase14 discovery Source Map seed (no publish).");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
