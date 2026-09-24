-- Row 236 — the admin merge page's undo. Two columns so an approval can be
-- undone EXACTLY, and a backfill for the ones already made.
--
-- ════════ THE REPORTED BUG ════════
--
-- Lika approved a pair on the Identity tab, pressed undo, and got a red error
-- asking for a person id with no field to type one into.
--
-- The screen is right and the server is wrong. `admin.routes.ts` carries the
-- comment „Undo per pair: POST /admin/identity/candidates/:id/unmerge
-- (existing)" — and that route has never existed. The only undo is
-- POST /admin/identity/unmerge with a `person_id`, which the page has no
-- reason to know: it approved a CANDIDATE, so it can only name a candidate.
--
-- ════════ AND THE BUG UNDER IT, WHICH IS WORSE ════════
--
-- `unmergePerson` deletes EVERY person_identities row for that person_id. That
-- is correct only when the approval created the person. When it EXTENDED one —
-- approve reuses an existing person_id when any phone already belongs to one,
-- deliberately, so an approval never invents a rival person — undoing by
-- person id also removes phones that approval never touched.
--
--     merges that created a new person        465
--     merges that extended an existing one      7   ← over-deleted by the undo
--
-- Nobody has met it because NO UNMERGE HAS EVER SUCCEEDED: person_merge_log
-- holds 472 merges and zero unmerges. The missing route hid a data-loss path
-- behind an error message.
--
-- ════════ WHAT THESE COLUMNS HOLD ════════
--
--   person_id      the person the approval produced or extended
--   merged_phones  the phones the approval ACTUALLY INSERTED
--
-- The second is the one that makes an exact undo possible. Approve inserts
-- with ON CONFLICT (phone) DO NOTHING, so a phone that already belonged to
-- somebody is left exactly as it was — and `RETURNING phone` therefore names
-- precisely the rows that approval created, which are precisely the rows an
-- undo should remove.
ALTER TABLE identity_candidates
  ADD COLUMN IF NOT EXISTS person_id     uuid,
  ADD COLUMN IF NOT EXISTS merged_phones text[];

-- ════════ THE BACKFILL, AND WHAT IT DELIBERATELY LEAVES EMPTY ════════
--
-- Eighty candidates are already approved, including the pair Lika tried to
-- undo, so without a backfill the new route would refuse exactly the case that
-- was reported.
--
-- It is only written where it is PROVABLE:
--
--   * the merge log row must have no prior_person_ids — meaning no phone in
--     the pair already belonged to anyone, so every phone was inserted and
--     merged_phones IS the candidate's phones;
--   * exactly one merge log row may match the candidate's phones. Two matching
--     rows is an ambiguity, and guessing which one produced this candidate is
--     how an undo removes the wrong mapping.
--
-- The seven that extended an existing person stay NULL on purpose. For those
-- the log records WHICH person ids existed but not WHICH PHONE had which, so
-- the exact set cannot be recovered — and the route refuses rather than
-- guessing, because guessing here unmaps a real person's phone. They are
-- undoable through the person-id route by somebody who has looked at them.
UPDATE identity_candidates c
   SET person_id     = m.person_id,
       merged_phones = c.phones
  FROM person_merge_log m
 WHERE c.status = 'approved'
   AND c.merged_phones IS NULL
   AND m.action = 'merge'
   AND m.phones = c.phones
   AND (m.prior_person_ids IS NULL OR cardinality(m.prior_person_ids) = 0)
   AND (SELECT COUNT(*) FROM person_merge_log m2
         WHERE m2.action = 'merge' AND m2.phones = c.phones) = 1;
