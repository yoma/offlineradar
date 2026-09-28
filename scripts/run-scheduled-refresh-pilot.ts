/**
 * Safe local/pilot scheduled refresh for 1–2 sources.
 * Uses shared engine with trigger_type=scheduled. No auto-publish.
 *
 * Usage:
 *   node --env-file=.env.local --import tsx scripts/run-scheduled-refresh-pilot.ts
 *   node --env-file=.env.local --import tsx scripts/run-scheduled-refresh-pilot.ts --parser=speeddaten
 *   node --env-file=.env.local --import tsx scripts/run-scheduled-refresh-pilot.ts --parser=speeddaten,hoptodate
 */
import {
  assertOfflineRadarDbConfig,
  expectedNeonProjectId,
  getEventsSql,
} from "../lib/events/db";
import { REFRESH_PILOTS } from "../lib/source-refresh/registry";
import { runScheduledSourceRefresh } from "../lib/source-refresh/scheduler";

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
  if (!getEventsSql()) {
    console.error("FAIL SQL unavailable");
    process.exit(1);
  }

  const arg = process.argv.find((a) => a.startsWith("--parser="));
  const keys = (arg?.slice("--parser=".length) || "speeddaten")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const pilots = REFRESH_PILOTS.filter((p) => keys.includes(p.parserKey));
  if (pilots.length === 0) {
    console.error(`FAIL unknown parser keys: ${keys.join(",")}`);
    process.exit(1);
  }
  if (pilots.length > 2) {
    console.error("FAIL pilot max 2 sources");
    process.exit(1);
  }

  console.log(
    JSON.stringify(
      {
        mode: "scheduled_pilot",
        parsers: pilots.map((p) => p.parserKey),
        note: "bypassGlobalKillSwitch=true for local pilot only",
      },
      null,
      2,
    ),
  );

  const summary = await runScheduledSourceRefresh({
    onlySourceIds: pilots.map((p) => p.catalogSourceId),
    bypassGlobalKillSwitch: true,
    forceDue: true,
    maxSources: pilots.length,
  });

  console.log(JSON.stringify(summary, null, 2));

  const sql = getEventsSql()!;
  for (const outcome of summary.outcomes) {
    if (!outcome.runId) continue;
    const rows = (await sql`
      SELECT id, trigger_type, status, new_count, changed_count
      FROM source_refresh_runs WHERE id = ${outcome.runId}
    `) as {
      id: string;
      trigger_type: string;
      status: string;
      new_count: number;
      changed_count: number;
    }[];
    const row = rows[0];
    if (!row) {
      console.error(`FAIL run missing ${outcome.runId}`);
      process.exit(1);
    }
    if (row.trigger_type !== "scheduled") {
      console.error(`FAIL trigger_type=${row.trigger_type} expected scheduled`);
      process.exit(1);
    }
    console.log(
      `OK run ${row.id} trigger=${row.trigger_type} status=${row.status} new=${row.new_count} changed=${row.changed_count}`,
    );
  }

  console.log("\nOK: scheduled refresh pilot finished (no auto-publish).");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
