import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { isGoogleAuthConfigured } from "@/lib/tips/auth-env";
import type { JWT } from "next-auth/jwt";

type GoogleProfile = {
  email?: string;
  email_verified?: boolean | string;
};

function profileEmailVerified(profile: GoogleProfile | undefined): boolean {
  if (!profile) return false;
  return profile.email_verified === true || profile.email_verified === "true";
}

/**
 * Auth.js (next-auth v5) — Google OAuth for OfflineRadar tips admin only.
 *
 * Scopes: openid + email + profile only (no Gmail/Drive/Calendar).
 * Admin rights still require OFFLINERADAR_ADMIN_EMAILS (never trust client claims).
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: isGoogleAuthConfigured()
    ? [
        Google({
          authorization: {
            params: {
              prompt: "select_account",
              // Minimal identity scopes only — no Gmail, Drive, or other APIs.
              scope: "openid email profile",
            },
          },
        }),
      ]
    : [],
  secret: process.env.AUTH_SECRET || "offlineradar-auth-unconfigured",
  session: { strategy: "jwt" },
  pages: {
    signIn: "/interne-tips",
    error: "/interne-tips",
  },
  callbacks: {
    async signIn({ profile }) {
      // Allow any Google account to complete OAuth so non-allowlisted users
      // see a clear "geen beheerrechten" page. Reject unverified emails.
      const googleProfile = profile as GoogleProfile | undefined;
      if (!profileEmailVerified(googleProfile)) return false;
      if (!googleProfile?.email) return false;
      return true;
    },
    async jwt({ token, profile }) {
      const t = token as JWT & { emailVerified?: boolean };
      if (profile) {
        const googleProfile = profile as GoogleProfile;
        if (typeof googleProfile.email === "string") {
          t.email = googleProfile.email.toLowerCase();
        }
        t.emailVerified = profileEmailVerified(googleProfile);
      } else if (typeof t.email === "string") {
        t.email = t.email.toLowerCase();
      }
      return t;
    },
    async session({ session, token }) {
      const t = token as JWT & { emailVerified?: boolean };
      if (session.user) {
        const user = session.user as { email?: string | null };
        // Only expose email when Google confirmed it; admin gate uses this.
        if (t.emailVerified && typeof t.email === "string") {
          user.email = t.email;
        } else {
          user.email = undefined;
        }
      }
      return session;
    },
  },
  trustHost: true,
});
