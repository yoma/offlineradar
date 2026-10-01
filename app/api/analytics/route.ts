import { NextResponse } from "next/server";
import { insertAnalyticsEvent } from "@/lib/analytics/store";
import { isAllowlistedAdminEmail } from "@/lib/tips/admin-auth";

export const runtime = "nodejs";

const BOT_RE =
  /bot|crawler|spider|slurp|bingpreview|facebookexternalhit|embedly|quora|pinterest|redditbot|applebot|duckduckbot|yandex|baidu|semrush|ahrefs|mj12bot|dotbot|petalbot|bytespider|gptbot|claudebot|amazonbot|headless/i;

function isProductionTraffic(): boolean {
  const env = process.env.VERCEL_ENV ?? process.env.NODE_ENV;
  if (env === "development" || env === "test") return false;
  // Prefer production only; preview deploys skip persistence.
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production") {
    return false;
  }
  return true;
}

function asString(value: unknown, max = 200): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

function asMeta(
  properties: unknown,
): Record<string, unknown> {
  if (!properties || typeof properties !== "object" || Array.isArray(properties)) {
    return {};
  }
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(properties as Record<string, unknown>)) {
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value == null) {
      out[key] = value;
    }
  }
  return out;
}

export async function POST(request: Request) {
  if (!isProductionTraffic()) {
    return NextResponse.json({ ok: true, skipped: "non_production" });
  }

  const ua = request.headers.get("user-agent") ?? "";
  if (BOT_RE.test(ua)) {
    return NextResponse.json({ ok: true, skipped: "bot" });
  }

  // Exclude authenticated admins so internal browsing does not dominate metrics.
  try {
    const { auth } = await import("@/auth");
    const session = await auth();
    const email =
      typeof session?.user?.email === "string" ? session.user.email : null;
    if (isAllowlistedAdminEmail(email)) {
      return NextResponse.json({ ok: true, skipped: "admin" });
    }
  } catch {
    // Auth unavailable: continue as anonymous.
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const record = body as Record<string, unknown>;
  const name = asString(record.name, 80);
  const anonymousSessionId = asString(record.anonymousSessionId, 80);
  if (!name || !anonymousSessionId) {
    return NextResponse.json({ ok: false, error: "missing_fields" }, { status: 400 });
  }

  const properties = asMeta(record.properties);
  const eventEditionId =
    asString(properties.eventId, 80) ??
    asString(properties.eventEditionId, 80) ??
    asString(properties.editionId, 80);
  const organizerId = asString(properties.organizerId, 80);
  const category = asString(properties.category, 64);
  const path = asString(record.path, 300);

  const result = await insertAnalyticsEvent({
    eventName: name,
    eventEditionId,
    organizerId,
    category,
    metadata: properties,
    anonymousSessionId,
    path,
  });

  if (!result.ok) {
    return NextResponse.json(result, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
