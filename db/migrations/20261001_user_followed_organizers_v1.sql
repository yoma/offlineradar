-- Fase 26.14: followed organizers (no notifications).
-- Ownership via session app_users.id. Cascade on account delete.

CREATE TABLE IF NOT EXISTS user_followed_organizers (
  user_id UUID NOT NULL REFERENCES app_users (id) ON DELETE CASCADE,
  organizer_id UUID NOT NULL REFERENCES organizers (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, organizer_id)
);

CREATE INDEX IF NOT EXISTS user_followed_organizers_user_created_idx
  ON user_followed_organizers (user_id, created_at DESC);

INSERT INTO schema_migrations (id)
VALUES ('20261001_user_followed_organizers_v1')
ON CONFLICT (id) DO NOTHING;
