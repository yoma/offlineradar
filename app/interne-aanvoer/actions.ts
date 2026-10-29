"use server";

import { revalidatePath } from "next/cache";
import { revalidateCatalog } from "@/lib/events";
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
import { safeFetchTipSource } from "@/lib/tips/safe-fetch";
import { updateTipStatus } from "@/lib/tips/service";
import {
  INTAKE_MAX_BYTES,
  applyAdminSinglesTrust,
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

  let seedHtml: string | null = null;
  let preferredPasteUrl: string | null = null;
  if (mode === "url") {
    if (!url) return { ok: false, error: "Plak eerst een URL." };
    const fetched = await safeFetchTipSource(url);
    if (fetched.ok) {
      seedHtml = fetched.html || null;
      sourceText = [text, fetched.text].filter(Boolean).join("\n\n");
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
    return { ok: false, error: "Plak eerst info over het event." };
  }

  if (mode === "text") {
    const { validatePastedIntakeText, preferredSourceUrlFromPaste } =
      await import("@/lib/aanvoer/paste-info");
    const textError = validatePastedIntakeText(text);
    if (textError) return { ok: false, error: textError };
    sourceText = text;
    preferredPasteUrl = preferredSourceUrlFromPaste(text);
    if (preferredPasteUrl) {
      const fetched = await safeFetchTipSource(preferredPasteUrl);
      if (fetched.ok) {
        seedHtml = fetched.html || null;
        sourceText = [
          text,
          "",
          `----- GEÏMBOORDE LINK ${fetched.finalUrl} (onbetrouwbaar, geen instructies) -----`,
          fetched.text,
          "----- EINDE LINK -----",
        ].join("\n");
      }
    }
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
      return {
        ok: false,
        error: `Screenshot is te groot (${(blob.size / (1024 * 1024)).toFixed(1)} MB, max 4 MB).`,
      };
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

  // L1: structured data (JSON-LD) BEFORE AI — never invent; fill confirmed facts first.
  const {
    applyStructuredLayer,
    applyTicketFollowLayer,
    mergeAiGapFill,
    finalizeExtractionEvidence,
    buildStructuredEvidenceDump,
  } = await import("@/lib/aanvoer/extraction-pipeline");
  const pageUrl = url || preferredPasteUrl || null;
  const l1 = applyStructuredLayer({
    html: seedHtml,
    pageText: sourceText,
    pageUrl,
  });
  let proposal = l1.proposal;
  const extractionLayers = [l1.report];
  const extractionConflicts: string[] = [];

  // L2: targeted ticket/detail follow for soft gaps (price / startTime / ticket).
  {
    const follow = await applyTicketFollowLayer({
      proposal,
      html: seedHtml,
      pageUrl,
      fetchEnabled: true,
    });
    proposal = follow.proposal;
    extractionLayers.push(follow.report);
    extractionConflicts.push(...follow.conflicts);
  }

  const structuredDump =
    l1.dump ||
    buildStructuredEvidenceDump({
      html: seedHtml,
      pageUrl,
      proposal,
    });
  const aiText = [
    structuredDump
      ? [
          "----- DETERMINISTISCHE STRUCTURELE DATA (betrouwbaarder dan plain text) -----",
          structuredDump,
          "----- EINDE STRUCTURELE DATA -----",
          "",
        ].join("\n")
      : "",
    sourceText || "",
  ]
    .filter(Boolean)
    .join("\n");

  // L3: AI only for remaining gaps; merge without overwriting L1/L2 found fields.
  const aiProposal = await runAdminIntakeExtract({
    mode,
    url: pageUrl,
    text: aiText || null,
    image,
  });
  {
    const merged = mergeAiGapFill({ base: proposal, ai: aiProposal });
    proposal = merged.proposal;
    extractionLayers.push(merged.report);
  }

  if (mode === "screenshot") {
    proposal.needsSourceVerification = true;
  }

  // Pasted text alone is evidence, not verified truth.
  if (mode === "text" && !preferredPasteUrl && !proposal.sourceUrl.value) {
    proposal.needsSourceVerification = true;
  }
  if (
    mode === "text" &&
    preferredPasteUrl &&
    !proposal.sourceUrl.value
  ) {
    proposal.sourceUrl = {
      value: preferredPasteUrl,
      status: "found",
      evidence: "URL uit geplakte tekst",
    };
  }

  // Pass 2: deep verification when essentials missing (FASE 26.16).
  // Text paste always benefits from deep path when URLs/source map can corroborate.
  const forceDeep = String(formData.get("forceDeep") ?? "") === "1";
  const {
    shouldRunDeepVerification,
    runDeepVerification,
    formatDeepScanNotes,
  } = await import("@/lib/aanvoer/deep-verify");
  const runDeep =
    forceDeep ||
    mode === "screenshot" ||
    shouldRunDeepVerification(proposal) ||
    (mode === "text" && Boolean(preferredPasteUrl));
  if (runDeep) {
    const deep = await runDeepVerification({
      proposal,
      seedUrl:
        url ||
        preferredPasteUrl ||
        proposal.sourceUrl.value ||
        proposal.organizerUrl.value ||
        proposal.visibleUrls?.[0] ||
        null,
      seedHtml,
      seedText: text || sourceText,
      force: forceDeep || mode === "screenshot",
    });
    proposal = deep.proposal;
    proposal.deepScan = deep.report;
    {
      const { enrichProposalFromPage } = await import(
        "@/lib/aanvoer/structured-enrich"
      );
      proposal = enrichProposalFromPage({
        proposal,
        html: seedHtml,
        pageText: sourceText,
        pageUrl,
      });
    }
    const stamp = formatDeepScanNotes(deep.report);
    if (stamp) {
      proposal.notes = {
        value: [proposal.notes.value, stamp].filter(Boolean).join("\n"),
        status: "found",
        evidence: proposal.notes.evidence,
      };
    }
  }

  {
    const finalized = finalizeExtractionEvidence({
      proposal,
      conflicts: extractionConflicts,
      layers: extractionLayers,
    });
    proposal = finalized.proposal;
  }

  // The admin added this themselves: singles by their judgement.
  const draft = applyAdminSinglesTrust(proposalToDraft(proposal));
  if (url && !draft.sourceUrl) draft.sourceUrl = url;
  if (preferredPasteUrl && !draft.sourceUrl) draft.sourceUrl = preferredPasteUrl;

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
  | {
      ok: true;
      message: string;
      sourceId?: string;
      editionId?: string;
      sourceFollowMessage?: string | null;
    }
  | { ok: false; error: string; matches?: IntakeMatch[] };

export type ApproveIntakeResult =
  | {
      ok: true;
      message: string;
      sourceId?: string;
      editionId: string;
      slug?: string;
      published: boolean;
      reviewReasons: string[];
      sourceFollowMessage?: string | null;
      matches?: IntakeMatch[];
      enrichedFields?: string[];
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
  const startTimeUnknown =
    String(formData.get("startTimeUnknown") ?? "") === "1";
  let fieldEvidence = null as
    | import("@/lib/aanvoer/field-evidence").FieldEvidence[]
    | null;
  try {
    const raw = String(formData.get("fieldEvidence") ?? "");
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) fieldEvidence = parsed as typeof fieldEvidence;
    }
  } catch {
    fieldEvidence = null;
  }
  let deepScan = null as import("@/lib/aanvoer/types").IntakeProposal["deepScan"];
  try {
    const raw = String(formData.get("deepScan") ?? "");
    if (raw) deepScan = JSON.parse(raw) as typeof deepScan;
  } catch {
    deepScan = null;
  }

  const approval = evaluateIntakeApproval(draft, {
    needsSourceVerification,
    routeAdvice: draft.routeAdvice,
    aiFailed,
    fieldEvidence,
    startTimeUnknown,
    deepScan,
  });
  if (approval.blockers.length > 0) {
    return {
      ok: false,
      error: approval.blockers.join(" "),
      blockers: approval.blockers,
    };
  }

  const matches = await findIntakeMatches(draft);
  if (!force) {
    const {
      pickEnrichableEditionMatch,
      enrichEditionFromIntakeDraft,
    } = await import("@/lib/aanvoer/enrich-edition");
    const match = pickEnrichableEditionMatch(matches);
    if (match) {
      const enriched = await enrichEditionFromIntakeDraft({
        editionId: match.id,
        draft,
        sourceUrl: draft.sourceUrl || draft.organizerUrl || null,
      });
      if (!enriched.ok) {
        return { ok: false, error: enriched.error, matches };
      }
      revalidatePath("/interne-aanvoer");
      revalidatePath("/interne-events");
      revalidatePath("/ontdek");
      revalidateCatalog();
      if (enriched.slug) revalidatePath(`/event/${enriched.slug}`);
      return {
        ok: true,
        editionId: enriched.editionId,
        slug: enriched.slug,
        published: enriched.publicationStatus === "published",
        reviewReasons: approval.reviewReasons,
        message:
          enriched.filledFields.length > 0
            ? `✓ Bestaand event bijgewerkt: ${enriched.filledFields.join(", ")}`
            : "Event bestond al; geen nieuwe velden om aan te vullen.",
        matches,
        enrichedFields: enriched.filledFields,
      };
    }
    if (
      matches.some(
        (m) => m.kind === "catalog_source" || m.kind === "event_edition",
      )
    ) {
      return {
        ok: false,
        error: "Dit event lijkt al in DateOfflineHub te staan.",
        matches,
      };
    }
  }

  let sourceId: string | undefined;
  let sourceFollowMessage: string | null = null;
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
      const { listCatalogSources } = await import(
        "@/lib/events/catalog-sources"
      );
      const { enableCatalogSourceAutoFollow } = await import(
        "@/lib/aanvoer/source-follow"
      );
      const catalog = (await listCatalogSources()).find(
        (s) => s.id === source.sourceId,
      );
      const name = (catalog?.name ?? draft.organizer.trim()) || "Bron";
      const follow = await enableCatalogSourceAutoFollow({
        catalogSourceId: source.sourceId,
        officialUrl:
          catalog?.officialUrl ||
          draft.sourceUrl.trim() ||
          draft.organizerUrl.trim(),
        name,
      });
      sourceFollowMessage = follow.message;
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
    revalidateCatalog();
    revalidatePath(`/event/${event.slug}`);
  }

  return {
    ok: true,
    editionId: event.editionId,
    sourceId,
    published,
    reviewReasons: approval.reviewReasons,
    sourceFollowMessage,
    message: published
      ? "✓ Toegevoegd aan DateOfflineHub"
      : approval.reviewReasons.length > 0
        ? `⚠ Jouw aandacht nodig. ${approval.reviewReasons[0]}`
        : "⚠ Jouw aandacht nodig",
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

  const { listCatalogSources } = await import("@/lib/events/catalog-sources");
  const { enableCatalogSourceAutoFollow } = await import(
    "@/lib/aanvoer/source-follow"
  );
  const catalog = (await listCatalogSources()).find(
    (s) => s.id === result.sourceId,
  );
  const name = (catalog?.name ?? draft.organizer.trim()) || "Bron";
  const follow = await enableCatalogSourceAutoFollow({
    catalogSourceId: result.sourceId,
    officialUrl:
      catalog?.officialUrl ||
      draft.sourceUrl.trim() ||
      draft.organizerUrl.trim(),
    name,
    namePrefix: result.message,
  });

  revalidatePath("/interne-aanvoer");
  revalidatePath("/interne-events");
  return {
    ok: true,
    message: result.message,
    sourceId: result.sourceId,
    sourceFollowMessage: follow.message,
  };
}

/**
 * Simple URL → Source Map add (Bronnenlijst). Name optional; hostname used as fallback.
 */
export async function addSourceByUrlAction(
  formData: FormData,
): Promise<
  | { ok: true; message: string; sourceId: string }
  | { ok: false; error: string }
> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  const officialUrl = String(formData.get("officialUrl") ?? "").trim();
  let name = String(formData.get("name") ?? "").trim();
  if (!officialUrl) return { ok: false, error: "URL is verplicht." };

  let parsed: URL;
  try {
    parsed = new URL(officialUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { ok: false, error: "Gebruik een http(s)-URL." };
    }
  } catch {
    return { ok: false, error: "Ongeldige URL." };
  }

  if (!name) {
    name = parsed.hostname.replace(/^www\./, "") || "Bron";
  }

  const { upsertCatalogSourceByUrl } = await import(
    "@/lib/events/catalog-sources"
  );
  const { withUserSuppliedProvenance } = await import(
    "@/lib/discovery/user-supplied"
  );
  const { enableCatalogSourceAutoFollow } = await import(
    "@/lib/aanvoer/source-follow"
  );

  const result = await upsertCatalogSourceByUrl({
    name,
    officialUrl,
    status: "promising",
    notes: withUserSuppliedProvenance("via=bronnen_lijst"),
  });
  if (!result) return { ok: false, error: "Kon bron niet opslaan." };

  const follow = await enableCatalogSourceAutoFollow({
    catalogSourceId: result.record.id,
    officialUrl: result.record.officialUrl,
    name: result.record.name,
    namePrefix: result.created
      ? `${result.record.name} toegevoegd.`
      : `${result.record.name} stond al in de lijst.`,
  });

  revalidatePath("/interne-aanvoer");
  revalidatePath("/interne-events");
  revalidatePath("/interne-goedkeuren");
  return {
    ok: true,
    sourceId: result.record.id,
    message: follow.message,
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

export type SourceFollowActionResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

/** Pause / resume / disable / enable / archive catalog source (admin Bronnen). */
export async function updateSourceFollowAction(
  formData: FormData,
): Promise<SourceFollowActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  const id = String(formData.get("sourceId") ?? "").trim();
  const intent = String(formData.get("intent") ?? "").trim();
  if (!id) return { ok: false, error: "Bron ontbreekt." };

  const { listCatalogSources, updateCatalogSourceFields } = await import(
    "@/lib/events/catalog-sources"
  );
  const { setSourceRefreshEnabled } = await import("@/lib/source-refresh/store");
  const {
    FOLLOW_ARCHIVED_TAG,
    FOLLOW_DISABLED_TAG,
    FOLLOW_PAUSED_TAG,
    getSourceFollowCapability,
    patchFollowNotes,
  } = await import("@/lib/aanvoer/source-follow");

  const all = await listCatalogSources();
  const source = all.find((s) => s.id === id);
  if (!source) return { ok: false, error: "Bron niet gevonden." };

  const capability = getSourceFollowCapability({
    catalogSourceId: source.id,
    officialUrl: source.officialUrl,
    name: source.name,
  });

  const now = new Date().toISOString();
  let notes = source.notes ?? "";
  let status = source.status;
  let message = "Bijgewerkt.";

  if (intent === "pause") {
    notes = patchFollowNotes(notes, {
      set: [FOLLOW_PAUSED_TAG],
      clear: [FOLLOW_DISABLED_TAG],
      stamp: `paused_at=${now}`,
    });
    await setSourceRefreshEnabled(id, false);
    message = "Bron gepauzeerd. Automatische scans stoppen tijdelijk.";
  } else if (intent === "resume") {
    notes = patchFollowNotes(notes, {
      clear: [FOLLOW_PAUSED_TAG, FOLLOW_DISABLED_TAG, FOLLOW_ARCHIVED_TAG],
      stamp: `resumed_at=${now}`,
    });
    if (status === "inactive") status = "active";
    if (capability.autoFollowable) {
      await setSourceRefreshEnabled(id, true);
      message = `Bron wordt opnieuw automatisch gevolgd (${capability.methodLabel}).`;
    } else {
      message = `Handmatige bron — ${capability.manualReason ?? "automatische opvolging niet mogelijk"}.`;
    }
  } else if (intent === "disable") {
    notes = patchFollowNotes(notes, {
      set: [FOLLOW_DISABLED_TAG],
      clear: [FOLLOW_PAUSED_TAG],
      stamp: `disabled_at=${now}`,
    });
    status = "inactive";
    await setSourceRefreshEnabled(id, false);
    message = "Bron uitgeschakeld. Bestaande events blijven behouden.";
  } else if (intent === "enable") {
    notes = patchFollowNotes(notes, {
      clear: [FOLLOW_DISABLED_TAG, FOLLOW_ARCHIVED_TAG, FOLLOW_PAUSED_TAG],
      stamp: `enabled_at=${now}`,
    });
    status = "active";
    if (capability.autoFollowable) {
      await setSourceRefreshEnabled(id, true);
      message = `Bron opnieuw ingeschakeld en automatisch gevolgd (${capability.methodLabel}).`;
    } else {
      message = `Bron opnieuw ingeschakeld. ${capability.manualReason ?? "Automatische opvolging niet mogelijk."}`;
    }
  } else if (intent === "archive") {
    notes = patchFollowNotes(notes, {
      set: [FOLLOW_ARCHIVED_TAG, FOLLOW_DISABLED_TAG],
      clear: [FOLLOW_PAUSED_TAG],
      stamp: `archived_at=${now}`,
    });
    status = "inactive";
    await setSourceRefreshEnabled(id, false);
    message =
      "Bron gearchiveerd (veilige soft-delete). Events en historie blijven behouden.";
  } else {
    return { ok: false, error: "Ongeldige actie." };
  }

  const updated = await updateCatalogSourceFields({
    id,
    status,
    notes,
    touchChecked: false,
  });
  if (!updated) return { ok: false, error: "Kon bron niet bijwerken." };
  revalidatePath("/interne-aanvoer");
  revalidatePath("/interne-events");
  return { ok: true, message };
}

/** Manual scan-now for any auto-followable source (parser or generic). */
export async function scanSourceNowAction(
  formData: FormData,
): Promise<SourceFollowActionResult & { runId?: string }> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  const id = String(formData.get("sourceId") ?? "").trim();
  if (!id) return { ok: false, error: "Bron ontbreekt." };

  const { listCatalogSources } = await import("@/lib/events/catalog-sources");
  const { getSourceFollowCapability } = await import(
    "@/lib/aanvoer/source-follow"
  );
  const source = (await listCatalogSources()).find((s) => s.id === id);
  if (!source) return { ok: false, error: "Bron niet gevonden." };
  const capability = getSourceFollowCapability({
    catalogSourceId: source.id,
    officialUrl: source.officialUrl,
    name: source.name,
  });
  if (!capability.autoFollowable) {
    return {
      ok: false,
      error:
        capability.manualReason ??
        "Automatische opvolging momenteel niet mogelijk.",
    };
  }

  const { startSourceRefresh } = await import("@/lib/source-refresh/engine");
  const thorough = String(formData.get("thorough") ?? "") === "1";
  const result = await startSourceRefresh({
    catalogSourceId: id,
    triggeredBy: gate.email,
    triggerType: "manual",
    mode: thorough ? "thorough" : "standard",
    skipCooldown: thorough,
  });
  revalidatePath("/interne-aanvoer");
  revalidatePath("/interne-events");
  if (result.run?.id) {
    revalidatePath(`/interne-events/refresh/${result.run.id}`);
  }
  if (!result.ok) {
    return { ok: false, error: result.error, runId: result.run?.id };
  }
  const report = result.run.report;
  return {
    ok: true,
    message: thorough
      ? `Grondige scan klaar: ${result.run.newCount} nieuw (${report?.drafted ?? 0} draft), ${result.run.changedCount} gewijzigd (${report?.applied ?? 0} toegepast), ${result.run.unchangedCount} ongewijzigd. Volledigheid: ${report?.completeness ?? "?"}.`
      : `Scan klaar: ${result.run.newCount} nieuw, ${result.run.changedCount} gewijzigd, ${result.run.unchangedCount} ongewijzigd.`,
    runId: result.run.id,
  };
}

