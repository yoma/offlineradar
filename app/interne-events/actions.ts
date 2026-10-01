"use server";

import { revalidatePath } from "next/cache";
import { signIn, signOut } from "@/auth";
import { resolveTipsAdminAccess } from "@/lib/tips/admin-auth";
import {
  getEditionById,
  updateEditionPublication,
} from "@/lib/events/neon-store";
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
import { neonListTipIdsForEdition } from "@/lib/tips/neon-store";
import { updateTipStatus } from "@/lib/tips/service";

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

/** Explicit human publish: draft/approved/under_review → published. Syncs linked tips. */
export async function publishEventAction(formData: FormData) {
  const access = await resolveTipsAdminAccess();
  if (!access.ok) throw new Error("Niet geautoriseerd");
  const id = String(formData.get("editionId") ?? "").trim();
  if (!id) throw new Error("editionId ontbreekt");
  const { editionIsManuallySuppressed } = await import("@/lib/events/neon-store");
  if (await editionIsManuallySuppressed(id)) {
    throw new Error(
      "Dit event is handmatig weggehaald. AI mag het niet opnieuw publiceren.",
    );
  }
  const bundle = await getEditionById(id);
  if (!bundle) throw new Error("Event niet gevonden");
  const status = bundle.edition.publicationStatus;
  if (status === "published") throw new Error("Event is al published");
  if (status === "rejected" || status === "cancelled" || status === "expired") {
    throw new Error("Deze status kan niet gepubliceerd worden");
  }
  const now = new Date().toISOString();
  const updated = await updateEditionPublication({
    id,
    publicationStatus: "published",
    publishedAt: now,
    approvedAt: now,
  });
  if (!updated) throw new Error("Publiceren mislukt");

  const tipIds = await neonListTipIdsForEdition(id);
  for (const tipId of tipIds) {
    await updateTipStatus({
      tipId,
      status: "published",
      decisionReason: "Gekoppeld event gepubliceerd via /interne-events.",
      publishedEventPath: `/event/${updated.slug}`,
    });
  }

  revalidatePath("/interne-events");
  revalidatePath("/interne-tips");
  revalidatePath("/ontdek");
  revalidatePath(`/event/${updated.slug}`);
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
  revalidatePath("/interne-events");
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
