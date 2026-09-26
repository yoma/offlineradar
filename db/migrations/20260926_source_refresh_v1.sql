-- Semi-automatic source refresh V1 (admin-triggered only).
-- Stores refresh runs + reviewable candidates. Never auto-publishes.

CREATE TABLE IF NOT EXISTS source_refresh_runs (
  id UUID PRIMARY KEY,
  catalog_source_id UUID NOT NULL REFERENCES catalog_sources (id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  fetched_url TEXT,
  http_status INT,
  fetch_state TEXT,
  parser_key TEXT NOT NULL,
  parser_version TEXT NOT NULL DEFAULT '1',
  candidate_count INT NOT NULL DEFAULT 0,
  new_count INT NOT NULL DEFAULT 0,
  unchanged_count INT NOT NULL DEFAULT 0,
  changed_count INT NOT NULL DEFAULT 0,
  removed_count INT NOT NULL DEFAULT 0,
  error TEXT,
  triggered_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT source_refresh_runs_status_check CHECK (
    status IN (
      'pending',
      'running',
      'completed',
      'failed',
      'blocked',
      'cooldown'
    )
  )
);

CREATE INDEX IF NOT EXISTS source_refresh_runs_source_started_idx
  ON source_refresh_runs (catalog_source_id, started_at DESC);

CREATE INDEX IF NOT EXISTS source_refresh_runs_status_idx
  ON source_refresh_runs (status);

CREATE TABLE IF NOT EXISTS source_refresh_items (
  id UUID PRIMARY KEY,
  refresh_run_id UUID NOT NULL REFERENCES source_refresh_runs (id) ON DELETE CASCADE,
  catalog_source_id UUID NOT NULL REFERENCES catalog_sources (id) ON DELETE CASCADE,
  detected_external_key TEXT NOT NULL,
  normalized_url TEXT,
  detected_title TEXT,
  detected_start TIMESTAMPTZ,
  detected_location TEXT,
  detected_min_age INT,
  detected_max_age INT,
  detected_age_rule TEXT,
  detected_price NUMERIC,
  detected_availability TEXT,
  detected_source_url TEXT,
  match_event_edition_id UUID REFERENCES event_editions (id) ON DELETE SET NULL,
  detection_type TEXT NOT NULL,
  match_confidence TEXT,
  change_summary JSONB,
  proposed_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'needs_review',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by TEXT,
  CONSTRAINT source_refresh_items_detection_type_check CHECK (
    detection_type IN (
      'new',
      'existing_unchanged',
      'existing_changed',
      'possibly_removed'
    )
  ),
  CONSTRAINT source_refresh_items_status_check CHECK (
    status IN (
      'needs_review',
      'ignored',
      'accepted',
      'rejected',
      'applied'
    )
  ),
  CONSTRAINT source_refresh_items_match_confidence_check CHECK (
    match_confidence IS NULL OR match_confidence IN ('exact', 'probable', 'none')
  )
);

CREATE INDEX IF NOT EXISTS source_refresh_items_run_idx
  ON source_refresh_items (refresh_run_id);

CREATE INDEX IF NOT EXISTS source_refresh_items_source_status_idx
  ON source_refresh_items (catalog_source_id, status);

CREATE INDEX IF NOT EXISTS source_refresh_items_detection_idx
  ON source_refresh_items (detection_type);

INSERT INTO schema_migrations (id)
VALUES ('20260926_source_refresh_v1')
ON CONFLICT (id) DO NOTHING;
