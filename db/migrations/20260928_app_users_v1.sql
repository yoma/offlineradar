-- Fase 25: public user accounts (preferences + saved events).
-- Admin auth remains OFFLINERADAR_ADMIN_EMAILS allowlist (no admin privilege here).

CREATE TABLE IF NOT EXISTS app_users (
  id UUID PRIMARY KEY,
  email TEXT NOT NULL,
  google_sub TEXT,
  name TEXT,
  image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT app_users_email_unique UNIQUE (email)
);

CREATE UNIQUE INDEX IF NOT EXISTS app_users_google_sub_uidx
  ON app_users (google_sub)
  WHERE google_sub IS NOT NULL;

CREATE TABLE IF NOT EXISTS user_preferences (
  user_id UUID PRIMARY KEY REFERENCES app_users (id) ON DELETE CASCADE,
  age INT,
  gender TEXT,
  place_id TEXT NOT NULL DEFAULT 'antwerpen',
  max_distance_km INT NOT NULL DEFAULT 100,
  preferred_age_min INT,
  preferred_age_max INT,
  preferred_meet_gender TEXT NOT NULL DEFAULT 'anyone',
  interests JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_preferences_age_check CHECK (
    age IS NULL OR (age >= 18 AND age <= 99)
  ),
  CONSTRAINT user_preferences_distance_check CHECK (
    max_distance_km IN (10, 25, 50, 100)
  ),
  CONSTRAINT user_preferences_pref_age_check CHECK (
    (preferred_age_min IS NULL OR (preferred_age_min >= 18 AND preferred_age_min <= 99))
    AND (preferred_age_max IS NULL OR (preferred_age_max >= 18 AND preferred_age_max <= 99))
  )
);

CREATE TABLE IF NOT EXISTS user_saved_events (
  user_id UUID NOT NULL REFERENCES app_users (id) ON DELETE CASCADE,
  event_edition_id UUID NOT NULL REFERENCES event_editions (id) ON DELETE CASCADE,
  saved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, event_edition_id)
);

CREATE INDEX IF NOT EXISTS user_saved_events_user_saved_idx
  ON user_saved_events (user_id, saved_at DESC);

INSERT INTO schema_migrations (id)
VALUES ('20260928_app_users_v1')
ON CONFLICT (id) DO NOTHING;
