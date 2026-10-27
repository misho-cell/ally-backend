-- 278 (#7822, founder 26 Oct, D888-D891): the result brief. Beside the free
-- brief a goal keeps WHAT KIND of result it is after (A trusted provider,
-- B buyer-seller match, C a specific person or organisation, D an expert's
-- advice, E a meeting or presentation, F bring a non-member in, G sell
-- without pitching, H re-engage), what the delivered result looks like, and
-- the kind's checkpoints with which are done, so every wake works on the
-- NEXT checkpoint instead of searching again. A goal may switch kind.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS result_kind TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS result_shape TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS checkpoints JSONB;
