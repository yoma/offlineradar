/**
 * Instagram post queue (Neon): scheduled posts with an approval step.
 *
 * Status flow:
 *   concept      → parked / rejected, never posted
 *   te_keuren    → waiting for the admin (posted only when auto-post is on)
 *   goedgekeurd  → posted by the cron at scheduled_at
 *   gepost       → live on Instagram (instagram_media_id set)
 *   mislukt      → error_message says why; "Opnieuw proberen" re-approves
 */

import { randomBytes } from "node:crypto";
import { appPublicBaseUrl } from "@/lib/email/app-brand";
import { getEventsSql } from "@/lib/events/db";
import { ensureInstagramQueueSchema } from "@/lib/instagram/queue-schema";
import type { ReelProps } from "@/lib/instagram/reel/types";

export const INSTAGRAM_QUEUE_STATUSES = [
  "concept",
  "te_keuren",
  "goedgekeurd",
  "gepost",
  "mislukt",
] as const;

export type InstagramQueueStatus = (typeof INSTAGRAM_QUEUE_STATUSES)[number];

export const INSTAGRAM_CAPTION_MAX = 2200;
export const INSTAGRAM_MEDIA_PATH = "/api/instagram/media";

export type ReelStatus = "geen" | "te_maken" | "bezig" | "klaar" | "mislukt";

/** How a post went (or is going) to Instagram. */
export type PublishedAs = "reel" | "post";

/** Media kinds a reel render uploads. */
export type ReelMediaKind = "reel" | "reel_cover" | "reel_story";

/** Render attempts before a reel counts as failed (the post stays usable). */
export const REEL_MAX_ATTEMPTS = 3;

export type InstagramQueuePost = {
  id: string;
  imageUrls: string[];
  mediaIds: string[];
  caption: string;
  scheduledAt: string;
  status: InstagramQueueStatus;
  errorMessage: string | null;
  instagramMediaId: string | null;
  /** Container we sent to media_publish; set means a publish may have happened. */
  containerId: string | null;
  /** Also publish a story after the feed post. */
  postStory: boolean;
  /** Our media id of the 1080×1920 story JPEG (null until rendered). */
  storyImageId: string | null;
  /** Instagram media id of the published story. */
  instagramStoryId: string | null;
  storyError: string | null;
  reelStatus: ReelStatus;
  reelError: string | null;
  /** Our media ids of the rendered MP4 and its cover (null until rendered). */
  reelVideoId: string | null;
  reelCoverId: string | null;
  /** Story still for the reel ("Nieuwe reel, bekijk ons profiel"). */
  reelStoryId: string | null;
  reelTrack: string | null;
  /** The reel's hook sentence, e.g. "3 singles-events in Gent dit weekend". */
  reelHook: string | null;
  /** Set once publishing starts: 'reel' or 'post' (fallback or reels off). */
  publishedAs: PublishedAs | null;
  source: "auto" | "manual";
  format: string | null;
  eventIds: string[];
  approvedBy: string | null;
  approvedAt: string | null;
  publishStartedAt: string | null;
  postedAt: string | null;
  createdAt: string;
};

type QueueRow = {
  id: string;
  image_urls: unknown;
  caption: string;
  scheduled_at: string | Date;
  status: InstagramQueueStatus;
  error_message: string | null;
  instagram_media_id: string | null;
  container_id: string | null;
  post_story?: boolean | null;
  story_media_id?: string | null;
  story_error?: string | null;
  story_image_id?: string | null;
  reel_status?: ReelStatus | null;
  reel_error?: string | null;
  reel_track?: string | null;
  reel_props?: unknown;
  reel_video_id?: string | null;
  reel_cover_id?: string | null;
  reel_story_id?: string | null;
  published_as?: PublishedAs | null;
  source: "auto" | "manual";
  format: string | null;
  event_ids: unknown;
  approved_by: string | null;
  approved_at: string | Date | null;
  publish_started_at: string | Date | null;
  posted_at: string | Date | null;
  created_at: string | Date;
  media_ids?: unknown;
};

