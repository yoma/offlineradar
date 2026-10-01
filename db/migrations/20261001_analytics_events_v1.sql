-- Fase 26.18: anonymous product analytics (no PII).
-- Cookieless session id + aggregate event names only.

CREATE TABLE IF NOT EXISTS analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name TEXT NOT NULL,
  event_edition_id UUID REFERENCES event_editions (id) ON DELETE SET NULL,
  organizer_id UUID REFERENCES organizers (id) ON DELETE SET NULL,
  category TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  anonymous_session_id TEXT NOT NULL,
  path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT analytics_events_name_check CHECK (
    char_length(event_name) BETWEEN 1 AND 80
  ),
  CONSTRAINT analytics_events_session_check CHECK (
    char_length(anonymous_session_id) BETWEEN 8 AND 80
  )
);

CREATE INDEX IF NOT EXISTS analytics_events_created_at_idx
  ON analytics_events (created_at DESC);

CREATE INDEX IF NOT EXISTS analytics_events_name_created_idx
  ON analytics_events (event_name, created_at DESC);

CREATE INDEX IF NOT EXISTS analytics_events_edition_name_created_idx
  ON analytics_events (event_edition_id, event_name, created_at DESC)
  WHERE event_edition_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS analytics_events_session_created_idx
  ON analytics_events (anonymous_session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS analytics_events_organizer_name_created_idx
  ON analytics_events (organizer_id, event_name, created_at DESC)
  WHERE organizer_id IS NOT NULL;

INSERT INTO schema_migrations (id)
VALUES ('20261001_analytics_events_v1')
ON CONFLICT (id) DO NOTHING;
