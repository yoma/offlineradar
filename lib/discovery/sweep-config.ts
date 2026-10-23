/**
 * Autopilot Phase 2A discovery-sweep bounds + kill switch.
 * Default OFF — same pattern as OFFLINERADAR_SCHEDULED_REFRESH.
 */

/** Max search queries per sweep invocation. */
export const DISCOVERY_SWEEP_MAX_QUERIES = 6;

/** Max unique candidate URLs to evaluate (fetch) per sweep. */
export const DISCOVERY_SWEEP_MAX_CANDIDATES = 12;

/** Max new catalog_sources inserts per sweep (never events/publish). */
export const DISCOVERY_SWEEP_MAX_INSERTS = 5;

/** Max parallel page fetches. */
export const DISCOVERY_SWEEP_FETCH_CONCURRENCY = 2;

/**
 * Global kill switch. Default OFF unless explicitly "1".
 * Set OFFLINERADAR_DISCOVERY_SWEEP=1 only after Phase 2A review.
 */
export function isDiscoverySweepGloballyEnabled(): boolean {
  return process.env.OFFLINERADAR_DISCOVERY_SWEEP === "1";
}

/** Wallonie FR expansion — off until product unfreezes. */
export function isDiscoveryWallonieEnabled(): boolean {
  return process.env.OFFLINERADAR_DISCOVERY_WALLONIE === "1";
}
