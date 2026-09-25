import { PILOT_CANDIDATES } from "@/data/pilot/candidates";
import { runPipeline } from "@/lib/screening/pipeline";
import { DEFAULT_PILOT_WINDOW } from "@/lib/screening/screen";
import type { ScreeningDecision, ScreeningStatusReason } from "@/types/screening";

/**
 * Real Data Screening Pilot report (local dev tool, no infra).
 *
 * Runs the isolated pipeline over the real candidate set and prints an
 * inspectable table plus a summary, separating concept suitability (A),
 * concrete occurrence (B) and publication readiness. Does not touch the feed.
 *
 * `now` is pinned to the pilot reference date so results are reproducible.
 */
const PILOT_NOW = new Date("2026-09-25T08:00:00+02:00");

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

function yesNo(value: boolean): string {
  return value ? "ja" : "nee";
}

function main() {
  const rows = runPipeline(PILOT_CANDIDATES, DEFAULT_PILOT_WINDOW, PILOT_NOW);

  console.log("# OfflineRadar Real Data Screening Pilot\n");
  console.log(
    `Kandidaten: ${rows.length} · pilotvenster ${DEFAULT_PILOT_WINDOW.start}..${DEFAULT_PILOT_WINDOW.end}\n`,
  );

  console.log(
    "| Activiteit | Besluit | Status | Concept | Concreet moment | Binnen venster | Publicatieklaar | Reden |",
  );
  console.log("|---|---|---|---|---|---|---|---|");
  for (const { normalized, result } of rows) {
    const occ = result.occurrence.confirmed
      ? result.occurrence.dateDerived
        ? "afgeleid"
        : "bevestigd"
      : "onbevestigd";
    console.log(
      `| ${truncate(normalized.title, 40)} | ${result.decision} | ${result.statusReason} | ${yesNo(result.conceptSuitable)} | ${occ} | ${yesNo(result.occurrence.withinPilotWindow)} | ${yesNo(result.publicationReady)} | ${truncate(result.reason, 80)} |`,
    );
  }

  const counts: Record<ScreeningDecision, number> = { ACCEPT: 0, REVIEW: 0, REJECT: 0 };
  const reasonCounts = new Map<ScreeningStatusReason, number>();
  let conceptSuitable = 0;
  let confirmedWithinWindow = 0;
  let suitableConfirmedWithinWindow = 0;
  let conceptSuitableNotReady = 0;
  let gateDisagreements = 0;

  for (const { result } of rows) {
    counts[result.decision] += 1;
    reasonCounts.set(result.statusReason, (reasonCounts.get(result.statusReason) ?? 0) + 1);
    const inWindowConfirmed =
      result.occurrence.confirmed && result.occurrence.withinPilotWindow;
    if (result.conceptSuitable) conceptSuitable += 1;
    if (inWindowConfirmed) confirmedWithinWindow += 1;
    if (result.conceptSuitable && inWindowConfirmed) suitableConfirmedWithinWindow += 1;
    if (result.conceptSuitable && !result.publicationReady) conceptSuitableNotReady += 1;
    if (!result.listingGateAgrees) gateDisagreements += 1;
  }

  console.log("\n## Samenvatting\n");
  console.log(`- Verzameld: ${rows.length}`);
  console.log(`- ACCEPT (publicatieklaar): ${counts.ACCEPT}`);
  console.log(`- REVIEW: ${counts.REVIEW}`);
  console.log(`- REJECT: ${counts.REJECT}`);
  console.log(`- Inhoudelijk geschikt (concept): ${conceptSuitable}`);
  console.log(`- Bevestigd moment binnen pilotvenster (alle): ${confirmedWithinWindow}`);
  console.log(
    `- Bevestigd moment binnen pilotvenster (concept-geschikt): ${suitableConfirmedWithinWindow}`,
  );
  console.log(`- Inhoudelijk geschikt maar nog niet publicatieklaar: ${conceptSuitableNotReady}`);

  console.log("\n### Status-verdeling");
  for (const [reason, n] of [...reasonCounts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`- (${n}) ${reason}`);
  }

  console.log(
    `\n### Listing-gate cross-check (lib/events): ${gateDisagreements === 0 ? "consistent" : `${gateDisagreements} afwijking(en)`}`,
  );
}

main();
