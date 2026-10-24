-- Instagram Phase 3B: Meta publish attempts (idempotent).
-- Records publish/dry-run outcomes only. Does not modify event_editions.

CREATE TABLE IF NOT EXISTS instagram_publishes (
  id TEXT PRIMARY KEY,
  concept_key TEXT NOT NULL,
  format TEXT NOT NULL,
  event_ids JSONB NOT NULL,
  caption TEXT NOT NULL,
  slide_count INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL,
  dry_run BOOLEAN NOT NULL DEFAULT false,
  meta_container_id TEXT,
  meta_media_id TEXT,
  error_code TEXT,
  error_message TEXT,
  requested_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  CONSTRAINT instagram_publishes_status_check CHECK (
    status IN ('pending', 'dry_run', 'published', 'failed')
  ),
  CONSTRAINT instagram_publishes_format_check CHECK (
    format IN ('binnenkort', 'deze_week', 'nieuw')
  ),
  CONSTRAINT instagram_publishes_slide_count_check CHECK (
    slide_count BETWEEN 1 AND 10
  ),
  CONSTRAINT instagram_publishes_concept_key_check CHECK (
    char_length(concept_key) BETWEEN 16 AND 128
  )
);

-- One in-flight or successful live publish per concept (retries after failure allowed).
CREATE UNIQUE INDEX IF NOT EXISTS instagram_publishes_active_concept_uidx
  ON instagram_publishes (concept_key)
  WHERE status IN ('pending', 'published');

CREATE INDEX IF NOT EXISTS instagram_publishes_created_at_idx
  ON instagram_publishes (created_at DESC);

CREATE INDEX IF NOT EXISTS instagram_publishes_meta_media_id_idx
  ON instagram_publishes (meta_media_id)
  WHERE meta_media_id IS NOT NULL;

INSERT INTO schema_migrations (id)
VALUES ('20261024_instagram_publishes_v1')
ON CONFLICT (id) DO NOTHING;
