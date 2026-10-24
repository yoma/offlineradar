/**
 * Public signed JPEG endpoint for Meta crawlers (Phase 3B).
 * Auth = HMAC ticket only (no admin session). Short-lived tokens.
 *
 * Tickets carry a content fingerprint; rendering uses frozen approved
 * event snapshots so late Meta fetches cannot pick up title/date/location drift.
 */

import { NextResponse } from "next/server";
import { getApprovalByContentFingerprint } from "@/lib/instagram/approvals";
import { eventsFromSnapshots } from "@/lib/instagram/event-snapshot";
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

  const approval = await getApprovalByContentFingerprint(verified.ticket.fp);
  if (!approval) {
    return NextResponse.json(
      { error: "approval_not_found" },
      { status: 404 },
    );
  }

  const frozenCatalog = eventsFromSnapshots(approval.eventSnapshots);
  const result = await renderInstagramJpegFromQuery(
    verified.ticket.kind,
    verified.ticket.q,
    { catalog: frozenCatalog },
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
      "X-Instagram-Content-Fingerprint": verified.ticket.fp.slice(0, 16),
    },
  });
}
