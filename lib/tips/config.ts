/**
 * Tip portal feature gates.
 *
 * Public production submit stays OFF unless OFFLINERADAR_TIPS_PUBLIC_SUBMIT=1.
 * Neon store is for durable OfflineRadar DB (project little-haze-16039117).
 * Local JSON remains a shielded development fallback only.
 * Admin page/API require Auth.js + allowlist (see admin-auth.ts); env flags
 * alone are never production authentication.
 */

import { assertOfflineRadarDbConfig } from "@/lib/tips/db";

export function isTipsLocalStoreEnabled(): boolean {
  return (
    process.env.OFFLINERADAR_TIPS_LOCAL_STORE === "1" &&
    process.env.NODE_ENV !== "production"
  );
}

/** Explicit Neon tips store (never implied by DATABASE_URL alone). */
export function isTipsNeonStoreEnabled(): boolean {
  if (process.env.OFFLINERADAR_TIPS_NEON_STORE !== "1") return false;
  return assertOfflineRadarDbConfig().ok;
}

export function isTipsStoreAvailable(): boolean {
  return isTipsNeonStoreEnabled() || isTipsLocalStoreEnabled();
}

/**
 * Whether the backend may accept tip POSTs.
 * Production requires an explicit public-submit flag + Neon.
 * Non-production may use Neon or local store for developer testing.
 */
export function isTipsSubmitEnabled(): boolean {
  if (process.env.OFFLINERADAR_TIPS_PUBLIC_SUBMIT === "1") {
    return isTipsNeonStoreEnabled();
  }
  if (process.env.NODE_ENV === "production") {
    return false;
  }
  return isTipsNeonStoreEnabled() || isTipsLocalStoreEnabled();
}

/** Explicit public production submit (still off until you enable it). */
export function isTipsPublicSubmitEnabled(): boolean {
  return (
    process.env.OFFLINERADAR_TIPS_PUBLIC_SUBMIT === "1" &&
    isTipsNeonStoreEnabled()
  );
}

/**
 * Store + legacy admin flag (scripts / local UX only).
 * Never sufficient for production admin access — use resolveTipsAdminAccess().
 */
export function isTipsAdminEnabled(): boolean {
  if (process.env.OFFLINERADAR_TIPS_ADMIN !== "1") return false;
  return isTipsStoreAvailable();
}

export function tipsStorageMode(): "disabled" | "local_file" | "neon" {
  if (isTipsNeonStoreEnabled()) return "neon";
  if (isTipsLocalStoreEnabled()) return "local_file";
  return "disabled";
}
