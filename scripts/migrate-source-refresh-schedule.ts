/**
 * Fase 23: apply scheduled-refresh schema + enable 5 stable pilots.
 * Usage: npm run db:migrate:source-refresh-schedule
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  assertOfflineRadarDbConfig,
  expectedNeonProjectId,
  getEventsSql,
} from "../lib/events/db";
import { splitSqlStatements } from "../lib/events/sql-split";
import { REFRESH_PILOTS } from "../lib/source-refresh/registry";
import { DEFAULT_REFRESH_INTERVAL_HOURS } from "../lib/source-refresh/schedule-config";

const MIGRATION_ID = "20260928_source_refresh_schedule_v1";

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
  const editionBefore = await sql`
    SELECT count(*)::int AS n FROM event_editions WHERE publication_status = 'published'
  `;
  const editionBeforeN = (editionBefore[0] as { n: number }).n;

  const migrationPath = path.join(
    process.cwd(),
    "db/migrations/20260928_source_refresh_schedule_v1.sql",
  );
  const raw = await readFile(migrationPath, "utf8");
  for (const statement of splitSqlStatements(raw)) {
    await sql.query(statement, []);
  }

  // CHECK constraints (idempotent; skip if already present)
  const constraints = (await sql`
    SELECT conname FROM pg_constraint
    WHERE conname IN (
      'source_refresh_runs_trigger_type_check',
      'catalog_sources_refresh_interval_hours_check'
    )
  `) as { conname: string }[];
  const have = new Set(constraints.map((c) => c.conname));
  if (!have.has("source_refresh_runs_trigger_type_check")) {
    await sql.query(
      `ALTER TABLE source_refresh_runs
       ADD CONSTRAINT source_refresh_runs_trigger_type_check
       CHECK (trigger_type IN ('manual', 'scheduled'))`,
      [],
    );
  }
  if (!have.has("catalog_sources_refresh_interval_hours_check")) {
    await sql.query(
      `ALTER TABLE catalog_sources
       ADD CONSTRAINT catalog_sources_refresh_interval_hours_check
       CHECK (
         refresh_interval_hours IS NULL
         OR (refresh_interval_hours >= 6 AND refresh_interval_hours <= 168)
       )`,
      [],
    );
  }

  const cols = (await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'catalog_sources'
      AND column_name IN ('refresh_enabled', 'refresh_interval_hours', 'last_scheduled_refresh_at')
  `) as { column_name: string }[];
  if (cols.length !== 3) {
    console.error("FAIL catalog_sources schedule columns missing");
    process.exit(1);
  }

  const runCols = (await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'source_refresh_runs'
      AND column_name = 'trigger_type'
  `) as { column_name: string }[];
  if (runCols.length !== 1) {
    console.error("FAIL source_refresh_runs.trigger_type missing");
    process.exit(1);
  }

  let enabled = 0;
  for (const pilot of REFRESH_PILOTS) {
    const hours = DEFAULT_REFRESH_INTERVAL_HOURS[pilot.parserKey] ?? 48;
    const rows = (await sql`
      UPDATE catalog_sources SET
        refresh_enabled = true,
        refresh_interval_hours = COALESCE(refresh_interval_hours, ${hours}),
        updated_at = now()
      WHERE id = ${pilot.catalogSourceId}
      RETURNING id
    `) as { id: string }[];
    if (rows[0]) {
      enabled += 1;
      console.log(`enabled ${pilot.label} interval=${hours}h`);
    } else {
      console.error(
        `WARN missing catalog source ${pilot.catalogSourceId} (${pilot.label})`,
      );
    }
  }

  const tipAfter = await sql`SELECT count(*)::int AS n FROM tips`;
  const tipAfterN = (tipAfter[0] as { n: number }).n;
  if (tipAfterN !== tipBeforeN) {
    console.error(`FAIL tip count changed ${tipBeforeN} → ${tipAfterN}`);
    process.exit(1);
  }
  const editionAfter = await sql`
    SELECT count(*)::int AS n FROM event_editions WHERE publication_status = 'published'
  `;
  const editionAfterN = (editionAfter[0] as { n: number }).n;
  if (editionAfterN !== editionBeforeN) {
    console.error(
      `FAIL published count changed ${editionBeforeN} → ${editionAfterN}`,
    );
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
        migration: MIGRATION_ID,
        pilotsEnabled: enabled,
        expectedPilots: REFRESH_PILOTS.length,
        publishedCount: editionAfterN,
        tipCount: tipAfterN,
      },
      null,
      2,
    ),
  );
  console.log("\nOK: source_refresh schedule migration applied.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
