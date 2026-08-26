-- Ticket 6, engine T16: "The weekly Lab report" — auto-generated, no hands.
-- One snapshot row per week, product-wide; per-market breakdowns (city, the
-- same proxy used throughout T6-T11) live nested inside report_json where
-- the underlying data supports it. Nullable/no-default column, no backfill —
-- safe DDL regardless of table size (this table starts empty).

CREATE TABLE IF NOT EXISTS lab_reports (
  id SERIAL PRIMARY KEY,
  week_start DATE NOT NULL UNIQUE,
  report_json JSONB NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
