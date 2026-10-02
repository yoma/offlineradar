/**
 * Thorough refresh for all registered pilot sources.
 * Usage: SOURCE_REFRESH_SKIP_COOLDOWN=1 node --env-file=.env.local --import tsx scripts/run-all-pilots-thorough-scan.ts
 */
import { startSourceRefresh } from "../lib/source-refresh/engine";
import { REFRESH_PILOTS } from "../lib/source-refresh/registry";

async function main() {
  const results: Array<Record<string, unknown>> = [];
  for (const pilot of REFRESH_PILOTS) {
    console.log(`\n=== ${pilot.label} (${pilot.parserKey}) ===`);
    try {
      const result = await startSourceRefresh({
        catalogSourceId: pilot.catalogSourceId,
        triggeredBy: "verify-script@local",
        triggerType: "manual",
        mode: "thorough",
        skipCooldown: true,
      });
      if (!result.ok) {
        console.error("FAILED:", result.code, result.error);
        results.push({
          label: pilot.label,
          ok: false,
          error: result.error,
          code: result.code,
          runId: result.run?.id,
          report: result.run?.report ?? null,
        });
        continue;
      }
      const run = result.run;
      const summary = {
        label: pilot.label,
        ok: true,
        runId: run.id,
        candidates: run.candidateCount,
        new: run.newCount,
        changed: run.changedCount,
        unchanged: run.unchangedCount,
        drafted: run.draftedCount,
        applied: run.appliedCount,
        completeness: run.report?.completeness,
      };
      console.log(JSON.stringify(summary, null, 2));
      results.push(summary);
    } catch (err) {
      console.error(err);
      results.push({
        label: pilot.label,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  console.log("\n=== SUMMARY ===");
  console.log(JSON.stringify(results, null, 2));
  if (results.some((r) => r.ok === false)) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
