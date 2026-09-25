-- OfflineRadar tips portal schema
-- Target: Neon project little-haze-16039117 / database offlineradar only
-- Reproduce with: npm run db:migrate:tips
-- Do NOT auto-run on app boot.

CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tips (
  id UUID PRIMARY KEY,
  original_url TEXT NOT NULL,
  normalized_url TEXT NOT NULL,
  note TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL,
  notify_requested BOOLEAN NOT NULL DEFAULT false,
  email TEXT,
  duplicate_of_tip_id UUID REFERENCES tips (id) ON DELETE SET NULL,
  linked_event_id TEXT,
  linked_source_id UUID,
  duplicate_notes JSONB NOT NULL DEFAULT '[]'::jsonb,
  submitter_user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT tips_status_check CHECK (
    status IN (
      'received',
      'duplicate',
      'in_review',
      'needs_info',
      'rejected',
      'approved_for_publication',
      'published',
      'expired_or_cancelled'
    )
  ),
  CONSTRAINT tips_email_opt_in_check CHECK (
    (notify_requested = false AND email IS NULL)
    OR (notify_requested = true)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS tips_normalized_url_uidx
  ON tips (normalized_url);

CREATE INDEX IF NOT EXISTS tips_received_at_idx
  ON tips (received_at DESC);

CREATE INDEX IF NOT EXISTS tips_status_idx
  ON tips (status);

CREATE TABLE IF NOT EXISTS tip_reviews (
  tip_id UUID PRIMARY KEY REFERENCES tips (id) ON DELETE CASCADE,
  checked_at TIMESTAMPTZ,
  source_url_checked TEXT,
  ai_prep JSONB,
  missing_or_conflicts JSONB NOT NULL DEFAULT '[]'::jsonb,
  admin_decision TEXT,
  decision_reason TEXT,
  decided_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  published_event_path TEXT,
  CONSTRAINT tip_reviews_admin_decision_check CHECK (
    admin_decision IS NULL
    OR admin_decision IN (
      'received',
      'duplicate',
      'in_review',
      'needs_info',
      'rejected',
      'approved_for_publication',
      'published',
      'expired_or_cancelled'
    )
  )
);

CREATE TABLE IF NOT EXISTS source_watchlist (
  id UUID PRIMARY KEY,
  official_url TEXT NOT NULL,
  normalized_url TEXT NOT NULL,
  organizer_or_series_name TEXT NOT NULL,
  why_interesting TEXT NOT NULL,
  last_checked_at TIMESTAMPTZ,
  next_check_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS source_watchlist_normalized_url_uidx
  ON source_watchlist (normalized_url);

CREATE TABLE IF NOT EXISTS source_watch_tips (
  source_id UUID NOT NULL REFERENCES source_watchlist (id) ON DELETE CASCADE,
  tip_id UUID NOT NULL REFERENCES tips (id) ON DELETE CASCADE,
  PRIMARY KEY (source_id, tip_id)
);

CREATE TABLE IF NOT EXISTS tip_email_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tip_id UUID NOT NULL REFERENCES tips (id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  provider_message_id TEXT,
  CONSTRAINT tip_email_log_status_check CHECK (
    status IN (
      'received',
      'duplicate',
      'in_review',
      'needs_info',
      'rejected',
      'approved_for_publication',
      'published',
      'expired_or_cancelled'
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS tip_email_log_idempotency_uidx
  ON tip_email_log (idempotency_key);

CREATE INDEX IF NOT EXISTS tip_email_log_tip_id_idx
  ON tip_email_log (tip_id);

INSERT INTO schema_migrations (id)
VALUES ('20260925_tips_portal_v1')
ON CONFLICT (id) DO NOTHING;
