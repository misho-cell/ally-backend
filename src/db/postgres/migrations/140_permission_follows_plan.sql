-- Ticket 18 [99], the founder's answer (D215): a goal's old permission no
-- longer counts on its own — permission follows the plan's approval.
--
-- 68 goals carry `permission_granted = true` with no `plan_approved_at`. They
-- were given a yes before plans existed, and #1619 is the one that showed the
-- cost: the admin screen said "not approved", the connector said "permission
-- granted", and an ask had gone out between the two readings.
--
-- Measured on 13 September, before this ran:
--   68 rows in total
--   17 still open
--   2 of those have a plan proposed and waiting
--   15 have no plan at all
--
-- SAID PLAINLY, because it is a real consequence and not a detail: after this,
-- those 15 open goals can send nothing until their owner is shown a plan and
-- approves it. That is what "the old yes stops counting" means. They are not
-- stuck — the engine proposes a plan on the next run of a goal that has none —
-- but between now and then they are silent, and that is by decision.
--
-- The ids are kept so this is undoable. A migration that withdraws consent on
-- live goals must be reversible by more than memory:
--
--   UPDATE tasks SET permission_granted = true
--   WHERE id IN (SELECT task_id FROM permission_migration_140);
CREATE TABLE IF NOT EXISTS permission_migration_140 (
  task_id    INTEGER PRIMARY KEY,
  was_open   BOOLEAN NOT NULL,
  had_plan   BOOLEAN NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO permission_migration_140 (task_id, was_open, had_plan)
SELECT id, status = 'open', plan_proposed IS NOT NULL
FROM tasks
WHERE permission_granted = true AND plan_approved_at IS NULL
ON CONFLICT (task_id) DO NOTHING;

UPDATE tasks
SET permission_granted = false
WHERE permission_granted = true AND plan_approved_at IS NULL;