/** List actions: Toevoegen / Niet toevoegen / Opnieuw laten controleren. */
export async function updateAanvoerCandidateStatusAction(
  formData: FormData,
): Promise<
  | {
      ok: true;
      message?: string;
      deepOutcome?: string;
      deepOutcomeMessage?: string;
      searchResultCount?: number;
      sourcesChecked?: number;
      fieldsConfirmed?: string[];
      /** True when deep-search published the edition (enough info). */
      published?: boolean;
      /** Snapshot of fields after deep search, for cockpit display. */
      fieldsAfter?: Record<string, string | null>;
      attachedSourceUrl?: string | null;
    }
  | { ok: false; error: string }
> {
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

    const rows = (await sql`
      SELECT
        e.id,
        e.title,
        e.city,
        e.venue_name,
        e.starts_at::text AS starts_at,
        e.eligibility_route,
        e.singles_only,
        e.singles_oriented,
        e.internal_notes,
        e.tags,
        e.publication_status,
        e.organizer_id,
        o.name AS organizer_name,
        o.website_url AS organizer_website_url,
        s.url AS source_url
      FROM event_editions e
      LEFT JOIN organizers o ON o.id = e.organizer_id
      LEFT JOIN LATERAL (
        SELECT url FROM event_sources
        WHERE event_edition_id = e.id
        ORDER BY is_primary DESC, created_at ASC
        LIMIT 1
      ) s ON true
      WHERE e.id = ${id}::uuid
      LIMIT 1
    `) as {
      id: string;
      title: string;
      city: string;
      venue_name: string | null;
      starts_at: string;
      eligibility_route: string | null;
      singles_only: boolean | null;
      singles_oriented: boolean | null;
      internal_notes: string | null;
      tags: unknown;
      publication_status: string;
      organizer_id: string | null;
      organizer_name: string | null;
      organizer_website_url: string | null;
      source_url: string | null;
    }[];
    const row = rows[0];
    if (!row) return { ok: false, error: "Event niet gevonden." };

    const {
      proposalToDraft,
    } = await import("@/lib/aanvoer/types");
    const {
      isPlaceholderStartsAt,
    } = await import("@/lib/aanvoer/admin-status");
    const {
      runDeepVerification,
      formatDeepScanNotes,
    } = await import("@/lib/aanvoer/deep-verify");
    const { evaluateIntakeApproval } = await import("@/lib/aanvoer/approval");
    const { runAdminIntakeExtract } = await import("@/lib/aanvoer/extract");
    const { safeFetchTipSource } = await import("@/lib/tips/safe-fetch");
    const { enrichProposalFromPage } = await import(
      "@/lib/aanvoer/structured-enrich"
    );

    let seedHtml: string | null = null;
    let sourceText = [
      `Titel: ${row.title}`,
      `Organisator: ${row.organizer_name ?? ""}`,
      `Stad: ${row.city}`,
      `Venue: ${row.venue_name ?? ""}`,
      row.internal_notes ?? "",
    ].join("\n");

    if (row.source_url) {
      const fetched = await safeFetchTipSource(row.source_url);
      if (fetched.ok) {
        seedHtml = fetched.html || null;
        sourceText = `${sourceText}\n\n${fetched.text}`;
      }
    }

    const {
      applyStructuredLayer,
      mergeAiGapFill,
      buildStructuredEvidenceDump,
    } = await import("@/lib/aanvoer/extraction-pipeline");
    const l1 = applyStructuredLayer({
      html: seedHtml,
      pageText: sourceText,
      pageUrl: row.source_url,
    });
    const structuredDump =
      l1.dump ||
      buildStructuredEvidenceDump({
        html: seedHtml,
        pageUrl: row.source_url,
        proposal: l1.proposal,
      });
    const aiProposal = await runAdminIntakeExtract({
      mode: row.source_url ? "url" : "text",
      url: row.source_url,
      text: [
        structuredDump
          ? `----- DETERMINISTISCHE STRUCTURELE DATA -----\n${structuredDump}\n----- EINDE -----\n`
          : "",
        sourceText,
      ]
        .filter(Boolean)
        .join("\n"),
    });
    let proposal = mergeAiGapFill({
      base: l1.proposal,
      ai: aiProposal,
    }).proposal;
    // Prefer known title/org if extract weak
    if (!proposal.title.value) {
      proposal.title = {
        value: row.title,
        status: "found",
        evidence: "Bestaande eventtitel",
      };
    }
    if (!proposal.organizer.value && row.organizer_name) {
      proposal.organizer = {
        value: row.organizer_name,
        status: "found",
        evidence: "Bestaande organisator",
      };
    }
    if (!isPlaceholderStartsAt(row.starts_at) && !proposal.startDate.value) {
      proposal.startDate = {
        value: row.starts_at.slice(0, 10),
        status: "found",
        evidence: "Bestaande datum",
      };
    }

    proposal = enrichProposalFromPage({
      proposal,
      html: seedHtml,
      pageText: sourceText,
      pageUrl: row.source_url,
    });

    const deep = await runDeepVerification({
      proposal,
      seedUrl: row.source_url,
      seedHtml,
      force: true,
    });
    proposal = deep.proposal;
    proposal.deepScan = deep.report;
    const stamp = [
      `deep_rescan_at=${new Date().toISOString()}`,
      formatDeepScanNotes(deep.report),
    ]
      .filter(Boolean)
      .join("\n");

    const draft = proposalToDraft(proposal);
    const approval = evaluateIntakeApproval(draft, {
      needsSourceVerification: proposal.needsSourceVerification,
      routeAdvice: draft.routeAdvice,
      aiFailed: proposal.aiFailed,
      deepScan: deep.report,
      fieldEvidence: proposal.fieldEvidence ?? null,
      startTimeUnknown: proposal.startTimeUnknown,
    });

    const { buildIntakeStartsAt, UNKNOWN_START_TIME_NOTE } = await import(
      "@/lib/aanvoer/dates"
    );
    const dateKnown =
      /^\d{4}-\d{2}-\d{2}$/.test(draft.startDate) &&
      Number(draft.startDate.slice(0, 4)) < 2090;
    const builtStarts = dateKnown
      ? buildIntakeStartsAt({
          startDate: draft.startDate,
          startTime: draft.startTime,
        })
      : null;
    const startsAt = builtStarts?.startsAt ?? row.starts_at;
    const timeUnknown = Boolean(builtStarts?.timeUnknown);
    const tags = Array.isArray(row.tags)
      ? row.tags.filter((t): t is string => typeof t === "string")
      : [];
    let nextTags = dateKnown
      ? tags.filter((t) => t !== "date_unknown")
      : [...new Set([...tags, "date_unknown"])];
    nextTags = timeUnknown
      ? [...new Set([...nextTags.filter((t) => t !== "time_unknown"), "time_unknown"])]
      : nextTags.filter((t) => t !== "time_unknown");
    const nextNotes = [
      row.internal_notes ?? "",
      stamp,
      timeUnknown
        ? `time_unknown=1 | ${UNKNOWN_START_TIME_NOTE} (12:00 is technische placeholder).`
        : null,
    ]
      .filter(Boolean)
      .join("\n")
      .trim();
    const route =
      draft.routeAdvice === "route_a" || draft.routeAdvice === "route_b"
        ? draft.routeAdvice
        : row.eligibility_route;
    const startTimeDisplayNote =
      timeUnknown && dateKnown ? UNKNOWN_START_TIME_NOTE : null;

    await sql`
      UPDATE event_editions SET
        title = ${draft.title || row.title},
        city = ${draft.city || row.city},
        venue_name = ${draft.venue || row.venue_name},
        starts_at = ${startsAt}::timestamptz,
        start_time_display_note = ${startTimeDisplayNote},
        eligibility_route = ${route},
        singles_only = ${
          draft.singlesOnly === "true"
            ? true
            : draft.singlesOnly === "false"
              ? false
              : row.singles_only
        },
        singles_oriented = ${
          draft.singlesOriented === "true"
            ? true
            : draft.singlesOriented === "false"
              ? false
              : row.singles_oriented
        },
        tags = ${JSON.stringify(nextTags)}::jsonb,
        internal_notes = ${nextNotes},
        updated_at = now()
      WHERE id = ${id}::uuid
    `;

    // Persist best official URL so consumer "Bekijk officiële bron" never
    // falls back to an empty href (same-page self-link).
    const firstOkDeepUrl =
      deep.report.sourcesChecked.find((s) => s.ok && /^https?:\/\//i.test(s.url))
        ?.url ?? null;
    const attachCandidates = [
      draft.sourceUrl,
      draft.organizerUrl,
      proposal.sourceUrl.value,
      proposal.organizerUrl.value,
      firstOkDeepUrl,
      row.source_url,
    ];
    let attachedSourceUrl: string | null = null;
    for (const candidate of attachCandidates) {
      const url = typeof candidate === "string" ? candidate.trim() : "";
      if (!/^https?:\/\//i.test(url)) continue;
      try {
        const { attachSource } = await import("@/lib/events/neon-store");
        const { normalizeRefreshUrl } = await import(
          "@/lib/source-refresh/normalize"
        );
        let host = "bron";
        try {
          host = new URL(url).hostname.replace(/^www\./, "");
        } catch {
          /* keep default */
        }
        await attachSource({
          eventEditionId: id,
          sourceType: "organizer",
          sourceName: host,
          url,
          normalizedUrl: normalizeRefreshUrl(url),
          isPrimary: !row.source_url,
          checkedAt: new Date().toISOString(),
          evidenceNote: "URL uit deep-search opnieuw controleren",
        });
        attachedSourceUrl = url;
        break;
      } catch (error) {
        console.error("[aanvoer] deep-search attachSource failed", error);
      }
    }

    if (
      row.organizer_id &&
      !row.organizer_website_url &&
      attachedSourceUrl
    ) {
      try {
        await sql`
          UPDATE organizers
          SET website_url = ${attachedSourceUrl}, updated_at = now()
          WHERE id = ${row.organizer_id}::uuid
            AND website_url IS NULL
        `;
      } catch (error) {
        console.error("[aanvoer] organizer website update failed", error);
      }
    }

    const deepPayload = {
      deepOutcome: deep.report.outcome,
      deepOutcomeMessage: deep.report.outcomeMessage,
      searchResultCount: deep.report.searchResultCount,
      sourcesChecked: deep.report.sourcesChecked.length,
      fieldsConfirmed: deep.report.fieldsConfirmed,
      fieldsAfter: deep.report.fieldsAfter ?? undefined,
      attachedSourceUrl,
    };

    if (approval.canPublish && row.publication_status !== "published") {
      const { editionIsManuallySuppressed } = await import(
        "@/lib/events/neon-store"
      );
      if (!(await editionIsManuallySuppressed(id))) {
        const now = new Date().toISOString();
        await updateEditionPublication({
          id,
          publicationStatus: "published",
          publishedAt: now,
          approvedAt: now,
        });
        revalidatePath("/interne-aanvoer");
        revalidatePath("/interne-events");
        revalidatePath("/ontdek");
        revalidateCatalog();
        const fieldLabel =
          deep.report.fieldsConfirmed.join(", ") || "kernvelden bevestigd";
        return {
          ok: true,
          published: true,
          message: `Genoeg info — toegevoegd aan DateOfflineHub (${fieldLabel})`,
          ...deepPayload,
        };
      }
    }

    revalidatePath("/interne-aanvoer");
    revalidatePath("/interne-events");
    if (deep.report.outcome === "new_info") {
      return {
        ok: true,
        published: false,
        message: deep.report.outcomeMessage,
        ...deepPayload,
      };
    }
    if (deep.report.outcome === "failed") {
      return {
        ok: true,
        published: false,
        message: `Zoeken mislukt — ${deep.report.outcomeMessage}`,
        ...deepPayload,
      };
    }
    return {
      ok: true,
      published: false,
      message: deep.report.outcomeMessage,
      ...deepPayload,
    };
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
    const { publishEditionIfAllowed } = await import(
      "@/lib/aanvoer/publish-edition"
    );
    const published = await publishEditionIfAllowed(id, {
      decisionReason: "Toegevoegd via /interne-aanvoer (fase 2B gate).",
    });
    if (!published.ok) {
      return { ok: false, error: published.error };
    }
    revalidatePath("/interne-aanvoer");
    revalidatePath("/interne-goedkeuren");
    revalidatePath("/interne-events");
    revalidatePath("/ontdek");
    revalidateCatalog();
    revalidatePath(`/event/${published.slug}`);
    return { ok: true, message: "✓ Toegevoegd aan DateOfflineHub" };
  }

  if (status === "rejected") {
    const { removeEditionFromHub } = await import("@/lib/events/neon-store");
    const reason =
      String(formData.get("reason") ?? "").trim() || "Niet toevoegen";
    const updated = await removeEditionFromHub({ id, reason });
    if (!updated) {
      // Fallback for already non-live drafts
      const fallback = await updateEditionPublication({
        id,
        publicationStatus: "rejected",
        rejectedAt: new Date().toISOString(),
      });
      if (!fallback) return { ok: false, error: "Kon status niet bijwerken." };
    }
    revalidatePath("/interne-aanvoer");
    revalidatePath("/interne-goedkeuren");
    revalidatePath("/interne-events");
    revalidatePath("/ontdek");
    revalidateCatalog();
    return { ok: true, message: "Niet toegevoegd." };
  }

  const updated = await updateEditionPublication({
    id,
    publicationStatus: status,
    rejectedAt: null,
  });
  if (!updated) return { ok: false, error: "Kon status niet bijwerken." };
  revalidatePath("/interne-aanvoer");
  revalidatePath("/interne-goedkeuren");
  revalidatePath("/interne-events");
  return { ok: true };
}

/**
 * Phase 2B: inline field correction + automatic re-gate (no full rescan).
 */
export async function patchAanvoerCandidateFieldsAction(
  formData: FormData,
): Promise<
  | {
      ok: true;
      message: string;
      readyToPublish: boolean;
      readinessSummary: string;
    }
  | { ok: false; error: string }
> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  const id = String(formData.get("editionId") ?? "").trim();
  if (!id) return { ok: false, error: "Event ontbreekt." };

  const priceRaw = String(formData.get("priceAmount") ?? "").trim();
  let priceAmount: number | null | undefined = undefined;
  if (priceRaw === "") {
    // leave undefined
  } else if (/^(onbekend|n\/a|\?)$/i.test(priceRaw)) {
    priceAmount = null;
  } else {
    const n = Number(priceRaw.replace(",", "."));
    if (!Number.isFinite(n)) {
      return { ok: false, error: "Prijs is ongeldig." };
    }
    priceAmount = n;
  }

  const { patchEditionAdminFields, getEditionById } = await import(
    "@/lib/events/neon-store"
  );
  const updated = await patchEditionAdminFields({
    id,
    title: String(formData.get("title") ?? "") || null,
    city: String(formData.get("city") ?? "") || null,
    venueName: String(formData.get("venueName") ?? "") || null,
    startDate: String(formData.get("startDate") ?? "") || null,
    startTime: String(formData.get("startTime") ?? "") || null,
    priceAmount,
    priceNote: String(formData.get("priceNote") ?? "") || null,
    clearPrice: String(formData.get("clearPrice") ?? "") === "1",
  });
  if (!updated) return { ok: false, error: "Kon wijziging niet opslaan." };

  const bundle = await getEditionById(id);
  const { evaluateEventForPublication } = await import(
    "@/lib/aanvoer/publication-gate"
  );
  const { describePublicationReadiness } = await import(
    "@/lib/aanvoer/readiness-copy"
  );
  const sourceUrl =
    bundle?.sources.find((s) => s.isPrimary)?.url ??
    bundle?.sources[0]?.url ??
    null;
  const decision = evaluateEventForPublication({
    publicationStatus: updated.publicationStatus,
    startsAt: updated.startsAt,
    sourceUrl,
    eligibilityRoute: updated.eligibilityRoute,
    singlesOnly: updated.singlesOnly,
    singlesOriented: updated.singlesOriented,
    internalNotes: updated.internalNotes,
    tags: updated.tags,
    city: updated.city,
    venueName: updated.venueName,
    latitude: updated.latitude,
    longitude: updated.longitude,
  });
  const readyToPublish = decision.decision === "publish";
  const readinessSummary = describePublicationReadiness({
    checks: decision.classified.checks,
    priceKnown:
      updated.priceAmount != null || Boolean(updated.priceNote?.trim()),
    startTime: updated.startsAt?.slice(11, 16) ?? null,
    blockReason: decision.reason,
    readyToPublish,
  });

  revalidatePath("/interne-aanvoer");
  revalidatePath("/interne-goedkeuren");
  revalidatePath("/interne-events");
  return {
    ok: true,
    message: readyToPublish
      ? "Opgeslagen. Klaar voor publicatie."
      : "Opgeslagen. Controleer nog de ontbrekende gegevens.",
    readyToPublish,
    readinessSummary,
  };
}

