# Autonomy, stage 2 — executable plans

Branch: `claude/autonomy-stage2`. Owner of shipping: the lead session (merges, deploys).
Goal (Misho, 5 Nov): the owner gives a task once, approves a plan once, and the agent
drives it to a result, asking the owner only where the plan marked it in advance.

Rules kept unchanged: a message to a real person only with the owner's consent (an
approved plan step counts); a fictional test seat never messages a real member; a member
target's number moves only on their own yes (#8945); the 112 text and phone hiding stay.
Founder rule #8779: the server checks STRUCTURE only — no word lists that read meaning.

---

## Design (K1–K4)

### K1 — plan schema v2

`propose_task_plan`'s `plan` gains two optional fields. Everything that exists today stays.

```
result_when?: string          // what counts as the result; alias of solved_when
steps?: PlanStep[]            // at most 10, in the order they are worked

PlanStep {
  id?: string                 // "s1", "s2"… — assigned by the server when missing
  action: 'ask' | 'introduce' | 'search' | 'web'
  who?: { phone?: string, name?: string }
  what?: string               // ≤ 160 chars: what this step asks / looks for
  on_silence?: { after_days: 1..14, next_step: string }
  on_no?: { next_step: string }
  on_named?: { action: 'introduce' | 'ask' }
  ask_owner?: boolean         // a point where the owner's word is needed (default false)
}
```

Structure checks (server, `src/services/planSteps.ts`, no reading of meaning):

- `result_when` and `solved_when` are one field: either is accepted; `solved_when` stays
  the stored source of truth so every existing reader keeps working, and `result_when`
  is stored beside it when given.
- ids unique; a missing id becomes `s<n>` (its 1-based position).
- `next_step` must name a LATER step. Steps only move forward, so a plan always ends —
  no loops, no timers that ring for ever.
- `ask` / `introduce` need `who.phone`, and that phone must be one of
  `people_to_involve`. The plan's people list stays the consent list the ask path
  enforces (`planAllows`); a step cannot widen it. For `introduce`, `who` is the
  go-between (the person asked to introduce) and `what` names whom to be introduced to.
- `search` / `web` need nothing but `what`.
- `after_days` is an integer 1–14.
- A refusal names the exact field and the fix, in one line.

Old plans keep working: a plan without `steps` is read (never rewritten) as one step
`{ id: 's1', action: 'ask', ask_owner: false }` with no `who`, meaning „ask everyone in
people_to_involve" — `stepsOf(plan)`. `planHasSteps(plan)` is true only for a plan the
model wrote steps for; K10/K12 key off it.

The plan text the owner reads (`planInSentences`) gets one short line after the plan
sentence when the plan has steps: the first few steps, numbered, each „action — who",
and the ask-the-owner points marked. At most 5 shown, the rest counted.

### K2 — plan progress state

Migration `296_plan_step_events.sql`:

```
plan_step_events (id BIGSERIAL, task_id INT → tasks ON DELETE CASCADE, step_id TEXT,
                  kind TEXT CHECK in (started, sent, answered, declined, silent, named),
                  ref TEXT NULL, created_at TIMESTAMPTZ DEFAULT NOW())
  index (task_id, created_at DESC), index (task_id, kind, ref)
tasks.plan_step TEXT NULL   -- the current step id
```

`src/services/planProgress.service.ts` owns every read and write: parameterized, with a
timeout, every read LIMITed. Moving the current step and recording its `started` event is
one transaction (two tables). The `Task` row type is NOT widened — progress is read by its
own module, so nothing else in the 20k-line chat path changes shape.

### K3 — the server advances steps

Pure decision in `planSteps.ts` (`stepAfter(plan, stepId, outcome)`), side effects in
`planProgress.service.ts`. Hooks are one line each in the existing code:

| what happened | where it is seen | recorded | rule applied |
|---|---|---|---|
| an ask went out | `taskAsks.service` after the `task_asks` INSERT | `sent` (ref = ask id) on the step whose `who` is the recipient (else the current „everyone" ask step) | a send to a LATER step's person moves the current step there (`started`) — progress follows what really happened |
| an answer arrived | `deliverOwedAnswers` (the answer wake) | `answered` or `declined` (ref = ask id) on the step that ask was sent for | declined → `on_no.next_step`, else the next step in order. answered → the step stays; the event names `on_named` and the next step, and the model judges whether `result_when` is met |
| nobody answered | new `sweepSilentSteps()` in the engine ticker | `silent` | after `on_silence.after_days` since the step's last `sent` with no answer/decline since → `on_silence.next_step` |
| a person the plan asked named somebody | `request_introduction` insert for a goal with steps | `named` (ref = request id) | `on_named` is already the plan's yes (0ab4ca90 / introYesGate) |

Who declined is the model's reading already stored on the ask (`declined_at`, #8779 b) —
the server reads the flag, never the words.

When the current step changes the goal is woken with a short event naming it:
`ნაბიჯი 2 დაიწყო: კითხვა — <name>. გეგმით — მფლობელის კითხვის გარეშე.` For a step with
`ask_owner`, the event says the step needs the owner's word and to ask them first. No
owner question is generated by the server in between.

### K4 — „where we are" block

`whereWeAreSection(task)` (async, in `planProgress.service.ts`) is placed directly before
the goal's engine section in every goal run's prompt (one entry in the existing
`Promise.all` in `chat.service.ts`). Only for a goal with an approved plan:

```
## სად ვართ
შედეგი, როცა: <result_when>
ახლანდელი ნაბიჯი: 2 — კითხვა: <name>
ბოლო მოვლენა: ნაბიჯი 1 — უარი (<date>)
შემდეგი ნაბიჯი: 3 — …
მფლობელის კითხვის გარეშე: ნაბიჯები 1, 2, 4. მფლობელის სიტყვა საჭიროა: ნაბიჯი 3.
```

Dates are absolute (no „2 days ago") so the text is deterministic and testable.

### K5, K7, K10, K12 (after K1–K4)

- K5: `approve_task_plan` takes `delegated: boolean` (the model's reading of „do what's
  needed / you decide"); migration `297` adds `tasks.plan_delegated`; K4's block says what
  the delegation covers.
- K7: `set_task_result` on a goal with a plan records the result and goes out through the
  existing result card + push/WhatsApp paths.
- K10: when a plan has steps, the wave size / „one go-between first" (#8845) limits read
  the plan's current step instead of their own counters.
- K12: for a plan with steps, day one's event is a step event („ნაბიჯი 1 დაიწყო: …").

---

## Progress

| item | status | commit | notes |
|---|---|---|---|
| K11 | done (lead) | 0ab4ca9 | approved plan covers introductions |
| design | done | 52e1c4d6 | |
| K1 | done | 7525b4cb | `planSteps.ts` (parse/structure), `planStepsText.ts` (card line), `planStepsSchema.ts` (tool schema); `parsePlan` reads `result_when`/`steps`; card + engine prompt show the steps line. Test: `planSteps.test.ts` |
| K2 | done | 356d1deb | migration `296_plan_step_events.sql` (table + `tasks.plan_step`); `planProgress.service.ts` (record / move-in-a-transaction / read, LIMITed). `Task` row type not widened. Test: `planProgress.service.test.ts` |
| K3 | done | 93a153be | pure rules + texts `planAdvance.ts`; DB hooks `planAdvance.service.ts`: `notePlanAskSent` (taskAsks, after the INSERT, owner's own asks only), `notePlanNamed` (requestIntroduction, after the INSERT, not direct / not forwarded), `planStepNoteForAnswers` (answer wake, note under the event), `sweepSilentSteps` (engine tick, ≤50 goals). Idempotent on retried wakes. Tests: `planAdvance.test.ts`, `planAdvance.service.test.ts` |
| K4 | done | 3f65fcf3 | `whereWeAre.ts` (render), `whereWeAre.service.ts` (read; empty on failure); 4 lines in `chat.service.ts`: the read starts beside the prompt's `Promise.all` and is placed right before `buildTaskEngineSection`. Test: `whereWeAre.test.ts` |
| K5 | done | fe13ba12 | migration `297_plan_delegated.sql`; `approve_task_plan` takes `delegated` (schema in `planDelegation.ts`); every approval resets it to false in the same UPDATE, the chat handler stores true after a successful approval; K4's block says so. Connector approvals stay non-delegated. Test: `planDelegation.test.ts` |
| K7 | done | 21a1ba4a | an engine run that calls `set_task_result` is news: the push (high value → WhatsApp template) goes even while the goal is `waiting` on others; the card goes as before (`run_complete.result`). The K3 answer note tells the run to call it when the plan's result is met. Test: `aPlanResultRingsTheOwner.test.ts` |
| K10 | done | 833d191d | with steps, `readWave` is null (no wave note, no wave move, no wave number) and `waveRoomFor` asks `planStepRoom`: the current step's person and earlier ones; the next person step once the current one is heard from or has nobody to ask; anyone further waits, with a line naming the current step. D625 (the owner named them) still passes; a failed progress read fails open to the plan wall. Plans without steps: waves exactly as before. Test: `aPlanWithStepsIsWorkedByItsSteps.test.ts` |
| K12 | done | 71e25dc8 | `startDayOne` reads its event at wake time (`wakeWhenFree` accepts a lazy event): a plan with steps is moved to step 1 and the day-one event is „ნაბიჯი 1 დაიწყო: … გეგმა დამტკიცებულია — გააკეთე ახლა, მფლობელის კითხვის გარეშე“ followed by 3070's first-pass sentences; without steps the old event. Test: `dayOneIsStepOne.test.ts` |

## How to test (fictional seats)

- K1: on a test seat, give a goal; the run's propose_task_plan may now carry `steps`.
  DONE WHEN the plan text in the reply ends with „ნაბიჯები: 1. ვკითხავ — … ; 2. …" and a
  step marked `ask_owner` reads „(აქ შენს სიტყვას დაველოდები)"; an old-shape plan reads
  exactly as before; a step naming somebody not in people_to_involve is refused with the
  fix named (`step s2: … is not in people_to_involve — add them there too`).

- K2: after deploy (lead), `\d plan_step_events` exists and `tasks.plan_step` is a column;
  nothing writes to them until K3.

- K3, on a fictional seat with a plan of steps s1 ask A (on_no → s2), s2 ask B
  (on_silence 1 day → s3), s3 web, approved:
  - day one asks A → `plan_step_events` has `started s1`, `sent s1 <ask id>`.
  - A answers „no" (the model marks it declined) → `declined s1`, `tasks.plan_step = s2`,
    and the answer's wake event ends with „(ნაბიჯ 1-ზე უარი მოვიდა.) ნაბიჯი 2 დაიწყო: …
    მფლობელის კითხვის გარეშე." DONE WHEN the run asks B with no question to the owner.
  - B silent for a day → `silent s2`, `started s3`, the goal is woken with „ნაბიჯი 3
    დაიწყო: ვებ-ძიება …". DONE WHEN the run searches with no question to the owner.
  - an answer that is not a no → `answered`, the wake event names the result check,
    the step's on_named rule and the next step; the plan does not move by itself.
  - an old plan (no steps): events are recorded, wake texts are unchanged.

- K4, any goal with an approved plan: DONE WHEN the run's system prompt (admin prompt
  view / log) carries „## სად ვართ" above „## აქტიური დავალება", with the result, the
  current step, the last event with its UTC time, the next step, and the steps that need
  no owner question; a goal without an approved plan has no such block.

- K5: on a fictional seat, approve a plan with „კი, შენ გადაწყვიტე" → the tool call carries
  `delegated: true`, `tasks.plan_delegated` is true, and the next goal run's „სად ვართ"
  ends with „მფლობელმა გადაგაბარა …". Approve a later version with a plain „კი" → false.

- K7: fictional seat, a plan of two asks; the first helper's answer meets the result
  while the second is still out. DONE WHEN the run calls set_task_result, the result card
  shows in the goal's thread, and the owner's device gets the push (the log line
  „[push] goal N: a step" does NOT appear for that run).

- K10: fictional seat, plan of steps s1 ask A, s2 ask B, s3 ask C, approved. DONE WHEN day
  one asks only A (an ask to C is refused with „ეს ადამიანი გეგმის შემდეგ ნაბიჯზეა. ახლა
  ნაბიჯი 1: …"), the prompt has no „## ტალღა" block, and after A's answer the run may ask B
  (but not yet C) without the owner.

- K12: approve a plan with steps on a fictional seat. DONE WHEN the day-one run's event in
  the thread reads „[მოვლენა] ნაბიჯი 1 დაიწყო: …“ (not „გეგმა ახლახან დამტკიცდა“),
  `tasks.plan_step = s1`, and the run asks step 1's person without asking the owner.


## Second round (lead session's request, 5 Nov 13:01Z)

| item | commit | what |
|---|---|---|
| merge lead branch | e0d7b989 | `origin/claude/wizardly-johnson-a6orxq` merged (no rebase); no conflicts; stage-2 lines used no removed word triggers |
| two server texts | a9dbe991 | `PLAN_ANSWER_IN_WORDS`: approve when the owner's words mean agreement, „you decide" included (then `delegated: true`); nightly review: for a plan with steps silence is `on_silence`, no new yes (`planNightly.ts`), and the three-day method-change sweep skips such goals (stamps them first) |
| #8779 g4: referral | d2312828 | RECOMMENDS_RE gone: every referral reads the recommended line; a mediator's worded decline carries „if it suggests someone else, that is a suggestion" for the model |
| #8779 g4: KNOWS_RE | e6919049 | the server's instant „X is not on Netai" answer gone; the model's tools say it |
| #8779 g4: birthdays | 2ed4e2c6 | the app's run gets `get_upcoming_birthdays` (the connector's own tool); the server-written answer and its regex gone |
| #8779 g4: registered name | 09b9f8cd | `search_contact_by_name.about_the_name` (the model's reading) replaces ASKS_ABOUT_THE_NAME_RE |
| #8779 g4: askKind | be1c33c2 | `ask_contact.kind` (intro / know / help / yes_no / open), stored as `task_asks.ask_kind` (**migration 298**); no kind = open set („later" only) |
| #8779 g4: reminders | 59d153d4 | REMINDER_REQUEST_RE gone; set_reminder's description says „only a reminder → nothing else" |
| #8779 g4: hidden tools | 076a0e7b | invite / link / web no longer held on words, the warm-path walk no longer forced; each rule is in the tool's description |
| #8779 g4: lookups first | dc4bff12 | weather, where-they-work, the lender role search and the opening-search skip gone (whereTheyWork.ts, roleWebSearch.service.ts deleted) |
| #8779 g4: small talk + greeting | af5ee4b3 | the server hello and the small-talk fast path gone; every line takes the ordinary turn. Titles: the title model answers NO_TITLE_YET when there is nothing to name; the placeholder stays |
| #8779 g4: auto goal | 1489831a | need/question word lists gone; a goal opens before the run only on the app's new-goal button, otherwise by the model's create_task |
| #8779 g4: discuss first | 071d4697 | `set_discussion` tool, `threads.discussion_since` (**migration 299**); the server holds every other tool in a discussion turn and opens no goal |

Kept (section 5 of WORD_LISTS.md): WhatsApp STOP words, the 112 text, the health cut,
phone scrubbing. Not touched: `answerNotTagged` (negatedTerm), `asksWhoHoldsAPost`,
`looksLikeContactInstruction` and the other instruction readers — not in group 4's list.

Costs to watch on a fictional seat (DONE WHEN each holds):
- a „გამარჯობა" now takes a full model turn (seconds, not the server's instant line) and
  must not open a goal or call tools; the thread keeps „ახალი საუბარი" until something
  is named.
- a typed need with no new-goal button: the run calls create_task first, in the same turn.
- „ჯერ მკითხე, ლიდები არ მინდა" → set_discussion(true), then question-only turns with no
  goal; „ახლა მოძებნე" → set_discussion(false) and the search runs.
- an ask_contact carries `kind`; the reader's WhatsApp buttons match it.

## Notes for the lead session

- Migrations on this branch: 296, 297, 298, 299 (main ends at 295 per the lead).
- Migration number 296 was the next free one on this branch's base. If main took 296
  meanwhile, rename the file to the next free number before merging — nothing else
  refers to the number.
- K3 touched three existing files with one delimited line each (plus an import):
  `taskAsks.service.ts` (after the task_asks INSERT), `tools/requestIntroduction.ts`
  (after the introduction INSERT), `taskEngine.service.ts` (`deliverOwedAnswers` event and
  `tick`). The source-text test `theAnswersAreOnScreenFirst.test.ts` was updated to the
  wrapped event call.
- K7: the result card is still only the live `run_complete` event (as before this branch);
  a card the owner was not looking at survives as the reply text plus the push. Storing the
  card itself would be a client change, so it is not in this branch.
- A step event whose wake falls in quiet hours is held like any other wake; the step has
  already moved, so the next run reads it in the „where we are" block (K4).

## Questions for Misho

1. **What does a plain (not delegated) approval NOT cover?** Today an approved plan already
   covers asking its people and (0ab4ca9) the introductions they lead to. Built now:
   `delegated` is stored and the run is told „do not ask about small things inside the
   plan"; the server walls are the same either way. *Recommendation:* keep it that way —
   a plain yes covers the plan's steps as written; a delegation additionally lets the run
   fill in what the plan left open (the order among the plan's own people, an `on_named`
   person being asked when the step said only „introduce") without a new plan version.
   The second part needs a consent-wall change in `planAllows` and is NOT built — it is
   the lead session's area (stage 1 walls). Continuing with the recommendation.
2. **Should the server enforce `ask_owner` steps, or only tell the run?** Built now: the
   step event and „სად ვართ" say the step needs the owner's word; an ask to that step's
   person is still allowed by the plan wall, because the person is in people_to_involve.
   *Recommendation:* enforce it — refuse an ask/introduction whose only step is an
   `ask_owner` step until the owner has written since that step started (structure, no
   words read). It is a consent-wall change in `chat.service.ts`, so I left it for the
   lead session to place beside the stage-1 walls rather than edit the same lines.