function iso(value: string | Date | null): string | null {
  if (!value) return null;
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

function stringArray(value: unknown): string[] {
  const parsed = typeof value === "string" ? safeJson(value) : value;
  return Array.isArray(parsed)
    ? parsed.filter((v): v is string => typeof v === "string")
    : [];
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function reelHookOf(raw: unknown): string | null {
  const props = typeof raw === "string" ? safeJson(raw) : raw;
  const hook = (props as { hookText?: unknown } | null)?.hookText;
  return typeof hook === "string" ? hook : null;
}

function mapRow(row: QueueRow): InstagramQueuePost {
  return {
    id: row.id,
    imageUrls: stringArray(row.image_urls),
    mediaIds: stringArray(row.media_ids),
    caption: row.caption,
    scheduledAt: iso(row.scheduled_at)!,
    status: row.status,
    errorMessage: row.error_message,
    instagramMediaId: row.instagram_media_id,
    containerId: row.container_id ?? null,
    postStory: row.post_story !== false,
    storyImageId: row.story_image_id ?? null,
    instagramStoryId: row.story_media_id ?? null,
    storyError: row.story_error ?? null,
    reelStatus: row.reel_status ?? "geen",
    reelError: row.reel_error ?? null,
    reelVideoId: row.reel_video_id ?? null,
    reelCoverId: row.reel_cover_id ?? null,
    reelStoryId: row.reel_story_id ?? null,
    reelTrack: row.reel_track ?? null,
    reelHook: reelHookOf(row.reel_props),
    publishedAs: row.published_as ?? null,
    source: row.source,
    format: row.format,
    eventIds: stringArray(row.event_ids),
    approvedBy: row.approved_by,
    approvedAt: iso(row.approved_at),
    publishStartedAt: iso(row.publish_started_at),
    postedAt: iso(row.posted_at),
    createdAt: iso(row.created_at)!,
  };
}

async function queueSql() {
  const sql = getEventsSql();
  if (!sql) throw new Error("neon_unavailable");
  await ensureInstagramQueueSchema();
  return sql;
}

export function newMediaId(): string {
  return randomBytes(16).toString("hex");
}

export function publicMediaUrl(mediaId: string, baseUrl = appPublicBaseUrl()): string {
  return `${baseUrl.replace(/\/$/, "")}${INSTAGRAM_MEDIA_PATH}/${mediaId}.jpg`;
}

/** Public MP4 URL (Meta fetches reels from here, like the JPEGs). */
export function publicVideoUrl(mediaId: string, baseUrl = appPublicBaseUrl()): string {
  return `${baseUrl.replace(/\/$/, "")}${INSTAGRAM_MEDIA_PATH}/${mediaId}.mp4`;
}

export function normalizeCaption(raw: string): string {
  return raw.replace(/\r\n/g, "\n").trim().slice(0, INSTAGRAM_CAPTION_MAX);
}

export async function listQueuePosts(limit = 60): Promise<InstagramQueuePost[]> {
  const sql = await queueSql();
  const rows = (await sql`
    SELECT q.*,
      COALESCE(
        (SELECT jsonb_agg(m.id ORDER BY m.position)
         FROM instagram_post_media m WHERE m.post_id = q.id AND m.kind = 'feed'),
        '[]'::jsonb
      ) AS media_ids,
      (SELECT m.id FROM instagram_post_media m
       WHERE m.post_id = q.id AND m.kind = 'story' LIMIT 1) AS story_image_id,
      (SELECT m.id FROM instagram_post_media m
       WHERE m.post_id = q.id AND m.kind = 'reel' LIMIT 1) AS reel_video_id,
      (SELECT m.id FROM instagram_post_media m
       WHERE m.post_id = q.id AND m.kind = 'reel_cover' LIMIT 1) AS reel_cover_id,
      (SELECT m.id FROM instagram_post_media m
       WHERE m.post_id = q.id AND m.kind = 'reel_story' LIMIT 1) AS reel_story_id
    FROM instagram_post_queue q
    ORDER BY
      CASE WHEN q.status IN ('te_keuren', 'goedgekeurd', 'mislukt') THEN 0 ELSE 1 END,
      CASE WHEN q.status IN ('te_keuren', 'goedgekeurd', 'mislukt')
        THEN q.scheduled_at END ASC,
      q.scheduled_at DESC
    LIMIT ${limit}
  `) as QueueRow[];
  return rows.map(mapRow);
}

export async function getQueuePost(id: string): Promise<InstagramQueuePost | null> {
  const sql = await queueSql();
  const rows = (await sql`
    SELECT * FROM instagram_post_queue WHERE id = ${id}
  `) as QueueRow[];
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function hasPostForSlot(slotKey: string): Promise<boolean> {
  const sql = await queueSql();
  const rows = (await sql`
    SELECT 1 FROM instagram_post_queue WHERE slot_key = ${slotKey}
  `) as unknown[];
  return rows.length > 0;
}

/**
 * Insert a post together with its frozen JPEG slides.
 * Returns null when the slot was taken by a concurrent run.
 */
export async function createQueuePost(input: {
  jpegs: Buffer[];
  caption: string;
  scheduledAt: Date;
  status: Extract<InstagramQueueStatus, "concept" | "te_keuren">;
  source: "auto" | "manual";
  format?: string | null;
  eventIds?: string[];
  slotKey?: string | null;
  /** 1080×1920 story JPEG; null when it could not be rendered. */
  storyJpeg?: Buffer | null;
  postStory?: boolean;
  /** Input for the reel render; null/absent = no reel for this post. */
  reelProps?: ReelProps | null;
}): Promise<InstagramQueuePost | null> {
  if (input.jpegs.length < 1 || input.jpegs.length > 10) {
    throw new Error("Een post heeft 1 tot 10 afbeeldingen nodig.");
  }
  const sql = await queueSql();
  const id = `igq_${randomBytes(9).toString("hex")}`;
  const mediaIds = input.jpegs.map(() => newMediaId());
  const imageUrls = mediaIds.map((m) => publicMediaUrl(m));

  const inserted = (await sql`
    INSERT INTO instagram_post_queue (
      id, image_urls, caption, scheduled_at, status, source, format,
      event_ids, slot_key, post_story, reel_status, reel_props
    ) VALUES (
      ${id},
      ${JSON.stringify(imageUrls)}::jsonb,
      ${normalizeCaption(input.caption)},
      ${input.scheduledAt.toISOString()}::timestamptz,
      ${input.status},
      ${input.source},
      ${input.format ?? null},
      ${JSON.stringify(input.eventIds ?? [])}::jsonb,
      ${input.slotKey ?? null},
      ${input.postStory !== false},
      ${input.reelProps ? "te_maken" : "geen"},
      ${input.reelProps ? JSON.stringify(input.reelProps) : null}::jsonb
    )
    ON CONFLICT DO NOTHING
    RETURNING id
  `) as { id: string }[];
  if (inserted.length === 0) return null;

  try {
    for (let i = 0; i < input.jpegs.length; i++) {
      await sql`
        INSERT INTO instagram_post_media (id, post_id, position, bytes)
        VALUES (${mediaIds[i]!}, ${id}, ${i}, ${input.jpegs[i]!})
      `;
    }
    if (input.storyJpeg) await addStoryImage(id, input.storyJpeg);
  } catch (error) {
    await sql`DELETE FROM instagram_post_queue WHERE id = ${id}`.catch(
      () => undefined,
    );
    throw error;
  }
  return getQueuePost(id);
}

export async function getQueueMedia(mediaId: string): Promise<Buffer | null> {
  return (await getQueueMediaWithKind(mediaId))?.bytes ?? null;
}

/** Media bytes plus their kind ('feed', 'story', 'reel', 'reel_cover'). */
export async function getQueueMediaWithKind(
  mediaId: string,
): Promise<{ bytes: Buffer; kind: string } | null> {
  const sql = await queueSql();
  const rows = (await sql`
    SELECT bytes, kind FROM instagram_post_media WHERE id = ${mediaId}
  `) as { bytes: Buffer | Uint8Array; kind: string }[];
  const row = rows[0];
  if (!row?.bytes) return null;
  return {
    bytes: Buffer.isBuffer(row.bytes) ? row.bytes : Buffer.from(row.bytes),
    kind: row.kind,
  };
}

/** Admin edits are only allowed before publishing starts. */
const EDITABLE = ["concept", "te_keuren", "goedgekeurd", "mislukt"] as const;

export async function updateQueuePost(
  id: string,
  patch: { caption?: string; scheduledAt?: Date; postStory?: boolean },
): Promise<boolean> {
  const sql = await queueSql();
  const rows = (await sql`
    UPDATE instagram_post_queue SET
      caption = COALESCE(${patch.caption != null ? normalizeCaption(patch.caption) : null}, caption),
      scheduled_at = COALESCE(${patch.scheduledAt?.toISOString() ?? null}::timestamptz, scheduled_at),
      post_story = COALESCE(${patch.postStory ?? null}::boolean, post_story),
      updated_at = now()
    WHERE id = ${id}
      AND status = ANY(${[...EDITABLE]})
      AND publish_started_at IS NULL
    RETURNING id
  `) as unknown[];
  return rows.length > 0;
}

export async function approveQueuePost(
  id: string,
  args: {
    caption: string;
    scheduledAt?: Date;
    approvedBy: string | null;
    postStory?: boolean;
  },
  now = new Date(),
): Promise<boolean> {
  const sql = await queueSql();
  // A time in the past means "post at the next cron run".
  const rows = (await sql`
    UPDATE instagram_post_queue SET
      caption = ${normalizeCaption(args.caption)},
      post_story = COALESCE(${args.postStory ?? null}::boolean, post_story),
      scheduled_at = GREATEST(
        COALESCE(${args.scheduledAt?.toISOString() ?? null}::timestamptz, scheduled_at),
        ${now.toISOString()}::timestamptz
      ),
      status = 'goedgekeurd',
      error_message = NULL,
      approved_by = ${args.approvedBy},
      approved_at = now(),
      updated_at = now()
    WHERE id = ${id}
      AND status IN ('te_keuren', 'goedgekeurd')
      AND publish_started_at IS NULL
    RETURNING id
  `) as unknown[];
  return rows.length > 0;
}

export async function rejectQueuePost(id: string): Promise<boolean> {
  const sql = await queueSql();
  const rows = (await sql`
    UPDATE instagram_post_queue SET
      status = 'concept',
      approved_by = NULL,
      approved_at = NULL,
      updated_at = now()
    WHERE id = ${id}
      AND status IN ('te_keuren', 'goedgekeurd', 'mislukt')
      AND publish_started_at IS NULL
    RETURNING id
  `) as unknown[];
  return rows.length > 0;
}

/** Send a parked concept back to the review list. */
export async function submitQueuePostForReview(id: string): Promise<boolean> {
  const sql = await queueSql();
  const rows = (await sql`
    UPDATE instagram_post_queue SET status = 'te_keuren', updated_at = now()
    WHERE id = ${id} AND status = 'concept'
    RETURNING id
  `) as unknown[];
  return rows.length > 0;
}

/**
 * Make a failed post eligible again (it goes back to "te keuren").
 *
 * container_id is kept by default: the next publish asks Instagram what
 * happened to it and refuses to post again unless it is clearly unpublished.
 * `confirmedNotOnInstagram` (admin checked Instagram) clears it.
 */
export async function resetFailedQueuePost(
  id: string,
  options?: { confirmedNotOnInstagram?: boolean },
): Promise<boolean> {
  const sql = await queueSql();
  const clear = options?.confirmedNotOnInstagram === true;
  const rows = (await sql`
    UPDATE instagram_post_queue SET
      status = 'te_keuren',
      error_message = NULL,
      container_id = CASE WHEN ${clear} THEN NULL ELSE container_id END,
      published_as = CASE WHEN ${clear} THEN NULL ELSE published_as END,
      publish_started_at = NULL,
      approved_by = NULL,
      approved_at = NULL,
      updated_at = now()
    WHERE id = ${id} AND status = 'mislukt'
    RETURNING id
  `) as unknown[];
  return rows.length > 0;
}

export async function deleteQueuePost(id: string): Promise<boolean> {
  const sql = await queueSql();
  const rows = (await sql`
    DELETE FROM instagram_post_queue
    WHERE id = ${id} AND status <> 'gepost' AND publish_started_at IS NULL
    RETURNING id
  `) as unknown[];
  return rows.length > 0;
}

// --- cron side --------------------------------------------------------------

/**
 * Atomically claim the next due post. Only one cron run can win a post:
 * publish_started_at is set in the same statement.
 */
export async function claimDueQueuePost(args: {
  autoPost: boolean;
  now?: Date;
}): Promise<InstagramQueuePost | null> {
  const sql = await queueSql();
  const now = (args.now ?? new Date()).toISOString();
  const rows = (await sql`
    UPDATE instagram_post_queue SET
      publish_started_at = now(),
      updated_at = now()
    WHERE id = (
      SELECT id FROM instagram_post_queue
      WHERE publish_started_at IS NULL
        AND scheduled_at <= ${now}::timestamptz
        AND (
          status = 'goedgekeurd'
          OR (status = 'te_keuren' AND ${args.autoPost})
        )
      ORDER BY scheduled_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    AND publish_started_at IS NULL
    RETURNING *
  `) as QueueRow[];
  return rows[0] ? mapRow(rows[0]) : null;
}

/** Claim one specific post for an immediate "Nu plaatsen". */
export async function claimQueuePostById(
  id: string,
): Promise<InstagramQueuePost | null> {
  const sql = await queueSql();
  const rows = (await sql`
    UPDATE instagram_post_queue SET
      publish_started_at = now(),
      updated_at = now()
    WHERE id = ${id}
      AND status IN ('te_keuren', 'goedgekeurd')
      AND publish_started_at IS NULL
    RETURNING *
  `) as QueueRow[];
  return rows[0] ? mapRow(rows[0]) : null;
}

/** Saved right before media_publish, so a retry can check that container. */
export async function saveQueueContainerId(
  id: string,
  containerId: string,
  publishedAs: PublishedAs = "post",
) {
  const sql = await queueSql();
  await sql`
    UPDATE instagram_post_queue
    SET container_id = ${containerId}, published_as = ${publishedAs}, updated_at = now()
    WHERE id = ${id}
  `;
}

/** The reel files of a post (null ids when not rendered). */
export async function getReelMediaIds(postId: string): Promise<{
  video: string | null;
  cover: string | null;
  story: string | null;
}> {
  const sql = await queueSql();
  const rows = (await sql`
    SELECT id, kind FROM instagram_post_media
    WHERE post_id = ${postId} AND kind IN ('reel', 'reel_cover', 'reel_story')
  `) as { id: string; kind: string }[];
  const of = (kind: string) => rows.find((r) => r.kind === kind)?.id ?? null;
  return { video: of("reel"), cover: of("reel_cover"), story: of("reel_story") };
}

export async function markQueuePosted(
  id: string,
  mediaId: string | null,
  publishedAs?: PublishedAs,
) {
  const sql = await queueSql();
  await sql`
    UPDATE instagram_post_queue SET
      status = 'gepost',
      published_as = COALESCE(${publishedAs ?? null}, published_as, 'post'),
      instagram_media_id = ${mediaId},
      error_message = NULL,
      posted_at = now(),
      updated_at = now()
    WHERE id = ${id}
  `;
}

export async function markQueueFailed(id: string, message: string) {
  const sql = await queueSql();
  await sql`
    UPDATE instagram_post_queue SET
      status = 'mislukt',
      error_message = ${message.slice(0, 1000)},
      updated_at = now()
    WHERE id = ${id}
  `;
}

/**
 * Housekeeping: interrupted publishes, posts that missed their time by more
 * than two days, and old JPEG bytes (Instagram keeps its own copy).
 */
export async function sweepQueue(now = new Date()): Promise<{
  interrupted: number;
  overdue: number;
  mediaPurged: number;
}> {
  const sql = await queueSql();
  const nowIso = now.toISOString();
  const interrupted = (await sql`
    UPDATE instagram_post_queue SET
      status = 'mislukt',
      error_message = 'Publiceren werd onderbroken. Kijk op Instagram of de post toch online staat voor je opnieuw probeert.',
      updated_at = now()
    WHERE status IN ('te_keuren', 'goedgekeurd')
      AND publish_started_at IS NOT NULL
      AND publish_started_at < ${nowIso}::timestamptz - interval '15 minutes'
    RETURNING id
  `) as unknown[];
  const overdue = (await sql`
    UPDATE instagram_post_queue SET
      status = 'mislukt',
      error_message = 'Niet geplaatst: het geplande tijdstip is meer dan twee dagen voorbij. Kies een nieuw tijdstip en keur opnieuw goed.',
      updated_at = now()
    WHERE status = 'goedgekeurd'
      AND publish_started_at IS NULL
      -- 48h: the cron runs once a day, so a missed evening still gets one
      -- more chance the next day.
      AND scheduled_at < ${nowIso}::timestamptz - interval '48 hours'
    RETURNING id
  `) as unknown[];
  const mediaPurged = (await sql`
    DELETE FROM instagram_post_media m
    USING instagram_post_queue q
    WHERE m.post_id = q.id
      AND (
        (q.status = 'gepost' AND q.posted_at < ${nowIso}::timestamptz - interval '30 days')
        OR (q.status IN ('concept', 'mislukt')
            AND q.updated_at < ${nowIso}::timestamptz - interval '60 days')
      )
    RETURNING m.id
  `) as unknown[];
  return {
    interrupted: interrupted.length,
    overdue: overdue.length,
    mediaPurged: mediaPurged.length,
  };
}

// --- stories ----------------------------------------------------------------

export async function getStoryImageId(postId: string): Promise<string | null> {
  const sql = await queueSql();
  const rows = (await sql`
    SELECT id FROM instagram_post_media
    WHERE post_id = ${postId} AND kind = 'story'
    LIMIT 1
  `) as { id: string }[];
  return rows[0]?.id ?? null;
}

export async function getFirstFeedImage(postId: string): Promise<Buffer | null> {
  const sql = await queueSql();
  const rows = (await sql`
    SELECT id FROM instagram_post_media
    WHERE post_id = ${postId} AND kind = 'feed'
    ORDER BY position LIMIT 1
  `) as { id: string }[];
  return rows[0] ? getQueueMedia(rows[0].id) : null;
}

export async function addStoryImage(postId: string, jpeg: Buffer): Promise<string> {
  const sql = await queueSql();
  const mediaId = newMediaId();
  await sql`
    INSERT INTO instagram_post_media (id, post_id, position, bytes, kind)
    VALUES (${mediaId}, ${postId}, 0, ${jpeg}, 'story')
  `;
  return mediaId;
}

/**
 * Claim the story publish for a posted feed post. A claim older than 10
 * minutes counts as abandoned. Returns false when a story is already live
 * or another run holds the claim.
 */
export async function claimStoryPublish(postId: string): Promise<boolean> {
  const sql = await queueSql();
  const rows = (await sql`
    UPDATE instagram_post_queue SET
      story_started_at = now(),
      story_error = NULL,
      updated_at = now()
    WHERE id = ${postId}
      AND status = 'gepost'
      AND story_media_id IS NULL
      AND (story_started_at IS NULL OR story_started_at < now() - interval '10 minutes')
    RETURNING id
  `) as unknown[];
  return rows.length > 0;
}

export async function markStoryPosted(postId: string, igMediaId: string) {
  const sql = await queueSql();
  await sql`
    UPDATE instagram_post_queue SET
      story_media_id = ${igMediaId},
      story_error = NULL,
      updated_at = now()
    WHERE id = ${postId}
  `;
}

/** Story failed: release the claim so "Verhaal plaatsen" can try again. */
export async function markStoryFailed(postId: string, message: string) {
  const sql = await queueSql();
  await sql`
    UPDATE instagram_post_queue SET
      story_error = ${message.slice(0, 1000)},
      story_started_at = NULL,
      updated_at = now()
    WHERE id = ${postId}
  `;
}

// --- settings ---------------------------------------------------------------

export async function getAutoPostWithoutApproval(): Promise<boolean> {
  const sql = await queueSql();
  const rows = (await sql`
    SELECT auto_post_without_approval FROM instagram_settings WHERE id = 1
  `) as { auto_post_without_approval: boolean }[];
  return rows[0]?.auto_post_without_approval === true;
}

export async function setAutoPostWithoutApproval(enabled: boolean) {
  const sql = await queueSql();
  await sql`
    UPDATE instagram_settings
    SET auto_post_without_approval = ${enabled}, updated_at = now()
    WHERE id = 1
  `;
}

// --- reels --------------------------------------------------------------------

/** Posts whose reel may still be (re)made: anything not live or publishing. */
const REEL_RENDERABLE = ["concept", "te_keuren", "goedgekeurd", "mislukt"] as const;

export type ReelJob = { id: string; scheduledAt: string; props: ReelProps };

/** Number of reels waiting for a render (cheap check for the workflow). */
export async function countPendingReels(): Promise<number> {
  const sql = await queueSql();
  const rows = (await sql`
    SELECT count(*)::int AS n FROM instagram_post_queue
    WHERE status = ANY(${[...REEL_RENDERABLE]})
      AND reel_props IS NOT NULL
      AND (
        reel_status = 'te_maken'
        OR (reel_status = 'bezig' AND reel_started_at < now() - interval '30 minutes')
      )
  `) as { n: number }[];
  return rows[0]?.n ?? 0;
}

/**
 * Claim reels to render, soonest first. A claim older than 30 minutes counts
 * as abandoned (the render job died) and may be taken again.
 */
export async function claimReelJobs(limit: number): Promise<ReelJob[]> {
  const sql = await queueSql();
  const rows = (await sql`
    UPDATE instagram_post_queue SET
      reel_status = 'bezig',
      reel_started_at = now(),
      reel_attempts = reel_attempts + 1,
      updated_at = now()
    WHERE id IN (
      SELECT id FROM instagram_post_queue
      WHERE status = ANY(${[...REEL_RENDERABLE]})
        AND reel_props IS NOT NULL
        AND (
          reel_status = 'te_maken'
          OR (reel_status = 'bezig' AND reel_started_at < now() - interval '30 minutes')
        )
      ORDER BY scheduled_at ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, scheduled_at, reel_props
  `) as { id: string; scheduled_at: string | Date; reel_props: unknown }[];
  return rows.map((r) => ({
    id: r.id,
    scheduledAt: iso(r.scheduled_at)!,
    props: (typeof r.reel_props === "string" ? safeJson(r.reel_props) : r.reel_props) as ReelProps,
  }));
}

/** The track of the most recently rendered reel (for rotation). */
export async function getLastReelTrack(): Promise<string | null> {
  const sql = await queueSql();
  const rows = (await sql`
    SELECT reel_track FROM instagram_post_queue
    WHERE reel_track IS NOT NULL AND reel_rendered_at IS NOT NULL
    ORDER BY reel_rendered_at DESC
    LIMIT 1
  `) as { reel_track: string }[];
  return rows[0]?.reel_track ?? null;
}

/** Store (or replace) the rendered MP4, cover or story still of a post being rendered. */
export async function saveReelMedia(
  postId: string,
  kind: ReelMediaKind,
  bytes: Buffer,
): Promise<string | null> {
  const sql = await queueSql();
  const mediaId = newMediaId();
  const results = await sql.transaction([
    sql`
      DELETE FROM instagram_post_media m
      USING instagram_post_queue q
      WHERE m.post_id = q.id AND q.id = ${postId}
        AND q.reel_status = 'bezig' AND m.kind = ${kind}
    `,
    sql`
      INSERT INTO instagram_post_media (id, post_id, position, bytes, kind)
      SELECT ${mediaId}, q.id, 0, ${bytes}, ${kind}
      FROM instagram_post_queue q
      WHERE q.id = ${postId} AND q.reel_status = 'bezig'
      RETURNING id
    `,
  ]);
  const inserted = results[1] as unknown[];
  return inserted.length > 0 ? mediaId : null;
}

/** Render finished: both files are stored. */
export async function markReelReady(postId: string, track: string | null): Promise<boolean> {
  const sql = await queueSql();
  const rows = (await sql`
    UPDATE instagram_post_queue q SET
      reel_status = 'klaar',
      reel_error = NULL,
      reel_track = ${track},
      reel_rendered_at = now(),
      updated_at = now()
    WHERE q.id = ${postId}
      AND q.reel_status = 'bezig'
      AND EXISTS (SELECT 1 FROM instagram_post_media m WHERE m.post_id = q.id AND m.kind = 'reel')
      AND EXISTS (SELECT 1 FROM instagram_post_media m WHERE m.post_id = q.id AND m.kind = 'reel_cover')
    RETURNING q.id
  `) as unknown[];
  return rows.length > 0;
}

/**
 * Render failed. Below REEL_MAX_ATTEMPTS the reel is queued again; after
 * that it stays 'mislukt' and the post goes out as a normal feed post.
 */
export async function markReelFailed(
  postId: string,
  message: string,
): Promise<{ status: ReelStatus } | null> {
  const sql = await queueSql();
  const rows = (await sql`
    UPDATE instagram_post_queue SET
      reel_status = CASE WHEN reel_attempts >= ${REEL_MAX_ATTEMPTS} THEN 'mislukt' ELSE 'te_maken' END,
      reel_error = ${message.slice(0, 1000)},
      updated_at = now()
    WHERE id = ${postId} AND reel_status = 'bezig'
    RETURNING reel_status
  `) as { reel_status: ReelStatus }[];
  return rows[0] ? { status: rows[0].reel_status } : null;
}

/** Admin "Reel opnieuw maken", or new props after a change of date. */
export async function requestReelRender(
  postId: string,
  props?: ReelProps,
): Promise<boolean> {
  const sql = await queueSql();
  const rows = (await sql`
    UPDATE instagram_post_queue SET
      reel_props = COALESCE(${props ? JSON.stringify(props) : null}::jsonb, reel_props),
      reel_status = 'te_maken',
      reel_error = NULL,
      reel_attempts = 0,
      reel_started_at = NULL,
      updated_at = now()
    WHERE id = ${postId}
      AND status = ANY(${[...REEL_RENDERABLE]})
      AND publish_started_at IS NULL
      AND (reel_props IS NOT NULL OR ${props ? true : false})
    RETURNING id
  `) as unknown[];
  return rows.length > 0;
}
