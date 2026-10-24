/**
 * Apply Instagram concept-history migration + optional import from local file.
 * Usage: npm run db:migrate:instagram-concept-history
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  assertOfflineRadarDbConfig,
  expectedNeonProjectId,
  getEventsSql,
} from "../lib/events/db";
import { splitSqlStatements } from "../lib/events/sql-split";

const MIGRATION_ID = "20261024_instagram_concept_history_v1";
const LEGACY_FILE = path.join(
  process.cwd(),
  ".data/instagram-concept-history.json",
);

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

  const pubBefore = await sql`
    SELECT count(*)::int AS n FROM event_editions WHERE publication_status = 'published'
  `;
  const pubBeforeN = (pubBefore[0] as { n: number }).n;

  const migrationPath = path.join(
    process.cwd(),
    "db/migrations/20261024_instagram_concept_history_v1.sql",
  );
  const raw = await readFile(migrationPath, "utf8");
  for (const statement of splitSqlStatements(raw)) {
    await sql.query(statement, []);
  }

  const tables = await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'instagram_concept_history'
  `;
  if (tables.length !== 1) {
    console.error("FAIL instagram_concept_history missing");
    process.exit(1);
  }

  let imported = 0;
  try {
    const legacyRaw = await readFile(LEGACY_FILE, "utf8");
    const legacy = JSON.parse(legacyRaw) as {
      eventIds?: Record<string, string>;
    };
    for (const [eventId, iso] of Object.entries(legacy.eventIds ?? {})) {
      const id = eventId.trim().slice(0, 120);
      if (!id) continue;
      const usedAt = Date.parse(iso);
      if (Number.isNaN(usedAt)) continue;
      await sql`
        INSERT INTO instagram_concept_history (event_id, last_used_at)
        VALUES (${id}, ${new Date(usedAt).toISOString()}::timestamptz)
        ON CONFLICT (event_id) DO UPDATE SET
          last_used_at = GREATEST(
            instagram_concept_history.last_used_at,
            EXCLUDED.last_used_at
          )
      `;
      imported += 1;
    }
  } catch {
    // No local legacy file — fine on fresh / production hosts.
  }

  const pubAfter = await sql`
    SELECT count(*)::int AS n FROM event_editions WHERE publication_status = 'published'
  `;
  const pubAfterN = (pubAfter[0] as { n: number }).n;
  if (pubAfterN !== pubBeforeN) {
    console.error(`FAIL published count changed ${pubBeforeN} → ${pubAfterN}`);
    process.exit(1);
  }

  const mig = await sql`
    SELECT id FROM schema_migrations WHERE id = ${MIGRATION_ID}
  `;
  if (mig.length === 0) {
    console.error("FAIL migration id not recorded");
    process.exit(1);
  }

  const count = await sql`
    SELECT count(*)::int AS n FROM instagram_concept_history
  `;

  console.log(
    JSON.stringify(
      {
        project: expectedNeonProjectId(),
        published: pubAfterN,
        migration: MIGRATION_ID,
        historyRows: (count[0] as { n: number }).n,
        importedFromLegacyFile: imported,
      },
      null,
      2,
    ),
  );
  console.log("\nOK: Instagram concept-history migration applied.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
