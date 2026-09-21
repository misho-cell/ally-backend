-- Row 221 — D348 item 2, the founder's ruling of 20 September: at zero, the
-- person's next message is still ACCEPTED AND ANSWERED ONCE, and the top-up
-- wall comes AFTER that answer rather than instead of it.
--
-- What happens today, measured by the seat on 21 September with no parallel
-- runs: seat 171873 walked down 30 -> 15 in single questions, then ONE more
-- question took it from 15 to -16 in a single run. The next message (thread
-- 20760, 15:16:27) got HTTP 402 in 0.3 s, the words stored, the wall, and no
-- answer at all. The wall came INSTEAD of the answer.
--
-- Two things the same measurement settles, and both shape this column:
--
--   * „AT ZERO" IS „BELOW ZERO" FOR ALMOST EVERYONE. A run's cost is not
--     bounded by what is left, so the balance that crosses lands negative —
--     +15 to -16 in one run. The grace cannot be written as „balance == 0".
--   * THE CROSSING RUN IS NOT THE ONCE. It was already paid for when it
--     started. The ruling is about the message AFTER the balance is gone.
--
-- One timestamp rather than a counter, and compared against the budget
-- window's start: the grace renews when the allowance does, and there is
-- nothing to reset by hand.
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS grace_answer_used_at TIMESTAMPTZ;

COMMENT ON COLUMN "User".grace_answer_used_at IS
  'When this account last used its one answer-on-empty (D348 item 2). Compared '
  'against the current budget window: earlier than the window start means the '
  'grace is available again.';
