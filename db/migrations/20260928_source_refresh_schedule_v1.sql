-- Fase 23: scheduled source refresh (no auto-publish).
-- Adds run trigger provenance + per-source schedule flags on catalog_sources.

ALTER TABLE source_refresh_runs
  ADD COLUMN IF NOT EXISTS trigger_type TEXT NOT NULL DEFAULT 'manual';

ALTER TABLE source_refresh_runs
  DROP CONSTRAINT IF EXISTS source_refresh_runs_trigger_type_check;

ALTER TABLE source_refresh_runs
  ADD CONSTRAINT source_refresh_runs_trigger_type_check
  CHECK (trigger_type IN ('manual', 'scheduled'));

ALTER TABLE catalog_sources
  ADD COLUMN IF NOT EXISTS refresh_enabled BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE catalog_sources
  ADD COLUMN IF NOT EXISTS refresh_interval_hours INT;

ALTER TABLE catalog_sources
  ADD COLUMN IF NOT EXISTS last_scheduled_refresh_at TIMESTAMPTZ;

ALTER TABLE catalog_sources
  DROP CONSTRAINT IF EXISTS catalog_sources_refresh_interval_hours_check;

ALTER TABLE catalog_sources
  ADD CONSTRAINT catalog_sources_refresh_interval_hours_check
  CHECK (
    refresh_interval_hours IS NULL
    OR (refresh_interval_hours >= 6 AND refresh_interval_hours <= 168)
  );

CREATE INDEX IF NOT EXISTS catalog_sources_refresh_enabled_idx
  ON catalog_sources (refresh_enabled)
  WHERE refresh_enabled = true;

CREATE INDEX IF NOT EXISTS source_refresh_runs_trigger_type_idx
  ON source_refresh_runs (trigger_type);

INSERT INTO schema_migrations (id)
VALUES ('20260928_source_refresh_schedule_v1')
ON CONFLICT (id) DO NOTHING;
