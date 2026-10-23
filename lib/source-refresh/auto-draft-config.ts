/**
 * Phase 2B — optional auto-draft after scheduled source refresh.
 * Default OFF. When ON, scheduled cron may use thorough mode for an
 * explicit source allowlist: safe new candidates → draft editions (never published).
 *
 * Independent from OFFLINERADAR_SCHEDULED_REFRESH (must also be ON for cron work)
 * and OFFLINERADAR_DISCOVERY_SWEEP (organizer discovery).
 *
 * Safety: AUTO_DRAFT=1 alone is not enough — OFFLINERADAR_REFRESH_AUTO_DRAFT_SOURCE_IDS
 * must list 1–N catalog source UUIDs. Empty/missing allowlist → no thorough drafts.
 */

/** Default max new drafts created per source in one thorough run. */
export const REFRESH_AUTO_DRAFT_MAX_PER_SOURCE = 10;

/**
 * Kill switch. Default OFF unless explicitly "1".
 * Set OFFLINERADAR_REFRESH_AUTO_DRAFT=1 only after Phase 2B review + allowlist.
 */
export function isRefreshAutoDraftGloballyEnabled(): boolean {
  return process.env.OFFLINERADAR_REFRESH_AUTO_DRAFT === "1";
}

/**
 * Comma/whitespace-separated catalog_sources.id allowlist for thorough auto-draft.
 * Returns [] when unset/empty (fail-closed: no source gets thorough).
 */
export function getRefreshAutoDraftSourceAllowlist(): string[] {
  const raw = process.env.OFFLINERADAR_REFRESH_AUTO_DRAFT_SOURCE_IDS ?? "";
  return raw
    .split(/[,\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => /^[0-9a-f-]{36}$/.test(s));
}

/**
 * Thorough auto-draft for this source only when global switch is ON and
 * the source id is on the allowlist (non-empty).
 */
export function isRefreshAutoDraftAllowedForSource(
  catalogSourceId: string,
): boolean {
  if (!isRefreshAutoDraftGloballyEnabled()) return false;
  const allow = getRefreshAutoDraftSourceAllowlist();
  if (allow.length === 0) return false;
  return allow.includes(catalogSourceId.trim().toLowerCase());
}

/**
 * Hard cap for drafts created in one thorough post-process.
 * Override with OFFLINERADAR_REFRESH_AUTO_DRAFT_MAX_PER_SOURCE (1–50).
 */
export function getRefreshAutoDraftMaxPerSource(): number {
  const raw = process.env.OFFLINERADAR_REFRESH_AUTO_DRAFT_MAX_PER_SOURCE;
  if (raw == null || raw.trim() === "") return REFRESH_AUTO_DRAFT_MAX_PER_SOURCE;
  const n = Number(raw);
  if (!Number.isFinite(n)) return REFRESH_AUTO_DRAFT_MAX_PER_SOURCE;
  return Math.min(50, Math.max(1, Math.floor(n)));
}
