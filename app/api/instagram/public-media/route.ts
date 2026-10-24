/**
 * Public signed JPEG endpoint for Meta crawlers (Phase 3B).
 * Auth = HMAC ticket only (no admin session). Short-lived tokens.
 */

import { NextResponse } from "next/server";
import { renderInstagramJpegFromQuery } from "@/lib/instagram/render-jpeg";
import { verifyInstagramMediaTicket } from "@/lib/instagram/signed-media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("t");
  if (!token) {
    return NextResponse.json({ error: "missing_token" }, { status: 401 });
  }

  const verified = verifyInstagramMediaTicket(token);
  if (!verified.ok) {
    const status = verified.error === "expired" ? 410 : 401;
    return NextResponse.json({ error: verified.error }, { status });
  }

  const result = await renderInstagramJpegFromQuery(
    verified.ticket.kind,
    verified.ticket.q,
  );
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status },
    );
  }

  return new NextResponse(new Uint8Array(result.bytes), {
    status: 200,
    headers: {
      "Content-Type": result.contentType,
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
