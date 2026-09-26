-- Canonical catalog Source Map (separate from tip-side source_watchlist).
-- Manual curated organizers/platforms for future hand batches. No crawler.

CREATE TABLE IF NOT EXISTS catalog_sources (
  id UUID PRIMARY KEY,
  organizer_id UUID REFERENCES organizers (id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  official_url TEXT NOT NULL,
  normalized_url TEXT NOT NULL,
  source_kind TEXT NOT NULL DEFAULT 'organizer_source',
  source_type TEXT NOT NULL DEFAULT 'organizer',
  regions TEXT[] NOT NULL DEFAULT '{}',
  formats TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'promising',
  last_checked_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT catalog_sources_source_kind_check CHECK (
    source_kind IN ('organizer_source', 'discovery_platform', 'other')
  ),
  CONSTRAINT catalog_sources_source_type_check CHECK (
    source_type IN (
      'organizer',
      'ticket_platform',
      'event_series',
      'community',
      'venue_with_singles_program',
      'discovery_platform',
      'other'
    )
  ),
  CONSTRAINT catalog_sources_status_check CHECK (
    status IN ('active', 'promising', 'low_yield', 'inactive')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS catalog_sources_normalized_url_uidx
  ON catalog_sources (normalized_url);

CREATE INDEX IF NOT EXISTS catalog_sources_status_idx
  ON catalog_sources (status);

CREATE INDEX IF NOT EXISTS catalog_sources_organizer_id_idx
  ON catalog_sources (organizer_id);

INSERT INTO schema_migrations (id)
VALUES ('20260926_catalog_sources_v1')
ON CONFLICT (id) DO NOTHING;