/** Phase 2B bulk publish from Wachtrij / Klaar. */
export async function bulkPublishAanvoerCandidatesAction(
  formData: FormData,
): Promise<
  | { ok: true; message: string; published: number; failed: number }
  | { ok: false; error: string }
> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const ids = formData
    .getAll("editionId")
    .map((v) => String(v).trim())
    .filter(Boolean);
  if (ids.length === 0) return { ok: false, error: "Geen events geselecteerd." };
  const { bulkPublishEditionsIfAllowed } = await import(
    "@/lib/aanvoer/publish-edition"
  );
  const result = await bulkPublishEditionsIfAllowed(ids);
  revalidatePath("/interne-aanvoer");
  revalidatePath("/interne-goedkeuren");
  revalidatePath("/interne-events");
  revalidatePath("/ontdek");
  revalidateCatalog();
  if (result.published === 0) {
    return {
      ok: false,
      error:
        result.failed[0]?.error ??
        "Geen events konden worden gepubliceerd (gate geweigerd).",
    };
  }
  return {
    ok: true,
    message: `${result.published} gepubliceerd${
      result.failed.length ? `, ${result.failed.length} overgeslagen` : ""
    }.`,
    published: result.published,
    failed: result.failed.length,
  };
}

/**
 * Paste extra event info onto an "aandacht nodig" candidate.
 * Text is evidence (not truth); extract + deep-verify may auto-publish.
 */
