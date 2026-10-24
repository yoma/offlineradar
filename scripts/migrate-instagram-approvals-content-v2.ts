/**
 * Apply approvals content-binding + uncertain publish status migration.
 * Usage: npm run db:migrate:instagram-approvals-content-v2
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  assertOfflineRadarDbConfig,
  expectedNeonProjectId,
  getEventsSql,
} from "../lib/events/db";
import { splitSqlStatements } from "../lib/events/sql-split";

const MIGRATION_ID = "20261024_instagram_approvals_content_v2";

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
    "db/migrations/20261024_instagram_approvals_content_v2.sql",
  );
  const raw = await readFile(migrationPath, "utf8");
  for (const statement of splitSqlStatements(raw)) {
    await sql.query(statement, []);
  }

  const cols = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'instagram_concept_approvals'
      AND column_name = 'content_fingerprint'
  `;
  if (cols.length !== 1) {
    console.error("FAIL content_fingerprint column missing");
    process.exit(1);
  }

  const pubAfter = await sql`
    SELECT count(*)::int AS n FROM event_editions WHERE publication_status = 'published'
  `;
  const pubAfterN = (pubAfter[0] as { n: number }).n;
  if (pubAfterN !== pubBeforeN) {
    console.error(`FAIL published count changed ${pubBeforeN} → ${pubAfterN}`);
    process.exit(1);
  }

  console.log(
    JSON.stringify(
      { project: expectedNeonProjectId(), published: pubAfterN, migration: MIGRATION_ID },
      null,
      2,
    ),
  );
  console.log("\nOK: Instagram approvals content v2 migration applied.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
