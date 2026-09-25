import { NextResponse } from "next/server";
import { resolveTipsAdminAccess } from "@/lib/tips/admin-auth";
import { listTips, updateTipStatus } from "@/lib/tips/service";
import { TIP_STATUSES, type TipStatus } from "@/types/tips";

export const dynamic = "force-dynamic";

function deny(reason: string) {
  // Use 404 for unauthenticated/forbidden to avoid confirming the endpoint.
  if (reason === "forbidden") {
    return NextResponse.json(
      { ok: false, error: "Geen beheerrechten." },
      { status: 403 },
    );
  }
  return NextResponse.json({ ok: false, error: "Niet beschikbaar." }, { status: 404 });
}

export async function GET() {
  const access = await resolveTipsAdminAccess();
  if (!access.ok) return deny(access.reason);

  const snapshot = await listTips();
  if (!snapshot) return deny("store_disabled");
  return NextResponse.json(snapshot);
}

export async function PATCH(request: Request) {
  const access = await resolveTipsAdminAccess();
  if (!access.ok) return deny(access.reason);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Ongeldige aanvraag." }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, error: "Ongeldige aanvraag." }, { status: 400 });
  }

  const record = body as Record<string, unknown>;
  // Ignore any client-supplied email/role fields — identity is session-only.
  const tipId = typeof record.tipId === "string" ? record.tipId : "";
  const status = record.status;
  if (!tipId || typeof status !== "string" || !TIP_STATUSES.includes(status as TipStatus)) {
    return NextResponse.json({ ok: false, error: "Ongeldige status." }, { status: 400 });
  }

  const result = await updateTipStatus({
    tipId,
    status: status as TipStatus,
    decisionReason:
      typeof record.decisionReason === "string" ? record.decisionReason : null,
    publishedEventPath:
      typeof record.publishedEventPath === "string"
        ? record.publishedEventPath
        : null,
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

/** Reserved: AI screening / email triggers must also call resolveTipsAdminAccess. */
export async function POST() {
  const access = await resolveTipsAdminAccess();
  if (!access.ok) return deny(access.reason);
  return NextResponse.json(
    {
      ok: false,
      error: "AI-screening en e-mailverzending zijn nog niet geactiveerd.",
    },
    { status: 501 },
  );
}
