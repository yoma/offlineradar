"use server";

import { revalidatePath } from "next/cache";
import { resolveTipsAdminAccess } from "@/lib/tips/admin-auth";
import { recordConceptEventIds } from "@/lib/instagram/history";
import { publishInstagramConcept } from "@/lib/instagram/publish";
import type { InstagramFormatId } from "@/lib/instagram/constants";
import type { InstagramRenderKind } from "@/lib/instagram/render";

/**
 * Mark a concept as reviewed: remember its event ids so later posts avoid them.
 * Does NOT publish to Instagram.
 */
export async function approveInstagramConceptAction(formData: FormData) {
  const access = await resolveTipsAdminAccess();
  if (!access.ok) {
    return { ok: false as const, error: "unauthorized" };
  }

  const idsRaw = String(formData.get("eventIds") ?? "");
  const eventIds = idsRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const result = await recordConceptEventIds(eventIds);
  revalidatePath("/interne-instagram");
  return {
    ok: true as const,
    recorded: result.count,
    stored: result.stored,
  };
}

function parseSlides(raw: string): {
  kind: InstagramRenderKind;
  label: string;
  query: Record<string, string>;
}[] {
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
      .filter((s): s is NonNullable<typeof s> => s != null);
  } catch {
    return [];
  }
}

/**
 * Publish an approved concept to Instagram (or dry-run).
 * Gated by INSTAGRAM_META_PUBLISH_ENABLED / INSTAGRAM_META_DRY_RUN.
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

  const format = String(formData.get("format") ?? "") as InstagramFormatId;
  if (
    format !== "binnenkort" &&
    format !== "deze_week" &&
    format !== "nieuw"
  ) {
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
  };
}
