# Stage 3 (prompt) — progress

Branch `claude/autonomy-stage3`. Text drafts only: no src/, migrations, config or live store touched.

## Done
- CHANGES.md Part A: inventory of every ask / confirm / wait line in all 10 live blocks
  (78 lines: keep / change / remove, one line why) + 3 code-side lines for the server sessions.

## Next
- CHANGES.md Part B (P1–P12 with quoted current lines, replacement, why) + `blocks/` paste-ready
  core_shared, task_main, task_rules, qa_main, request_main; size totals before/after.
- TEST.md: 10 fictional-seat conversations.

## Questions for Misho (with my recommendation)
(none yet — collected after the blocks are written)

## Note for the lead
- The commit trailer: the task brief gives `Claude-Session: …RnyUjbjqMjsULvHW` (the lead's
  session); this session's own harness gives `…cMyDQkeEzdVqF83u`. I used this session's own id
  so the link points at the session that wrote the commit. Say if you want the lead's id instead.
- `core.hooksPath` is not set in this container, so the pre-push hook does not run by itself;
  I run `npm run verify` by hand before each push.
