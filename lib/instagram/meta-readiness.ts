/**
 * Instagram Meta Graph API readiness (Phase 3B).
 *
 * Official path (Facebook Login for Business / Page token):
 * - Instagram Professional account (@dateofflinehub)
 * - Facebook Page linked to the IG account
 * - Meta App with `instagram_basic`, `instagram_content_publish`,
 *   `pages_read_engagement` (Advanced Access for production)
 * - Long-lived Page access token in server env (never NEXT_PUBLIC_*)
 *
 * Required server env (see docs/instagram-meta-setup-fase3b.md):
 * - META_IG_USER_ID
 * - META_PAGE_ACCESS_TOKEN
 * - META_GRAPH_API_VERSION (optional, default v22.0)
 * - INSTAGRAM_META_PUBLISH_ENABLED=1 for live publish (default off)
 * - INSTAGRAM_META_DRY_RUN=1 for dry-run without Meta HTTP
 * - INSTAGRAM_IMAGE_SIGNING_SECRET (or AUTH_SECRET) for public JPEG URLs
 *
 * Limits (Meta):
 * - JPEG only for image_url; max ~8 MB; aspect 4:5–1.91:1
 * - ≤50 publishes / 24h / professional account
 * - Media URL must be publicly reachable (Meta curls it)
 *
 * Not in this phase: cron / auto-post, Stories, Reels.
 */

import {
  metaPublishModeLabel,
  readInstagramMetaConfig,
} from "@/lib/instagram/meta-config";

export function getInstagramMetaStatus() {
  const config = readInstagramMetaConfig();
  return {
    phase: "3B-meta-publish" as const,
    mode: config.mode,
    modeLabel: metaPublishModeLabel(config.mode),
    publishEnabled: config.publishEnabled,
    dryRun: config.dryRun,
    graphApiWired: Boolean(config.igUserId && config.accessToken),
    graphApiVersion: config.graphApiVersion,
    missingForLive: config.missingForLive,
  };
}

/** @deprecated prefer getInstagramMetaStatus() */
export const INSTAGRAM_META_STATUS = {
  publishEnabled: false,
  graphApiWired: false,
  phase: "3B-meta-publish",
} as const;
