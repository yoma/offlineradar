/**
 * Autopilot Phase 2A discovery sweep (manual / dry-run).
 *
 * Default: dry-run (no DB writes).
 * Write mode: --write (still requires OFFLINERADAR_DISCOVERY_SWEEP=1 unless --force-write).
 *
 * Usage:
 *   npx tsx scripts/run-discovery-sweep.ts
 *   npx tsx scripts/run-discovery-sweep.ts --write
 *   node --env-file=.env.local --import tsx scripts/run-discovery-sweep.ts --max-queries=4
 */
import { runDiscoverySweep } from "../lib/discovery/sweep";
import { isDiscoverySweepGloballyEnabled } from "../lib/discovery/sweep-config";

function flag(name: string): boolean {
  return process.argv.includes(name);
}

function intFlag(name: string, fallback: number): number {
  const eq = process.argv.find((a) => a.startsWith(`${name}=`));
  if (eq) {
    const n = Number(eq.slice(name.length + 1));
    return Number.isFinite(n) ? n : fallback;
  }
  const idx = process.argv.indexOf(name);
  if (idx < 0) return fallback;
  const n = Number(process.argv[idx + 1]);
  return Number.isFinite(n) ? n : fallback;
}

async function main() {
  const wantWrite = flag("--write");
  const forceWrite = flag("--force-write");
  const includeWallonie = flag("--wallonie");
  const noAnthropic = flag("--no-anthropic");

  if (wantWrite && !isDiscoverySweepGloballyEnabled() && !forceWrite) {
    console.error(
      "FAIL write mode requires OFFLINERADAR_DISCOVERY_SWEEP=1 (or pass --force-write for explicit ops).",
    );
    process.exit(1);
  }

  const dryRun = !wantWrite;
  console.log(
    JSON.stringify(
      {
        mode: dryRun ? "dry-run" : "write",
        killSwitch: isDiscoverySweepGloballyEnabled(),
        wallonie: includeWallonie,
        anthropic: !noAnthropic,
      },
      null,
      2,
    ),
  );

  const summary = await runDiscoverySweep({
    dryRun,
    requireGlobalEnable: wantWrite && !forceWrite,
    maxQueries: intFlag("--max-queries", 6),
    maxCandidates: intFlag("--max-candidates", 12),
    maxInserts: intFlag("--max-inserts", 5),
    includeWallonie,
    useAnthropic: !noAnthropic,
  });

  console.log(
    JSON.stringify(
      {
        globallyEnabled: summary.globallyEnabled,
        dryRun: summary.dryRun,
        wrote: summary.wrote,
        queries: summary.queries,
        providersUsed: summary.providersUsed,
        searchHitCount: summary.searchHitCount,
        evaluated: summary.evaluated,
        inserts: summary.inserts,
        updates: summary.updates,
        skippedExisting: summary.skippedExisting,
        accepted: summary.accepted,
        rejected: summary.rejected.slice(0, 40),
      },
      null,
      2,
    ),
  );

  if (!dryRun && summary.wrote) {
    console.log("\nOK: discovery sweep wrote promising agent sources (no publish).");
  } else {
    console.log("\nOK: discovery sweep dry-run complete (no DB writes).");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
