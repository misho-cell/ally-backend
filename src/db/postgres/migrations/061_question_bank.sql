-- 061: PART H phase-2 foundations — the question bank and the answer events,
-- exactly the shapes accepted in the ticket-6 reply (tester's §5.1 with our
-- four amendments). The tester's ~48 question rows load into question_bank;
-- answer_events keeps full history with a DATABASE-enforced supersede rule:
-- at most one is_current row per (user, question), so the store cannot rot
-- the way the note store did (three duplicate brevity preferences).

CREATE TABLE IF NOT EXISTS question_bank (
  question_id     TEXT PRIMARY KEY,
  category        TEXT NOT NULL,
  surface         TEXT NOT NULL DEFAULT 'any'
                  CHECK (surface IN ('onboarding','message_draft','meeting_prep','weekly_review','any')),
  prompt_ka       TEXT NOT NULL,
  prompt_es       TEXT,
  prompt_en       TEXT,
  options         JSONB NOT NULL DEFAULT '[]',
  signals         TEXT[] NOT NULL DEFAULT '{}',
  score_vector    JSONB NOT NULL DEFAULT '{}',
  immediate_use   TEXT NOT NULL,
  storage_level   TEXT NOT NULL DEFAULT 'raw+normalized'
                  CHECK (storage_level IN ('raw+normalized','normalized_only')),
  follow_up_rule  TEXT,
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS answer_events (
  id                    SERIAL PRIMARY KEY,
  user_id               INTEGER NOT NULL,
  question_id           TEXT NOT NULL REFERENCES question_bank(question_id),
  raw_answer            TEXT,
  normalized_tags       JSONB NOT NULL DEFAULT '{}',
  surface               TEXT NOT NULL,
  asked_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  answered_at           TIMESTAMPTZ,
  user_goal_at_time     TEXT,
  confidence_weight     REAL NOT NULL DEFAULT 1.0,
  immediate_output_used BOOLEAN,
  user_feedback         TEXT,
  sensitivity_level     TEXT,
  skipped               BOOLEAN NOT NULL DEFAULT FALSE,
  is_current            BOOLEAN NOT NULL DEFAULT TRUE
);

-- The supersede rule, enforced by the database, not by discipline: the writer
-- flips the previous current row and inserts the new one in ONE transaction;
-- recomputation reads WHERE is_current only. Full history stays.
CREATE UNIQUE INDEX IF NOT EXISTS answer_events_current
  ON answer_events (user_id, question_id) WHERE is_current;

CREATE INDEX IF NOT EXISTS idx_answer_events_user ON answer_events (user_id, asked_at DESC);
CREATE INDEX IF NOT EXISTS idx_question_bank_category ON question_bank (category) WHERE active;
