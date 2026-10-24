-- Optional follow-up: allow match_confidence = 'conflict' for SmartVibes CMS-id
-- duplicate editions. Not required for the CMS-id matcher (engine stores
-- conflicts as needs_review + change_summary.field = cmsIdConflict with
-- match_confidence = 'none' until this migration is applied).
--
-- Do not auto-apply from agents; run deliberately after review.

ALTER TABLE source_refresh_items
  DROP CONSTRAINT IF EXISTS source_refresh_items_match_confidence_check;

ALTER TABLE source_refresh_items
  ADD CONSTRAINT source_refresh_items_match_confidence_check CHECK (
    match_confidence IS NULL
    OR match_confidence IN ('exact', 'probable', 'none', 'conflict')
  );
