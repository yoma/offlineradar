/**
 * Fase 17: exactly one live refresh for Tomeeto + Juntas (no other pilots).
 * Usage: npm run refresh:phase17-pilot
 */
import { startSourceRefresh } from "../lib/source-refresh/engine";
import { REFRESH_PILOTS } from "../lib/source-refresh/registry";
import {
  assertOfflineRadarDbConfig,
  expectedNeonProjectId,
  getEventsSql,
} from "../lib/events/db";
import { upsertCatalogSourceByUrl } from "../lib/events/catalog-sources";
import { listRefreshItemsForRun } from "../lib/source-refresh/store";

const TARGETS = ["tomeeto", "juntas"] as const;

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

  const tipBefore = (await sql`SELECT count(*)::int AS n FROM tips`)[0] as {
    n: number;
  };
  const pubBefore = (
    await sql`SELECT count(*)::int AS n FROM event_editions WHERE publication_status = 'published'`
  )[0] as { n: number };

  // Source Map yield notes: refresh_supported via existing notes convention.
  await upsertCatalogSourceByUrl({
    name: "Tomeeto singles aanbod hub",
    officialUrl: "https://tomeeto.be/vakanties/aanbod-voor-singles/",
    sourceKind: "organizer_source",
    sourceType: "organizer",
    regions: ["Vlaanderen", "Wallonië", "internationaal"],
    formats: ["travel", "weekend", "ski"],
    status: "active",
    notes:
      "[fase17] refresh_supported=true parser_key=tomeeto | hub listing date+ageband editions; no auto-publish. discovered_by=user | Door Youri aangebracht (handmatige productvondst).",
    lastCheckedAt: new Date().toISOString(),
  });
  await upsertCatalogSourceByUrl({
    name: "Juntas exclusief singles",
    officialUrl: "https://juntas.be/?reis_label=single-only",
    sourceKind: "organizer_source",
    sourceType: "organizer",
    regions: ["internationaal", "België"],
    formats: ["travel", "weekend"],
    status: "active",
    notes:
      "[fase17] refresh_supported=true parser_key=juntas | single-only WP cards; guideline 45+; sold_out via label; no auto-publish.",
    lastCheckedAt: new Date().toISOString(),
  });

  const rows: Array<Record<string, unknown>> = [];
  for (const key of TARGETS) {
    const pilot = REFRESH_PILOTS.find((p) => p.parserKey === key);
    if (!pilot) {
      console.error("missing pilot", key);
      process.exit(1);
    }
    console.log(`\n=== ${pilot.label} ===`);
    const result = await startSourceRefresh({
      catalogSourceId: pilot.catalogSourceId,
      triggeredBy: "phase17-pilot:youri77@gmail.com",
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
    const sampleNew = items
      .filter((i) => i.detectionType === "new")
      .slice(0, 5)
      .map((i) => i.detectedTitle);
    const sampleChanged = items
      .filter((i) => i.detectionType === "existing_changed")
      .slice(0, 5)
      .map((i) => ({
        title: i.detectedTitle,
        changes: i.changeSummary,
      }));
    rows.push({
      source: pilot.label,
      detected: result.run.candidateCount,
      matched,
      new: result.run.newCount,
      changed: result.run.changedCount,
      removed: result.run.removedCount,
      unchanged: result.run.unchangedCount,
      errors: result.run.error,
      runId: result.run.id,
      sampleNew,
      sampleChanged,
    });
    console.log(JSON.stringify(rows[rows.length - 1], null, 2));
  }

  const tipAfter = (await sql`SELECT count(*)::int AS n FROM tips`)[0] as {
    n: number;
  };
  const pubAfter = (
    await sql`SELECT count(*)::int AS n FROM event_editions WHERE publication_status = 'published'`
  )[0] as { n: number };

  console.log("\n=== SUMMARY ===");
  console.table(
    rows.map((r) => ({
      source: r.source,
      detected: r.detected,
      matched: r.matched,
      new: r.new,
      changed: r.changed,
      removed: r.removed,
      errors: r.errors,
    })),
  );
  console.log(
    JSON.stringify(
      {
        tipsUnchanged: tipBefore.n === tipAfter.n,
        publishedUnchanged: pubBefore.n === pubAfter.n,
        publishedCount: pubAfter.n,
        tipCount: tipAfter.n,
        noAutoPublish: true,
      },
      null,
      2,
    ),
  );
  if (tipBefore.n !== tipAfter.n || pubBefore.n !== pubAfter.n) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
