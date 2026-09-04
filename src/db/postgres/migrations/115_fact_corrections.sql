-- 115: a correction must BEAT the fact it corrects (ticket 9 task 14).
--
-- On 31 July the founder recorded about Nodo Ivanidze: „he is no longer an
-- active angel investor… he should no longer be offered as an investor". On
-- 1 September the app answered, under its own heading „Confirmed active angel
-- investors": „Nodo Ivanidze, angel investor…".
--
-- Why: the correction was saved as a NOTE in the matchable state — hidden
-- text — while the thing it corrects, `occupation: "…; Angel Investor"`, is a
-- PUBLIC fact. The correction sat in a weaker state than the error, so the
-- error won. And it was a coin flip rather than a rule: in the same answer the
-- same class of correction was honoured for one person and ignored for
-- another.
--
-- A correction is therefore not a note and not a fact. It is a VETO, recorded
-- by the person who made it, over one contact and one claim:
--
--   „for me, this person is NOT this."
--
-- It does two things a note never could. It retracts the caller's own wrong
-- rows (that is retract_contact_fact, which already existed), and it keeps a
-- standing veto that the SEARCH LAYER reads — so the wrong answer is never
-- produced, rather than argued with after the fact. The crowd's public row is
-- not deleted: another person's phonebook is not this user's to rewrite. It
-- simply stops reaching THIS user's results.
CREATE TABLE IF NOT EXISTS fact_corrections (
  id            BIGSERIAL PRIMARY KEY,
  user_id       INTEGER     NOT NULL,
  contact_phone TEXT        NOT NULL,
  -- The claim being denied, as the user said it („angel investor").
  wrong_value   TEXT        NOT NULL,
  -- Lower-cased words of wrong_value, so the veto can be matched against a
  -- query without re-tokenising on every search.
  wrong_words   TEXT[]      NOT NULL,
  -- Optional: the field the wrong claim lived in (occupation, role…).
  field_type    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fact_corrections_user
  ON fact_corrections (user_id);
CREATE INDEX IF NOT EXISTS idx_fact_corrections_words
  ON fact_corrections USING GIN (wrong_words);

-- One standing veto per user per contact per claim; saying it twice refreshes
-- nothing and must not pile up.
CREATE UNIQUE INDEX IF NOT EXISTS idx_fact_corrections_unique
  ON fact_corrections (user_id, contact_phone, wrong_value);
