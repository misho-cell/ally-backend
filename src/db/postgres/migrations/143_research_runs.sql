-- Ticket 19 [20]: the research actually runs.
--
-- The trigger table (Part 3 Task 3) has decided WHAT to look up for each
-- person since it was written, and nothing has ever looked it up. The plan was
-- visible on an admin screen and went no further, so „automatic research" was
-- a plan generator with no hands.
--
-- TWO TABLES, AND THE REASON.
--
-- `research_steps` is one row per step the plan asked for — including the ones
-- that were NOT run. A step that was never attempted must never be able to
-- look like a step that found nothing: that is the same false „done" that
-- made the product tell somebody their note was deleted when it was not, and
-- here it would quietly teach us that a person has no public trace when we
-- simply never looked. `register` and `roster` have no integration on this
-- side, so every such step is written down as not_attempted, by name.
--
-- `research_findings` is the raw result: what came back, from which page, in
-- its own words.
--
-- WHAT IS DELIBERATELY NOT HERE: any conclusion about a person. No fact, no
-- role, no employer, nothing that touches the contact tables. This records
-- that a search was run and what a page said — attribution of any of it to a
-- human being is a separate decision, and a machine that writes claims about
-- real named people into the shared base unattended is exactly what we agreed
-- must not happen.
CREATE TABLE IF NOT EXISTS research_steps (
  id           SERIAL PRIMARY KEY,
  phone        TEXT NOT NULL,
  -- Which row of the founder's table sent us here. Kept so a bad rule can be
  -- found by its results rather than argued about.
  trigger      TEXT NOT NULL,
  source       TEXT NOT NULL,
  query        TEXT NOT NULL,
  -- 'found' | 'nothing' | 'not_attempted' | 'error'
  status       TEXT NOT NULL,
  -- Why, for not_attempted and error. Never user content.
  note         TEXT,
  ran_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The two reads: one person's whole research trail, and „what did the runner
-- do today" (which is also how the daily search budget is counted).
CREATE INDEX IF NOT EXISTS idx_research_steps_phone ON research_steps (phone, ran_at DESC);
CREATE INDEX IF NOT EXISTS idx_research_steps_time  ON research_steps (ran_at DESC);

CREATE TABLE IF NOT EXISTS research_findings (
  id         SERIAL PRIMARY KEY,
  step_id    INTEGER NOT NULL REFERENCES research_steps (id) ON DELETE CASCADE,
  phone      TEXT NOT NULL,
  url        TEXT NOT NULL,
  title      TEXT,
  -- The page's own words, truncated at the writer. Evidence, not a verdict.
  snippet    TEXT,
  found_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- The same page found twice for the same person is one piece of evidence.
  UNIQUE (phone, url)
);

CREATE INDEX IF NOT EXISTS idx_research_findings_step ON research_findings (step_id);
