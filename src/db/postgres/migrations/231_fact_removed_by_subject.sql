-- 4126 item 5 (Misho's yes, 9 Oct ~20:48 UTC): a person sees the facts kept
-- about their own numbers and removes any of them. A removal by the person the
-- fact is about is stronger than a retraction: no later save of the same row
-- (the saver's upsert, the research reload) may bring it back.
ALTER TABLE contact_facts ADD COLUMN IF NOT EXISTS removed_by_subject_at TIMESTAMP;
