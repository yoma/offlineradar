import { NextResponse } from "next/server";
import { countPendingReels, recordInstagramRun } from "@/lib/instagram/queue";
import { runInstagramQueueTick, summarizeInstagramRun } from "@/lib/instagram/queue-runner";
import { kickReelRenderer } from "@/lib/instagram/reel/kick";
import { isCronRequestAuthorized } from "@/lib/source-refresh/cron-auth";
import { scrubSecrets } from "@/lib/instagram/token-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Instagram queue tick: publish one due post, otherwise propose one post for
 * an empty weekly slot; refreshes the access token when due.
 * Vercel cron, three runs each evening at 17:xx UTC (vercel.json; the ?run=
 * query only keeps the entries apart; Hobby crons run once a day somewhere
 * in the hour). The hourly GitHub run (/api/instagram/publish) publishes due
 * posts during the day too; "Nu plaatsen" covers any other moment. Every
 * round is logged (instagram_runs) and shown on the wachtrij page.
 * Auth: Authorization: Bearer $CRON_SECRET.
 */
export async function GET(request: Request) {
  if (!isCronRequestAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await runInstagramQueueTick();
    await recordInstagramRun({ source: "avond", ...summarizeInstagramRun(result) });
    // Back-up for reels left waiting (e.g. a retry after a failed render).
    if ((await countPendingReels().catch(() => 0)) > 0) await kickReelRenderer("cron");
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = scrubSecrets(
      error instanceof Error ? error.message : "instagram_tick_failed",
    );
    console.error("[cron/instagram]", message);
    await recordInstagramRun({
      source: "avond",
      ...summarizeInstagramRun({ published: [], error: message }),
    });
    return NextResponse.json(
      { ok: false, error: "instagram_tick_failed" },
      { status: 500 },
    );
  }
}
