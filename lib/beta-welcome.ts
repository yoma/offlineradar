/** One-time beta welcome modal (client localStorage; no DB). */

export const BETA_WELCOME_STORAGE_KEY = "offlineradar_beta_welcome_seen_v1";

export function isBetaWelcomeEnabled(): boolean {
  return process.env.NEXT_PUBLIC_BETA_WELCOME_ENABLED === "1";
}

/** Routes where the welcome modal must never appear. */
export function shouldSkipBetaWelcomePath(pathname: string | null): boolean {
  if (!pathname) return true;
  if (pathname === "/inloggen" || pathname.startsWith("/inloggen/")) return true;
  if (pathname === "/account" || pathname.startsWith("/account/")) return true;
  if (pathname.startsWith("/interne-")) return true;
  return false;
}

export function readBetaWelcomeSeen(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(BETA_WELCOME_STORAGE_KEY) === "1";
  } catch {
    return true;
  }
}

export function markBetaWelcomeSeen(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(BETA_WELCOME_STORAGE_KEY, "1");
  } catch {
    // ignore quota / private mode
  }
}
