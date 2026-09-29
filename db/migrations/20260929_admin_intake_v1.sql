-- FASE 26.6: Admin Quick Intake private screenshot assets.
-- Screenshots are review evidence only. Never public event images.
-- Never use created_at as freshness.

CREATE TABLE IF NOT EXISTS admin_intake_assets (
  id uuid PRIMARY KEY,
  storage_key text NOT NULL UNIQUE,
  mime_type text NOT NULL,
  byte_size integer NOT NULL CHECK (byte_size > 0 AND byte_size <= 4194304),
  data bytea NOT NULL,
  uploaded_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_intake_assets_created_at_idx
  ON admin_intake_assets (created_at DESC);

INSERT INTO schema_migrations (id)
VALUES ('20260929_admin_intake_v1')
ON CONFLICT (id) DO NOTHING;
