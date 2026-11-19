-- 305 (Misho, 19 Nov: the people deep-research brief — Exa, Linkup, Firecrawl).
-- POST /admin/deep-research/people researches one member or public office-holder.

-- One person's research: which pages were seen and whose they were, how many
-- facts were found and written, what it cost and why it stopped. Neither the
-- pages' text nor the facts are kept here: the facts live in contact_facts,
-- where the person can remove them.
-- research_load is the load tag, so POST /admin/company-base/undo-load takes
-- the record out with the facts it wrote.
CREATE TABLE IF NOT EXISTS deep_research_runs (
  run_id         TEXT PRIMARY KEY,
  phone          TEXT NOT NULL,
  subject_kind   TEXT NOT NULL,
  research_load  TEXT NOT NULL,
  dry_run        BOOLEAN NOT NULL,
  stopped        TEXT NOT NULL,
  steps          TEXT[] NOT NULL DEFAULT '{}',
  sources        JSONB NOT NULL DEFAULT '[]',
  facts_found    INTEGER NOT NULL DEFAULT 0,
  facts_written  INTEGER NOT NULL DEFAULT 0,
  cost_usd       NUMERIC(12,6) NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS deep_research_runs_load_idx ON deep_research_runs (research_load);
CREATE INDEX IF NOT EXISTS deep_research_runs_phone_idx ON deep_research_runs (phone);

-- A public page read in full, kept 30 days so it is paid for once.
CREATE TABLE IF NOT EXISTS deep_research_pages (
  url      TEXT PRIMARY KEY,
  title    TEXT NOT NULL DEFAULT '',
  text     TEXT NOT NULL,
  read_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Prices per call (USD), from each service's price page on 19 Nov; a DB update changes them.
INSERT INTO provider_prices (price_key, value) VALUES
  ('exa.search',       0.007),
  ('linkup.standard',  0.006),
  ('linkup.deep',      0.006),
  ('firecrawl.scrape', 0.005)
ON CONFLICT (price_key) DO NOTHING;
