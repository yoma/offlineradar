/**
 * Neon persistence for Instagram Meta publish attempts.
 */

import { randomUUID } from "node:crypto";
import { getEventsSql } from "@/lib/events/db";
import type { InstagramFormatId } from "@/lib/instagram/constants";

export type InstagramPublishStatus =
  | "pending"
  | "uncertain"
  | "dry_run"
  | "published"
  | "failed";

export type InstagramPublishRow = {
  id: string;
  conceptKey: string;
  format: InstagramFormatId;
  eventIds: string[];
  caption: string;
  slideCount: number;
  status: InstagramPublishStatus;
  dryRun: boolean;
  metaContainerId: string | null;
  metaMediaId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  contentFingerprint: string | null;
  recoveryLeaseUntil: string | null;
  requestedBy: string | null;
  createdAt: string;
  updatedAt: string;
  finishedAt: string | null;
};

/** Pending/uncertain rows older than this are eligible for recovery attempts. */
export const PUBLISH_PENDING_STALE_MS = 15 * 60 * 1000;
export const RECOVERY_LEASE_MS = 60_000;

function mapRow(raw: Record<string, unknown>): InstagramPublishRow {
  const eventIds = Array.isArray(raw.event_ids)
    ? (raw.event_ids as string[])
    : typeof raw.event_ids === "string"
      ? (JSON.parse(raw.event_ids) as string[])
      : [];
  return {
    id: String(raw.id),
    conceptKey: String(raw.concept_key),
    format: String(raw.format) as InstagramFormatId,
    eventIds,
    caption: String(raw.caption ?? ""),
    slideCount: Number(raw.slide_count ?? 1),
    status: String(raw.status) as InstagramPublishStatus,
    dryRun: Boolean(raw.dry_run),
    metaContainerId:
      raw.meta_container_id == null ? null : String(raw.meta_container_id),
    metaMediaId: raw.meta_media_id == null ? null : String(raw.meta_media_id),
    errorCode: raw.error_code == null ? null : String(raw.error_code),
    errorMessage:
      raw.error_message == null ? null : String(raw.error_message),
    contentFingerprint:
      raw.content_fingerprint == null
        ? null
        : String(raw.content_fingerprint),
    recoveryLeaseUntil: raw.recovery_lease_until
      ? new Date(String(raw.recovery_lease_until)).toISOString()
      : null,
    requestedBy: raw.requested_by == null ? null : String(raw.requested_by),
    createdAt: new Date(String(raw.created_at)).toISOString(),
    updatedAt: new Date(String(raw.updated_at)).toISOString(),
    finishedAt: raw.finished_at
      ? new Date(String(raw.finished_at)).toISOString()
      : null,
  };
}

export function isPublishPendingStale(
  row: InstagramPublishRow,
  now = Date.now(),
  staleMs = PUBLISH_PENDING_STALE_MS,
): boolean {
  if (row.status !== "pending" && row.status !== "uncertain") return false;
  const updated = Date.parse(row.updatedAt || row.createdAt);
  if (Number.isNaN(updated)) return true;
  return now - updated >= staleMs;
}

export async function findActivePublish(
  conceptKey: string,
): Promise<InstagramPublishRow | null> {
  const sql = getEventsSql();
  if (!sql) return null;
  try {
    const rows = (await sql`
      SELECT *
      FROM instagram_publishes
      WHERE concept_key = ${conceptKey}
        AND status IN ('pending', 'uncertain', 'published')
      ORDER BY created_at DESC
      LIMIT 1
    `) as Record<string, unknown>[];
    return rows[0] ? mapRow(rows[0]) : null;
  } catch {
    return null;
  }
}

/**
 * Claim an in-flight publish row. Returns existing active row on conflict.
 */
export async function claimPublishAttempt(input: {
  conceptKey: string;
  format: InstagramFormatId;
  eventIds: string[];
  caption: string;
  slideCount: number;
  dryRun: boolean;
  contentFingerprint?: string | null;
  requestedBy?: string | null;
}): Promise<
  | { ok: true; row: InstagramPublishRow; created: boolean }
  | { ok: false; error: "neon_unavailable" | "claim_failed"; detail?: string }
