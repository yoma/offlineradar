/**
 * Server-only Instagram Meta publish configuration (Phase 3B).
 * Credentials never use NEXT_PUBLIC_*.
 */

export type InstagramMetaPublishMode = "disabled" | "dry_run" | "live";

export type InstagramMetaConfig = {
  mode: InstagramMetaPublishMode;
  igUserId: string | null;
  accessToken: string | null;
  graphApiVersion: string;
  graphHost: string;
  publishEnabled: boolean;
  dryRun: boolean;
  missingForLive: string[];
};

function flagOn(name: string): boolean {
  const v = process.env[name]?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

export function readInstagramMetaConfig(): InstagramMetaConfig {
  const publishEnabled = flagOn("INSTAGRAM_META_PUBLISH_ENABLED");
  const dryRun = flagOn("INSTAGRAM_META_DRY_RUN");
  const igUserId = process.env.META_IG_USER_ID?.trim() || null;
  const accessToken =
    process.env.META_PAGE_ACCESS_TOKEN?.trim() ||
    process.env.META_ACCESS_TOKEN?.trim() ||
    null;
  const graphApiVersion =
    process.env.META_GRAPH_API_VERSION?.trim() || "v22.0";
  const graphHost =
    process.env.META_GRAPH_HOST?.trim() || "graph.facebook.com";

  const missingForLive: string[] = [];
  if (!igUserId) missingForLive.push("META_IG_USER_ID");
  if (!accessToken) missingForLive.push("META_PAGE_ACCESS_TOKEN");

  let mode: InstagramMetaPublishMode = "disabled";
  if (dryRun) mode = "dry_run";
  else if (publishEnabled) mode = "live";

  return {
    mode,
    igUserId,
    accessToken,
    graphApiVersion,
    graphHost,
    publishEnabled,
    dryRun,
    missingForLive,
  };
}

export function metaPublishModeLabel(mode: InstagramMetaPublishMode): string {
  switch (mode) {
    case "live":
      return "live (echte Meta-publicatie)";
    case "dry_run":
      return "dry-run (geen Meta-aanroep)";
    default:
      return "uit (INSTAGRAM_META_PUBLISH_ENABLED / INSTAGRAM_META_DRY_RUN)";
  }
}
