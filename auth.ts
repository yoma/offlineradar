import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { isGoogleAuthConfigured } from "@/lib/tips/auth-env";
import { upsertAppUserFromGoogle } from "@/lib/users/store";
import type { JWT } from "next-auth/jwt";

type GoogleProfile = {
  sub?: string;
  email?: string;
  email_verified?: boolean | string;
  name?: string;
  picture?: string;
};

function profileEmailVerified(profile: GoogleProfile | undefined): boolean {
  if (!profile) return false;
  return profile.email_verified === true || profile.email_verified === "true";
}

/**
 * Auth.js (next-auth v5) — Google OAuth for DateOfflineHub.
 *
 * - Public users: optional account (preferences + saved events).
 * - Admin: still gated by OFFLINERADAR_ADMIN_EMAILS (never from this JWT alone).
 *
 * Scopes: openid + email + profile only (no Gmail/Drive/Calendar).
 */
const authSecret =
  process.env.AUTH_SECRET?.trim() ||
  (process.env.NODE_ENV === "production"
    ? undefined
    : "offlineradar-auth-unconfigured");

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
  secret: authSecret,
  session: { strategy: "jwt" },
  pages: {
    signIn: "/inloggen",
    error: "/inloggen",
  },
  callbacks: {
    async signIn({ profile }) {
      // Allow any verified Google account. Admin rights stay allowlist-only.
      const googleProfile = profile as GoogleProfile | undefined;
      if (!profileEmailVerified(googleProfile)) return false;
      if (!googleProfile?.email) return false;
      return true;
    },
    async jwt({ token, profile, account }) {
      const t = token as JWT;
      if (profile) {
        const googleProfile = profile as GoogleProfile;
        if (typeof googleProfile.email === "string") {
          t.email = googleProfile.email.toLowerCase();
        }
        t.emailVerified = profileEmailVerified(googleProfile);

        if (
          t.emailVerified &&
          typeof t.email === "string" &&
          account?.provider === "google"
        ) {
          try {
            const user = await upsertAppUserFromGoogle({
              email: t.email,
              googleSub:
                typeof googleProfile.sub === "string"
                  ? googleProfile.sub
                  : typeof account.providerAccountId === "string"
                    ? account.providerAccountId
                    : null,
              name: googleProfile.name ?? null,
              imageUrl: googleProfile.picture ?? null,
            });
            if (user) {
              t.appUserId = user.id;
              t.accountProvisionError = false;
            } else {
              t.accountProvisionError = true;
            }
          } catch {
            t.accountProvisionError = true;
          }
        }
      } else if (typeof t.email === "string") {
        t.email = t.email.toLowerCase();
        // Retry Neon upsert on later JWT refreshes when the first login failed.
        if (t.emailVerified && !t.appUserId && t.accountProvisionError) {
          try {
            const user = await upsertAppUserFromGoogle({
              email: t.email,
              googleSub:
                typeof t.sub === "string" && t.sub.length > 0 ? t.sub : null,
              name: typeof t.name === "string" ? t.name : null,
              imageUrl: typeof t.picture === "string" ? t.picture : null,
            });
            if (user) {
              t.appUserId = user.id;
              t.accountProvisionError = false;
            }
          } catch {
            t.accountProvisionError = true;
          }
        }
      }
      return t;
    },
    async session({ session, token }) {
      const t = token as JWT;
      if (session.user) {
        const user = session.user as {
          email?: string | null;
          id?: string;
        };
        // Only expose email when Google confirmed it; admin gate uses this.
        if (t.emailVerified && typeof t.email === "string") {
          user.email = t.email;
        } else {
          user.email = undefined;
        }
        if (typeof t.appUserId === "string") {
          user.id = t.appUserId;
        }
      }
      session.accountProvisionError = Boolean(
        t.accountProvisionError && !t.appUserId,
      );
      return session;
    },
  },
  trustHost: true,
});
