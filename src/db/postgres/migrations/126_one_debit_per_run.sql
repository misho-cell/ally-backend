-- 126: one debit per run (Ticket 10 Task 25 (e); D123).
--
-- "Concurrent chains cannot exceed the limit or double-charge." A run's cost is
-- debited once, when its reply is saved; nothing in the schema said so, and a
-- retried settle would have charged the same run twice. Production today: 3,159
-- debits on 3,159 distinct runs — the rule held by luck. Now it holds by index.
CREATE UNIQUE INDEX IF NOT EXISTS idx_token_tx_one_debit_per_run
  ON token_transactions (run_id)
  WHERE reason = 'chat_debit' AND run_id IS NOT NULL;
