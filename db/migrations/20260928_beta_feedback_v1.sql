-- Fase 26: minimal beta feedback storage (no ticketsystem).

CREATE TABLE IF NOT EXISTS beta_feedback (
  id UUID PRIMARY KEY,
  what_went_well TEXT,
  what_unclear TEXT,
  what_missing TEXT,
  contact_email TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS beta_feedback_created_idx
  ON beta_feedback (created_at DESC);

INSERT INTO schema_migrations (id)
VALUES ('20260928_beta_feedback_v1')
ON CONFLICT (id) DO NOTHING;
