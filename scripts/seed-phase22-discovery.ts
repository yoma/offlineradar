/**
 * Fase 22: upsert Source Map (Party4singles user lead + Vlaamse yield notes).
 * Does NOT publish events.
 * Usage: npm run seed:phase22-discovery
 */
import {
  assertOfflineRadarDbConfig,
  expectedNeonProjectId,
  getEventsSql,
} from "../lib/events/db";
import { upsertCatalogSourceByUrl } from "../lib/events/catalog-sources";
import {
  PHASE22_REJECTED,
  PHASE22_RESEARCHED,
  PHASE22_SOURCE_UPSERTS,
} from "../data/pilot/phase22-party4singles-discovery";
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
  for (const seed of PHASE22_SOURCE_UPSERTS) {
    const result = await upsertCatalogSourceByUrl(seed);
    if (!result) throw new Error(`upsert failed ${seed.name}`);
    if (result.created) created += 1;
    else updated += 1;
    console.log(
      `${result.created ? "source+" : "source~"} ${seed.name} [${seed.status}]`,
    );
  }

  const party = PHASE22_SOURCE_UPSERTS.find((s) => s.name === "Party4singles");
  if (!party || !isUserSuppliedNotes(party.notes)) {
    console.error("FAIL Party4singles must carry discovered_by=user provenance");
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
        researched: PHASE22_RESEARCHED.length,
        rejectedNotStored: PHASE22_REJECTED.length,
      },
      null,
      2,
    ),
  );
  console.log("\nOK: phase22 discovery Source Map seed (no publish).");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
