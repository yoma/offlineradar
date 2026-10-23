/**
 * Phase 2B — single gated publish path for admin one-click / bulk publish.
 * Never bypasses classifyAdminStatus / evaluateEventForPublication.
 * Auto-publish remains OFF: callers are always explicit human actions.
 */
import { evaluateEventForPublication } from "@/lib/aanvoer/publication-gate";
import {
  isManuallySuppressed,
  isPlaceholderStartsAt,
} from "@/lib/aanvoer/admin-status";
import {
  editionIsManuallySuppressed,
  getEditionById,
  updateEditionPublication,
} from "@/lib/events/neon-store";
import { neonListTipIdsForEdition } from "@/lib/tips/neon-store";
import { updateTipStatus } from "@/lib/tips/service";

export type PublishEditionResult =
  | {
      ok: true;
      editionId: string;
      slug: string;
      message: string;
    }
  | {
      ok: false;
      editionId: string;
      error: string;
      decision?: "needs_attention" | "reject" | "already_published";
    };

function primarySourceUrl(
  sources: { url: string; isPrimary: boolean }[],
): string | null {
  const primary = sources.find((s) => s.isPrimary) ?? sources[0];
  return primary?.url ?? null;
}

/**
 * Server-side publish gate. Safe for one-click and bulk.
 * Returns a clear Dutch error when the edition is not ready.
 */
export async function publishEditionIfAllowed(
  editionId: string,
  options: { decisionReason?: string } = {},
): Promise<PublishEditionResult> {
  const id = editionId.trim();
  if (!id) {
    return { ok: false, editionId: "", error: "Event ontbreekt." };
  }

  if (await editionIsManuallySuppressed(id)) {
    return {
      ok: false,
      editionId: id,
      error:
        "Dit event is handmatig weggehaald. Het mag niet opnieuw worden gepubliceerd.",
      decision: "reject",
    };
  }

  const bundle = await getEditionById(id);
  if (!bundle) {
    return { ok: false, editionId: id, error: "Event niet gevonden." };
  }

  const edition = bundle.edition;
  if (edition.publicationStatus === "published") {
    return {
      ok: false,
      editionId: id,
      error: "Dit event staat al online.",
      decision: "already_published",
    };
  }
  if (
    edition.publicationStatus === "rejected" ||
    edition.publicationStatus === "cancelled" ||
    edition.publicationStatus === "expired"
  ) {
    return {
      ok: false,
      editionId: id,
      error: "Deze status kan niet gepubliceerd worden.",
      decision: "reject",
    };
  }

  const tags = edition.tags ?? [];
  const notes = edition.internalNotes ?? "";
  if (isManuallySuppressed(tags, notes)) {
    return {
      ok: false,
      editionId: id,
      error: "Handmatig weggehaald — publiceren geblokkeerd.",
      decision: "reject",
    };
  }

  if (
    isPlaceholderStartsAt(edition.startsAt) ||
    tags.includes("date_unknown") ||
    /date_unknown=1|Startdatum onbekend/i.test(notes)
  ) {
    return {
      ok: false,
      editionId: id,
      error: "Datum kon niet worden bevestigd. Pas de datum eerst aan.",
      decision: "needs_attention",
    };
  }

  const decision = evaluateEventForPublication({
    publicationStatus: edition.publicationStatus,
    startsAt: edition.startsAt,
    sourceUrl: primarySourceUrl(bundle.sources),
    eligibilityRoute: edition.eligibilityRoute,
    singlesOnly: edition.singlesOnly,
    singlesOriented: edition.singlesOriented,
    internalNotes: notes,
    tags,
    city: edition.city,
    venueName: edition.venueName,
    latitude: edition.latitude,
    longitude: edition.longitude,
  });

  if (decision.decision !== "publish") {
    return {
      ok: false,
      editionId: id,
      error:
        decision.reason ??
        "Nog niet klaar voor publicatie. Controleer ontbrekende gegevens.",
      decision:
        decision.decision === "reject" ? "reject" : "needs_attention",
    };
  }

  const now = new Date().toISOString();
  let updated;
  try {
    updated = await updateEditionPublication({
      id,
      publicationStatus: "published",
      publishedAt: now,
      approvedAt: now,
    });
  } catch (error) {
    return {
      ok: false,
      editionId: id,
      error:
        error instanceof Error ? error.message : "Publiceren mislukt.",
    };
  }
  if (!updated) {
    return { ok: false, editionId: id, error: "Publiceren mislukt." };
  }

  const tipIds = await neonListTipIdsForEdition(id);
  for (const tipId of tipIds) {
    await updateTipStatus({
      tipId,
      status: "published",
      decisionReason:
        options.decisionReason ??
        "Gepubliceerd via één-klik publicatie (fase 2B).",
      publishedEventPath: `/event/${updated.slug}`,
    });
  }

  return {
    ok: true,
    editionId: id,
    slug: updated.slug,
    message: "Gepubliceerd op DateOfflineHub.",
  };
}

export type BulkPublishResult = {
  attempted: number;
  published: number;
  failed: Array<{ editionId: string; error: string }>;
};

/** Publish many editions; each is re-gated server-side. Failures do not stop others. */
export async function bulkPublishEditionsIfAllowed(
  editionIds: string[],
): Promise<BulkPublishResult> {
  const unique = [...new Set(editionIds.map((id) => id.trim()).filter(Boolean))];
  const failed: BulkPublishResult["failed"] = [];
  let published = 0;
  for (const id of unique) {
    const result = await publishEditionIfAllowed(id, {
      decisionReason: "Bulkpublicatie (fase 2B) — server-side opnieuw gecontroleerd.",
    });
    if (result.ok) published += 1;
    else failed.push({ editionId: id, error: result.error });
  }
  return { attempted: unique.length, published, failed };
}
