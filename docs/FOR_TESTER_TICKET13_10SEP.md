# Row 42 — the eight changes to the 48 personal questions, one status line each

Rewritten 21 September 2026. The original was written on 10 September and lost
with a container before it reached the folder; this is not that file recovered,
it is the same question answered again from the live database and the code.

**The eight are the seat's own list** (their 386, from
`FOR_MISHO_ANSWER_T324_2026-09-03.md` Part 1, reproducing the Ticket 6 close of
22 August). I could not read them anywhere — they are not in this repository —
and the row sat blocked for eleven days partly because it said it needed the
row's TEXT, which had been in the box since 15 September, rather than the list.

**Every line below was checked today against `question_bank`, `answer_events`,
`outcome_events`, `profile_dimensions` and the code. None of it is inferred.**

**All eight landed in one commit: `aaf8eba`, 8 September** — „Ticket 11: the
founder's eight decisions in code, and the mechanical scrubber". The seat's
reading of 3 September predates it by five days, which is why their note has
change 7 as missing.

---

## READ THIS BEFORE THE SIX „DONE"s

**„Done" here means built, and correct in schema and code. It does not mean
exercised.** The whole profile system has almost no traffic:

| | rows |
|---|---|
| `answer_events` | **6** |
| `profile_dimensions` | **4** |
| `question_bank` | 43, all active |
| `outcome_events` | **220** |

Six answers have ever been recorded. So for changes 1–6 and 8 the evidence is
the schema, the code and the seeded question rows — not behaviour under load.
`outcome_events` is the one exception and is genuinely running.

**43 questions, not 48.** The row's title says 48; the live bank holds 43
active rows and the seat's own list says „35 of the 43". Flagging the
discrepancy rather than quietly adopting either number.

---

## THE EIGHT

### 1. `immediate_use` localised and shown at the moment of asking — **HALF** (`aaf8eba`)

The columns exist: `immediate_use_ka`, `immediate_use_es`, `immediate_use_en`.

**Georgian is complete — 43 of 43. Spanish is 0. English is 0.**

The second half of the requirement — the frontend rendering it beside the
question BEFORE the tap — is not mine to verify and I have not. The seat's own
wording is the right test: „acceptance is on the screen, not in the table."
**Nothing here says it is on the screen.**

### 2. Multi-select on two questions only — **DONE** (`aaf8eba`)

| question | `select_mode` | `select_max` |
|---|---|---|
| `onb_primary_goal_001` (question 1) | multi | **3** |
| `val_project_pull_505` (question 33) | multi | **2** |

Every other row is `single`. `answer_events.option_ids` is an array column.

**The by-count scoring is there too**, which was the part most easily missed —
`score_vector` on question 1 reads
`{"_by_count": {"1": {"goal_clarity": 0.7}, "2": {"goal_clarity": 0.3}, "3": {"goal_clarity": -0.1}}}`,
and `scoring_note` says it in words: „goal_clarity is derived from the NUMBER
of options chosen". Exactly the +0.7 / +0.3 / −0.1 specified.

### 3. Goal binding on four questions — **DONE** (`aaf8eba`)

`goal_bound` is true on exactly four, and they are:

- `onb_connection_type_002`
- `goal_relationship_type_102`
- `goal_first_task_104`
- `col_new_contact_worth_705`

**Not verified:** that the selector actually skips them when no goal is active.
That is a behaviour, and with six answer rows in the table there is nothing to
read it off. Schema and count are right; the skip is unobserved.

### 4. Free-text „სხვა" on 35 of the 43 — **DONE** (`aaf8eba`)

**35 rows carry an option with `free_text`** — the exact number asked for — and
`answer_events.free_text` exists as its own column.

**Not verified:** that an „other" answer moves no score. The rule is stated in
the ask; I did not find a test pinning it, and no such answer has been
recorded.

### 5. New categories and a surface — **DONE** (`aaf8eba`)

| | value | questions |
|---|---|---|
| `category` | `pressure` | 2 |
| `category` | `current_state` | 2 |
| `surface` | `after_rejection` | 1 |

The full surface spread: `any` 24, `onboarding` 7, `weekly_review` 6,
`message_draft` 3, `meeting_prep` 2, `after_rejection` 1.

**Not verified:** that `after_rejection` never fires except after a refused
request. One question carries it and nothing has fired.

### 6. A ninth dimension, `pressure_response` — **HALF** (`aaf8eba`)

**The evidence ladder exists and names it.** `taskStore.service.ts` carries
„DROPPED — the outcome ladder's evidence for `pressure_response`", and the
ladder is producing: 178 `dropped` rows in `outcome_events`.

**Nothing computes or writes the dimension.** `profile_dimensions` holds
`goal_clarity`, `boundary_style` and `network_curation` — and **zero**
`pressure_response` rows. The word appears in the codebase exactly once, in
that comment.

So: the input is being collected, the dimension is not being produced. **The
„never shown to the user as a label" half is trivially satisfied, because there
is nothing to show.**

### 7. `outcome_events` — **DONE, AND THE ONLY ONE ACTUALLY RUNNING** (`aaf8eba`)

The table exists with the columns asked for — `user_id`, `subject_type`,
`subject_id`, `outcome`, `next_action`, `created_at` — and **220 rows**.

**Both halves the seat said certainly did not exist are there:**

| subject | outcome | rows | |
|---|---|---|---|
| task | `dropped` | **178** | ← abandonment |
| intro_request | `no_reply` | **19** | ← silence |
| task | `rerouted` | 14 | |
| intro_request | `accepted` | 8 | |
| intro_request | `declined` | 1 | |

Their note said „the two halves that certainly do not exist are SILENCE and
ABANDONMENT". Both exist and both are producing rows. That reading was correct
on 3 September and the commit landed on the 8th.

### 8. Rotation state — **DONE, DERIVED** (`aaf8eba`)

Built the cheaper of the two ways they offered, which was left as my call.
`partH.service.ts` says so in its own comment — „rotation DERIVED from the last
non-skipped answer: its category goes to `avoidCategory`" — and the query reads
the last non-skipped answer's category and excludes it from the next pick.

**No column, no migration.**

---

## THE TALLY

| | |
|---|---|
| done | **6** — changes 2, 3, 4, 5, 7, 8 |
| half | **2** — change 1 (Georgian only, screen unverified), change 6 (evidence yes, dimension no) |
| not started | **0** |

**And the honest qualifier again, because six „done"s in a row invite the wrong
reading:** with six rows in `answer_events`, changes 1–6 and 8 are proved in
schema and code and not in behaviour. Only change 7 has run at scale.

## WHAT WOULD CLOSE THE TWO HALVES

- **Change 1:** the Spanish and English `immediate_use` strings (43 each), and
  the frontend rendering the line before the tap. Neither is mine.
- **Change 6:** a rule that turns the `dropped` / `no_reply` ladder into a
  `pressure_response` value. The evidence has been accumulating for two weeks —
  178 rows — so whoever writes it has data to write it against.
