# Stage 3 (prompt) — progress

Branch `claude/autonomy-stage3`. Text drafts only: no src/, migrations, config or live store touched.

## Done
- CHANGES.md Part A: inventory of every ask / confirm / wait line in all 10 live blocks
  (78 lines: keep / change / remove, one line why) + 3 code-side lines for the server sessions.
- CHANGES.md Part B (P1–P12: quoted current lines, replacement, why, `[K…]` dependency tags) and
  Part C (sizes). `blocks/`: paste-ready core_shared, task_main, task_rules, qa_main, request_main.
  task_step total 35,436 → 37,085 (limit 48,000).
- TEST.md: 10 fictional-seat conversations (10 different approvals, delegation, a name → an
  introduction with no question, 2-day silence → next step, a no → next step, the three marked
  points, outside-the-plan, routes exhausted, status question, quiet wake) + negative checks.

## Next
- Nothing open on my side. Waiting on Misho's review; after K5/K7 ship, drop the `[K…]` notes.

## Questions for Misho (with my recommendation)
1. **Sizes.** core_shared +1,012 and task_rules +880 (the new sections live there because every
   plan-making mode loads them); task_main −243, qa_main −231. *Recommend: accept* — task_step
   is 37,085 of 48,000. A safe −390 in task_rules is listed in CHANGES.md Part C if you want it.
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
  I ran `npm run verify` by hand before pushing (1282 suites passed, 7 skipped).
