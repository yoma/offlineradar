/**
 * Pure publish policy helpers (offline-testable).
 */

/** Errors after media_publish where Meta may already have accepted the post. */
const AMBIGUOUS_POST_PUBLISH_CODES = new Set([
  "meta_network",
  "meta_container_timeout",
  "meta_missing_id",
  "meta_graph_error",
]);

/** Definitive failures before / instead of a successful publish ack. */
const DEFINITIVE_PRE_PUBLISH_CODES = new Set([
  "meta_auth",
  "meta_media_url",
  "meta_media_format",
  "meta_container_failed",
  "meta_rate_limit",
  "no_slides",
  "carousel_too_small",
  "missing_credentials",
  "missing_signing_secret",
  "not_approved",
  "content_mismatch",
  "event_drift",
]);

export function isAmbiguousPostPublishError(code: string): boolean {
  return AMBIGUOUS_POST_PUBLISH_CODES.has(code);
}

export function isDefinitivePrePublishError(code: string): boolean {
  return DEFINITIVE_PRE_PUBLISH_CODES.has(code);
}

/**
 * Whether a container status allows releasing the publish slot.
 * Unknown / IN_PROGRESS / lookup failure → keep blocked.
 */
export function canReleasePendingForStatus(args: {
  statusOk: boolean;
  statusCode?: string | null;
  hasContainerId: boolean;
  mode: "live" | "dry_run";
  rowIsLiveAttempt: boolean;
}): "keep_blocked" | "safe_to_fail_no_container" | "resume_finished" | "confirm_published" {
  // Dry-run must never release or recover a live attempt.
  if (args.mode === "dry_run" && args.rowIsLiveAttempt) {
    return "keep_blocked";
  }
  if (!args.hasContainerId) {
    // Publish never reached Meta — safe to free after stale window.
    return "safe_to_fail_no_container";
  }
  if (!args.statusOk) return "keep_blocked";
  const code = (args.statusCode ?? "").toUpperCase();
  if (code === "PUBLISHED") return "confirm_published";
  if (code === "FINISHED") return "resume_finished";
  if (code === "ERROR" || code === "EXPIRED") {
    // Definitive container death before a known media id — still keep blocked
    // if we cannot prove no post; treat as keep_blocked for safety after publish attempt.
    // Pre-publish container errors are handled before media_publish separately.
    return "keep_blocked";
  }
  // IN_PROGRESS, UNKNOWN, empty, etc.
  return "keep_blocked";
}

export const META_HTTP_TIMEOUT_MS = 20_000;
export const META_CAROUSEL_TOTAL_BUDGET_MS = 180_000;
