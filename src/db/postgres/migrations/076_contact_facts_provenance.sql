-- Engine T1 (ticket 6, 20 Aug spec): every contact_facts row should carry
-- WHERE it came from and how sure the source was. NULL for every row
-- written before this migration (946 today) — provenance was never
-- tracked, and there is nothing honest to backfill it with.
ALTER TABLE contact_facts ADD COLUMN IF NOT EXISTS source TEXT
  CHECK (source IS NULL OR source IN ('chat', 'sweep', 'label', 'debrief'));
ALTER TABLE contact_facts ADD COLUMN IF NOT EXISTS confidence TEXT
  CHECK (confidence IS NULL OR confidence IN ('stated', 'mentioned'));
