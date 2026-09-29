/**
 * HARD RULE — future discovery (FASE 26.6 / B21):
 *
 * Every catalog source saved via Admin Quick Intake carries
 * `discovered_by=user` (see withUserSuppliedProvenance).
 *
 * Automatic discovery / scheduled refresh MUST treat these as mandatory
 * input forever. Scanners may never drop or ignore a user-supplied source
 * merely because it was not rediscovered on a later crawl.
 *
 * Do not use screenshot upload time or intake created_at as freshness.
 * source_checked_at / last_checked_at only after a real official-source check.
 */
export const USER_SUPPLIED_MANDATORY_FUTURE_SCAN =
  "User-supplied (admin intake) sources are mandatory future discovery input.";
