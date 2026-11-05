# Stage 3 (prompt) — progress

Branch `claude/autonomy-stage3`. Text drafts only: no src/, migrations, config or live store touched.

## Done
- CHANGES.md Part A: inventory of every ask / confirm / wait line in all 10 live blocks
  (78 lines: keep / change / remove, one line why) + 3 code-side lines for the server sessions.
- CHANGES.md Part B (P1–P12: quoted current lines, replacement, why, `[K…]` dependency tags) and
  Part C (sizes). `blocks/`: paste-ready core_shared, task_main, task_rules, qa_main, request_main.
  task_step total 35,436 → 37,075 (limit 48,000).
- TEST.md: 10 fictional-seat conversations (10 different approvals, delegation, a name → an
  introduction with no question, 2-day silence → next step, a no → next step, the three marked
  points, outside-the-plan, routes exhausted, status question, quiet wake) + negative checks.

- Round 2 (lead's message, owner's yes): merged `origin/claude/wizardly-johnson-a6orxq`;
  #8779 rule 42 (`PROTOCOL_WORDS` → the model's respond_to_invite_campaign call; the server reads
  only the recorded state during this run); rule 43 (`CONFIRMATION_WORDS` → the extraction model's
  per-candidate `source: user | confirmed`, server checks shape only); K9_REFUSALS.md
  (B change 11 + 2 soft, A keep 7, C keep 8).
- Fix found by K9: approve_task_plan starts the first round itself, so P2 no longer tells the run
  to send the first step (core_shared block, CHANGES P2, TEST.md updated).

- Round 3 (#8623 DR10, owner's yes): merged wizardly-johnson again; `netai_team` reason in
  excludedHolders.service (`setTeamAccountExcluded`, `listTeamAccounts`; only that reason's rows
  are written or removed, cache cleared); `GET` / `PUT /admin/team-accounts[/:userId]` in
  teamAccounts.routes.ts, mounted in the admin router and guarded on its own, product event
  `team_account_exclusion`. Walks checked, no change needed (all read excluded_holders by
  user_id with no reason filter): find_warm_path (middlemen), mutualGroups (plan card groups),
  reverseTies, searchSecondDegree, ownerHolders, everyHolder, ownContactByNumber,
  getContactFullProfile. Caveat: the phone cache is per process — another instance sees a
  change within 10 minutes.

## Next
- Waiting on Misho's review and the lead's chat.service.ts rows (K9 B1–B3).

## Decisions (owner, 5 Nov: my recommendations accepted)
- **Rule 42 risk** — accepted. Watch for a week the share of invite threads that close by the
  seven-day timeout instead of a recorded answer.
- **Rule 43 cost** — accepted (one cheap extraction call per short non-question message).
- **on_named** — plans use `on_named: introduce` only until K9 B4's server fix admits a person
  named in a step's answer. Applied: task_rules STEP 5, task_main ANSWERS, CHANGES.md, TEST.md.
- **Sizes** — accepted as they are (task_step 37,075 of 48,000); no extra cut.
- **A yes with a change** — the model proposes the changed plan and approves it in the same turn,
  without showing it again. Stage-2 session to confirm approve_task_plan accepts that.
- **„A stranger“ for ask_owner** — a first message to someone with no tie to the owner;
  introduction targets named by a helper are not marked.
- **Code-side texts** — for the lead: PLAN_ANSWER_IN_WORDS reads „როცა მისი სიტყვები გეგმაზე
  თანხმობას ნიშნავს — მათ შორის „შენ გადაწყვიტე““ (K9 B3); nightlyReview's three-silent-days
  rule is skipped for plans with steps (K9 B10).
- **Anonymous asks** — revealing his name after an answer stays a question.

## Questions for Misho
(none open)

## Note for the lead
- The commit trailer: the task brief gives `Claude-Session: …RnyUjbjqMjsULvHW` (the lead's
  session); this session's own harness gives `…cMyDQkeEzdVqF83u`. I used this session's own id
  so the link points at the session that wrote the commit. Say if you want the lead's id instead.
- `core.hooksPath` is not set in this container, so the pre-push hook does not run by itself;
  I run `npm run verify` by hand before every push.
