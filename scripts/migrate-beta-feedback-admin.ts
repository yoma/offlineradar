/**
 * Apply beta_feedback admin columns migration.
 * Usage: npm run db:migrate:beta-feedback-admin
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  assertOfflineRadarDbConfig,
  expectedNeonProjectId,
  getEventsSql,
} from "../lib/events/db";
import { splitSqlStatements } from "../lib/events/sql-split";

const MIGRATION_ID = "20260928_beta_feedback_admin_v1";

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

  const fbBefore = await sql`SELECT count(*)::int AS n FROM beta_feedback`;
  const fbBeforeN = (fbBefore[0] as { n: number }).n;
  const pubBefore = await sql`
    SELECT count(*)::int AS n FROM event_editions WHERE publication_status = 'published'
  `;
  const pubBeforeN = (pubBefore[0] as { n: number }).n;

  const migrationPath = path.join(
    process.cwd(),
    "db/migrations/20260928_beta_feedback_admin_v1.sql",
  );
  const raw = await readFile(migrationPath, "utf8");
  for (const statement of splitSqlStatements(raw)) {
    await sql.query(statement, []);
  }

  const cols = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'beta_feedback'
      AND column_name IN ('category', 'message', 'status', 'pathname', 'admin_note', 'app_user_id')
  `;
  if (cols.length < 6) {
    console.error("FAIL expected admin columns missing", cols);
    process.exit(1);
  }

  const fbAfter = await sql`SELECT count(*)::int AS n FROM beta_feedback`;
  const fbAfterN = (fbAfter[0] as { n: number }).n;
  if (fbAfterN !== fbBeforeN) {
    console.error(`FAIL feedback count changed ${fbBeforeN} → ${fbAfterN}`);
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

  const mig = await sql`
    SELECT id FROM schema_migrations WHERE id = ${MIGRATION_ID}
  `;
  if (mig.length === 0) {
    console.error("FAIL migration id not recorded");
    process.exit(1);
  }

  console.log(
    JSON.stringify(
      {
        migration: MIGRATION_ID,
        feedbackRows: fbAfterN,
        published: pubAfterN,
      },
      null,
      2,
    ),
  );
  console.log("\nOK: beta_feedback admin migration applied.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
