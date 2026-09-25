/**
 * Server-side admin authorization for the tips queue.
 *
 * - Session identity comes only from Auth.js (Google OAuth).
 * - Admin role comes only from OFFLINERADAR_ADMIN_EMAILS (server env allowlist).
 * - Browser-supplied email/role parameters are never trusted.
 * - Env flags alone are not production auth.
 */

import { isGoogleAuthConfigured } from "@/lib/tips/auth-env";

export type TipsAdminDenialReason =
  | "store_disabled"
  | "auth_unconfigured"
  | "unauthenticated"
  | "forbidden";

export type TipsAdminAccess =
  | {
      ok: true;
      email: string;
      via: "google_session" | "dev_bypass";
    }
  | {
      ok: false;
      reason: TipsAdminDenialReason;
    };

/** Injected in verify scripts; production always uses Auth.js auth(). */
let sessionEmailOverride: string | null | undefined;

export function __setTipsAdminSessionEmailForTests(
  email: string | null | undefined,
): void {
  sessionEmailOverride = email;
}

export { isGoogleAuthConfigured };

/** Explicit allowlist of admin emails (comma-separated). */
export function getAdminEmailAllowlist(): Set<string> {
  const raw = process.env.OFFLINERADAR_ADMIN_EMAILS?.trim() ?? "";
  if (!raw) return new Set();
  return new Set(
    raw
      .split(",")
      .map((part) => part.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isAllowlistedAdminEmail(
  email: string | null | undefined,
): boolean {
  if (!email) return false;
  return getAdminEmailAllowlist().has(email.trim().toLowerCase());
}

/**
 * Local-only bypass for store/UI testing without Google OAuth.
 * Never active in production. Never a substitute for real auth on deploy.
 */
export function isTipsAdminDevBypassEnabled(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  return (
    process.env.OFFLINERADAR_TIPS_ADMIN_DEV_BYPASS === "1" &&
    process.env.OFFLINERADAR_TIPS_ADMIN === "1"
  );
}

/**
 * Resolve whether the current request may access tips admin data.
 * Call from Server Components and Route Handlers only.
 */
export async function resolveTipsAdminAccess(options?: {
  /** Pre-resolved session email from Auth.js; omit to read auth() when configured. */
  sessionEmail?: string | null;
  storeAvailable?: boolean;
}): Promise<TipsAdminAccess> {
  const { isTipsStoreAvailable } = await import("@/lib/tips/config");
  const storeAvailable = options?.storeAvailable ?? isTipsStoreAvailable();

  if (!storeAvailable) {
    return { ok: false, reason: "store_disabled" };
  }

  // Test injection takes precedence (scripts only).
  if (sessionEmailOverride !== undefined) {
    const email = sessionEmailOverride;
    if (!email) return { ok: false, reason: "unauthenticated" };
    if (!isAllowlistedAdminEmail(email)) {
      return { ok: false, reason: "forbidden" };
    }
    return { ok: true, email: email.toLowerCase(), via: "google_session" };
  }

  if (options?.sessionEmail !== undefined) {
    const email = options.sessionEmail;
    if (!email) return { ok: false, reason: "unauthenticated" };
    if (!isAllowlistedAdminEmail(email)) {
      return { ok: false, reason: "forbidden" };
    }
    return { ok: true, email: email.toLowerCase(), via: "google_session" };
  }

  if (isGoogleAuthConfigured()) {
    const { auth } = await import("@/auth");
    const session = await auth();
    const email = session?.user?.email?.toLowerCase() ?? null;
    if (!email) return { ok: false, reason: "unauthenticated" };
    if (!isAllowlistedAdminEmail(email)) {
      return { ok: false, reason: "forbidden" };
    }
    return { ok: true, email, via: "google_session" };
  }

  // Auth not configured: only explicit local bypass (never production).
  if (isTipsAdminDevBypassEnabled()) {
    return {
      ok: true,
      email: "dev-bypass@localhost",
      via: "dev_bypass",
    };
  }

  return { ok: false, reason: "auth_unconfigured" };
}