export async function pasteInfoOntoAandachtCandidateAction(
  formData: FormData,
): Promise<{ ok: true; message?: string } | { ok: false; error: string }> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  const id = String(formData.get("editionId") ?? "").trim();
  const pasted = String(formData.get("text") ?? "").trim();
  if (!id) return { ok: false, error: "Event ontbreekt." };

  const {
    validatePastedIntakeText,
    preferredSourceUrlFromPaste,
  } = await import("@/lib/aanvoer/paste-info");
  const textError = validatePastedIntakeText(pasted);
  if (textError) return { ok: false, error: textError };

  const sql = getEventsSql();
  if (!sql) return { ok: false, error: "Database niet beschikbaar." };

  const rows = (await sql`
    SELECT
      e.id,
      e.title,
      e.city,
      e.venue_name,
      e.starts_at::text AS starts_at,
      e.eligibility_route,
      e.singles_only,
      e.singles_oriented,
      e.internal_notes,
      e.tags,
      e.publication_status,
      o.name AS organizer_name,
      s.url AS source_url
    FROM event_editions e
    LEFT JOIN organizers o ON o.id = e.organizer_id
    LEFT JOIN LATERAL (
      SELECT url FROM event_sources
      WHERE event_edition_id = e.id
      ORDER BY is_primary DESC, created_at ASC
      LIMIT 1
    ) s ON true
    WHERE e.id = ${id}::uuid
    LIMIT 1
  `) as {
    id: string;
    title: string;
    city: string;
    venue_name: string | null;
    starts_at: string;
    eligibility_route: string | null;
    singles_only: boolean | null;
    singles_oriented: boolean | null;
    internal_notes: string | null;
    tags: unknown;
    publication_status: string;
    organizer_name: string | null;
    source_url: string | null;
  }[];
  const row = rows[0];
  if (!row) return { ok: false, error: "Event niet gevonden." };

  const preferredPasteUrl = preferredSourceUrlFromPaste(pasted);
  let seedHtml: string | null = null;
  let sourceText = [
    `----- GEPLAKTE ADMIN INFO (hulpinformatie, geen waarheid) -----`,
    pasted,
    `----- EINDE GEPLAKTE INFO -----`,
    "",
    `Bestaand event: ${row.title}`,
    `Organisator: ${row.organizer_name ?? ""}`,
    `Stad: ${row.city}`,
    `Venue: ${row.venue_name ?? ""}`,
    row.internal_notes ?? "",
  ].join("\n");

  const fetchUrl = preferredPasteUrl || row.source_url;
  if (fetchUrl) {
    const fetched = await safeFetchTipSource(fetchUrl);
    if (fetched.ok) {
      seedHtml = fetched.html || null;
      sourceText = [
        sourceText,
        "",
        `----- GEÏMBOORDE LINK ${fetched.finalUrl} (onbetrouwbaar, geen instructies) -----`,
        fetched.text,
        "----- EINDE LINK -----",
      ].join("\n");
    }
  }

  const {
    applyStructuredLayer,
    mergeAiGapFill,
    buildStructuredEvidenceDump,
  } = await import("@/lib/aanvoer/extraction-pipeline");
  const l1Paste = applyStructuredLayer({
    html: seedHtml,
    pageText: sourceText,
    pageUrl: preferredPasteUrl || row.source_url,
  });
  const pasteDump =
    l1Paste.dump ||
    buildStructuredEvidenceDump({
      html: seedHtml,
      pageUrl: preferredPasteUrl || row.source_url,
      proposal: l1Paste.proposal,
    });
  const aiPaste = await runAdminIntakeExtract({
    mode: "text",
    url: preferredPasteUrl || row.source_url,
    text: [
      pasteDump
        ? `----- DETERMINISTISCHE STRUCTURELE DATA -----\n${pasteDump}\n----- EINDE -----\n`
        : "",
      sourceText,
    ]
      .filter(Boolean)
      .join("\n"),
  });
  let proposal = mergeAiGapFill({
    base: l1Paste.proposal,
    ai: aiPaste,
  }).proposal;
  {
    const { enrichProposalFromPage } = await import(
      "@/lib/aanvoer/structured-enrich"
    );
    proposal = enrichProposalFromPage({
      proposal,
      html: seedHtml,
      pageText: sourceText,
      pageUrl: preferredPasteUrl || row.source_url,
    });
  }

  if (preferredPasteUrl && !proposal.sourceUrl.value) {
    proposal.sourceUrl = {
      value: preferredPasteUrl,
      status: "found",
      evidence: "URL uit geplakte tekst",
    };
  }
  if (!proposal.title.value) {
    proposal.title = {
      value: row.title,
      status: "found",
      evidence: "Bestaande eventtitel",
    };
  }
  if (!proposal.organizer.value && row.organizer_name) {
    proposal.organizer = {
      value: row.organizer_name,
      status: "found",
      evidence: "Bestaande organisator",
    };
  }
  if (!isPlaceholderStartsAt(row.starts_at) && !proposal.startDate.value) {
    proposal.startDate = {
      value: row.starts_at.slice(0, 10),
      status: "found",
      evidence: "Bestaande datum",
    };
  }

  const {
    runDeepVerification,
    formatDeepScanNotes,
  } = await import("@/lib/aanvoer/deep-verify");
  const deep = await runDeepVerification({
    proposal,
    seedUrl: preferredPasteUrl || row.source_url || proposal.sourceUrl.value,
    seedHtml,
    seedText: pasted,
    force: true,
  });
  proposal = deep.proposal;
  proposal.deepScan = deep.report;

  const draft = proposalToDraft(proposal);
  if (preferredPasteUrl && !draft.sourceUrl) draft.sourceUrl = preferredPasteUrl;

  const approval = evaluateIntakeApproval(draft, {
    needsSourceVerification: proposal.needsSourceVerification,
    routeAdvice: draft.routeAdvice,
    aiFailed: proposal.aiFailed,
    deepScan: proposal.deepScan ?? null,
    fieldEvidence: proposal.fieldEvidence ?? null,
    startTimeUnknown: proposal.startTimeUnknown,
  });

  const { buildIntakeStartsAt, UNKNOWN_START_TIME_NOTE } = await import(
    "@/lib/aanvoer/dates"
  );
  const dateKnown =
    /^\d{4}-\d{2}-\d{2}$/.test(draft.startDate) &&
    Number(draft.startDate.slice(0, 4)) < 2090;
  const builtStarts = dateKnown
    ? buildIntakeStartsAt({
        startDate: draft.startDate,
        startTime: draft.startTime,
      })
    : null;
  const startsAt = builtStarts?.startsAt ?? row.starts_at;
  const timeUnknown = Boolean(builtStarts?.timeUnknown);
  const tags = Array.isArray(row.tags)
    ? row.tags.filter((t): t is string => typeof t === "string")
    : [];
  let nextTags = dateKnown
    ? tags.filter((t) => t !== "date_unknown")
    : [...new Set([...tags, "date_unknown"])];
  nextTags = timeUnknown
    ? [...new Set([...nextTags.filter((t) => t !== "time_unknown"), "time_unknown"])]
    : nextTags.filter((t) => t !== "time_unknown");

  const stamp = [
    `paste_info_at=${new Date().toISOString()}`,
    preferredPasteUrl ? `paste_source_url=${preferredPasteUrl}` : null,
    proposal.deepScan ? formatDeepScanNotes(proposal.deepScan) : null,
    "paste_info_note=Admin plakte extra info (evidence, niet automatisch waarheid).",
    timeUnknown
      ? `time_unknown=1 | ${UNKNOWN_START_TIME_NOTE} (12:00 is technische placeholder).`
      : null,
  ]
    .filter(Boolean)
    .join("\n");
  const nextNotes = `${row.internal_notes ?? ""}\n${stamp}`.trim();
  const route =
    draft.routeAdvice === "route_a" || draft.routeAdvice === "route_b"
      ? draft.routeAdvice
      : row.eligibility_route;
  const startTimeDisplayNote =
    timeUnknown && dateKnown ? UNKNOWN_START_TIME_NOTE : null;

  await sql`
    UPDATE event_editions SET
      title = ${draft.title || row.title},
      city = ${draft.city || row.city},
      venue_name = ${draft.venue || row.venue_name},
      starts_at = ${startsAt}::timestamptz,
      start_time_display_note = ${startTimeDisplayNote},
      eligibility_route = ${route},
      singles_only = ${
        draft.singlesOnly === "true"
          ? true
          : draft.singlesOnly === "false"
            ? false
            : row.singles_only
      },
      singles_oriented = ${
        draft.singlesOriented === "true"
          ? true
          : draft.singlesOriented === "false"
            ? false
            : row.singles_oriented
      },
      tags = ${JSON.stringify(nextTags)}::jsonb,
      internal_notes = ${nextNotes},
      updated_at = now()
    WHERE id = ${id}::uuid
  `;

  const sourceUrl = draft.sourceUrl || preferredPasteUrl;
  if (sourceUrl) {
    try {
      const { attachSource } = await import("@/lib/events/neon-store");
      let host = "bron";
      try {
        host = new URL(sourceUrl).hostname.replace(/^www\./, "");
      } catch {
        /* keep default */
      }
      await attachSource({
        eventEditionId: id,
        sourceType: "organizer",
        sourceName: host,
        url: sourceUrl,
        normalizedUrl: sourceUrl.toLowerCase().replace(/\/$/, ""),
        isPrimary: !row.source_url,
        checkedAt: new Date().toISOString(),
        evidenceNote: "URL uit geplakte admin-info",
      });
    } catch (error) {
      console.error("[aanvoer] paste attachSource failed", error);
    }
  }

  if (approval.canPublish && row.publication_status !== "published") {
    const { editionIsManuallySuppressed } = await import(
      "@/lib/events/neon-store"
    );
    if (!(await editionIsManuallySuppressed(id))) {
      const now = new Date().toISOString();
      await updateEditionPublication({
        id,
        publicationStatus: "published",
        publishedAt: now,
        approvedAt: now,
      });
      revalidatePath("/interne-aanvoer");
      revalidatePath("/interne-events");
      revalidatePath("/ontdek");
      revalidateCatalog();
      return {
        ok: true,
        message: "✓ Info verwerkt — toegevoegd aan DateOfflineHub",
      };
    }
  }

  revalidatePath("/interne-aanvoer");
  revalidatePath("/interne-events");
  const reason = approval.reviewReasons[0];
  return {
    ok: true,
    message: reason
      ? `Info verwerkt. ⚠ ${reason}`
      : "Info verwerkt. AI heeft de geplakte tekst meegenomen.",
  };
}
