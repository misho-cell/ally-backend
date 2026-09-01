-- 103: the D35 scan stops sampling its owner ranges and starts finishing them.
--
-- Discovery took at most IDENTITY_PAIR_CAP_PER_BATCH (300) pairs from an owner
-- range and then moved the resume point past that range for good. Measured on
-- live data, a 500-owner range holds 2,354-5,115 pairs — so the scan was
-- examining roughly 6-13% of each range and skipping the rest silently. It
-- looked like a scan; it was a sample.
--
-- This column is the position INSIDE the current range. A full page means the
-- range still has pairs, so the range is kept and only the offset advances; a
-- short page means the range is drained and the owner window moves on with the
-- offset back to zero.
ALTER TABLE identity_scan_progress
  ADD COLUMN IF NOT EXISTS pair_offset INTEGER NOT NULL DEFAULT 0;

-- Restart from the beginning: every range walked so far was sampled, not
-- covered. Candidate inserts are idempotent (ON CONFLICT (phones) DO NOTHING),
-- so re-walking costs time and finds what the sampling missed.
UPDATE identity_scan_progress
   SET next_from = 1, pair_offset = 0, done = FALSE, updated_at = NOW()
 WHERE id = 1;
