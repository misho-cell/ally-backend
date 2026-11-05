-- 298: #8779 group 4 (the founder, 4 Nov: no fixed word lists). What kind of question an ask
-- is — an introduction, „do you know…", a request for help, an open question, a yes/no — was
-- read off its words to pick the reader's buttons. The asking model says it now, and it is kept
-- with the ask so a reminder or an evening card gives the same buttons. NULL = open (only
-- „later"), the safe set for any question.
ALTER TABLE task_asks ADD COLUMN IF NOT EXISTS ask_kind TEXT;
