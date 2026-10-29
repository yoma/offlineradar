import { NextResponse } from "next/server";
import { loadLiveVisitors } from "@/lib/analytics/audience";
import { resolveTipsAdminAccess } from "@/lib/tips/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Admin only: who is on the site right now (last 5 minutes). */
export async function GET() {
  const access = await resolveTipsAdminAccess();
  if (!access.ok) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  try {
    return NextResponse.json(
      { visitors: await loadLiveVisitors(5) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
}
