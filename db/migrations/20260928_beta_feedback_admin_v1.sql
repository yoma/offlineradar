-- Fase 26.1: beta feedback admin fields (additive, keep existing rows).
-- Category/status values validated in application code.

ALTER TABLE beta_feedback
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'other';

ALTER TABLE beta_feedback
  ADD COLUMN IF NOT EXISTS message TEXT;

ALTER TABLE beta_feedback
  ADD COLUMN IF NOT EXISTS app_user_id UUID REFERENCES app_users (id) ON DELETE SET NULL;

ALTER TABLE beta_feedback
  ADD COLUMN IF NOT EXISTS pathname TEXT;

ALTER TABLE beta_feedback
  ADD COLUMN IF NOT EXISTS query_string TEXT;

ALTER TABLE beta_feedback
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'new';

ALTER TABLE beta_feedback
  ADD COLUMN IF NOT EXISTS admin_note TEXT;

ALTER TABLE beta_feedback
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

UPDATE beta_feedback
SET message = NULLIF(
  trim(both E'\n' from concat_ws(
    E'\n\n',
    CASE
      WHEN what_went_well IS NOT NULL AND length(trim(what_went_well)) > 0
        THEN 'Ging goed: ' || trim(what_went_well)
      ELSE NULL
    END,
    CASE
      WHEN what_unclear IS NOT NULL AND length(trim(what_unclear)) > 0
        THEN 'Onduidelijk: ' || trim(what_unclear)
      ELSE NULL
    END,
    CASE
      WHEN what_missing IS NOT NULL AND length(trim(what_missing)) > 0
        THEN 'Mis ik: ' || trim(what_missing)
      ELSE NULL
    END
  )),
  ''
)
WHERE message IS NULL;

CREATE INDEX IF NOT EXISTS beta_feedback_status_created_idx
  ON beta_feedback (status, created_at DESC);

CREATE INDEX IF NOT EXISTS beta_feedback_category_created_idx
  ON beta_feedback (category, created_at DESC);

INSERT INTO schema_migrations (id)
VALUES ('20260928_beta_feedback_admin_v1')
ON CONFLICT (id) DO NOTHING;
