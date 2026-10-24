-- Instagram Phase 3B: durable concept approvals (publish gate).
-- Additive only. Does not modify event_editions.

CREATE TABLE IF NOT EXISTS instagram_concept_approvals (
  concept_key TEXT PRIMARY KEY,
  format TEXT NOT NULL,
  event_ids JSONB NOT NULL,
  approved_by TEXT,
  approved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT instagram_concept_approvals_format_check CHECK (
    format IN ('binnenkort', 'deze_week', 'nieuw')
  ),
  CONSTRAINT instagram_concept_approvals_concept_key_check CHECK (
    char_length(concept_key) BETWEEN 16 AND 128
  )
);

CREATE INDEX IF NOT EXISTS instagram_concept_approvals_approved_at_idx
  ON instagram_concept_approvals (approved_at DESC);

INSERT INTO schema_migrations (id)
VALUES ('20261024_instagram_concept_approvals_v1')
ON CONFLICT (id) DO NOTHING;
