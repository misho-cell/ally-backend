-- Row 271 (item B) — A BALANCE THAT COULD GO BELOW ZERO, AND TWICE AT ONCE.
--
-- Misho's word, 25 September: „so that it can NOT exceed the token count under
-- any circumstance." This column is the honest half of obeying him.
--
-- WHAT WAS HAPPENING. `checkRunAllowance` asked `balance > 0` when a run
-- STARTED and `debitRun` charged the whole actual cost when it ENDED, with
-- nothing reserved in between. Two consequences, both measured rather than
-- reasoned about:
--
--   * ONE RUN COULD COST MORE THAN WAS LEFT. Seat 171873, 21 September: 15
--     tokens left, one question cost 31, balance -16.
--   * TWO RUNS COULD BOTH BE TOLD YES. Seat 171874, 25 September: balance 17,
--     a run at 15:59:59 charged 23, a second at 16:00:22 charged 29, and the
--     account finished at -35. The founder's D348 allows ONE crossing — „at
--     zero the person's next message is still accepted and answered once."
--     Two at once nobody decided.
--
-- The debit is now floored at the balance, under a lock, so the sum of this
-- column can never fall below zero. But the cost does not vanish when the
-- charge is capped — SOMEBODY pays it, and from today that somebody is the
-- house. A number the house pays must be a number the house can read, so it
-- is stored beside the charge rather than inferred later from two tables.
--
-- Measured before building, over 30 days: 394 tokens would have been absorbed
-- in all, and 26 of them for real people — Ninia 20, Madina 5, Giorgi 1. The
-- other 368 are the ten test seats. At tokens.usd_per_token that is about
-- twenty-six cents a month of real exposure, which is what makes the floor an
-- easy trade rather than a policy question.

ALTER TABLE token_transactions
  ADD COLUMN IF NOT EXISTS absorbed INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN token_transactions.absorbed IS
  'Tokens this run cost that the wallet did not pay, because paying them would '
  'have taken the balance below zero. The house absorbed them. `amount` is what '
  'the person was charged; `amount - absorbed` is what the run actually cost.';

-- „How much has the house absorbed, and for whom" must be one cheap read, not
-- a scan of every grant and top-up ever written.
CREATE INDEX IF NOT EXISTS idx_token_tx_absorbed
  ON token_transactions (user_id, created_at DESC)
  WHERE absorbed > 0;
