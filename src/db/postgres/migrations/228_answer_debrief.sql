-- 1692 part 2 (A9): a „how did it go?" armed when a helper ANSWERS, beside the
-- existing one armed when nobody answers. Its own kind, so the two arms of one
-- ask never collide on (kind, ref_id).
ALTER TABLE debrief_arms DROP CONSTRAINT IF EXISTS debrief_arms_kind_check;
ALTER TABLE debrief_arms ADD CONSTRAINT debrief_arms_kind_check
  CHECK (kind IN ('intro_request', 'task_ask', 'search', 'answered_ask'));
