/**
 * Verify tips migrations on OfflineRadar Neon only.
 * Schema is applied via checked-in SQL files (and Neon MCP).
 * Usage: npm run db:migrate:tips
 * Does not run on app boot.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  assertOfflineRadarDbConfig,
  expectedNeonProjectId,
  getTipsSql,
} from "../lib/tips/db";

const EXPECTED_TABLES = [
  "tips",
  "tip_reviews",
  "source_watchlist",
  "source_watch_tips",
  "tip_email_log",
  "tip_submit_rate",
  "schema_migrations",
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
      `FAIL OFFLINERADAR_NEON_PROJECT_ID must be ${expectedNeonProjectId()}`,
    );
    process.exit(1);
  }

  await readFile(
    path.join(process.cwd(), "db/migrations/20260925_tips_portal_v1.sql"),
    "utf8",
  );
  await readFile(
    path.join(process.cwd(), "db/migrations/20260926_tips_submit_rate_v1.sql"),
    "utf8",
  );

  const sql = getTipsSql();
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

  const tables = await sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN (
        'tips',
        'tip_reviews',
        'source_watchlist',
        'source_watch_tips',
        'tip_email_log',
        'tip_submit_rate',
        'schema_migrations'
      )
    ORDER BY table_name
  `;

  if (tables.length !== 7) {
    console.error(
      `FAIL expected 7 tips tables, found ${tables.length}. Apply db/migrations/*.sql first.`,
    );
    process.exit(1);
  }

  const migrations = await sql`
    SELECT id FROM schema_migrations ORDER BY applied_at
  `;

  console.log(
    `OK OfflineRadar tips schema present on project ${expectedNeonProjectId()}`,
  );
  console.log(
    `tables: ${tables.map((t) => (t as { table_name: string }).table_name).join(", ")}`,
  );
  console.log(
    `migrations: ${migrations.map((m) => (m as { id: string }).id).join(", ")}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
