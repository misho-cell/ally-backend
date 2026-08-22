-- 069: PART H — the eight C.9 schema changes against migration 061, exactly
-- as the tester wrote them on 18 Aug (re-sent 22 Aug). The bank itself (43
-- rows) arrives later; nothing here loads rows.

-- C9.1 — immediate_use must be localised and user-facing (shown WITH the
-- question, before the answer). The old single column stays as the internal
-- note / English fallback.
ALTER TABLE question_bank ADD COLUMN IF NOT EXISTS immediate_use_ka TEXT;
ALTER TABLE question_bank ADD COLUMN IF NOT EXISTS immediate_use_es TEXT;
ALTER TABLE question_bank ADD COLUMN IF NOT EXISTS immediate_use_en TEXT;

-- C9.2 — multi-select questions (q1 up to three, q33 up to two).
ALTER TABLE question_bank ADD COLUMN IF NOT EXISTS select_mode TEXT NOT NULL DEFAULT 'single'
  CHECK (select_mode IN ('single', 'multi'));
ALTER TABLE question_bank ADD COLUMN IF NOT EXISTS select_max INTEGER;
ALTER TABLE answer_events ADD COLUMN IF NOT EXISTS option_ids TEXT[] NOT NULL DEFAULT '{}';

-- C9.3 — goal binding: a goal-dependent question is never asked bare.
ALTER TABLE question_bank ADD COLUMN IF NOT EXISTS goal_bound BOOLEAN NOT NULL DEFAULT FALSE;

-- C9.4 — free-text „სხვა": research data, never profile data.
ALTER TABLE answer_events ADD COLUMN IF NOT EXISTS free_text TEXT;

-- C9.5 — new categories need no schema change (category is unchecked TEXT);
-- the new surface does: after_rejection joins the CHECK.
ALTER TABLE question_bank DROP CONSTRAINT IF EXISTS question_bank_surface_check;
ALTER TABLE question_bank ADD CONSTRAINT question_bank_surface_check
  CHECK (surface IN ('onboarding','message_draft','meeting_prep','weekly_review','after_rejection','any'));

-- C9.6 — the profile dimensions store, with the ninth dimension. Values are
-- the framework's -1..+1; pressure_response is never shown as a label.
CREATE TABLE IF NOT EXISTS profile_dimensions (
  user_id    INTEGER NOT NULL,
  dimension  TEXT NOT NULL CHECK (dimension IN (
    'goal_clarity','openness','conscientiousness','extraversion','agreeableness',
    'risk_appetite','network_breadth','reciprocity','pressure_response')),
  value      REAL NOT NULL DEFAULT 0 CHECK (value >= -1 AND value <= 1),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, dimension)
);

-- C9.7 — outcome_events: what the user DOES after a suggestion — the evidence
-- source for pressure_response. declined/accepted land at resolve time; the
-- no_reply half comes from a timer sweep; dropped/rerouted from future hooks.
CREATE TABLE IF NOT EXISTS outcome_events (
  id           SERIAL PRIMARY KEY,
  user_id      INTEGER NOT NULL,
  subject_type TEXT NOT NULL CHECK (subject_type IN ('intro_request','draft','suggestion','task')),
  subject_id   TEXT NOT NULL,
  outcome      TEXT NOT NULL CHECK (outcome IN ('declined','no_reply','dropped','rerouted','accepted')),
  next_action  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- One outcome of a kind per subject — the sweep can re-run forever safely.
CREATE UNIQUE INDEX IF NOT EXISTS outcome_events_unique
  ON outcome_events (subject_type, subject_id, outcome);
CREATE INDEX IF NOT EXISTS idx_outcome_events_user ON outcome_events (user_id, created_at DESC);

-- C9.8 — rotation state: DERIVED from the last non-skipped answer's category
-- (the cheaper option the tester offered); no column needed.
