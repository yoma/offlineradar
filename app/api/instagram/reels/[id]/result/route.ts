import { NextResponse } from "next/server";
import { notifyInstagramAdmins } from "@/lib/instagram/notify";
import { markReelFailed, markReelReady } from "@/lib/instagram/queue";
import { isCronRequestAuthorized } from "@/lib/source-refresh/cron-auth";
import { scrubSecrets } from "@/lib/instagram/token-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Report a finished render: { ok: true, track } after both uploads, or
 * { ok: false, message } when rendering failed. Auth: Bearer $CRON_SECRET.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!isCronRequestAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as
    | { ok?: unknown; track?: unknown; message?: unknown }
    | null;
  if (!body || typeof body.ok !== "boolean") {
    return NextResponse.json({ ok: false, error: "bad_body" }, { status: 400 });
  }
  try {
    if (body.ok) {
      const track = typeof body.track === "string" ? body.track.slice(0, 200) : null;
      const ready = await markReelReady(id, track);
      if (!ready) {
        return NextResponse.json({ ok: false, error: "incomplete" }, { status: 409 });
      }
      console.info(`[instagram/reels] ${id}: reel klaar (${track ?? "geen muziek"})`);
      return NextResponse.json({ ok: true, status: "klaar" });
    }
    const message = scrubSecrets(
      typeof body.message === "string" && body.message.trim()
        ? body.message.trim()
        : "Renderen mislukt.",
    );
    const failed = await markReelFailed(id, message);
    if (failed?.status === "mislukt" && failed.promo) {
      console.error(`[instagram/reels] ${id}: promo-reel definitief mislukt: ${message}`);
      await notifyInstagramAdmins({
        kind: "reel_render_failed",
        postId: id,
        message:
          `De promo-reel ${id} kon na 3 pogingen niet gemaakt worden, dus deze week gaat er geen promo-reel online. ` +
          `In de wachtrij kan je hem opnieuw laten maken (nieuwe tekst, nieuwe beelden of allebei).\n\nFout: ${message}`,
      });
    } else if (failed?.status === "mislukt") {
      console.error(`[instagram/reels] ${id}: reel definitief mislukt, de post gaat als gewone post: ${message}`);
      await notifyInstagramAdmins({
        kind: "reel_render_failed",
        postId: id,
        message:
          `De reel voor post ${id} kon na 3 pogingen niet gemaakt worden. ` +
          `Met reels aan gaat deze post als gewone post online. ` +
          `In de wachtrij kan je "Reel opnieuw maken" proberen.\n\nFout: ${message}`,
      });
    } else {
      console.warn(`[instagram/reels] ${id}: render mislukt, nieuwe poging volgt: ${message}`);
    }
    return NextResponse.json({ ok: true, status: failed?.status ?? null });
  } catch (error) {
    console.error("[instagram/reels] result", error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false, error: "unavailable" }, { status: 503 });
  }
}
