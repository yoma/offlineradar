/**
 * Shared parsing of Instagram image query params → render input.
 */

import type { Event } from "@/types/event";
import type { InstagramFormatId } from "@/lib/instagram/constants";
import type {
  InstagramRenderInput,
  InstagramRenderKind,
} from "@/lib/instagram/render";

const KINDS = new Set<InstagramRenderKind>([
  "binnenkort_cover",
  "event",
  "deze_week",
  "nieuw_cover",
]);

export function parseInstagramRenderKind(
  raw: string | null | undefined,
): InstagramRenderKind | null {
  if (!raw || !KINDS.has(raw as InstagramRenderKind)) return null;
  return raw as InstagramRenderKind;
}

export function eventsByIds(events: Event[], idsCsv: string | null): Event[] {
  if (!idsCsv) return [];
  const ids = idsCsv
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const byId = new Map(events.map((e) => [e.id, e]));
  return ids.map((id) => byId.get(id)).filter((e): e is Event => e != null);
}

export function resolveInstagramRenderInput(
  kind: InstagramRenderKind,
  params: URLSearchParams | Record<string, string>,
  catalog: Event[],
):
  | { ok: true; input: InstagramRenderInput }
  | { ok: false; error: string; status: number } {
  const get = (key: string): string | null => {
    if (params instanceof URLSearchParams) return params.get(key);
    const v = params[key];
    return typeof v === "string" ? v : null;
  };

  const period = get("period") ?? "";

  if (kind === "nieuw_cover") {
    return {
      ok: true,
      input: {
        kind,
        periodLabel: period || "Nieuwe singlesactiviteiten",
        // Optional: first event's website image leads the cover.
        events: eventsByIds(catalog, get("ids")),
      },
    };
  }

  if (kind === "binnenkort_cover") {
    const events = eventsByIds(catalog, get("ids"));
    return {
      ok: true,
      input: {
        kind,
        periodLabel: period,
        events,
        eventCount: events.length,
      },
    };
  }

  if (kind === "deze_week") {
    const events = eventsByIds(catalog, get("ids"));
    return {
      ok: true,
      input: {
        kind,
        periodLabel: period,
        events,
      },
    };
  }

  const id = get("id");
  const event = catalog.find((e) => e.id === id);
  if (!event) {
    return { ok: false, error: "event_not_found", status: 404 };
  }
  const index = Number(get("index") ?? "1") || 1;
  const total = Number(get("total") ?? "1") || 1;
  const format = (get("format") as InstagramFormatId | null) ?? "binnenkort";

  return {
    ok: true,
    input: {
      kind: "event",
      event,
      index,
      total,
      format,
    },
  };
}
