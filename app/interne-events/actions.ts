"use server";

import { revalidatePath } from "next/cache";
import { signIn, signOut } from "@/auth";
import { resolveTipsAdminAccess } from "@/lib/tips/admin-auth";
import {
  upsertCatalogSourceByUrl,
  updateCatalogSourceFields,
  type CatalogSourceStatus,
} from "@/lib/events/catalog-sources";
import { withUserSuppliedProvenance } from "@/lib/discovery/user-supplied";
import {
  updateOpenReportsForEdition,
  type EventReportStatus,
} from "@/lib/events/reports";

export async function startEventsAdminSignIn() {
  await signIn("google", { redirectTo: "/interne-events" });
}

export async function signOutEventsAdmin() {
  await signOut({ redirectTo: "/interne-events" });
}

export async function takeEventOfflineAction(formData: FormData) {
  const access = await resolveTipsAdminAccess();
  if (!access.ok) {
    throw new Error("Niet geautoriseerd");
  }
  const id = String(formData.get("editionId") ?? "").trim();
  if (!id) throw new Error("editionId ontbreekt");
  const reason = String(formData.get("reason") ?? "").trim() || null;
  const { removeEditionFromHub } = await import("@/lib/events/neon-store");
  const updated = await removeEditionFromHub({ id, reason });
  if (!updated) {
    throw new Error("Kon event niet van DateOfflineHub halen.");
  }
  revalidatePath("/interne-events");
  revalidatePath("/interne-aanvoer");
  revalidatePath("/ontdek");
  revalidatePath(`/event/${updated.slug}`);
}

/** Explicit human publish: gated one-click (Phase 2B). Syncs linked tips. */
export async function publishEventAction(formData: FormData) {
  const access = await resolveTipsAdminAccess();
  if (!access.ok) throw new Error("Niet geautoriseerd");
  const id = String(formData.get("editionId") ?? "").trim();
  if (!id) throw new Error("editionId ontbreekt");
  const { publishEditionIfAllowed } = await import(
    "@/lib/aanvoer/publish-edition"
  );
  const result = await publishEditionIfAllowed(id, {
    decisionReason: "Gepubliceerd via /interne-events (fase 2B gate).",
  });
  if (!result.ok) throw new Error(result.error);

  revalidatePath("/interne-events");
  revalidatePath("/interne-tips");
  revalidatePath("/interne-goedkeuren");
  revalidatePath("/interne-aanvoer");
  revalidatePath("/ontdek");
  revalidatePath(`/event/${result.slug}`);
}

/** Bulk publish with per-edition server-side gate. */
export async function bulkPublishEventsAction(formData: FormData) {
  const access = await resolveTipsAdminAccess();
  if (!access.ok) throw new Error("Niet geautoriseerd");
  const ids = formData
    .getAll("editionId")
    .map((v) => String(v).trim())
    .filter(Boolean);
  if (ids.length === 0) throw new Error("Geen events geselecteerd");
  const { bulkPublishEditionsIfAllowed } = await import(
    "@/lib/aanvoer/publish-edition"
  );
  const result = await bulkPublishEditionsIfAllowed(ids);
  revalidatePath("/interne-events");
  revalidatePath("/interne-aanvoer");
  revalidatePath("/interne-goedkeuren");
  revalidatePath("/ontdek");
  if (result.published === 0 && result.failed.length > 0) {
    throw new Error(
      result.failed[0]?.error ?? "Geen events konden worden gepubliceerd.",
    );
  }
  return result;
}

