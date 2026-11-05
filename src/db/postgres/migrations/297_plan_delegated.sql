-- 297: autonomy stage 2, K5 (Misho, 5 Nov) — the owner's yes to a plan can hand the
-- decisions over („do what's needed", „you decide"). The model reads that meaning when
-- it records the approval; the server stores the flag beside the approval it belongs to.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS plan_delegated BOOLEAN NOT NULL DEFAULT FALSE;
