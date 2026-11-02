import { NextResponse } from "next/server";
import { recordInstagramRun } from "@/lib/instagram/queue";
import { runHourlyPublishTick, summarizeInstagramRun } from "@/lib/instagram/queue-runner";
import { isCronRequestAuthorized } from "@/lib/source-refresh/cron-auth";
import { scrubSecrets } from "@/lib/instagram/token-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Meta processes the video while we wait. */
export const maxDuration = 300;

/**
 * Publish every post that is due (promo reels at their own time, event posts
 * whose evening round was missed). Called every hour by the GitHub workflow
 * "Instagram publish"; the Vercel cron covers the evening.
 * Auth: Authorization: Bearer $CRON_SECRET.
 */
export async function POST(request: Request) {
  if (!isCronRequestAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await runHourlyPublishTick();
    // Only rounds that did something are logged: an empty hour is no news.
    if (result.published.length > 0) {
      await recordInstagramRun({ source: "uur", ...summarizeInstagramRun(result) });
    }
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = scrubSecrets(error instanceof Error ? error.message : "publish_failed");
    console.error("[instagram/publish]", message);
    await recordInstagramRun({
      source: "uur",
      ...summarizeInstagramRun({ published: [], error: message }),
    });
    return NextResponse.json({ ok: false, error: "publish_failed" }, { status: 500 });
  }
}
