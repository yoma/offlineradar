/**
 * Public tip submit rate limiting — design only (not activated).
 *
 * Do NOT use in-memory counters on Vercel serverless (cold starts / multi-instance).
 *
 * Recommended approach when public submit is enabled (needs your approval):
 * - Shared store: OfflineRadar Neon table, e.g. tip_submit_rate
 *   (ip_hash TEXT, window_start TIMESTAMPTZ, hit_count INT, PK (ip_hash, window_start))
 * - Hash visitor IP with a server secret (AUTH_SECRET or dedicated salt); never store raw IP
 *   longer than needed, or store only HMAC.
 * - Limit e.g. N submissions per rolling 15-minute window per hash.
 * - Fail closed or soft-throttle on DB errors (no silent unlimited submit).
 *
 * Alternatives that introduce a new paid/external service (ask first):
 * - Upstash Redis + @upstash/ratelimit
 * - Vercel Firewall / BotID for bot pressure (complementary, not sole limit)
 *
 * This module is intentionally inactive until public submit is authorized.
 */

export const PUBLIC_SUBMIT_RATE_LIMIT_PLAN = {
  storage: "neon_shared_table",
  recommendedWindowMinutes: 15,
  recommendedMaxSubmits: 5,
  status: "not_activated",
} as const;
