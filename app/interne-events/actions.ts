"use server";

import { revalidatePath } from "next/cache";
import { signIn, signOut } from "@/auth";
import { resolveTipsAdminAccess } from "@/lib/tips/admin-auth";
import { takeEditionOffline } from "@/lib/events/neon-store";
import {
  upsertCatalogSourceByUrl,
  updateCatalogSourceFields,
  type CatalogSourceStatus,
} from "@/lib/events/catalog-sources";

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
  const updated = await takeEditionOffline(id);
  if (!updated) {
    throw new Error("Kon event niet offline halen (niet published of niet gevonden).");
  }
  revalidatePath("/interne-events");
  revalidatePath("/ontdek");
  revalidatePath(`/event/${updated.slug}`);
}

export async function addCatalogSourceAction(formData: FormData) {
  const access = await resolveTipsAdminAccess();
  if (!access.ok) throw new Error("Niet geautoriseerd");
  const name = String(formData.get("name") ?? "").trim();
  const officialUrl = String(formData.get("officialUrl") ?? "").trim();
  const status = String(formData.get("status") ?? "promising").trim() as CatalogSourceStatus;
  const notes = String(formData.get("notes") ?? "").trim() || null;
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
