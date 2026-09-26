import { NextResponse } from "next/server";
import { submitEventReport } from "@/lib/events/reports";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Public report endpoint.
 * Response is always minimal: { ok: true } or { ok: false, error }.
 * Never leaks counts, hashes, or admin state.
 */
export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const result = await submitEventReport({
    eventEditionId: id,
    request,
  });

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: result.status },
    );
  }

  return NextResponse.json({ ok: true });
}
