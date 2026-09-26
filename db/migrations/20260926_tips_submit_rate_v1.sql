-- OfflineRadar tips public-submit rate limit
-- Target: Neon project little-haze-16039117 / database offlineradar only
-- Do NOT auto-run on app boot.

CREATE TABLE IF NOT EXISTS tip_submit_rate (
  ip_hash TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  hit_count INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (ip_hash, window_start),
  CONSTRAINT tip_submit_rate_hit_count_check CHECK (hit_count >= 0)
);

CREATE INDEX IF NOT EXISTS tip_submit_rate_window_start_idx
  ON tip_submit_rate (window_start);

INSERT INTO schema_migrations (id)
VALUES ('20260926_tips_submit_rate_v1')
ON CONFLICT (id) DO NOTHING;
