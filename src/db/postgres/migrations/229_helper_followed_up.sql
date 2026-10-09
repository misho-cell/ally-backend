-- 1692 part 2 (A9): an answer whose debrief went unanswered for 14 days gives
-- the helper one „<asker> is following up your lead" — an effort never
-- vanishes without a word. One row per ask either way, so it is said once.
ALTER TABLE helper_thanks DROP CONSTRAINT IF EXISTS helper_thanks_state_check;
ALTER TABLE helper_thanks ADD CONSTRAINT helper_thanks_state_check
  CHECK (state IN ('offered', 'decided', 'asked_again', 'followed_up'));
