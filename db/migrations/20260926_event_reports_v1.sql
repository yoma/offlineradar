-- Event reports: public "Geen singlesevent? Meld het"
-- Signal only — NEVER auto-changes publication/eligibility.
-- Target: Neon project little-haze-16039117 / database offlineradar only

CREATE TABLE IF NOT EXISTS event_reports (
  id UUID PRIMARY KEY,
  event_edition_id UUID NOT NULL REFERENCES event_editions (id) ON DELETE CASCADE,
  report_type TEXT NOT NULL DEFAULT 'not_singles_event',
  status TEXT NOT NULL DEFAULT 'new',
  reporter_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by TEXT,
  resolution_note TEXT,
  CONSTRAINT event_reports_type_check CHECK (
    report_type IN ('not_singles_event')
  ),
  CONSTRAINT event_reports_status_check CHECK (
    status IN ('new', 'reviewing', 'confirmed', 'dismissed', 'resolved')
  )
);

CREATE INDEX IF NOT EXISTS event_reports_edition_status_idx
  ON event_reports (event_edition_id, status);

CREATE INDEX IF NOT EXISTS event_reports_status_created_idx
  ON event_reports (status, created_at DESC);

CREATE INDEX IF NOT EXISTS event_reports_reporter_dedupe_idx
  ON event_reports (event_edition_id, reporter_hash, report_type, created_at DESC);

-- Soft rate limit for public reports (IP HMAC only, never raw IP).
CREATE TABLE IF NOT EXISTS event_report_rate (
  ip_hash TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  hit_count INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (ip_hash, window_start),
  CONSTRAINT event_report_rate_hit_count_check CHECK (hit_count >= 0)
);

CREATE INDEX IF NOT EXISTS event_report_rate_window_start_idx
  ON event_report_rate (window_start);

INSERT INTO schema_migrations (id)
VALUES ('20260926_event_reports_v1')
ON CONFLICT (id) DO NOTHING;
