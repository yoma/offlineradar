/**
 * Neon persistence for Instagram Meta publish attempts.
 */

import { randomUUID } from "node:crypto";
import { getEventsSql } from "@/lib/events/db";
import type { InstagramFormatId } from "@/lib/instagram/constants";

export type InstagramPublishStatus =
  | "pending"
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
  requestedBy: string | null;
  createdAt: string;
  updatedAt: string;
  finishedAt: string | null;
};

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
    requestedBy: raw.requested_by == null ? null : String(raw.requested_by),
    createdAt: new Date(String(raw.created_at)).toISOString(),
    updatedAt: new Date(String(raw.updated_at)).toISOString(),
    finishedAt: raw.finished_at
      ? new Date(String(raw.finished_at)).toISOString()
      : null,
  };
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
        AND status IN ('pending', 'published')
      ORDER BY created_at DESC
      LIMIT 1
    `) as Record<string, unknown>[];
    return rows[0] ? mapRow(rows[0]) : null;
  } catch {
    return null;
  }
}

export async function findLatestPublish(
  conceptKey: string,
): Promise<InstagramPublishRow | null> {
  const sql = getEventsSql();
  if (!sql) return null;
  try {
    const rows = (await sql`
      SELECT *
      FROM instagram_publishes
      WHERE concept_key = ${conceptKey}
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
        status, dry_run, requested_by
      ) VALUES (
        ${id},
        ${input.conceptKey},
        ${input.format},
        ${JSON.stringify(input.eventIds)},
        ${input.caption},
        ${input.slideCount},
        'pending',
        ${input.dryRun},
        ${input.requestedBy ?? null}
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
    const rows = (await sql`
      UPDATE instagram_publishes
      SET
        status = ${patch.status},
        meta_container_id = COALESCE(${patch.metaContainerId ?? null}, meta_container_id),
        meta_media_id = COALESCE(${patch.metaMediaId ?? null}, meta_media_id),
        error_code = ${patch.errorCode ?? null},
        error_message = ${patch.errorMessage ?? null},
        updated_at = ${finishedAt}::timestamptz,
        finished_at = ${finishedAt}::timestamptz
      WHERE id = ${id}
      RETURNING *
    `) as Record<string, unknown>[];
    return rows[0] ? mapRow(rows[0]) : null;
  } catch {
    return null;
  }
}
