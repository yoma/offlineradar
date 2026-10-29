import { NextResponse } from "next/server";
import {
  excludeAnalyticsSession,
  includeAnalyticsSession,
} from "@/lib/analytics/schema";

export const runtime = "nodejs";

/**
 * "Dit toestel niet meetellen": the caller can only (un)exclude its own
 * anonymous device id, so no login is needed.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const record = (body ?? {}) as Record<string, unknown>;
  const id = typeof record.anonymousSessionId === "string" ? record.anonymousSessionId.trim() : "";
  if (id.length < 8 || id.length > 80) {
    return NextResponse.json({ ok: false, error: "invalid_session" }, { status: 400 });
  }
  try {
    if (record.mode === "include") await includeAnalyticsSession(id);
    else await excludeAnalyticsSession(id, record.reason === "admin" ? "admin" : "self");
  } catch {
    return NextResponse.json({ ok: false, error: "db_unavailable" }, { status: 503 });
  }
  return NextResponse.json({ ok: true });
}
