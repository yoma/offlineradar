/**
 * Fase 8: upsert Source Map discovery batch (no event import).
 * Usage: npm run seed:phase8-sources
 */
import {
  assertOfflineRadarDbConfig,
  expectedNeonProjectId,
  getEventsSql,
} from "../lib/events/db";
import { upsertCatalogSourceByUrl } from "../lib/events/catalog-sources";
import {
  PHASE8_REJECTED,
  PHASE8_SOURCE_MAP_UPSERTS,
  PHASE8_HIGH_YIELD_REFRESH_CANDIDATES,
} from "../data/pilot/phase8-source-discovery";

async function main() {
  const gate = assertOfflineRadarDbConfig();
  if (!gate.ok) {
    console.error("DB config fail:", gate.error);
    process.exit(1);
  }
  console.log(`Neon project OK: ${expectedNeonProjectId()}`);

  let created = 0;
  let updated = 0;
  const seen = new Set<string>();

  for (const input of PHASE8_SOURCE_MAP_UPSERTS) {
    const key = input.officialUrl.trim().replace(/\/$/, "").toLowerCase();
    if (seen.has(key)) {
      console.warn(`SKIP duplicate URL in batch: ${input.name} → ${key}`);
      continue;
    }
    seen.add(key);

    const result = await upsertCatalogSourceByUrl(input);
    if (!result) {
      console.error(`FAIL upsert: ${input.name}`);
      process.exit(1);
    }
    if (result.created) created += 1;
    else updated += 1;
    console.log(
      `${result.created ? "CREATE" : "UPDATE"} ${result.record.status.padEnd(10)} ${result.record.name}`,
    );
  }

  const sql = getEventsSql();
  if (!sql) {
    console.error("No SQL client");
    process.exit(1);
  }

  const [counts] = (await sql`
    SELECT
      count(*)::int AS total,
      count(*) FILTER (WHERE status = 'active')::int AS active,
      count(*) FILTER (WHERE status = 'promising')::int AS promising,
      count(*) FILTER (WHERE status = 'low_yield')::int AS low_yield,
      count(*) FILTER (WHERE status = 'inactive')::int AS inactive
    FROM catalog_sources
  `) as Array<{
    total: number;
    active: number;
    promising: number;
    low_yield: number;
    inactive: number;
  }>;

  const [catalog] = (await sql`
    SELECT
      count(*) FILTER (WHERE publication_status = 'published')::int AS published,
      count(*) FILTER (WHERE publication_status = 'under_review')::int AS under_review
    FROM event_editions
  `) as Array<{ published: number; under_review: number }>;

  const [tips] = (await sql`
    SELECT count(*)::int AS n FROM tips
  `) as Array<{ n: number }>;

  const [reports] = (await sql`
    SELECT count(*)::int AS n FROM event_reports
  `) as Array<{ n: number }>;

  console.log("\n=== Phase 8 Source Map ===");
  console.log(`Upserts: ${created} created, ${updated} updated`);
  console.log(
    `Totals: ${counts.total} (active=${counts.active} promising=${counts.promising} low_yield=${counts.low_yield} inactive=${counts.inactive})`,
  );
  console.log(`Rejected (not stored): ${PHASE8_REJECTED.length}`);
  console.log(
    `High-yield refresh candidates: ${PHASE8_HIGH_YIELD_REFRESH_CANDIDATES.length}`,
  );
  console.log(
    `Catalog intact: published=${catalog.published} under_review=${catalog.under_review}`,
  );
  console.log(`Tips intact: ${tips.n}`);
  console.log(`Event reports intact: ${reports.n}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
