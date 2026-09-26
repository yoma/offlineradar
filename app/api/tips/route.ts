import { NextResponse } from "next/server";
import {
  isTipsPublicSubmitEnabled,
  isTipsSubmitEnabled,
  tipsStorageMode,
} from "@/lib/tips/config";
import { consumeTipSubmitRateLimit } from "@/lib/tips/rate-limit";
import { createTip } from "@/lib/tips/service";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 16_384;

/** Public capability probe only — never returns tips, notes, or emails. */
export async function GET() {
  return NextResponse.json({
    submitEnabled: isTipsSubmitEnabled(),
    publicSubmitEnabled: isTipsPublicSubmitEnabled(),
    storageMode: tipsStorageMode(),
  });
}

export async function POST(request: Request) {
  if (!isTipsSubmitEnabled()) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Tips kunnen nu nog niet duurzaam worden opgeslagen. Verzenden is uitgeschakeld.",
      },
      { status: 503 },
    );
  }

  // Shared Neon rate limit (required for public production submit).
  const rate = await consumeTipSubmitRateLimit(request);
  if (!rate.ok) {
    return NextResponse.json(
      { ok: false, error: rate.error },
      { status: rate.status },
    );
  }

  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > MAX_BODY_BYTES) {
    return NextResponse.json(
      { ok: false, error: "Aanvraag is te groot." },
      { status: 413 },
    );
  }

  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Ongeldige aanvraag." },
      { status: 400 },
    );
  }

  if (raw.length > MAX_BODY_BYTES) {
    return NextResponse.json(
      { ok: false, error: "Aanvraag is te groot." },
      { status: 413 },
    );
  }

  let body: unknown;
  try {
    body = JSON.parse(raw) as unknown;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Ongeldige aanvraag." },
      { status: 400 },
    );
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json(
      { ok: false, error: "Ongeldige aanvraag." },
      { status: 400 },
    );
  }

  const record = body as Record<string, unknown>;
  const url = typeof record.url === "string" ? record.url : "";
  const note = typeof record.note === "string" ? record.note : null;
  const notifyRequested = record.notifyRequested === true;
  const email = typeof record.email === "string" ? record.email : null;

  const result = await createTip({
    url,
    note,
    notifyRequested,
    email: notifyRequested ? email : null,
    userAgent: request.headers.get("user-agent"),
  });

  if (!result.ok) {
    const status =
      result.code === "storage_disabled"
        ? 503
        : result.code === "storage_error"
          ? 503
          : 400;
    return NextResponse.json(
      { ok: false, error: result.error },
      { status },
    );
  }

  // Success only after durable store write. Never leak emails or other tips.
  return NextResponse.json({
    ok: true,
    tipId: result.tip.id,
    duplicate: result.duplicate,
    message: result.duplicate
      ? "Bedankt! We hadden deze link al ontvangen. Je toelichting is bewaard bij de bestaande melding."
      : "Bedankt voor je tip! We controleren de activiteit en bekijken of ze op OfflineRadar past. Inzenden geeft geen garantie op publicatie.",
  });
}
