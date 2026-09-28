"use server";

import { revalidatePath } from "next/cache";
import { signIn, signOut } from "@/auth";
import { resolveTipsAdminAccess } from "@/lib/tips/admin-auth";
import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_STATUSES,
  type FeedbackCategory,
  type FeedbackStatus,
  updateBetaFeedbackAdminNote,
  updateBetaFeedbackCategory,
  updateBetaFeedbackStatus,
} from "@/lib/feedback/store";

export async function startFeedbackAdminSignIn() {
  await signIn("google", { redirectTo: "/interne-feedback" });
}

export async function signOutFeedbackAdmin() {
  await signOut({ redirectTo: "/interne-feedback" });
}

async function requireAdmin() {
  const access = await resolveTipsAdminAccess();
  if (!access.ok) {
    return { ok: false as const, error: "Geen beheerrechten." };
  }
  return { ok: true as const };
}

export async function updateFeedbackStatusAction(
  formData: FormData,
): Promise<void> {
  const gate = await requireAdmin();
  if (!gate.ok) return;

  const id = String(formData.get("id") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim();
  if (!id || !FEEDBACK_STATUSES.includes(status as FeedbackStatus)) return;

  await updateBetaFeedbackStatus(id, status as FeedbackStatus);
  revalidatePath("/interne-feedback");
}

export async function updateFeedbackCategoryAction(
  formData: FormData,
): Promise<void> {
  const gate = await requireAdmin();
  if (!gate.ok) return;

  const id = String(formData.get("id") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();
  if (!id || !FEEDBACK_CATEGORIES.includes(category as FeedbackCategory)) return;

  await updateBetaFeedbackCategory(id, category as FeedbackCategory);
  revalidatePath("/interne-feedback");
}

export async function updateFeedbackNoteAction(
  formData: FormData,
): Promise<void> {
  const gate = await requireAdmin();
  if (!gate.ok) return;

  const id = String(formData.get("id") ?? "").trim();
  const note = String(formData.get("adminNote") ?? "");
  if (!id) return;

  await updateBetaFeedbackAdminNote(id, note);
  revalidatePath("/interne-feedback");
}
