import { NextResponse } from "next/server";
import {
  claimReelJobs,
  countPendingReels,
  getLastReelTrack,
} from "@/lib/instagram/queue";
import { isCronRequestAuthorized } from "@/lib/source-refresh/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Reel render queue for the GitHub Actions renderer.
 * GET  → { pending } (cheap check before installing Remotion)
 * POST → claims up to `limit` reels: { jobs: [{ id, scheduledAt, props }], lastTrack }
 * Auth: Authorization: Bearer $CRON_SECRET.
 */
export async function GET(request: Request) {
  if (!isCronRequestAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json({ ok: true, pending: await countPendingReels() });
  } catch (error) {
    console.error("[instagram/reels] count", error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false, error: "unavailable" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  if (!isCronRequestAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const body = (await request.json().catch(() => ({}))) as { limit?: unknown };
  const limit = Math.min(10, Math.max(1, Number(body.limit) || 3));
  try {
    const jobs = await claimReelJobs(limit);
    const lastTrack = await getLastReelTrack();
    if (jobs.length > 0) {
      console.info(`[instagram/reels] ${jobs.length} reel(s) geclaimd: ${jobs.map((j) => j.id).join(", ")}`);
    }
    return NextResponse.json({ ok: true, jobs, lastTrack });
  } catch (error) {
    console.error("[instagram/reels] claim", error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false, error: "unavailable" }, { status: 503 });
  }
}
