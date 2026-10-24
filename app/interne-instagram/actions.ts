"use server";

import { revalidatePath } from "next/cache";
import { listEvents } from "@/lib/events";
import { resolveTipsAdminAccess } from "@/lib/tips/admin-auth";
import { recordConceptApproval } from "@/lib/instagram/approvals";
import type { InstagramSlideApproval } from "@/lib/instagram/concept-key";
import type { InstagramFormatId } from "@/lib/instagram/constants";
import { snapshotFromEvent } from "@/lib/instagram/event-snapshot";
import { recordConceptEventIds } from "@/lib/instagram/history";
import { publishInstagramConcept } from "@/lib/instagram/publish";
import type { InstagramRenderKind } from "@/lib/instagram/render";

function parseFormat(raw: string): InstagramFormatId | null {
  if (raw === "binnenkort" || raw === "deze_week" || raw === "nieuw") {
    return raw;
  }
  return null;
}

function parseSlides(raw: string): InstagramSlideApproval[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const row = item as Record<string, unknown>;
        const kind = String(row.kind ?? "") as InstagramRenderKind;
        const label = String(row.label ?? "");
        const query =
          row.query && typeof row.query === "object"
            ? (row.query as Record<string, string>)
            : {};
        if (!kind) return null;
        return { kind, label, query };
      })
      .filter((s): s is InstagramSlideApproval => s != null);
  } catch {
    return [];
  }
}

/** Dutch copy for approve action failures (UI must surface these, not swallow). */
export function approveInstagramConceptErrorMessage(
  error: string,
  detail?: string,
): string {
  switch (error) {
    case "unauthorized":
      return "Je bent niet ingelogd als beheerder.";
    case "invalid_concept":
      return "Concept is onvolledig (events, caption of slides ontbreken).";
    case "catalog_unavailable":
      return "Catalogus kon niet worden geladen. Probeer opnieuw.";
    case "events_missing":
      return detail
        ? `Event ontbreekt in de catalogus (${detail}). Vernieuw de pagina en keur opnieuw goed.`
        : "Een of meer events ontbreken in de catalogus. Vernieuw de pagina.";
    case "approval_store_failed":
      return detail
        ? `Goedkeuring kon niet worden opgeslagen: ${detail}`
        : "Goedkeuring kon niet worden opgeslagen. Probeer opnieuw.";
    default:
      return "Goedkeuren mislukt — probeer opnieuw.";
  }
}

/**
 * Mark a concept as reviewed with exact caption + slides + event field snapshots.
 * Does NOT publish to Instagram.
 */
export async function approveInstagramConceptAction(formData: FormData) {
  const access = await resolveTipsAdminAccess();
  if (!access.ok) {
    return {
      ok: false as const,
      error: "unauthorized" as const,
      message: approveInstagramConceptErrorMessage("unauthorized"),
    };
  }

  const format = parseFormat(String(formData.get("format") ?? ""));
  const eventIds = String(formData.get("eventIds") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const caption = String(formData.get("caption") ?? "");
  const slides = parseSlides(String(formData.get("slides") ?? "[]"));

  if (!format || eventIds.length === 0 || !caption || slides.length === 0) {
    return {
      ok: false as const,
      error: "invalid_concept" as const,
      message: approveInstagramConceptErrorMessage("invalid_concept"),
    };
  }

  let catalog: Awaited<ReturnType<typeof listEvents>>;
  try {
    catalog = await listEvents();
  } catch {
    return {
      ok: false as const,
      error: "catalog_unavailable" as const,
      message: approveInstagramConceptErrorMessage("catalog_unavailable"),
    };
  }
  const byId = new Map(catalog.map((e) => [e.id, e]));
  const ordered = [];
  for (const id of eventIds) {
    const event = byId.get(id);
    if (!event) {
      return {
        ok: false as const,
        error: "events_missing" as const,
        detail: id,
        message: approveInstagramConceptErrorMessage("events_missing", id),
      };
    }
    ordered.push(event);
  }
  const eventSnapshots = ordered.map(snapshotFromEvent);

  const result = await recordConceptEventIds(eventIds);
  const approval = await recordConceptApproval({
    format,
    eventIds,
    caption,
    slides,
    eventSnapshots,
    approvedBy: access.email ?? null,
  });
  if (!approval.ok) {
    return {
      ok: false as const,
      error: "approval_store_failed" as const,
      detail: approval.error,
      message: approveInstagramConceptErrorMessage(
        "approval_store_failed",
        approval.error,
      ),
    };
  }

  revalidatePath("/interne-instagram");
  return {
    ok: true as const,
    recorded: result.count,
    stored: result.stored,
    conceptKey: approval.conceptKey,
    contentFingerprint: approval.contentFingerprint,
    message: "Concept goedgekeurd en opgeslagen.",
  };
}

/**
 * Publish an approved concept to Instagram (or dry-run).
 * Gated by INSTAGRAM_META_PUBLISH_ENABLED / INSTAGRAM_META_DRY_RUN.
 * Blocks when live event title/date/location drifted after approval.
 */
export async function publishInstagramConceptAction(formData: FormData) {
  const access = await resolveTipsAdminAccess();
  if (!access.ok) {
    return {
      ok: false as const,
      code: "unauthorized",
      message: "Je bent niet ingelogd als beheerder.",
    };
  }

  const format = parseFormat(String(formData.get("format") ?? ""));
  if (!format) {
    return {
      ok: false as const,
      code: "invalid_format",
      message: "Ongeldig Instagram-format.",
    };
  }

  const eventIds = String(formData.get("eventIds") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const caption = String(formData.get("caption") ?? "");
  const slides = parseSlides(String(formData.get("slides") ?? "[]"));
  if (eventIds.length === 0 || !caption || slides.length === 0) {
    return {
      ok: false as const,
      code: "invalid_concept",
      message: "Concept is onvolledig (events, caption of slides ontbreken).",
    };
  }

  const result = await publishInstagramConcept({
    draft: { format, eventIds, caption, slides },
    requestedBy: access.email ?? null,
  });

  revalidatePath("/interne-instagram");

  if (!result.ok) {
    return {
      ok: false as const,
      code: result.code,
      message: result.message,
      publishId: result.publish?.id ?? null,
      metaMediaId: result.publish?.metaMediaId ?? null,
    };
  }

  return {
    ok: true as const,
    mode: result.mode,
    message: result.message,
    publishId: result.publish.id,
    metaMediaId: result.publish.metaMediaId,
    status: result.publish.status,
    finishedAt: result.publish.finishedAt,
    durableLogConfirmed: result.durableLogConfirmed,
  };
}
