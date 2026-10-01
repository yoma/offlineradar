"use server";

import { revalidatePath } from "next/cache";
import { signIn, signOut } from "@/auth";
import { evaluateIntakeApproval } from "@/lib/aanvoer/approval";
import {
  isPlaceholderStartsAt,
} from "@/lib/aanvoer/admin-status";
import {
  resolveIntakeImageMime,
  storeIntakeAsset,
  validateIntakeImage,
} from "@/lib/aanvoer/assets";
import { findIntakeMatches } from "@/lib/aanvoer/dedupe";
import { runAdminIntakeExtract } from "@/lib/aanvoer/extract";
import {
  saveIntakeAsEventCandidate,
  saveIntakeAsSource,
} from "@/lib/aanvoer/save";
import { getEventsSql } from "@/lib/events/db";
import { updateEditionPublication } from "@/lib/events/neon-store";
import { resolveTipsAdminAccess } from "@/lib/tips/admin-auth";
import { neonListTipIdsForEdition } from "@/lib/tips/neon-store";
import { htmlToPlainishText, safeFetchTipSource } from "@/lib/tips/safe-fetch";
import { updateTipStatus } from "@/lib/tips/service";
import {
  INTAKE_MAX_BYTES,
  proposalToDraft,
  type IntakeEditableDraft,
  type IntakeMatch,
  type IntakeMode,
  type IntakeProposal,
} from "@/lib/aanvoer/types";

export async function startAanvoerAdminSignIn() {
  await signIn("google", { redirectTo: "/interne-aanvoer" });
}

export async function signOutAanvoerAdmin() {
  await signOut({ redirectTo: "/interne-aanvoer" });
}

async function requireAdmin() {
  const access = await resolveTipsAdminAccess();
  if (!access.ok) {
    return { ok: false as const, error: "Geen beheerrechten.", email: null };
  }
  return { ok: true as const, email: access.email };
}

export type AnalyzeIntakeResult =
  | {
      ok: true;
      proposal: IntakeProposal;
      draft: IntakeEditableDraft;
      matches: IntakeMatch[];
      assetId: string | null;
    }
  | { ok: false; error: string };

export async function analyzeIntakeAction(
  formData: FormData,
): Promise<AnalyzeIntakeResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  const mode = String(formData.get("mode") ?? "").trim() as IntakeMode;
  if (mode !== "url" && mode !== "text" && mode !== "screenshot") {
    return { ok: false, error: "Ongeldige intake-modus." };
  }

  const url = String(formData.get("url") ?? "").trim();
  const text = String(formData.get("text") ?? "").trim();
  const file = formData.get("screenshot");

  let assetId: string | null = null;
  let image: { mimeType: string; base64: string } | null = null;
  let sourceText = text;

  if (mode === "url") {
    if (!url) return { ok: false, error: "Plak eerst een URL." };
    const fetched = await safeFetchTipSource(url);
    if (fetched.ok) {
      sourceText = [text, htmlToPlainishText(fetched.text)]
        .filter(Boolean)
        .join("\n\n");
    } else {
      sourceText = [
        text,
        `Kon pagina niet ophalen (${fetched.error}). Analyseer op basis van URL/metadata.`,
      ]
        .filter(Boolean)
        .join("\n\n");
    }
  }

  if (mode === "text" && !text) {
    return { ok: false, error: "Plak eerst tekst uit een advertentie of post." };
  }

  if (mode === "screenshot") {
    const blob =
      file instanceof Blob
        ? file
        : file &&
            typeof file === "object" &&
            "arrayBuffer" in file &&
            typeof (file as Blob).arrayBuffer === "function"
          ? (file as Blob)
          : null;
    if (!blob || blob.size === 0) {
      return { ok: false, error: "Kies een screenshot (PNG/JPG/WEBP)." };
    }
    if (blob.size > INTAKE_MAX_BYTES) {
      return { ok: false, error: "Screenshot mag maximaal 4 MB zijn." };
    }

    const buffer = Buffer.from(await blob.arrayBuffer());
    const declaredMime =
      (file instanceof File && file.type) ||
      (blob.type ? blob.type : "") ||
      "";
    const resolved = resolveIntakeImageMime({
      declaredMime,
      data: buffer,
    });
    if (!resolved.ok) return { ok: false, error: resolved.error };

    const mimeType = resolved.mimeType;
    const check = validateIntakeImage({
      mimeType,
      byteSize: buffer.byteLength,
    });
    if (!check.ok) return { ok: false, error: check.error };

    const stored = await storeIntakeAsset({
      mimeType,
      data: buffer,
      uploadedBy: gate.email!,
    });
    if (!stored) {
      return {
        ok: false,
        error:
          "Screenshot-opslag niet beschikbaar. Controleer of de migration is toegepast.",
      };
    }
    assetId = stored.id;
    image = {
      mimeType,
      base64: buffer.toString("base64"),
    };
  }

  const proposal = await runAdminIntakeExtract({
    mode,
    url: url || null,
    text: sourceText || null,
    image,
  });

  if (mode === "screenshot") {
    proposal.needsSourceVerification = true;
  }

  const draft = proposalToDraft(proposal);
  if (url && !draft.sourceUrl) draft.sourceUrl = url;

  const matches = await findIntakeMatches(draft);

  return {
    ok: true,
    proposal,
    draft,
    matches,
    assetId,
  };
}

