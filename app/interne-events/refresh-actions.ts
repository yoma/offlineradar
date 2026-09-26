"use server";

import { revalidatePath } from "next/cache";
import { resolveTipsAdminAccess } from "@/lib/tips/admin-auth";
import { applyRefreshChangesToEdition } from "@/lib/source-refresh/apply-change";
import { createDraftFromRefreshCandidate } from "@/lib/source-refresh/draft-from-candidate";
import { startSourceRefresh } from "@/lib/source-refresh/engine";
import { getRefreshPilot } from "@/lib/source-refresh/registry";
import {
  getRefreshItem,
  updateRefreshItemStatus,
} from "@/lib/source-refresh/store";
import type { RefreshNormalizedCandidate } from "@/lib/source-refresh/types";

export type RefreshActionState = {
  ok: boolean;
  message: string;
  runId?: string;
};

export async function runSourceRefreshAction(
  _prev: RefreshActionState,
  formData: FormData,
): Promise<RefreshActionState> {
  const access = await resolveTipsAdminAccess();
  if (!access.ok) {
    return { ok: false, message: "Niet geautoriseerd" };
  }
  const catalogSourceId = String(formData.get("catalogSourceId") ?? "").trim();
  if (!catalogSourceId) {
    return { ok: false, message: "Bron ontbreekt" };
  }
  const result = await startSourceRefresh({
    catalogSourceId,
    triggeredBy: access.email,
  });
  revalidatePath("/interne-events");
  if (result.run?.id) {
    revalidatePath(`/interne-events/refresh/${result.run.id}`);
  }
  if (!result.ok) {
    return {
      ok: false,
      message: result.error,
      runId: result.run?.id,
    };
  }
  return {
    ok: true,
    message: `Klaar: ${result.run.newCount} nieuw, ${result.run.changedCount} gewijzigd, ${result.run.unchangedCount} ongewijzigd, ${result.run.removedCount} mogelijk verdwenen.`,
    runId: result.run.id,
  };
}

export async function ignoreRefreshItemAction(formData: FormData) {
  const access = await resolveTipsAdminAccess();
  if (!access.ok) throw new Error("Niet geautoriseerd");
  const id = String(formData.get("itemId") ?? "").trim();
  if (!id) throw new Error("itemId ontbreekt");
  const item = await updateRefreshItemStatus({
    id,
    status: "ignored",
    reviewedBy: access.email,
  });
  if (!item) throw new Error("Item niet gevonden");
  revalidatePath(`/interne-events/refresh/${item.refreshRunId}`);
  revalidatePath("/interne-events");
}

export async function addRefreshItemAsDraftAction(formData: FormData) {
  const access = await resolveTipsAdminAccess();
  if (!access.ok) throw new Error("Niet geautoriseerd");
  const id = String(formData.get("itemId") ?? "").trim();
  if (!id) throw new Error("itemId ontbreekt");
  const item = await getRefreshItem(id);
  if (!item) throw new Error("Item niet gevonden");
  if (item.detectionType !== "new") {
    throw new Error("Alleen nieuwe edities kunnen als concept worden toegevoegd.");
  }
  const pilot = getRefreshPilot(item.catalogSourceId);
  if (!pilot) throw new Error("Onbekende pilotbron");
  const candidate = item.proposedData as RefreshNormalizedCandidate;
  if (!candidate?.externalKey || !candidate.title || !candidate.startsAt) {
    throw new Error("Kandidaatgegevens onvolledig");
  }
  const edition = await createDraftFromRefreshCandidate({
    candidate,
    organizerSlug: pilot.organizerSlug,
    organizerName: pilot.organizerName,
    organizerWebsite: pilot.fetchUrl,
  });
  if (!edition) throw new Error("Kon draft niet aanmaken");
  await updateRefreshItemStatus({
    id,
    status: "accepted",
    reviewedBy: access.email,
  });
  revalidatePath(`/interne-events/refresh/${item.refreshRunId}`);
  revalidatePath("/interne-events");
}

export async function applyRefreshItemChangeAction(formData: FormData) {
  const access = await resolveTipsAdminAccess();
  if (!access.ok) throw new Error("Niet geautoriseerd");
  const id = String(formData.get("itemId") ?? "").trim();
  if (!id) throw new Error("itemId ontbreekt");
  const item = await getRefreshItem(id);
  if (!item) throw new Error("Item niet gevonden");
  if (item.detectionType !== "existing_changed") {
    throw new Error("Alleen gewijzigde edities kunnen worden toegepast.");
  }
  if (!item.matchEventEditionId) {
    throw new Error("Geen gekoppeld canonical event.");
  }
  const updated = await applyRefreshChangesToEdition({
    editionId: item.matchEventEditionId,
    changes: item.changeSummary ?? [],
  });
  if (!updated) throw new Error("Kon wijziging niet toepassen");
  await updateRefreshItemStatus({
    id,
    status: "applied",
    reviewedBy: access.email,
  });
  revalidatePath(`/interne-events/refresh/${item.refreshRunId}`);
  revalidatePath("/interne-events");
  revalidatePath("/ontdek");
}

export async function bulkAddRefreshDraftsAction(formData: FormData) {
  const access = await resolveTipsAdminAccess();
  if (!access.ok) throw new Error("Niet geautoriseerd");
  const ids = formData.getAll("itemId").map((v) => String(v).trim()).filter(Boolean);
  if (ids.length === 0) throw new Error("Geen items geselecteerd");
  let runId: string | null = null;
  for (const id of ids) {
    const item = await getRefreshItem(id);
    if (!item || item.detectionType !== "new") continue;
    runId = item.refreshRunId;
    const pilot = getRefreshPilot(item.catalogSourceId);
    if (!pilot) continue;
    const candidate = item.proposedData as RefreshNormalizedCandidate;
    if (!candidate?.externalKey) continue;
    const edition = await createDraftFromRefreshCandidate({
      candidate,
      organizerSlug: pilot.organizerSlug,
      organizerName: pilot.organizerName,
      organizerWebsite: pilot.fetchUrl,
    });
    if (!edition) continue;
    await updateRefreshItemStatus({
      id,
      status: "accepted",
      reviewedBy: access.email,
    });
  }
  if (runId) revalidatePath(`/interne-events/refresh/${runId}`);
  revalidatePath("/interne-events");
}
