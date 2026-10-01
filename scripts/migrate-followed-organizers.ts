/**
 * Apply user_followed_organizers migration (Fase 26.14).
 * Usage: npm run db:migrate:followed-organizers
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  assertOfflineRadarDbConfig,
  expectedNeonProjectId,
  getEventsSql,
} from "../lib/events/db";
import { splitSqlStatements } from "../lib/events/sql-split";

const MIGRATION_ID = "20261001_user_followed_organizers_v1";

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
    "db/migrations/20261001_user_followed_organizers_v1.sql",
  );
  const raw = await readFile(migrationPath, "utf8");
  for (const statement of splitSqlStatements(raw)) {
    await sql.query(statement, []);
  }

  const tables = await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'user_followed_organizers'
  `;
  if (tables.length !== 1) {
    console.error("FAIL user_followed_organizers missing");
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
        project: expectedNeonProjectId(),
        published: pubAfterN,
        migration: MIGRATION_ID,
      },
      null,
      2,
    ),
  );
  console.log("\nOK: followed organizers migration applied.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