export type SaveIntakeResult =
  | { ok: true; message: string; sourceId?: string; editionId?: string }
  | { ok: false; error: string; matches?: IntakeMatch[] };

export type ApproveIntakeResult =
  | {
      ok: true;
      message: string;
      sourceId?: string;
      editionId: string;
      published: boolean;
      reviewReasons: string[];
    }
  | {
      ok: false;
      error: string;
      matches?: IntakeMatch[];
      blockers?: string[];
    };

function parseDraft(raw: string): IntakeEditableDraft | null {
  try {
    const parsed = JSON.parse(raw) as IntakeEditableDraft;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Primary CTA: save source+event; publish only when approval gate passes. */
export async function approveIntakeAction(
  formData: FormData,
): Promise<ApproveIntakeResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  const draft = parseDraft(String(formData.get("draft") ?? ""));
  if (!draft) return { ok: false, error: "Ongeldige draft." };
  const assetId = String(formData.get("assetId") ?? "").trim() || null;
  const force = String(formData.get("force") ?? "") === "1";
  const needsSourceVerification =
    String(formData.get("needsSourceVerification") ?? "") === "1";
  const aiFailed = String(formData.get("aiFailed") ?? "") === "1";

  const approval = evaluateIntakeApproval(draft, {
    needsSourceVerification,
    routeAdvice: draft.routeAdvice,
    aiFailed,
  });
  if (approval.blockers.length > 0) {
    return {
      ok: false,
      error: approval.blockers.join(" "),
      blockers: approval.blockers,
    };
  }

  const matches = await findIntakeMatches(draft);
  if (
    !force &&
    matches.some((m) => m.kind === "catalog_source" || m.kind === "event_edition")
  ) {
    return {
      ok: false,
      error: "Dit event lijkt al in DateOfflineHub te staan.",
      matches,
    };
  }

  let sourceId: string | undefined;
  const hasUrl = Boolean(draft.sourceUrl.trim() || draft.organizerUrl.trim());
  if (hasUrl) {
    const source = await saveIntakeAsSource({
      draft,
      assetId,
      force: true,
    });
    if (!source.ok) {
      if (approval.canPublish) return source;
    } else {
      sourceId = source.sourceId;
    }
  }

  const event = await saveIntakeAsEventCandidate({ draft, assetId });
  if (!event.ok) return event;

  let published = false;
  if (approval.canPublish) {
    const now = new Date().toISOString();
    const updated = await updateEditionPublication({
      id: event.editionId,
      publicationStatus: "published",
      publishedAt: now,
      approvedAt: now,
    });
    published = Boolean(updated);
    if (published) {
      const tipIds = await neonListTipIdsForEdition(event.editionId);
      for (const tipId of tipIds) {
        await updateTipStatus({
          tipId,
          status: "published",
          decisionReason: "Gekoppeld event goedgekeurd via /interne-aanvoer.",
          publishedEventPath: `/event/${event.slug}`,
        });
      }
    }
  }

  revalidatePath("/interne-aanvoer");
  revalidatePath("/interne-events");
  if (published) {
    revalidatePath("/ontdek");
    revalidatePath(`/event/${event.slug}`);
  }

  return {
    ok: true,
    editionId: event.editionId,
    sourceId,
    published,
    reviewReasons: approval.reviewReasons,
    message: published
      ? "Toegevoegd aan DateOfflineHub. Het event staat live."
      : approval.reviewReasons.length > 0
        ? `Bewaard onder Controle nodig. ${approval.reviewReasons[0]}`
        : "Bewaard onder Controle nodig.",
  };
}

/** Secondary: save URL/organizer only without creating an event. */
export async function saveIntakeSourceAction(
  formData: FormData,
): Promise<SaveIntakeResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  const draft = parseDraft(String(formData.get("draft") ?? ""));
  if (!draft) return { ok: false, error: "Ongeldige draft." };
  const assetId = String(formData.get("assetId") ?? "").trim() || null;
  const force = String(formData.get("force") ?? "") === "1";

  const matches = await findIntakeMatches(draft);
  if (!force && matches.some((m) => m.kind === "catalog_source")) {
    return {
      ok: false,
      error: "Deze bron lijkt al te bestaan. Bevestig om toch op te slaan.",
      matches,
    };
  }

  const result = await saveIntakeAsSource({ draft, assetId, force });
  if (!result.ok) return result;
  revalidatePath("/interne-aanvoer");
  revalidatePath("/interne-events");
  return {
    ok: true,
    message: result.message,
    sourceId: result.sourceId,
  };
}