> {
  const sql = getEventsSql();
  if (!sql) return { ok: false, error: "neon_unavailable" };

  const existing = await findActivePublish(input.conceptKey);
  if (existing) {
    return { ok: true, row: existing, created: false };
  }

  const id = randomUUID();
  try {
    const rows = (await sql`
      INSERT INTO instagram_publishes (
        id, concept_key, format, event_ids, caption, slide_count,
        status, dry_run, requested_by, content_fingerprint
      ) VALUES (
        ${id},
        ${input.conceptKey},
        ${input.format},
        ${JSON.stringify(input.eventIds)},
        ${input.caption},
        ${input.slideCount},
        'pending',
        ${input.dryRun},
        ${input.requestedBy ?? null},
        ${input.contentFingerprint ?? null}
      )
      ON CONFLICT DO NOTHING
      RETURNING *
    `) as Record<string, unknown>[];

    if (rows[0]) {
      return { ok: true, row: mapRow(rows[0]), created: true };
    }

    const raced = await findActivePublish(input.conceptKey);
    if (raced) return { ok: true, row: raced, created: false };
    return { ok: false, error: "claim_failed", detail: "no_row" };
  } catch (error) {
    const raced = await findActivePublish(input.conceptKey);
    if (raced) return { ok: true, row: raced, created: false };
    return {
      ok: false,
      error: "claim_failed",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Persist container id on the pending row. Returns the row only when the
 * same container id is confirmed stored on this attempt.
 */
export async function persistContainerIdBeforePublish(
  id: string,
  containerId: string,
): Promise<InstagramPublishRow | null> {
  const sql = getEventsSql();
  if (!sql) return null;
  const updatedAt = new Date().toISOString();
  try {
    const rows = (await sql`
      UPDATE instagram_publishes
      SET
        meta_container_id = ${containerId},
        updated_at = ${updatedAt}::timestamptz
      WHERE id = ${id}
        AND status = 'pending'
      RETURNING *
    `) as Record<string, unknown>[];
    const row = rows[0] ? mapRow(rows[0]) : null;
    if (!row || row.metaContainerId !== containerId) return null;
    return row;
  } catch {
    return null;
  }
}

/** Atomic recovery lease so only one worker recovers a stale pending/uncertain row. */
export async function acquireRecoveryLease(
  id: string,
  now = Date.now(),
  leaseMs = RECOVERY_LEASE_MS,
): Promise<InstagramPublishRow | null> {
  const sql = getEventsSql();
  if (!sql) return null;
  const leaseUntil = new Date(now + leaseMs).toISOString();
  const updatedAt = new Date(now).toISOString();
  try {
    const rows = (await sql`
      UPDATE instagram_publishes
      SET
        recovery_lease_until = ${leaseUntil}::timestamptz,
        updated_at = ${updatedAt}::timestamptz,
        error_code = COALESCE(error_code, 'recovery_lease')
      WHERE id = ${id}
        AND status IN ('pending', 'uncertain')
        AND (
          recovery_lease_until IS NULL
          OR recovery_lease_until < ${updatedAt}::timestamptz
        )
      RETURNING *
    `) as Record<string, unknown>[];
    return rows[0] ? mapRow(rows[0]) : null;
  } catch {
    return null;
  }
}

/**
 * Finish attempt. Never moves a published row back to failed/uncertain.
 * Terminal transitions only from pending/uncertain (or dry_run finish from pending).
 */
export async function finishPublishAttempt(
  id: string,
  patch: {
    status: Exclude<InstagramPublishStatus, "pending">;
    metaContainerId?: string | null;
    metaMediaId?: string | null;
    errorCode?: string | null;
    errorMessage?: string | null;
  },
): Promise<InstagramPublishRow | null> {
  const sql = getEventsSql();
  if (!sql) return null;
  const finishedAt = new Date().toISOString();
  try {
    // Never transition a published row. media_id may be null when Meta
    // confirmed PUBLISHED but no verified IG media id is known yet.
    const rows = (await sql`
      UPDATE instagram_publishes
      SET
        status = ${patch.status},
        meta_container_id = COALESCE(${patch.metaContainerId ?? null}, meta_container_id),
        meta_media_id = ${patch.metaMediaId ?? null},
        error_code = ${patch.errorCode ?? null},
        error_message = ${patch.errorMessage ?? null},
        updated_at = ${finishedAt}::timestamptz,
        finished_at = CASE
          WHEN ${patch.status} IN ('published', 'failed', 'dry_run')
            THEN ${finishedAt}::timestamptz
          ELSE NULL
        END,
        recovery_lease_until = NULL
      WHERE id = ${id}
        AND status IN ('pending', 'uncertain')
      RETURNING *
    `) as Record<string, unknown>[];
    return rows[0] ? mapRow(rows[0]) : null;
  } catch {
    return null;
  }
}

/** Mark ambiguous post-publish outcome; keeps idempotency slot (no media-id clear). */
export async function markPublishUncertain(
  id: string,
  patch: {
    metaContainerId?: string | null;
    errorCode: string;
    errorMessage: string;
  },
): Promise<InstagramPublishRow | null> {
  const sql = getEventsSql();
  if (!sql) return null;
  const updatedAt = new Date().toISOString();
  try {
    const rows = (await sql`
      UPDATE instagram_publishes
      SET
        status = 'uncertain',
        meta_container_id = COALESCE(${patch.metaContainerId ?? null}, meta_container_id),
        error_code = ${patch.errorCode},
        error_message = ${patch.errorMessage},
        updated_at = ${updatedAt}::timestamptz,
        finished_at = NULL,
        recovery_lease_until = NULL
      WHERE id = ${id}
        AND status IN ('pending', 'uncertain')
      RETURNING *
    `) as Record<string, unknown>[];
    return rows[0] ? mapRow(rows[0]) : null;
  } catch {
    return null;
  }
}
