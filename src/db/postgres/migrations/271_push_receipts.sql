-- 271: #7724 (tester's engagement desk C-0020, 25 Oct): 13 newcomers got two
-- pushes each, every delivery reads "sent 201", and nobody opened Netai. A 201
-- is the push service taking the message, not the phone showing it. Each push
-- now carries a receipt the service worker sends back when the phone receives
-- it and when the person taps it.
ALTER TABLE push_deliveries ADD COLUMN IF NOT EXISTS receipt TEXT;
ALTER TABLE push_deliveries ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ;
ALTER TABLE push_deliveries ADD COLUMN IF NOT EXISTS clicked_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS uq_push_deliveries_receipt
  ON push_deliveries (receipt) WHERE receipt IS NOT NULL;