export async function updateAanvoerSourceAction(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  const id = String(formData.get("sourceId") ?? "").trim();
  if (!id) return { ok: false, error: "Bron ontbreekt." };
  const status = String(formData.get("status") ?? "").trim();
  const notes = String(formData.get("notes") ?? "");
  const sourceType = String(formData.get("sourceType") ?? "").trim();
  const markReview = String(formData.get("markReview") ?? "") === "1";

  const {
    updateCatalogSourceFields,
    CATALOG_SOURCE_STATUSES,
    CATALOG_SOURCE_TYPES,
  } = await import("@/lib/events/catalog-sources");

  let nextNotes = notes;
  if (markReview) {
    const stamp = `review_requested_at=${new Date().toISOString()}`;
    nextNotes = nextNotes.includes("review_requested_at=")
      ? nextNotes
      : `${nextNotes}\n${stamp}`.trim();
  }

  const updated = await updateCatalogSourceFields({
    id,
    status: CATALOG_SOURCE_STATUSES.includes(status as never)
      ? (status as (typeof CATALOG_SOURCE_STATUSES)[number])
      : undefined,
    notes: nextNotes,
    sourceType: CATALOG_SOURCE_TYPES.includes(sourceType as never)
      ? (sourceType as (typeof CATALOG_SOURCE_TYPES)[number])
      : undefined,
    touchChecked: false,
  });
  if (!updated) return { ok: false, error: "Kon bron niet bijwerken." };
  revalidatePath("/interne-aanvoer");
  revalidatePath("/interne-events");
  return { ok: true };
}

/** List actions: Toevoegen / Niet toevoegen / Opnieuw laten controleren. */
export async function updateAanvoerCandidateStatusAction(
  formData: FormData,
): Promise<{ ok: true; message?: string } | { ok: false; error: string }> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  const id = String(formData.get("editionId") ?? "").trim();
  const intent = String(
    formData.get("intent") ?? formData.get("status") ?? "",
  ).trim();
  if (!id) return { ok: false, error: "Event ontbreekt." };

  if (intent === "opnieuw_controleren" || intent === "reclassify") {
    const sql = getEventsSql();
    if (!sql) return { ok: false, error: "Database niet beschikbaar." };
    const stamp = `reclassified_at=${new Date().toISOString()}`;
    await sql`
      UPDATE event_editions SET
        internal_notes = CASE
          WHEN internal_notes IS NULL OR internal_notes = '' THEN ${stamp}
          WHEN internal_notes LIKE ${"%" + "reclassified_at=%"} THEN internal_notes
          ELSE internal_notes || ${"\n" + stamp}
        END,
        updated_at = now()
      WHERE id = ${id}::uuid
    `;
    revalidatePath("/interne-aanvoer");
    return { ok: true, message: "Opnieuw beoordeeld op basis van beschikbare gegevens." };
  }

  let status: "draft" | "under_review" | "rejected" | "candidate" | "published";
  if (
    intent === "reject" ||
    intent === "rejected" ||
    intent === "niet_toegevoegd"
  ) {
    status = "rejected";
  } else if (
    intent === "review" ||
    intent === "under_review" ||
    intent === "te_bekijken" ||
    intent === "controle_nodig"
  ) {
    status = "under_review";
  } else if (intent === "draft" || intent === "candidate") {
    status = intent;
  } else if (
    intent === "publish" ||
    intent === "published" ||
    intent === "toegevoegd" ||
    intent === "toevoegen"
  ) {
    status = "published";
  } else {
    return { ok: false, error: "Ongeldige actie." };
  }

  if (status === "published") {
    const sql = getEventsSql();
    if (sql) {
      const rows = (await sql`
        SELECT starts_at::text AS starts_at, tags, internal_notes, title
        FROM event_editions WHERE id = ${id}::uuid LIMIT 1
      `) as {
        starts_at: string;
        tags: unknown;
        internal_notes: string | null;
        title: string;
      }[];
      const row = rows[0];
      if (!row) return { ok: false, error: "Event niet gevonden." };
      const tags = Array.isArray(row.tags)
        ? row.tags.filter((t): t is string => typeof t === "string")
        : [];
      if (
        isPlaceholderStartsAt(row.starts_at) ||
        tags.includes("date_unknown") ||
        /date_unknown=1|Startdatum onbekend/i.test(row.internal_notes ?? "")
      ) {
        return {
          ok: false,
          error: "Datum kon niet worden bevestigd. Pas de datum eerst aan.",
        };
      }
    }

    const now = new Date().toISOString();
    const updated = await updateEditionPublication({
      id,
      publicationStatus: "published",
      publishedAt: now,
      approvedAt: now,
    });
    if (!updated) return { ok: false, error: "Kon event niet toevoegen." };
    revalidatePath("/interne-aanvoer");
    revalidatePath("/interne-events");
    revalidatePath("/ontdek");
    revalidatePath(`/event/${updated.slug}`);
    return { ok: true, message: "Toegevoegd aan DateOfflineHub." };
  }

  const updated = await updateEditionPublication({
    id,
    publicationStatus: status,
    rejectedAt: status === "rejected" ? new Date().toISOString() : null,
  });
  if (!updated) return { ok: false, error: "Kon status niet bijwerken." };
  revalidatePath("/interne-aanvoer");
  revalidatePath("/interne-events");
  return { ok: true };
}
