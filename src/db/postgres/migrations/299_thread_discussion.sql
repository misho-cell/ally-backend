-- 299: #8779 group 4 (the founder, 4 Nov: no fixed word lists). Board #67: an owner who asks to
-- talk first — to be asked questions before any search or plan — gets talk until they ask for
-- action. That was read off their words by DISCUSS_FIRST_RE; the model now says it with
-- set_discussion, and the conversation keeps it here. NULL = not in discussion.
ALTER TABLE threads ADD COLUMN IF NOT EXISTS discussion_since TIMESTAMPTZ;
