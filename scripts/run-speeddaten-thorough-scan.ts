/**
 * Run a thorough Speeddaten.be scan once (admin tooling).
 * Usage: SOURCE_REFRESH_SKIP_COOLDOWN=1 node --env-file=.env.local --import tsx scripts/run-speeddaten-thorough-scan.ts
 */
import { startSourceRefresh } from "../lib/source-refresh/engine";
import { REFRESH_PILOTS } from "../lib/source-refresh/registry";
import { urlsReferToSameEvent } from "../lib/source-refresh/normalize";
import { parseSpeeddatenHtml } from "../lib/source-refresh/parsers/speeddaten";
import { listFutureEditionsForOrganizerSlug } from "../lib/source-refresh/store";
import { safeFetchHtmlSource } from "../lib/source-refresh/safe-fetch-html";

async function main() {
  const pilot = REFRESH_PILOTS.find((p) => p.parserKey === "speeddaten");
  if (!pilot) throw new Error("speeddaten pilot missing");

  console.log("Starting thorough scan…");
  const result = await startSourceRefresh({
    catalogSourceId: pilot.catalogSourceId,
    triggeredBy: "verify-script@local",
    triggerType: "manual",
    mode: "thorough",
    skipCooldown: true,
  });

  if (!result.ok) {
    console.error("Scan failed:", result.error, result.code);
    if (result.run?.report) console.log(JSON.stringify(result.run.report, null, 2));
    process.exit(1);
  }

  const run = result.run;
  console.log(
    JSON.stringify(
      {
        runId: run.id,
        status: run.status,
        candidateCount: run.candidateCount,
        newCount: run.newCount,
        changedCount: run.changedCount,
        unchangedCount: run.unchangedCount,
        drafted: run.draftedCount,
        applied: run.appliedCount,
        completeness: run.report?.completeness,
        completenessNote: run.report?.completenessNote,
      },
      null,
      2,
    ),
  );

  // Post-scan compare
  const fetched = await safeFetchHtmlSource(pilot.fetchUrl);
  if (!fetched.ok) throw new Error(fetched.error);
  const live = parseSpeeddatenHtml(fetched.html);
  const future = await listFutureEditionsForOrganizerSlug(pilot.organizerSlug);
  const dbUrls = future.flatMap((e) => e.sourceUrls);
  const missing = live.candidates.filter(
    (c) => !dbUrls.some((u) => urlsReferToSameEvent(c.officialUrl, u)),
  );
  console.log(
    `POST-COMPARE live=${live.candidates.length} db=${future.length} missing_by_url=${missing.length}`,
  );
  if (missing.length) {
    console.log(
      missing.slice(0, 10).map((m) => `${m.date} ${m.title}`).join("\n"),
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
