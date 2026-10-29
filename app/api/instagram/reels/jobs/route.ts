import { NextResponse } from "next/server";
import { listEvents } from "@/lib/events";
import { countEventsThisWeek } from "@/lib/instagram/promo/schedule";
import {
  claimReelJobs,
  countPendingReels,
  getLastReelTrack,
  getPromoHistory,
  getRecentBackdropKeys,
  getRecentStockClipKeys,
  type ReelJob,
} from "@/lib/instagram/queue";
import { isCronRequestAuthorized } from "@/lib/source-refresh/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Reel render queue for the GitHub Actions renderer.
 * GET  → { pending } (cheap check before installing Remotion)
 * POST → claims up to `limit` reels: { jobs, lastTrack, lastPromoTrack,
 *        usedClipKeys } (stock pictures of recent promo and event reels).
 *        A job is { kind: "reel", id, scheduledAt, props } or a promo reel
 *        { kind: "promo", ..., plan, redo }; a promo job that needs a (new)
 *        plan also gets `history` (what earlier promo reels used) and
 *        `eventCount` (events in the 7 days from its publish date).
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
    const claimed = await claimReelJobs(limit);
    const jobs = await withPromoContext(claimed);
    const lastTrack = await getLastReelTrack("reel");
    const lastPromoTrack = await getLastReelTrack("promo");
    const usedClipKeys = jobs.some((j) => j.kind === "reel") ? await getRecentStockClipKeys() : [];
    if (jobs.length > 0) {
      console.info(`[instagram/reels] ${jobs.length} reel(s) geclaimd: ${jobs.map((j) => j.id).join(", ")}`);
    }
    return NextResponse.json({ ok: true, jobs, lastTrack, lastPromoTrack, usedClipKeys });
  } catch (error) {
    console.error("[instagram/reels] claim", error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false, error: "unavailable" }, { status: 503 });
  }
}

/** History and event count for promo jobs that get a new plan. */
async function withPromoContext(jobs: ReelJob[]) {
  const needPlan = jobs.some((j) => j.kind === "promo" && (j.redo || !j.props));
  if (!needPlan) return jobs;
  const [promo, eventKeys] = await Promise.all([getPromoHistory(), getRecentBackdropKeys()]);
  // Promo clips first (the newest count most), then the event reels' pictures.
  const history = { ...promo, usedClipKeys: [...promo.usedClipKeys, ...eventKeys] };
  const catalog = await listEvents().catch((error) => {
    console.warn("[instagram/reels] catalogus voor promo", error instanceof Error ? error.message : error);
    return null;
  });
  return jobs.map((j) =>
    j.kind === "promo" && (j.redo || !j.props)
      ? {
          ...j,
          history,
          eventCount: catalog ? countEventsThisWeek(catalog, new Date(j.scheduledAt)) : null,
        }
      : j,
  );
}
