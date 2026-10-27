import { NextResponse } from "next/server";
import { runPromoPublishTick } from "@/lib/instagram/queue-runner";
import { isCronRequestAuthorized } from "@/lib/source-refresh/cron-auth";
import { scrubSecrets } from "@/lib/instagram/token-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Meta processes the video while we wait. */
export const maxDuration = 300;

/**
 * Publish a promo reel that is due. Called every hour by the GitHub workflow
 * "Instagram promo publish" (the Vercel cron runs only in the evening).
 * Auth: Authorization: Bearer $CRON_SECRET.
 */
export async function POST(request: Request) {
  if (!isCronRequestAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await runPromoPublishTick();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = scrubSecrets(error instanceof Error ? error.message : "promo_publish_failed");
    console.error("[instagram/promo] publish", message);
    return NextResponse.json({ ok: false, error: "promo_publish_failed" }, { status: 500 });
  }
}