export async function addCatalogSourceAction(formData: FormData) {
  const access = await resolveTipsAdminAccess();
  if (!access.ok) throw new Error("Niet geautoriseerd");
  const name = String(formData.get("name") ?? "").trim();
  const officialUrl = String(formData.get("officialUrl") ?? "").trim();
  const status = String(formData.get("status") ?? "promising").trim() as CatalogSourceStatus;
  const notesRaw = String(formData.get("notes") ?? "").trim() || null;
  const userSupplied = String(formData.get("userSupplied") ?? "") === "1";
  const notes = userSupplied
    ? withUserSuppliedProvenance(notesRaw)
    : notesRaw;
  const regionsRaw = String(formData.get("regions") ?? "").trim();
  const formatsRaw = String(formData.get("formats") ?? "").trim();
  if (!name || !officialUrl) throw new Error("Naam en URL verplicht");
  const result = await upsertCatalogSourceByUrl({
    name,
    officialUrl,
    status,
    notes,
    regions: regionsRaw
      ? regionsRaw.split(",").map((s) => s.trim()).filter(Boolean)
      : [],
    formats: formatsRaw
      ? formatsRaw.split(",").map((s) => s.trim()).filter(Boolean)
      : [],
    lastCheckedAt: new Date().toISOString(),
  });
  if (!result) throw new Error("Kon bron niet opslaan");

  const { enableCatalogSourceAutoFollow } = await import(
    "@/lib/aanvoer/source-follow"
  );
  await enableCatalogSourceAutoFollow({
    catalogSourceId: result.record.id,
    officialUrl: result.record.officialUrl,
    name: result.record.name,
    namePrefix: result.created
      ? `Bron ${result.record.name} toegevoegd.`
      : `Bron ${result.record.name} bijgewerkt.`,
  });

  revalidatePath("/interne-events");
  revalidatePath("/interne-aanvoer");
}

export async function updateCatalogSourceAction(formData: FormData) {
  const access = await resolveTipsAdminAccess();
  if (!access.ok) throw new Error("Niet geautoriseerd");
  const id = String(formData.get("sourceId") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim() as CatalogSourceStatus;
  const notes = String(formData.get("notes") ?? "").trim();
  const touch = String(formData.get("touchChecked") ?? "") === "1";
  if (!id) throw new Error("sourceId ontbreekt");
  const updated = await updateCatalogSourceFields({
    id,
    status: status || undefined,
    notes: notes.length ? notes : null,
    touchChecked: touch,
  });
  if (!updated) throw new Error("Kon bron niet updaten");
  revalidatePath("/interne-events");
}

export async function updateEventReportsAction(formData: FormData) {
  const access = await resolveTipsAdminAccess();
  if (!access.ok) throw new Error("Niet geautoriseerd");
  const editionId = String(formData.get("editionId") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim() as EventReportStatus;
  const note = String(formData.get("resolutionNote") ?? "").trim() || null;
  if (!editionId) throw new Error("editionId ontbreekt");
  if (!["reviewing", "confirmed", "dismissed", "resolved"].includes(status)) {
    throw new Error("Ongeldige status");
  }
  const reviewedBy = access.email;
  await updateOpenReportsForEdition({
    eventEditionId: editionId,
    status,
    reviewedBy,
    resolutionNote: note,
  });
  revalidatePath("/interne-events");
}

export async function loadAdminEventsPageAction(input: {
  scope: "current" | "past";
  limit: number;
  offset: number;
  search: string;
}) {
  const access = await resolveTipsAdminAccess();
  if (!access.ok) throw new Error("Niet geautoriseerd");
  const { listEditionBundlesForAdmin } = await import(
    "@/lib/events/neon-store"
  );
  const { countOpenReportsByEditionIds } = await import(
    "@/lib/events/reports"
  );
  const page = await listEditionBundlesForAdmin({
    scope: input.scope,
    limit: input.limit,
    offset: input.offset,
    search: input.search,
  });
  if (!page) throw new Error("Catalogus kon niet worden gelezen.");
  const openByEdition = await countOpenReportsByEditionIds(
    page.bundles.map((bundle) => bundle.edition.id),
  ).catch(() => new Map<string, number>());
  return {
    scope: page.scope,
    total: page.total,
    limit: page.limit,
    offset: page.offset,
    events: page.bundles.map((bundle) => {
      const { edition } = bundle;
      const primary =
        bundle.sources.find((source) => source.isPrimary) ?? bundle.sources[0];
      return {
        id: edition.id,
        title: edition.title,
        slug: edition.slug,
        publicationStatus: edition.publicationStatus,
        publishedAt: edition.publishedAt,
        lastCheckedAt: edition.lastCheckedAt,
        city: edition.city,
        startsAt: edition.startsAt,
        endsAt: edition.endsAt,
        primarySourceUrl: primary?.url ?? null,
        primarySourceLabel:
          primary?.sourceName ?? primary?.sourceType ?? null,
        openReports: openByEdition.get(edition.id) ?? 0,
      };
    }),
  };
}
