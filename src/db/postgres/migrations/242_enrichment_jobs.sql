-- 5317 (the tester's launch report, F10; Misho's yes to Q7, 15 Oct): the queue
-- of saved contacts waiting for their score and enrichment lived in memory, so
-- every deploy or restart dropped what was waiting. It is kept here instead,
-- one row per saved contact, claimed by the workers in arrival order.
CREATE TABLE IF NOT EXISTS enrichment_jobs (
  id                 BIGSERIAL PRIMARY KEY,
  user_id            INTEGER NOT NULL,
  user_composite_key TEXT NOT NULL,
  contact_phone      TEXT NOT NULL,
  alias              TEXT NOT NULL,
  -- false: score only — the owner's daily enrichment share was used up.
  enrich             BOOLEAN NOT NULL,
  status             TEXT NOT NULL DEFAULT 'queued'
                       CHECK (status IN ('queued', 'running', 'done', 'failed')),
  error              TEXT,
  queued_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at         TIMESTAMPTZ,
  finished_at        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS enrichment_jobs_queued_idx
  ON enrichment_jobs (id) WHERE status = 'queued';
