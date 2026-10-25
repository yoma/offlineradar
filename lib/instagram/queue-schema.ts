/**
 * Schema for the Instagram post queue (single source of truth).
 *
 * Applied lazily by ensureInstagramQueueSchema() on first use, so no manual
 * migration step is needed on Vercel. `npm run db:migrate:instagram-post-queue`
 * applies the same statements by hand. Every statement is idempotent.
 */

import { getEventsSql } from "@/lib/events/db";
import { splitSqlStatements } from "@/lib/events/sql-split";

export const INSTAGRAM_POST_QUEUE_MIGRATION_ID =
  "20261025_instagram_post_queue_v1";

export const INSTAGRAM_POST_QUEUE_SCHEMA_SQL = `
-- Instagram post queue: scheduled posts with admin approval, frozen JPEG
-- slides served publicly for Meta, and a single settings row (auto-post
-- toggle + encrypted access token). Additive only. Does not modify
-- event_editions.

CREATE TABLE IF NOT EXISTS instagram_post_queue (
  id TEXT PRIMARY KEY,
  image_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
  caption TEXT NOT NULL DEFAULT '',
  scheduled_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'te_keuren',
  error_message TEXT,
  instagram_media_id TEXT,
  container_id TEXT,
  -- 'auto' = proposed by the scheduler, 'manual' = made on the admin page.
  source TEXT NOT NULL DEFAULT 'auto',
  format TEXT,
  event_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- One auto proposal per weekly slot, e.g. '2026-10-27T19:00|binnenkort'.
  slot_key TEXT,
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  publish_started_at TIMESTAMPTZ,
  posted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT instagram_post_queue_status_check CHECK (
    status IN ('concept', 'te_keuren', 'goedgekeurd', 'gepost', 'mislukt')
  ),
  CONSTRAINT instagram_post_queue_source_check CHECK (
    source IN ('auto', 'manual')
  ),
  CONSTRAINT instagram_post_queue_caption_check CHECK (
    char_length(caption) <= 2200
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS instagram_post_queue_slot_key_uidx
  ON instagram_post_queue (slot_key)
  WHERE slot_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS instagram_post_queue_due_idx
  ON instagram_post_queue (scheduled_at)
  WHERE status IN ('te_keuren', 'goedgekeurd');

CREATE INDEX IF NOT EXISTS instagram_post_queue_scheduled_at_idx
  ON instagram_post_queue (scheduled_at DESC);

-- Frozen JPEG bytes so Meta can fetch them days after the proposal was made.
CREATE TABLE IF NOT EXISTS instagram_post_media (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES instagram_post_queue (id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  bytes BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT instagram_post_media_id_check CHECK (
    char_length(id) BETWEEN 24 AND 64
  ),
  CONSTRAINT instagram_post_media_position_check CHECK (
    position BETWEEN 0 AND 9
  )
);

CREATE INDEX IF NOT EXISTS instagram_post_media_post_idx
  ON instagram_post_media (post_id, position);

CREATE TABLE IF NOT EXISTS instagram_settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  auto_post_without_approval BOOLEAN NOT NULL DEFAULT false,
  -- AES-256-GCM ciphertext, never store or log the plain token.
  token_ciphertext TEXT,
  -- sha256 of the env token this row was seeded from (detects a new env token).
  token_source_hash TEXT,
  token_refreshed_at TIMESTAMPTZ,
  token_expires_at TIMESTAMPTZ,
  token_last_error TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT instagram_settings_singleton CHECK (id = 1)
);

INSERT INTO instagram_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

INSERT INTO schema_migrations (id)
VALUES ('20261025_instagram_post_queue_v1')
ON CONFLICT (id) DO NOTHING;
`;

let ensured: Promise<boolean> | null = null;

/** Create the queue tables once per server instance. False when Neon is unavailable. */
export function ensureInstagramQueueSchema(): Promise<boolean> {
  if (!ensured) {
    ensured = (async () => {
      const sql = getEventsSql();
      if (!sql) return false;
      const done = (await sql`
        SELECT 1 FROM schema_migrations
        WHERE id = ${INSTAGRAM_POST_QUEUE_MIGRATION_ID}
      `) as unknown[];
      if (done.length > 0) return true;
      // One transaction: either the whole schema exists or none of it.
      await sql.transaction(
        splitSqlStatements(INSTAGRAM_POST_QUEUE_SCHEMA_SQL).map((statement) =>
          sql.query(statement, []),
        ),
      );
      return true;
    })().catch((error) => {
      ensured = null;
      throw error;
    });
  }
  return ensured;
}
