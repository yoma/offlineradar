import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AccountView } from "@/components/account/account-view";
import {
  countSavedEvents,
  getUserPreferences,
} from "@/lib/users/store";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mijn account" };

export default async function AccountPage() {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    redirect("/inloggen?callbackUrl=/account");
  }

  let savedCount = 0;
  let preferences = null;
  try {
    [savedCount, preferences] = await Promise.all([
      countSavedEvents(session.user.id),
      getUserPreferences(session.user.id),
    ]);
  } catch {
    // Degrade gracefully if DB is down.
  }

  return (
    <AccountView
      email={session.user.email}
      savedCount={savedCount}
      preferences={preferences}
    />
  );
}
