-- Instagram Phase 3B: bind approvals to exact caption + slides content.
-- Additive / backwards-compatible. Does not modify event_editions.

ALTER TABLE instagram_concept_approvals
  ADD COLUMN IF NOT EXISTS content_fingerprint TEXT,
  ADD COLUMN IF NOT EXISTS caption TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS slides JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS instagram_concept_approvals_content_fingerprint_uidx
  ON instagram_concept_approvals (content_fingerprint)
  WHERE content_fingerprint IS NOT NULL;

-- Allow uncertain publish outcomes to hold the idempotency slot.
ALTER TABLE instagram_publishes
  DROP CONSTRAINT IF EXISTS instagram_publishes_status_check;

ALTER TABLE instagram_publishes
  ADD CONSTRAINT instagram_publishes_status_check CHECK (
    status IN ('pending', 'uncertain', 'dry_run', 'published', 'failed')
  );

DROP INDEX IF EXISTS instagram_publishes_active_concept_uidx;

CREATE UNIQUE INDEX IF NOT EXISTS instagram_publishes_active_concept_uidx
  ON instagram_publishes (concept_key)
  WHERE status IN ('pending', 'uncertain', 'published');

ALTER TABLE instagram_publishes
  ADD COLUMN IF NOT EXISTS recovery_lease_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS content_fingerprint TEXT;

INSERT INTO schema_migrations (id)
VALUES ('20261024_instagram_approvals_content_v2')
ON CONFLICT (id) DO NOTHING;
