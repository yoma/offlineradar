import { NextResponse } from "next/server";
import { runInstagramQueueTick } from "@/lib/instagram/queue-runner";
import { isCronRequestAuthorized } from "@/lib/source-refresh/cron-auth";
import { scrubSecrets } from "@/lib/instagram/token-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Instagram queue tick: publish one due post, otherwise propose one post for
 * an empty weekly slot; refreshes the access token when due.
 * Vercel cron, daily at 17:xx UTC (18–19h Brussels; Hobby crons run once a
 * day somewhere in the hour). "Nu plaatsen" on the admin page covers posting
 * at any other moment. Auth: Authorization: Bearer $CRON_SECRET.
 */
export async function GET(request: Request) {
  if (!isCronRequestAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await runInstagramQueueTick();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = scrubSecrets(
      error instanceof Error ? error.message : "instagram_tick_failed",
    );
    console.error("[cron/instagram]", message);
    return NextResponse.json(
      { ok: false, error: "instagram_tick_failed" },
      { status: 500 },
    );
  }
}
