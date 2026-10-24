/**
 * Instagram image render API (admin-only).
 * Returns 1080×1350 PNG via next/og. Never publishes to Meta.
 */

import { NextResponse } from "next/server";
import { listEvents } from "@/lib/events";
import { resolveTipsAdminAccess } from "@/lib/tips/admin-auth";
import {
  renderInstagramImage,
  type InstagramRenderKind,
} from "@/lib/instagram/render";
import type { Event } from "@/types/event";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KINDS = new Set<InstagramRenderKind>([
  "binnenkort_cover",
  "event",
  "deze_week",
  "nieuw_cover",
]);

function parseKind(raw: string | null): InstagramRenderKind | null {
  if (!raw || !KINDS.has(raw as InstagramRenderKind)) return null;
  return raw as InstagramRenderKind;
}

function byIds(events: Event[], idsCsv: string | null): Event[] {
  if (!idsCsv) return [];
  const ids = idsCsv
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const byId = new Map(events.map((e) => [e.id, e]));
  // Preserve selection order (Set/filter would scramble it).
  return ids.map((id) => byId.get(id)).filter((e): e is Event => e != null);
}

export async function GET(request: Request) {
  const access = await resolveTipsAdminAccess();
  if (!access.ok) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const kind = parseKind(url.searchParams.get("kind"));
  if (!kind) {
    return NextResponse.json({ error: "invalid_kind" }, { status: 400 });
  }

  try {
    const period = url.searchParams.get("period") ?? "";

    if (kind === "nieuw_cover") {
      return await renderInstagramImage({
        kind,
        periodLabel: period || "Nieuwe singlesactiviteiten",
      });
    }

    const catalog = await listEvents();

    if (kind === "binnenkort_cover") {
      const events = byIds(catalog, url.searchParams.get("ids"));
      return await renderInstagramImage({
        kind,
        periodLabel: period,
        events,
        eventCount: events.length,
      });
    }

    if (kind === "deze_week") {
      const events = byIds(catalog, url.searchParams.get("ids"));
      return await renderInstagramImage({
        kind,
        periodLabel: period,
        events,
      });
    }

    // event slide
    const id = url.searchParams.get("id");
    const event = catalog.find((e) => e.id === id);
    if (!event) {
      return NextResponse.json({ error: "event_not_found" }, { status: 404 });
    }
    const index = Number(url.searchParams.get("index") ?? "1") || 1;
    const total = Number(url.searchParams.get("total") ?? "1") || 1;
    const format =
      (url.searchParams.get("format") as
        | "binnenkort"
        | "deze_week"
        | "nieuw"
        | null) ?? "binnenkort";

    return await renderInstagramImage({
      kind: "event",
      event,
      index,
      total,
      format,
    });
  } catch (error) {
    console.error("[instagram/image]", error);
    return NextResponse.json(
      { error: "render_failed", message: String(error) },
      { status: 500 },
    );
  }
}
