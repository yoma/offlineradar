import { NextResponse } from "next/server";
import { saveReelMedia } from "@/lib/instagram/queue";
import { REEL_MAX_UPLOAD_BYTES } from "@/lib/instagram/reel/limits";
import { isCronRequestAuthorized } from "@/lib/source-refresh/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function looksLikeMp4(bytes: Buffer): boolean {
  return bytes.byteLength > 12 && bytes.subarray(4, 8).toString("latin1") === "ftyp";
}

function looksLikeJpeg(bytes: Buffer): boolean {
  return bytes.byteLength > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

/**
 * Upload the rendered MP4 (?kind=reel) or its cover JPEG (?kind=reel_cover)
 * for a post whose reel is being rendered. Auth: Bearer $CRON_SECRET.
 */
export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!isCronRequestAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const { id } = await context.params;
  const kind = new URL(request.url).searchParams.get("kind");
  if (kind !== "reel" && kind !== "reel_cover") {
    return NextResponse.json({ ok: false, error: "bad_kind" }, { status: 400 });
  }
  const bytes = Buffer.from(await request.arrayBuffer());
  if (bytes.byteLength === 0 || bytes.byteLength > REEL_MAX_UPLOAD_BYTES) {
    return NextResponse.json({ ok: false, error: "bad_size" }, { status: 413 });
  }
  if (kind === "reel" ? !looksLikeMp4(bytes) : !looksLikeJpeg(bytes)) {
    return NextResponse.json({ ok: false, error: "bad_type" }, { status: 415 });
  }
  try {
    const mediaId = await saveReelMedia(id, kind, bytes);
    if (!mediaId) {
      return NextResponse.json({ ok: false, error: "not_rendering" }, { status: 409 });
    }
    return NextResponse.json({ ok: true, mediaId });
  } catch (error) {
    console.error("[instagram/reels] upload", error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false, error: "unavailable" }, { status: 503 });
  }
}
