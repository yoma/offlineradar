"use server";

import { signIn, signOut } from "@/auth";

export async function startGoogleSignIn() {
  await signIn("google", { redirectTo: "/interne-goedkeuren#tips" });
}

export async function signOutTipsAdmin() {
  await signOut({ redirectTo: "/interne-goedkeuren" });
}
