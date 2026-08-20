-- 064: persist WHY an enrichment job failed (ticket 6 close, answer 9): the
-- nightly died every night since at least 11 Aug with processed=0 and the
-- only trace a Railway log line nobody was watching. The status endpoint the
-- tester already polls now carries the error text too.
ALTER TABLE enrichment_jobs ADD COLUMN IF NOT EXISTS error TEXT;
