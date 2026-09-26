/**
 * Fase 20: upsert Source Map for Leuven/Limburg/FR discovery gaps.
 * Does NOT publish events.
 * Usage: npm run seed:phase20-discovery
 */
import {
  assertOfflineRadarDbConfig,
  expectedNeonProjectId,
  getEventsSql,
} from "../lib/events/db";
import { upsertCatalogSourceByUrl } from "../lib/events/catalog-sources";
import {
  PHASE20_REJECTED,
  PHASE20_RESEARCHED,
  PHASE20_SOURCE_UPSERTS,
} from "../data/pilot/phase20-discovery-gaps";

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
  for (const seed of PHASE20_SOURCE_UPSERTS) {
    const result = await upsertCatalogSourceByUrl(seed);
    if (!result) throw new Error(`upsert failed ${seed.name}`);
    if (result.created) created += 1;
    else updated += 1;
    console.log(
      `${result.created ? "source+" : "source~"} ${seed.name} [${seed.status}]`,
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

  console.log(
    JSON.stringify(
      {
        tipCount: tipAfterN,
        publishedTotal: publishedAfterN,
        sourcesCreated: created,
        sourcesUpdated: updated,
        researched: PHASE20_RESEARCHED.length,
        rejectedNotStored: PHASE20_REJECTED.length,
      },
      null,
      2,
    ),
  );
  console.log("\nOK: phase20 discovery Source Map seed (no publish).");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
