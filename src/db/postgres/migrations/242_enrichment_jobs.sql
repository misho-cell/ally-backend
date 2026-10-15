-- 5317 (15 Oct): this file once created the contact enrichment queue under the
-- name enrichment_jobs. That name was already the nightly job's table (010), so
-- IF NOT EXISTS skipped it and every queue statement failed. The queue is
-- created in 243 as contact_enrichment_jobs; this file is recorded as run and
-- does nothing.
SELECT 1;
