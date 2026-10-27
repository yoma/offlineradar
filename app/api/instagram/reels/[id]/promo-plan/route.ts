import { NextResponse } from "next/server";
import { savePromoPlan } from "@/lib/instagram/queue";
import type { PromoPlanRecord, PromoReelProps } from "@/lib/instagram/promo/types";
import { isCronRequestAuthorized } from "@/lib/source-refresh/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Small sanity check; the renderer is our own script. */
function looksLikePlan(body: unknown): body is {
  plan: PromoPlanRecord;
  props: PromoReelProps;
  caption: string;
} {
  const b = body as { plan?: PromoPlanRecord; props?: PromoReelProps; caption?: unknown } | null;
  return Boolean(
    b &&
      typeof b.caption === "string" &&
      b.caption.trim() &&
      typeof b.plan?.script?.hook === "string" &&
      Array.isArray(b.plan.clips) &&
      b.plan.clips.length > 0 &&
      Array.isArray(b.props?.clips) &&
      b.props.clips.length === b.plan.clips.length &&
      Array.isArray(b.props.timing?.clipFrames),
  );
}

/**
 * Store a new promo plan (script, clips, props, caption) made by the
 * renderer, before it renders. Auth: Bearer $CRON_SECRET.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!isCronRequestAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as unknown;
  if (!looksLikePlan(body)) {
    return NextResponse.json({ ok: false, error: "bad_body" }, { status: 400 });
  }
  try {
    const saved = await savePromoPlan(id, body);
    if (!saved) {
      return NextResponse.json({ ok: false, error: "not_rendering" }, { status: 409 });
    }
    console.info(`[instagram/reels] ${id}: promo-plan "${body.plan.script.hook}"`);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[instagram/reels] promo-plan", error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false, error: "unavailable" }, { status: 503 });
  }
}
