import { NextResponse } from "next/server";
import { isCronRequestAuthorized } from "@/lib/source-refresh/cron-auth";
import { runScheduledSourceRefresh } from "@/lib/source-refresh/scheduler";

export const dynamic = "force-dynamic";
/** Allow enough time for a small bounded batch of HTML fetches + parse. */
export const maxDuration = 60;

/**
 * Vercel Cron: daily scheduled source refresh for stable parsers only.
 * Auth: Authorization: Bearer $CRON_SECRET
 * Kill switch: OFFLINERADAR_SCHEDULED_REFRESH=1 required (default OFF).
 */
export async function GET(request: Request) {
  if (!isCronRequestAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const summary = await runScheduledSourceRefresh();
    // No raw event titles / private URLs in response beyond aggregate counts.
    return NextResponse.json({
      ok: true,
      globallyEnabled: summary.globallyEnabled,
      due: summary.due,
      attempted: summary.attempted,
      succeeded: summary.succeeded,
      partial: summary.partial,
      failed: summary.failed,
      skipped: summary.skipped,
      outcomes: summary.outcomes.map((o) => ({
        catalogSourceId: o.catalogSourceId,
        parserKey: o.parserKey,
        status: o.status,
        reason: o.reason ?? null,
        runId: o.runId ?? null,
        newCount: o.newCount ?? null,
        changedCount: o.changedCount ?? null,
        removedCount: o.removedCount ?? null,
        unchangedCount: o.unchangedCount ?? null,
      })),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "scheduled_refresh_failed";
    console.error("[cron/source-refresh]", message);
    return NextResponse.json(
      { ok: false, error: "scheduled_refresh_failed" },
      { status: 500 },
    );
  }
}
