/**
 * Instagram image render API (admin-only).
 * Returns 1080×1350 PNG via next/og. Never publishes to Meta.
 */

import { NextResponse } from "next/server";
import { listEvents } from "@/lib/events";
import { resolveTipsAdminAccess } from "@/lib/tips/admin-auth";
import {
  parseInstagramRenderKind,
  resolveInstagramRenderInput,
} from "@/lib/instagram/image-query";
import { renderInstagramImage } from "@/lib/instagram/render";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const access = await resolveTipsAdminAccess();
  if (!access.ok) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const kind = parseInstagramRenderKind(url.searchParams.get("kind"));
  if (!kind) {
    return NextResponse.json({ error: "invalid_kind" }, { status: 400 });
  }

  try {
    const catalog = await listEvents();
    const resolved = resolveInstagramRenderInput(
      kind,
      url.searchParams,
      catalog,
    );
    if (!resolved.ok) {
      return NextResponse.json(
        { error: resolved.error },
        { status: resolved.status },
      );
    }
    return await renderInstagramImage(resolved.input);
  } catch (error) {
    console.error("[instagram/image]", error);
    return NextResponse.json(
      { error: "render_failed", message: String(error) },
      { status: 500 },
    );
  }
}
