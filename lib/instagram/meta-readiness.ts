/**
 * Instagram publish readiness (Instagram API with Instagram Login).
 *
 * - Instagram Professional account (@dateofflinehub), no Facebook Page needed
 * - Meta App with Instagram Login + `instagram_business_content_publish`
 *
 * Server env (Vercel → Settings → Environment Variables, never NEXT_PUBLIC_*):
 * - INSTAGRAM_USER_ID
 * - INSTAGRAM_ACCESS_TOKEN (seeds lib/instagram/token-store, auto-refreshed)
 * - INSTAGRAM_GRAPH_API_VERSION (optional, default v24.0)
 * - INSTAGRAM_META_PUBLISH_ENABLED=1 for the manual publish button
 * - INSTAGRAM_META_DRY_RUN=1 for dry-run without Meta HTTP
 *
 * Limits (Meta):
 * - JPEG only for image_url; max 8 MB; aspect 4:5–1.91:1
 * - ≤50 publishes / 24h / professional account
 * - Media URL must be publicly reachable (Meta curls it)
 *
 * Scheduled posting: see lib/instagram/queue.ts + /api/cron/instagram.
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
