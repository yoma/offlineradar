-- Instagram Phase 3A: persistent concept history (anti-repeat).
-- Stores only which event ids appeared in approved Instagram concepts.
-- Does not modify event_editions or publication state.

CREATE TABLE IF NOT EXISTS instagram_concept_history (
  event_id TEXT PRIMARY KEY,
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT instagram_concept_history_event_id_check CHECK (
    char_length(event_id) BETWEEN 1 AND 120
  )
);

CREATE INDEX IF NOT EXISTS instagram_concept_history_last_used_at_idx
  ON instagram_concept_history (last_used_at DESC);

INSERT INTO schema_migrations (id)
VALUES ('20261024_instagram_concept_history_v1')
ON CONFLICT (id) DO NOTHING;
