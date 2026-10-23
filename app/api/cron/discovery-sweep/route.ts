import { NextResponse } from "next/server";
import { isCronRequestAuthorized } from "@/lib/source-refresh/cron-auth";
import { isDiscoverySweepGloballyEnabled } from "@/lib/discovery/sweep-config";
import { runDiscoverySweep } from "@/lib/discovery/sweep";

export const dynamic = "force-dynamic";
/** Bounded search + few HTML fetches. */
export const maxDuration = 60;

/**
 * Vercel Cron: Autopilot Phase 2A organizer discovery.
 * Auth: Authorization: Bearer $CRON_SECRET
 * Kill switch: OFFLINERADAR_DISCOVERY_SWEEP=1 required (default OFF).
 *
 * Writes only catalog_sources (promising, refresh_enabled=false, discovered_by=agent).
 * Never publishes events.
 */
export async function GET(request: Request) {
  if (!isCronRequestAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  if (!isDiscoverySweepGloballyEnabled()) {
    return NextResponse.json({
      ok: true,
      globallyEnabled: false,
      skipped: true,
      reason: "kill_switch_off",
    });
  }

  try {
    const summary = await runDiscoverySweep({
      dryRun: false,
      requireGlobalEnable: true,
      useAnthropic: true,
    });

    return NextResponse.json({
      ok: true,
      globallyEnabled: summary.globallyEnabled,
      dryRun: summary.dryRun,
      wrote: summary.wrote,
      queryCount: summary.queries.length,
      providersUsed: summary.providersUsed,
      searchHitCount: summary.searchHitCount,
      evaluated: summary.evaluated,
      inserts: summary.inserts,
      updates: summary.updates,
      skippedExisting: summary.skippedExisting,
      accepted: summary.accepted.map((a) => ({
        catalogSourceId: a.catalogSourceId,
        created: a.created,
        channel: a.channel,
        route: a.route,
        // No raw private titles beyond organizer name length-capped.
        name: a.name.slice(0, 80),
      })),
      rejectedCount: summary.rejected.length,
      rejectedSample: summary.rejected.slice(0, 15).map((r) => ({
        reason: r.reason,
      })),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "discovery_sweep_failed";
    console.error("[cron/discovery-sweep]", message);
    return NextResponse.json(
      { ok: false, error: "discovery_sweep_failed" },
      { status: 500 },
    );
  }
}
