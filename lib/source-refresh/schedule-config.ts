/**
 * Per-parser default cadence (hours) for scheduled refresh.
 * Conservative: daily high-churn, slower for travel catalogs.
 */
import type { RefreshParserKey } from "@/lib/source-refresh/types";

/** Max sources refreshed in one cron invocation. */
export const SCHEDULED_REFRESH_BATCH_SIZE = 3;

/** Parallel fetches within one cron invocation. */
export const SCHEDULED_REFRESH_CONCURRENCY = 2;

/**
 * Default intervals (hours) when catalog_sources.refresh_interval_hours is null.
 * - speeddaten / hoptodate: daily (high edition churn)
 * - sportieve-singles: every 2 days
 * - tomeeto / juntas: ~2× per week
 */
export const DEFAULT_REFRESH_INTERVAL_HOURS: Record<RefreshParserKey, number> = {
  speeddaten: 24,
  hoptodate: 24,
  "sportieve-singles": 48,
  tomeeto: 84,
  juntas: 84,
  "generic-website": 72,
  websearch: 96,
};

/**
 * Global kill switch. Default OFF unless explicitly "1".
 * Set OFFLINERADAR_SCHEDULED_REFRESH=1 in production after pilot.
 */
export function isScheduledRefreshGloballyEnabled(): boolean {
  return process.env.OFFLINERADAR_SCHEDULED_REFRESH === "1";
}

/**
 * Optional cron source allowlist (catalog_sources.id).
 * When non-empty, scheduled refresh only considers these IDs
 * (still requires refresh_enabled=true and due interval).
 * When empty/unset → previous behaviour (all refresh_enabled).
 */
export function getScheduledRefreshSourceAllowlist(): string[] {
  const raw = process.env.OFFLINERADAR_SCHEDULED_REFRESH_SOURCE_IDS ?? "";
  return raw
    .split(/[,\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => /^[0-9a-f-]{36}$/.test(s));
}
