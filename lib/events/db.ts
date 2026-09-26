/**
 * Shared Neon SQL client for OfflineRadar catalog (same DB as tips).
 * Reuses project guards from lib/tips/db — no second framework.
 */

export {
  assertOfflineRadarDbConfig,
  expectedNeonEndpointId,
  expectedNeonProjectId,
  getOfflineRadarDatabaseUrl,
  getTipsSql as getEventsSql,
} from "@/lib/tips/db";
