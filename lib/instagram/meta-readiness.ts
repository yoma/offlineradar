/**
 * Future Meta Instagram Graph API readiness notes (Phase 3A — no live publish).
 *
 * Official path only:
 * - Meta Business / Instagram Professional account (@dateofflinehub)
 * - Facebook Page linked to the IG account
 * - Meta App with instagram_content_publish (and related) permissions
 * - Long-lived Page access token stored as server env (never NEXT_PUBLIC_*)
 *
 * Suggested later env (not created in this phase):
 * - META_IG_USER_ID
 * - META_PAGE_ACCESS_TOKEN
 * - META_GRAPH_API_VERSION (e.g. v21.0)
 *
 * Cost expectation (indicative, Meta pricing can change):
 * - Organic feed publish via Graph API: no per-post Meta fee for standard
 *   Business accounts within normal usage.
 * - Image render on Vercel: ImageResponse / serverless CPU only (existing plan).
 * - Optional AI caption polish (Anthropic): only if explicitly enabled later;
 *   Phase 3A captions are template-based and free.
 *
 * Publishing cadence proposal (not automated yet):
 * - 2–3 feed posts / week when enough eligible events exist
 * - Stories for events within ~3 days
 * - Skip the slot when selection returns too few events
 * - Avoid repeating the same edition within ~21 days (see history.ts)
 */

export const INSTAGRAM_META_STATUS = {
  publishEnabled: false,
  graphApiWired: false,
  phase: "3A-preview",
} as const;
