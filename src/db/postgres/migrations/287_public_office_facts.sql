-- #8350 item 4 (the founder via the tester, box 79213; Misho's yes, 31 Oct,
-- on the recommended scope): who holds a public office, taken from an answer
-- that cited an official page, kept with that page and the date it was
-- checked, so the same question is answered at once from memory for any member
-- instead of searching from zero. No contacts are kept: the server cannot check
-- an address against the page. Nothing about private people, and no member's
-- identity: the question is kept only as the words it is compared by.
CREATE TABLE IF NOT EXISTS public_office_facts (
  id          SERIAL PRIMARY KEY,
  language    TEXT NOT NULL,
  -- The question as it is compared: lower case, its distinct words, sorted.
  ask_key     TEXT NOT NULL,
  -- [{ "name", "role", "organisation" }], as the answer named them.
  people      JSONB NOT NULL,
  -- [{ "title", "url" }], official pages only.
  sources     JSONB NOT NULL,
  checked_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_public_office_facts_ask
  ON public_office_facts (language, ask_key);
CREATE INDEX IF NOT EXISTS idx_public_office_facts_checked
  ON public_office_facts (checked_at);
