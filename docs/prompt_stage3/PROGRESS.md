# Stage 3 (prompt) — progress

Branch `claude/autonomy-stage3`. Text drafts only: no src/, migrations, config or live store touched.

## Done
- CHANGES.md Part A: inventory of every ask / confirm / wait line in all 10 live blocks
  (78 lines: keep / change / remove, one line why) + 3 code-side lines for the server sessions.
- CHANGES.md Part B (P1–P12: quoted current lines, replacement, why, `[K…]` dependency tags) and
  Part C (sizes). `blocks/`: paste-ready core_shared, task_main, task_rules, qa_main, request_main.
  task_step total 35,436 → 37,129 (limit 48,000).
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

## Next
- Waiting on Misho's review and the lead's chat.service.ts rows (K9 B1–B3).

## Questions for Misho (with my recommendation)
0. **Rule 42 risk.** With the word list gone, a bare „არა“ the model does not record stays
   `asked` until the seven-day no-reply sweep closes it (the 4 Sep case). The invite section now
   tells the model its call is the only record. *Recommend: accept* (founder's rule); watch the
   share of invite threads that close by timeout for a week.
0b. **Rule 43 cost.** A short non-question with a reply (e.g. „კი“ to a plan) now reaches the
   cheap extraction model, which decides whether it agreed to anything. *Recommend: accept* —
   one cheap call per short message; the shape check still keeps questions out.
0c. **K9 B4.** A step with `on_named: ask` cannot pass the `outside_plan` wall today. *Recommend:*
   until the server admits a person named in that step's answer, plans use `on_named: introduce`.
1. **Sizes.** core_shared +1,056 and task_rules +880 (the new sections live there because every
   plan-making mode loads them); task_main −243, qa_main −231. *Recommend: accept* — task_step
   is 37,129 of 48,000. A safe −390 in task_rules is listed in CHANGES.md Part C if you want it.
2. **A yes with a change** („კი, ოღონდ ბექა არა“): the draft has the model propose the changed
   plan and approve it in the same turn, without showing it again. *Recommend: yes* — his words
   already approved it; the stage-2 session should confirm approve_task_plan accepts that.
3. **„A stranger“ for ask_owner** = a first message to someone with no tie to him (not his
   contact, not reached through one). Introduction targets named by a helper are not marked
   (5 Nov decision). *Recommend: keep this reading.*
4. **Code-side text that pulls the other way** (not mine to change): `PLAN_ANSWER_IN_WORDS`
   „approve_task_plan … მხოლოდ მაშინ, როცა … მკაფიოდ დაეთანხმება („კი“, „დავიწყოთ“)“, and
   `nightlyReview`'s „three silent days → change the method (a new yes)“. *Recommend:* the
   first reads „როცა მისი სიტყვები გეგმაზე თანხმობას ნიშნავს — მათ შორის „შენ გადაწყვიტე““;
   the second is skipped for plans with steps (their on_silence rule wins; K10/K12).
5. **Anonymous asks:** revealing his name after an answer stays a question (his own data,
   P4(b)). *Recommend: keep.*

## Note for the lead
- The commit trailer: the task brief gives `Claude-Session: …RnyUjbjqMjsULvHW` (the lead's
  session); this session's own harness gives `…cMyDQkeEzdVqF83u`. I used this session's own id
  so the link points at the session that wrote the commit. Say if you want the lead's id instead.
- `core.hooksPath` is not set in this container, so the pre-push hook does not run by itself;
  I run `npm run verify` by hand before every push.
