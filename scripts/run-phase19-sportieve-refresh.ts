/**
 * Fase 19: exactly one live Sportieve Singles refresh (no other pilots).
 * Usage: SOURCE_REFRESH_SKIP_COOLDOWN=1 npm run refresh:phase19-sportieve
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

  const pubBefore = (
    await sql`SELECT count(*)::int AS n FROM event_editions WHERE publication_status = 'published'`
  )[0] as { n: number };

  const pilot = REFRESH_PILOTS.find((p) => p.parserKey === "sportieve-singles");
  if (!pilot) {
    console.error("Sportieve pilot missing from registry");
    process.exit(1);
  }

  process.env.SOURCE_REFRESH_SKIP_COOLDOWN = "1";
  const result = await startSourceRefresh({
    catalogSourceId: pilot.catalogSourceId,
    triggeredBy: "phase19-pilot",
  });

  if (!result.ok || !result.run) {
    console.error("Refresh failed", result);
    process.exit(1);
  }

  const items = await listRefreshItemsForRun(result.run.id);
  const byType = items.reduce<Record<string, number>>((acc, item) => {
    acc[item.detectionType] = (acc[item.detectionType] ?? 0) + 1;
    return acc;
  }, {});

  const changed = items.filter((i) => i.detectionType === "existing_changed");
  const matched = items.filter(
    (i) =>
      i.detectionType === "existing_unchanged" ||
      i.detectionType === "existing_changed",
  );

  const pubAfter = (
    await sql`SELECT count(*)::int AS n FROM event_editions WHERE publication_status = 'published'`
  )[0] as { n: number };

  console.log(
    JSON.stringify(
      {
        runId: result.run.id,
        detected: result.run.candidateCount,
        matched: matched.length,
        unchanged: byType.existing_unchanged ?? 0,
        changed: byType.existing_changed ?? 0,
        new: byType.new ?? 0,
        possibly_removed: byType.possibly_removed ?? 0,
        errors: result.run.error,
        publishedBefore: pubBefore.n,
        publishedAfter: pubAfter.n,
        changedDetails: changed.map((i) => ({
          title: i.detectedTitle,
          start: i.detectedStart,
          changes: i.changeSummary,
        })),
        newTitles: items
          .filter((i) => i.detectionType === "new")
          .map((i) => i.detectedTitle),
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
