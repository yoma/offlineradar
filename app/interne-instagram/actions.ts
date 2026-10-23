"use server";

import { revalidatePath } from "next/cache";
import { resolveTipsAdminAccess } from "@/lib/tips/admin-auth";
import { recordConceptEventIds } from "@/lib/instagram/history";

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

  await recordConceptEventIds(eventIds);
  revalidatePath("/interne-instagram");
  return { ok: true as const, recorded: eventIds.length };
}
