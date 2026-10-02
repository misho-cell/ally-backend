-- Board #232 / #233 (Misho, 2 October: „კი ჩამოეჭრას"): a refund issued in the
-- Stripe dashboard is now seen. The payment row keeps what was paid and says
-- how much of it came back and when; nothing is deleted.
ALTER TABLE payment_events ADD COLUMN IF NOT EXISTS refunded_usd NUMERIC(12, 2) NOT NULL DEFAULT 0;
ALTER TABLE payment_events ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ;
