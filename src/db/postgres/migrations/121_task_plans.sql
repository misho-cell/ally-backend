-- 121: the plan a goal runs inside (Ticket 10 Task 21; D118, D119 — 7 Sep).
--
-- The founder's ruling, in his version: the user describes the problem, the
-- assistant proposes a plan — what counts as solved, which routes it will
-- pursue, whom it will involve, whom the user does not want contacted — and
-- the user approves it ONCE. Inside the approved plan the assistant acts on
-- its own; a change to the plan needs a new yes, and the unchanged parts keep
-- running meanwhile.
--
-- Two columns, on purpose. `plan` is the plan IN FORCE — the one consent was
-- given to. `plan_proposed` is the next version, waiting for a yes. A change
-- is written to the second and the first keeps running until the yes moves it
-- across; nothing stops while the user thinks.
--
-- The plan replaces per-message consent only where it can be checked in code:
-- an ask to a person the plan names goes without a per-message yes; a person
-- the plan does not name is refused with "propose a plan change"; a person on
-- never_contact is refused on every route. Until a goal has an approved plan,
-- the old rule holds unchanged.
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS plan             JSONB,
  ADD COLUMN IF NOT EXISTS plan_proposed    JSONB,
  ADD COLUMN IF NOT EXISTS plan_approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS plan_version     INTEGER NOT NULL DEFAULT 0;

-- Line 6 of the standard: a question to the user never stops the work. After a
-- day unanswered the assistant takes the harmless default and says so — once
-- per question, which is what this stamp is for.
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS pending_question_defaulted_at TIMESTAMPTZ;
