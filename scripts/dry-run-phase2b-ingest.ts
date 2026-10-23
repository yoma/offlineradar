/**
 * Read-only Phase 2B dry-run: exercise parsers on public HTML without DB writes.
 * Usage: npx tsx scripts/dry-run-phase2b-ingest.ts
 */
import { REFRESH_PILOTS } from "../lib/source-refresh/registry";
import { runRefreshParser } from "../lib/source-refresh/parsers";
import { safeFetchHtmlSource } from "../lib/source-refresh/safe-fetch-html";
import { matchCandidate } from "../lib/source-refresh/match";
import { isRefreshAutoDraftGloballyEnabled } from "../lib/source-refresh/auto-draft-config";
import { isScheduledRefreshGloballyEnabled } from "../lib/source-refresh/schedule-config";
import { writeFileSync, mkdirSync } from "node:fs";

async function main() {
  console.assert(
    isRefreshAutoDraftGloballyEnabled() === false,
    "auto-draft kill switch must stay OFF",
  );

  const pilots = REFRESH_PILOTS.slice(0, 3);
  const report: Record<string, unknown> = {
    killSwitches: {
      scheduledRefresh: isScheduledRefreshGloballyEnabled(),
      autoDraft: isRefreshAutoDraftGloballyEnabled(),
    },
    pilots: [] as unknown[],
    totals: {
      discovered: 0,
      withDate: 0,
      withPrice: 0,
      missingPrice: 0,
      missingTime: 0,
    },
  };

  const t0 = Date.now();
  for (const pilot of pilots) {
    const fetched = await safeFetchHtmlSource(pilot.fetchUrl);
    if (!fetched.ok) {
      (report.pilots as unknown[]).push({
        label: pilot.label,
        error: fetched.error ?? fetched.code ?? "fetch_failed",
      });
      continue;
    }
    const parsed = runRefreshParser(pilot.parserKey, fetched.html);
    const candidates = parsed.candidates ?? [];
    let withDate = 0;
    let withPrice = 0;
    let missingPrice = 0;
    let missingTime = 0;
    for (const c of candidates) {
      if (c.startsAt && !c.startsAt.startsWith("2099")) withDate += 1;
      if (c.price != null) withPrice += 1;
      else missingPrice += 1;
      const hm = c.startsAt?.slice(11, 16);
      if (!hm || hm === "12:00" || hm === "00:00") missingTime += 1;
      // Match against empty catalog → all "new"
      matchCandidate(c, [], pilot.organizerSlug);
    }
    (report.totals as { discovered: number }).discovered += candidates.length;
    (report.totals as { withDate: number }).withDate += withDate;
    (report.totals as { withPrice: number }).withPrice += withPrice;
    (report.totals as { missingPrice: number }).missingPrice += missingPrice;
    (report.totals as { missingTime: number }).missingTime += missingTime;
    (report.pilots as unknown[]).push({
      label: pilot.label,
      parserKey: pilot.parserKey,
      url: pilot.fetchUrl,
      httpOk: true,
      discovered: candidates.length,
      withDate,
      withPrice,
      missingPrice,
      missingTime,
      sampleTitles: candidates.slice(0, 5).map((c) => c.title),
    });
  }

  (report as { elapsedMs: number }).elapsedMs = Date.now() - t0;
  (report as { wrote: boolean }).wrote = false;

  console.log(JSON.stringify(report, null, 2));
  mkdirSync("/opt/cursor/artifacts", { recursive: true });
  writeFileSync(
    "/opt/cursor/artifacts/phase2b-ingest-dry-run.json",
    JSON.stringify(report, null, 2),
  );
  console.log("\nOK: phase2b ingest dry-run (no DB writes).");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
