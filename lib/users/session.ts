/**
 * Session helpers for public account ownership checks.
 * Never trust client-supplied user ids.
 */
import { auth } from "@/auth";
import { getAppUserById } from "@/lib/users/store";

export type SessionAppUser = {
  id: string;
  email: string;
};

export async function requireSessionAppUser(): Promise<
  | { ok: true; user: SessionAppUser }
  | { ok: false; error: string }
> {
  const session = await auth();
  const id = session?.user?.id;
  const email = session?.user?.email;
  if (!id || !email) {
    return { ok: false, error: "Je bent niet ingelogd." };
  }
  // Ensure user still exists (e.g. after account delete on another device).
  const row = await getAppUserById(id);
  if (!row) {
    return { ok: false, error: "Account niet gevonden. Log opnieuw in." };
  }
  return { ok: true, user: { id: row.id, email: row.email } };
}

export async function getOptionalSessionAppUserId(): Promise<string | null> {
  const session = await auth();
  const id = session?.user?.id;
  return typeof id === "string" && id.length > 0 ? id : null;
}
