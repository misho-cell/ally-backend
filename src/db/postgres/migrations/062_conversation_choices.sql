-- 062: tappable choices persist WITH the message (ticket 6 close §15 B1).
-- present_choices' captured options rode only in the live run_complete event —
-- the stored row carried just the header text, so on reload (and for any
-- client that missed the event) the user was told to choose from nothing.
-- Display-only payload; model history stays in content_json untouched.
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS choices JSONB;
