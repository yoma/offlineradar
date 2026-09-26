/**
 * Admin CLI: run one refresh per pilot source (max 3).
 * Usage: node --env-file=.env.local --import tsx scripts/run-pilot-source-refresh.ts
 */
import { startSourceRefresh } from "../lib/source-refresh/engine";
import { REFRESH_PILOTS } from "../lib/source-refresh/registry";
import {
  assertOfflineRadarDbConfig,
  expectedNeonProjectId,
  getEventsSql,
} from "../lib/events/db";
import { listRefreshItemsForRun } from "../lib/source-refresh/store";

async function main() {
  const check = assertOfflineRadarDbConfig();
  if (!check.ok) {
    console.error(check.error);
    process.exit(1);
  }
  if (process.env.OFFLINERADAR_NEON_PROJECT_ID?.trim() !== expectedNeonProjectId()) {
    console.error("Wrong Neon project");
    process.exit(1);
  }
  const sql = getEventsSql();
  if (!sql) {
    console.error("SQL unavailable");
    process.exit(1);
  }

  const tipBefore = await sql`SELECT count(*)::int AS n FROM tips`;
  const pubBefore =
    await sql`SELECT count(*)::int AS n FROM event_editions WHERE publication_status = 'published'`;

  const rows: Array<Record<string, unknown>> = [];
  for (const pilot of REFRESH_PILOTS) {
    console.log(`\n=== ${pilot.label} ===`);
    const result = await startSourceRefresh({
      catalogSourceId: pilot.catalogSourceId,
      triggeredBy: "pilot-cli:youri77@gmail.com",
    });
    if (!result.ok) {
      console.log("FAIL", result.code, result.error);
      rows.push({
        source: pilot.label,
        detected: result.run?.candidateCount ?? 0,
        matched:
          (result.run?.unchangedCount ?? 0) + (result.run?.changedCount ?? 0),
        new: result.run?.newCount ?? 0,
        changed: result.run?.changedCount ?? 0,
        removed: result.run?.removedCount ?? 0,
        errors: result.error,
        runId: result.run?.id ?? null,
      });
      continue;
    }
    const items = await listRefreshItemsForRun(result.run.id);
    const matched = items.filter(
      (i) =>
        i.detectionType === "existing_unchanged" ||
        i.detectionType === "existing_changed",
    ).length;
    rows.push({
      source: pilot.label,
      detected: result.run.candidateCount,
      matched,
      new: result.run.newCount,
      changed: result.run.changedCount,
      removed: result.run.removedCount,
      errors: result.run.error,
      runId: result.run.id,
    });
    console.log(JSON.stringify(rows[rows.length - 1], null, 2));
  }

  const tipAfter = await sql`SELECT count(*)::int AS n FROM tips`;
  const pubAfter =
    await sql`SELECT count(*)::int AS n FROM event_editions WHERE publication_status = 'published'`;
  const tipOk =
    (tipBefore[0] as { n: number }).n === (tipAfter[0] as { n: number }).n;
  const pubOk =
    (pubBefore[0] as { n: number }).n === (pubAfter[0] as { n: number }).n;

  console.log("\n=== SUMMARY ===");
  console.table(rows);
  console.log(
    JSON.stringify(
      {
        tipsUnchanged: tipOk,
        publishedUnchanged: pubOk,
        tipCount: (tipAfter[0] as { n: number }).n,
        publishedCount: (pubAfter[0] as { n: number }).n,
      },
      null,
      2,
    ),
  );
  if (!tipOk || !pubOk) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
