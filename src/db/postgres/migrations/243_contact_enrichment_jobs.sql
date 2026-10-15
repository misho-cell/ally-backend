-- 5317 (the tester's launch report, F10; Misho's yes to Q7, 15 Oct): the queue
-- of saved contacts waiting for their score and enrichment, one row per saved
-- contact, claimed by the workers in arrival order. Its own name: enrichment_jobs
-- is the nightly job's table (010), which 242 collided with.
CREATE TABLE IF NOT EXISTS contact_enrichment_jobs (
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

CREATE INDEX IF NOT EXISTS contact_enrichment_jobs_queued_idx
  ON contact_enrichment_jobs (id) WHERE status = 'queued';
