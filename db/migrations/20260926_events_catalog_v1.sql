-- OfflineRadar canonical event catalog (Phase 1)
-- Target: Neon project little-haze-16039117 / database offlineradar only
-- Non-destructive: creates new tables only. Does NOT modify tips tables.
-- Apply via: npm run db:migrate:events
-- Do NOT auto-run on app boot.

CREATE TABLE IF NOT EXISTS organizers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  website_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT organizers_slug_check CHECK (char_length(slug) BETWEEN 1 AND 120)
);

CREATE UNIQUE INDEX IF NOT EXISTS organizers_slug_uidx
  ON organizers (slug);

CREATE TABLE IF NOT EXISTS event_series (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id UUID NOT NULL REFERENCES organizers (id) ON DELETE RESTRICT,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT event_series_slug_check CHECK (char_length(slug) BETWEEN 1 AND 160)
);

CREATE UNIQUE INDEX IF NOT EXISTS event_series_organizer_slug_uidx
  ON event_series (organizer_id, slug);

CREATE INDEX IF NOT EXISTS event_series_organizer_id_idx
  ON event_series (organizer_id);

CREATE TABLE IF NOT EXISTS event_editions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL,
  organizer_id UUID REFERENCES organizers (id) ON DELETE SET NULL,
  series_id UUID REFERENCES event_series (id) ON DELETE SET NULL,
  title TEXT NOT NULL,

  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ,
  timezone TEXT NOT NULL DEFAULT 'Europe/Brussels',

  venue_name TEXT,
  address TEXT,
  city TEXT NOT NULL,
  postal_code TEXT,
  region TEXT,
  country TEXT NOT NULL DEFAULT 'BE',
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,

  eligibility_route TEXT NOT NULL DEFAULT 'unknown',
  singles_oriented BOOLEAN,
  singles_only BOOLEAN,
  singles_only_evidence TEXT,
  meet_formula TEXT,
  meet_formula_evidence TEXT,

  min_age INTEGER,
  max_age INTEGER,
  age_rule TEXT NOT NULL DEFAULT 'unknown',
  -- Full EventEligibility when richer than min/max (byGender, allowedGenders).
  eligibility_json JSONB,

  category TEXT NOT NULL DEFAULT 'dating',
  sub_category TEXT,
  activities JSONB NOT NULL DEFAULT '[]'::jsonb,
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,

  price_amount NUMERIC(10, 2),
  price_currency TEXT DEFAULT 'EUR',
  price_note TEXT,
  price_is_from BOOLEAN NOT NULL DEFAULT false,
  availability_status TEXT,
  spots_remaining INTEGER,
  booking_deadline TIMESTAMPTZ,
  availability_note TEXT,

  short_description TEXT,
  description TEXT,
  internal_notes TEXT,
  practical_info JSONB NOT NULL DEFAULT '[]'::jsonb,

  publication_status TEXT NOT NULL DEFAULT 'candidate',
  approved_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  expired_at TIMESTAMPTZ,

  last_checked_at TIMESTAMPTZ,
  source_checked_at TIMESTAMPTZ,
  next_check_at TIMESTAMPTZ,

  social_suitability TEXT,
  gender_availability TEXT,
  start_time_display_note TEXT,
  known_audience_genders JSONB,
  preferred_audience_age_min INTEGER,
  preferred_audience_age_max INTEGER,
  audience_age_from_source BOOLEAN NOT NULL DEFAULT false,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT event_editions_slug_check CHECK (char_length(slug) BETWEEN 1 AND 200),
  CONSTRAINT event_editions_eligibility_route_check CHECK (
    eligibility_route IN ('route_a', 'route_b', 'unknown')
  ),
  CONSTRAINT event_editions_age_rule_check CHECK (
    age_rule IN ('strict', 'guideline', 'unknown')
  ),
  CONSTRAINT event_editions_publication_status_check CHECK (
    publication_status IN (
      'candidate',
      'under_review',
      'approved',
      'draft',
      'published',
      'rejected',
      'expired',
      'cancelled'
    )
  ),
  CONSTRAINT event_editions_category_check CHECK (
    category IN ('dating', 'meet_new_people', 'social')
  ),
  CONSTRAINT event_editions_availability_status_check CHECK (
    availability_status IS NULL
    OR availability_status IN (
      'available',
      'limited',
      'almost_full',
      'waitlist',
      'sold_out',
      'unknown'
    )
  ),
  CONSTRAINT event_editions_age_bounds_check CHECK (
    min_age IS NULL OR max_age IS NULL OR min_age <= max_age
  ),
  CONSTRAINT event_editions_published_requires_published_at CHECK (
    publication_status <> 'published' OR published_at IS NOT NULL
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS event_editions_slug_uidx
  ON event_editions (slug);

CREATE INDEX IF NOT EXISTS event_editions_publication_status_idx
  ON event_editions (publication_status);

CREATE INDEX IF NOT EXISTS event_editions_starts_at_idx
  ON event_editions (starts_at);

CREATE INDEX IF NOT EXISTS event_editions_organizer_id_idx
  ON event_editions (organizer_id);

CREATE INDEX IF NOT EXISTS event_editions_series_id_idx
  ON event_editions (series_id);

-- Dedupe support: same organizer + title + start moment
CREATE INDEX IF NOT EXISTS event_editions_dedupe_org_title_start_idx
  ON event_editions (organizer_id, lower(title), starts_at);

CREATE INDEX IF NOT EXISTS event_editions_dedupe_city_venue_start_idx
  ON event_editions (lower(city), lower(COALESCE(venue_name, '')), starts_at);

-- Published-only lookup (public feed later). Approved is intentionally excluded.
CREATE INDEX IF NOT EXISTS event_editions_published_starts_at_idx
  ON event_editions (starts_at)
  WHERE publication_status = 'published';

CREATE TABLE IF NOT EXISTS event_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_edition_id UUID NOT NULL REFERENCES event_editions (id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,
  source_name TEXT,
  url TEXT NOT NULL,
  normalized_url TEXT NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  checked_at TIMESTAMPTZ,
  evidence_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT event_sources_type_check CHECK (
    source_type IN (
      'organizer',
      'official_event',
      'ticket',
      'social',
      'aggregator',
      'other'
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS event_sources_edition_normalized_url_uidx
  ON event_sources (event_edition_id, normalized_url);

CREATE INDEX IF NOT EXISTS event_sources_normalized_url_idx
  ON event_sources (normalized_url);

CREATE INDEX IF NOT EXISTS event_sources_edition_id_idx
  ON event_sources (event_edition_id);

-- At most one primary source per edition
CREATE UNIQUE INDEX IF NOT EXISTS event_sources_primary_uidx
  ON event_sources (event_edition_id)
  WHERE is_primary = true;

CREATE TABLE IF NOT EXISTS event_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_edition_id UUID NOT NULL REFERENCES event_editions (id) ON DELETE CASCADE,
  url_or_path TEXT NOT NULL,
  image_type TEXT NOT NULL,
  source_url TEXT,
  rights_note TEXT,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  alt_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT event_images_type_check CHECK (
    image_type IN ('official', 'licensed', 'generated', 'mood')
  )
);

CREATE INDEX IF NOT EXISTS event_images_edition_id_idx
  ON event_images (event_edition_id);

CREATE UNIQUE INDEX IF NOT EXISTS event_images_primary_uidx
  ON event_images (event_edition_id)
  WHERE is_primary = true;

INSERT INTO schema_migrations (id)
VALUES ('20260926_events_catalog_v1')
ON CONFLICT (id) DO NOTHING;
