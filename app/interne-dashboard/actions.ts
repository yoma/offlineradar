"use server";

import { signIn, signOut } from "@/auth";

export async function startDashboardAdminSignIn() {
  await signIn("google", { redirectTo: "/interne-dashboard" });
}

export async function signOutDashboardAdmin() {
  await signOut({ redirectTo: "/interne-dashboard" });
}
