/**
 * Neon persistence for anonymous product analytics.
 * No email/name/IP storage. Retention: delete rows older than 180 days on insert batch.
 */
import { getEventsSql } from "@/lib/events/db";
import {
  ALLOWED_ANALYTICS_NAMES,
  canonicalizeEventName,
} from "@/lib/analytics/types";

export type AnalyticsInsertInput = {
  eventName: string;
  eventEditionId?: string | null;
  organizerId?: string | null;
  category?: string | null;
  metadata?: Record<string, unknown>;
  anonymousSessionId: string;
  path?: string | null;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function asUuidOrNull(value: string | null | undefined): string | null {
  if (!value) return null;
  return UUID_RE.test(value) ? value : null;
}

function scrubMetadata(
  input: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!input) return {};
  const out: Record<string, unknown> = {};
  const blocked = /email|name|password|token|phone|ip|user[_-]?id/i;
  for (const [key, value] of Object.entries(input)) {
    if (blocked.test(key)) continue;
    if (value == null) {
      out[key] = null;
      continue;
    }
    if (typeof value === "string") {
      const trimmed = value.trim().slice(0, 200);
      if (/@/.test(trimmed)) continue;
      out[key] = trimmed;
      continue;
    }
    if (typeof value === "number" || typeof value === "boolean") {
      out[key] = value;
    }
  }
  return out;
}

export async function insertAnalyticsEvent(
  input: AnalyticsInsertInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const sql = getEventsSql();
  if (!sql) return { ok: false, error: "db_unavailable" };

  const name = canonicalizeEventName(input.eventName);
  if (!ALLOWED_ANALYTICS_NAMES.has(name)) {
    return { ok: false, error: "invalid_event" };
  }

  const session = input.anonymousSessionId.trim().slice(0, 80);
  if (session.length < 8) return { ok: false, error: "invalid_session" };

  const metadata = scrubMetadata(input.metadata);
  const category =
    typeof input.category === "string"
      ? input.category.trim().slice(0, 64) || null
      : null;
  const path =
    typeof input.path === "string" ? input.path.trim().slice(0, 300) || null : null;

  try {
    await sql`
      INSERT INTO analytics_events (
        event_name,
        event_edition_id,
        organizer_id,
        category,
        metadata,
        anonymous_session_id,
        path
      ) VALUES (
        ${name},
        ${asUuidOrNull(input.eventEditionId)},
        ${asUuidOrNull(input.organizerId)},
        ${category},
        ${JSON.stringify(metadata)}::jsonb,
        ${session},
        ${path}
      )
    `;

    // Pragmatic retention: occasionally prune old rows (1% of inserts).
    if (Math.random() < 0.01) {
      await sql`
        DELETE FROM analytics_events
        WHERE created_at < now() - interval '180 days'
      `;
    }

    return { ok: true };
  } catch (error) {
    console.error("[analytics] insert failed", error);
    return { ok: false, error: "insert_failed" };
  }
}
