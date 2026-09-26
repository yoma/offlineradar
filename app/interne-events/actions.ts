"use server";

import { revalidatePath } from "next/cache";
import { signIn, signOut } from "@/auth";
import { resolveTipsAdminAccess } from "@/lib/tips/admin-auth";
import { takeEditionOffline } from "@/lib/events/neon-store";

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
