-- The tester's 47594 (8 Oct): a 510-card first import stopped at 163 when the
-- server restarted for a deploy, and nothing showed it was running. An import
-- now writes its row when it STARTS, in_progress = TRUE, and clears it when it
-- ends; the ship script waits while a recent one is open. A row left TRUE is an
-- import a restart cut. Existing rows are finished ones: the default is FALSE.
ALTER TABLE import_attempts ADD COLUMN IF NOT EXISTS in_progress BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_import_attempts_in_progress
  ON import_attempts (created_at DESC)
  WHERE in_progress;
