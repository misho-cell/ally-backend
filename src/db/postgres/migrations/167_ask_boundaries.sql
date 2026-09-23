-- Ticket 20 row 247 — a person's own boundary must reach other people's
-- SEARCHES, not only the last step before a message.
--
-- THE FOUNDER'S DECISION, 22 September (D421), after the seat measured the
-- promise being broken twice on the live build. His words: „if a person
-- prefers not to be asked about it, she has not to be in plan, because the
-- search system finds that she has asked her assistant not to bother her with
-- it." And the reasoning he wants carried into the code: „Always remember,
-- it's a human assistant. If my human assistant knows that Nino will not
-- answer, then my human assistant will never ask Nino about it — because she
-- knows she will not answer."
--
-- Absent, silently. Not named and marked; not named and refused at send.
--
-- WHAT WAS MEASURED, and it is why this table exists rather than a new read of
-- something already there. Two clean runs, 22 September:
--
--   14:07:27  Test 8 tells its own assistant „never pass me questions about
--             plumbers". save_user_note kind=preference, ok=true. The
--             assistant answers „no plumbing-related questions will be sent
--             your way going forward."
--   14:09:41  a DIFFERENT account's plan, seventy-four seconds later:
--             „Who I will ask: Netai Test 8, Netai Test 10"
--
--   14:12:2x  the same promise made to Test 9, on an account nowhere near any
--             rate cap
--   14:14:52  ask 3797 SENT to Test 9: „Do you know a good, trustworthy
--             plumber in Tbilisi?"
--
-- Two and a half minutes from the promise to the message. The note is real —
-- it saves, it persists, her own assistant reads it back to her — and it has
-- no effect on anything.
--
-- WHY A NEW TABLE. `user_notes` is (id, user_id, kind, text, created_at,
-- worked_at). There is no topic column, `text` is free prose, and all five
-- SQL statements that read it are `WHERE user_id = $1`. So there is nothing to
-- wire: no other user's search could see it, and if it could there would be
-- nothing to compare. The note stays exactly as it is — it is what the person
-- said, in their words, and their own assistant reads it. This table is what
-- the search can match on.
--
-- ONE ROW PER TERM, not an array. The match happens inside `getExcludedPhones`,
-- which is one UNION of SELECTs and is called by every search tool; a scalar
-- column joins there in one clause, and an array would need unnesting inside
-- a query that is already the hottest read in the product. `topic` keeps the
-- terms of one boundary together so it can be shown to its owner and lifted as
-- one thing, and `note_id` is what lets deleting the note lift the boundary —
-- an invisible exclusion with no way back is the 17 September fault again.
--
-- `term` IS STORED NORMALIZED — `normalizeSearchToken` + the Georgian stem, the
-- same pair the tag search compares with. Storing the raw word instead would
-- mean normalizing every row on every search.
CREATE TABLE IF NOT EXISTS ask_boundaries (
  id         BIGSERIAL PRIMARY KEY,
  user_id    INTEGER     NOT NULL,
  -- What the person said, in their own words: „plumbers or plumbing".
  topic      TEXT        NOT NULL,
  -- One normalized word the search compares against. Several per topic.
  term       TEXT        NOT NULL,
  -- Which note this came out of, so lifting the note can lift the boundary and
  -- so a person can be shown why they are not being asked.
  note_id    INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The same term twice for one person is one boundary.
CREATE UNIQUE INDEX IF NOT EXISTS ask_boundaries_one_term_per_person
  ON ask_boundaries (user_id, term);

-- The search's own lookup: given the words of a query, whose boundary matches.
CREATE INDEX IF NOT EXISTS ask_boundaries_term ON ask_boundaries (term);
