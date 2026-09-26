/**
 * Apply + verify canonical events catalog migration on OfflineRadar Neon only.
 * Usage: npm run db:migrate:events
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  assertOfflineRadarDbConfig,
  expectedNeonProjectId,
  getEventsSql,
} from "../lib/events/db";
import { splitSqlStatements } from "../lib/events/sql-split";

const MIGRATION_ID = "20260926_events_catalog_v1";
const EXPECTED_EVENT_TABLES = [
  "organizers",
  "event_series",
  "event_editions",
  "event_sources",
  "event_images",
] as const;

const EXPECTED_TIP_TABLES = [
  "tips",
  "tip_reviews",
  "source_watchlist",
  "source_watch_tips",
  "tip_email_log",
  "tip_submit_rate",
] as const;

async function main() {
  const check = assertOfflineRadarDbConfig();
  if (!check.ok) {
    console.error(`FAIL ${check.error}`);
    process.exit(1);
  }

  const projectId = process.env.OFFLINERADAR_NEON_PROJECT_ID?.trim();
  if (projectId !== expectedNeonProjectId()) {
    console.error(
      `FAIL OFFLINERADAR_NEON_PROJECT_ID must be ${expectedNeonProjectId()} (got ${projectId ?? "missing"})`,
    );
    process.exit(1);
  }

  const sql = getEventsSql();
  if (!sql) {
    console.error("FAIL SQL client unavailable");
    process.exit(1);
  }

  const identity = await sql`
    SELECT current_database() AS db, current_user AS db_user
  `;
  const row = identity[0] as { db: string; db_user: string };
  if (row.db !== "offlineradar" || row.db_user !== "offlineradar_owner") {
    console.error(`FAIL unexpected session ${row.db}/${row.db_user}`);
    process.exit(1);
  }

  const migrationPath = path.join(
    process.cwd(),
    "db/migrations/20260926_events_catalog_v1.sql",
  );
  const raw = await readFile(migrationPath, "utf8");
  const statements = splitSqlStatements(raw);

  for (const statement of statements) {
    await sql.query(statement, []);
  }

  const tipTables = await sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN (
        'tips',
        'tip_reviews',
        'source_watchlist',
        'source_watch_tips',
        'tip_email_log',
        'tip_submit_rate'
      )
    ORDER BY table_name
  `;
  if (tipTables.length !== EXPECTED_TIP_TABLES.length) {
    console.error(
      `FAIL tip tables missing after events migration (found ${tipTables.length})`,
    );
    process.exit(1);
  }

  const tipCount = await sql`SELECT count(*)::int AS n FROM tips`;
  const tipN = (tipCount[0] as { n: number }).n;

  const eventTables = await sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN (
        'organizers',
        'event_series',
        'event_editions',
        'event_sources',
        'event_images'
      )
    ORDER BY table_name
  `;
  if (eventTables.length !== EXPECTED_EVENT_TABLES.length) {
    console.error(
      `FAIL expected ${EXPECTED_EVENT_TABLES.length} event tables, found ${eventTables.length}`,
    );
    process.exit(1);
  }

  const migrations = await sql`
    SELECT id FROM schema_migrations WHERE id = ${MIGRATION_ID}
  `;
  if (migrations.length === 0) {
    console.error(`FAIL migration id ${MIGRATION_ID} not recorded`);
    process.exit(1);
  }

  console.log(
    `OK events catalog migration on project ${expectedNeonProjectId()}`,
  );
  console.log(
    `event tables: ${eventTables.map((t) => (t as { table_name: string }).table_name).join(", ")}`,
  );
  console.log(`tips intact: count=${tipN}`);
  console.log(`migration recorded: ${MIGRATION_ID}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
