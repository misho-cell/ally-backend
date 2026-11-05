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
| design | done | (this commit) | |
| K1 | done | (see log) | `planSteps.ts` (parse/structure), `planStepsText.ts` (card line), `planStepsSchema.ts` (tool schema); `parsePlan` reads `result_when`/`steps`; card + engine prompt show the steps line. Test: `planSteps.test.ts` |
| K2 | todo | | |
| K3 | todo | | |
| K4 | todo | | |
| K5 | todo | | |
| K7 | todo | | |
| K10 | todo | | |
| K12 | todo | | |

## How to test (fictional seats)

- K1: on a test seat, give a goal; the run's propose_task_plan may now carry `steps`.
  DONE WHEN the plan text in the reply ends with „ნაბიჯები: 1. ვკითხავ — … ; 2. …" and a
  step marked `ask_owner` reads „(აქ შენს სიტყვას დაველოდები)"; an old-shape plan reads
  exactly as before; a step naming somebody not in people_to_involve is refused with the
  fix named (`step s2: … is not in people_to_involve — add them there too`).

## Questions for Misho

(none yet)
