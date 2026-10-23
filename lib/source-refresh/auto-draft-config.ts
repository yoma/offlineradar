/**
 * Phase 2B — optional auto-draft after scheduled source refresh.
 * Default OFF. When ON, scheduled cron uses thorough mode:
 * safe new candidates → draft editions (never published).
 *
 * Independent from OFFLINERADAR_SCHEDULED_REFRESH (must also be ON for cron work)
 * and OFFLINERADAR_DISCOVERY_SWEEP (organizer discovery).
 */

/** Max drafted editions attributed in one scheduled batch summary (soft). */
export const REFRESH_AUTO_DRAFT_MAX_PER_SOURCE = 20;

/**
 * Kill switch. Default OFF unless explicitly "1".
 * Set OFFLINERADAR_REFRESH_AUTO_DRAFT=1 only after Phase 2B review.
 */
export function isRefreshAutoDraftGloballyEnabled(): boolean {
  return process.env.OFFLINERADAR_REFRESH_AUTO_DRAFT === "1";
}
