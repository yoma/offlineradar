"use server";

import { revalidatePath } from "next/cache";
import { signIn, signOut } from "@/auth";
import { requireSessionAppUser } from "@/lib/users/session";
import {
  countSavedEvents,
  deleteAppUser,
  getUserPreferences,
  listSavedEventIds,
  mergeSavedEventIds,
  setSavedEvent,
  upsertUserPreferences,
} from "@/lib/users/store";
import type { StoredProfile } from "@/types/search";
import { emptyProfile } from "@/lib/storage-shared";

export async function continueWithGoogle(redirectTo = "/account") {
  const safe =
    typeof redirectTo === "string" &&
    redirectTo.startsWith("/") &&
    !redirectTo.startsWith("//")
      ? redirectTo
      : "/account";
  await signIn("google", { redirectTo: safe });
}

export async function publicSignOut(redirectTo = "/") {
  const safe =
    typeof redirectTo === "string" &&
    redirectTo.startsWith("/") &&
    !redirectTo.startsWith("//")
      ? redirectTo
      : "/";
  await signOut({ redirectTo: safe });
}

export async function savePreferencesAction(
  profile: StoredProfile,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const gate = await requireSessionAppUser();
  if (!gate.ok) return gate;
  try {
    const saved = await upsertUserPreferences(gate.user.id, {
      ...emptyProfile,
      ...profile,
      interests: Array.isArray(profile.interests) ? profile.interests : [],
    });
    if (!saved) {
      return { ok: false, error: "Voorkeuren konden niet worden opgeslagen." };
    }
    revalidatePath("/account");
    revalidatePath("/ontdek");
    return { ok: true };
  } catch {
    return { ok: false, error: "Voorkeuren opslaan mislukt. Probeer later opnieuw." };
  }
}

export async function loadPreferencesAction(): Promise<
  { ok: true; profile: StoredProfile | null } | { ok: false; error: string }
> {
  const gate = await requireSessionAppUser();
  if (!gate.ok) return gate;
  try {
    const profile = await getUserPreferences(gate.user.id);
    return { ok: true, profile };
  } catch {
    return { ok: false, error: "Voorkeuren laden mislukt." };
  }
}

export async function toggleSavedEventAction(
  eventId: string,
  saved: boolean,
): Promise<{ ok: true; ids: string[] } | { ok: false; error: string }> {
  const gate = await requireSessionAppUser();
  if (!gate.ok) return gate;
  const id = typeof eventId === "string" ? eventId.trim() : "";
  if (!id) return { ok: false, error: "Ongeldig event." };
  try {
    await setSavedEvent(gate.user.id, id, saved);
    const ids = await listSavedEventIds(gate.user.id);
    revalidatePath("/bewaard");
    revalidatePath("/account");
    return { ok: true, ids };
  } catch {
    return { ok: false, error: "Bewaren mislukt. Probeer later opnieuw." };
  }
}

export async function mergeLocalSavedAction(
  localIds: string[],
): Promise<{ ok: true; ids: string[] } | { ok: false; error: string }> {
  const gate = await requireSessionAppUser();
  if (!gate.ok) return gate;
  try {
    const ids = await mergeSavedEventIds(
      gate.user.id,
      Array.isArray(localIds) ? localIds : [],
    );
    revalidatePath("/bewaard");
    return { ok: true, ids };
  } catch {
    return { ok: false, error: "Samenvoegen van bewaarde events mislukt." };
  }
}

export async function listSavedIdsAction(): Promise<
  { ok: true; ids: string[] } | { ok: false; error: string }
> {
  const gate = await requireSessionAppUser();
  if (!gate.ok) return gate;
  try {
    const ids = await listSavedEventIds(gate.user.id);
    return { ok: true, ids };
  } catch {
    return { ok: false, error: "Bewaarde events laden mislukt." };
  }
}

export async function accountSummaryAction(): Promise<
  | {
      ok: true;
      email: string;
      savedCount: number;
      preferences: StoredProfile | null;
    }
  | { ok: false; error: string }
> {
  const gate = await requireSessionAppUser();
  if (!gate.ok) return gate;
  try {
    const [savedCount, preferences] = await Promise.all([
      countSavedEvents(gate.user.id),
      getUserPreferences(gate.user.id),
    ]);
    return {
      ok: true,
      email: gate.user.email,
      savedCount,
      preferences,
    };
  } catch {
    return { ok: false, error: "Accountgegevens laden mislukt." };
  }
}

export async function deleteAccountAction(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const gate = await requireSessionAppUser();
  if (!gate.ok) return gate;
  try {
    const deleted = await deleteAppUser(gate.user.id);
    if (!deleted) {
      return { ok: false, error: "Account kon niet worden verwijderd." };
    }
  } catch {
    return { ok: false, error: "Account verwijderen mislukt." };
  }
  await signOut({ redirectTo: "/" });
  return { ok: true };
}
