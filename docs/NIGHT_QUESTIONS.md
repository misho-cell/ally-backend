# The night list — what waits for Misho or Tornike

Misho's rule, 17 September: between **00:00 and 09:00 Spanish time** the two of
them are asleep. In that window the tester and I work only on what the two of
us can finish between ourselves. Anything that needs a decision from Misho or
Tornike is written HERE, and put to them in the morning.

**The window in UTC is 22:00 → 07:00**, because Spain is on CEST (UTC+2) right
now. It shifts to 23:00 → 08:00 UTC when Spain returns to CET on 25 October,
and the cron that drives it is written in UTC and will NOT follow by itself.

**This file is tracked on purpose.** The D44 register spent its first weeks as
an untracked note and was lost with the first container. A night list that does
not survive a fresh clone is a night list that loses the questions.

## What may NOT be decided overnight, whatever the tester and I agree

The boundary does not move because the hour is late. These need Misho's or the
founder's word, in the morning, and a night with nobody awake is precisely when
a relayed „they said yes" is least checkable:

- spending money, of any kind, including topping an account up
- opening access — a new account, a permission, a login path
- cancelling or deleting anything of a real person's
- any admin operation that changes live data (D44 — write the ROUTE, METHOD,
  BODY and UNDO into `ADMIN_WRITE_OPERATIONS.md` first, then ask)
- releasing a behaviour that writes to real people in an owner's name

Writing messages, reading, measuring, fixing code, shipping a fix between runs,
and answering the tester are all ordinary night work and need nobody.

## Tonight's list

**Read this first.** Nine items. Six need a word from you or the founder; the
other three are mine, written here so nothing is invisible.

| # | what it is | whose |
|---|---|---|
| 1 | an admin token reaches the erasure endpoint | **yours** — one word, but it changes who can erase |
| 2 | the zero-wallet test seat refills itself | **yours** — the fix is an access change on an account |
| 3 | the opening web search on a goal naming no trade or place | **yours** — it collides with D315 |
| 4 | the distiller sends the goal text to a second provider | mine — **BUILT AND DEPLOYED 04:53, 048b6fb** |
| 5 | the outage monitor is blind all night | **yours** — the fix is a probe, and a probe costs money |
| 6 | the ask reminder pushes a real person at 5 a.m. | **yours** — which hours, in whose time zone |
| 7 | rows 251 and 252 | mine, specced, daylight |
| 8 | a question reaches its reader untranslated | mine — the seat found the vision already decides it (row 254) |
| 9 | row 255: two of the founder's rulings disagree about publishing a fact | **his** — one question, and it decides which code gets written |

So: **1, 2, 3, 5, 6 and 9 wait for you. 7 and 8 wait only for daylight; 4 is done.**

### 1. `privacy.routes.ts` takes an admin token on the erasure endpoint

Found at 21:47 by a new test that asks whether the auth middleware is MOUNTED
rather than whether it works. `privacy.routes.ts` mounts `authenticateJwt` and
**not** `requireUserRole`, and it carries the data summary, the export and
`deleteMyAccount` — which its own comment calls irreversible and rate-limits to
ten a minute for that reason.

**Not a cross-account hole.** An admin token acts on the ADMIN's own account,
never on somebody else's. What it means is that an admin JWT left in shared
client storage — the exact case `requireUserRole` was written for — reaches the
erasure door, and the account it would erase is the admin's own.

**Why we cannot decide it:** the file says it is deliberately not behind
`requireSubscription` („the right to erasure cannot depend on having paid") and
says nothing about the role, so the omission reads as unconsidered rather than
decided — but an admin flow we cannot see from the source may depend on it.
Adding `requireUserRole` is one word and it changes who can reach an
irreversible endpoint.

**What is blocked:** nothing. The test pins the current state, so whichever way
it goes is a deliberate edit.

### 2. The zero-wallet fixture refills itself every period

`171941` (Netai Test 11) is the reserved empty-wallet account and it is
carrying 245 tokens. Nobody granted them: `ensurePeriodGrant` credited 250 at
17:56 today, because its only condition is `subscription_status` being active
and every test seat's is.

Two of my own documents (§13 and §19 of `ADMIN_WRITE_OPERATIONS.md`) say
„171941 stays at zero". It cannot, by construction.

**Why we cannot decide it:** the fix is to make that seat's subscription
INACTIVE, which is an access change on an account. Removing the 250 is also a
ledger write and would last only until the next period.

**What is blocked:** any row 221 reading that needs a genuinely empty wallet.
Test 10's −6 tonight is real evidence and stands; Test 11 is not a spare for it.

### 3. Row 253's second half — the goal that names no trade and no place

Closed tonight: a person's name no longer reaches the search engine. NOT closed:
„I have a problem with my apartment" still fires an opening web search, which
returned Greensboro, North Carolina handymen.

**Why we cannot decide it:** the rule that would stop it is the positive test
`goalIntent.ts` has already measured and rejected — when a similar guard shipped
on 17 September it denied ten real goals their opening second-circle search and
nobody saw it for three days. And D315 says both searches RUN when a problem is
named. Two standing decisions point the other way; this needs the founder, not a
regex.

### 4. Row 253's other door — the distiller is a second provider

The skip added tonight sits AFTER `distilSearchQuery`, which is a model call on
OpenAI (`config/openai.ts`), not on the model that answers the conversation. So
on an introduction goal the name still reaches OpenAI to be distilled; what is
blocked is the distilled name reaching Tavily.

**Why we cannot decide it tonight:** the obvious fix is to skip distillation
too, and the distilled query is also what the SECOND CIRCLE searches with. Row
110 measured what a raw sentence costs there — a phrase matching 0 people, a
sentence timing out at 15 s three times. For an introduction goal the distilled
query is just the person's name, so raw text probably costs nothing — and
„probably" is what makes it daylight work.

**What is blocked:** nothing; it is mine to finish with a measurement, and
part of that measurement is now done. Every opening second-circle search whose
goal carries an introduction phrase, all of them ever:

    searches              40
    came back EMPTY       13
    failed                 0
    p50                2,663 ms

So 27 of 40 return somebody, which is why „skip the distiller too" is not a
one-line change on a hunch: on 27 occasions I would be changing the input of
something that was doing real work.

**MEASURED AT 00:44, AND IT KILLS THE EASY FIX.** I wrote above that for an
introduction goal „the distilled query is just the person's name, so raw text
probably costs nothing". That was me looking at the OUTPUT and not the INPUT.
Across the same 40 searches:

    distilled query   median  3 words   max  5
    raw goal text     median 14 words   max 34
    raw goals over 12 words                21 of 40

Row 110 measured what a whole sentence does to the second circle: „marketing
agency" as a phrase is on 0 people, and a sentence timed out at 15 s and
returned NOTHING, three times. Handing it the raw goal would put **21 of these
40 into exactly that regime.**

So skipping the distiller is not the fix — it trades a privacy door for half
the second circle on the goals in question.

**What is left, and it is the right shape anyway:** distil LOCALLY for this
case. The distiller's whole job here is to reduce „I want to be introduced to
X through Y" to the names, and that is a job for a few lines of code rather
than a call to a second provider. The model call goes, the short query stays,
and nothing leaves the building.

**DONE — 048b6fb, deployed 04:53 on 23 September.** `distilIntroductionLocally`
reads the name beside the phrase the owner used: after it in English, before it
in Georgian, four words at most, stopping at the clause. No call of any kind.

Measured against every introduction goal in `tool_call_log`, all 31 of them:

    identical to the model's query      11
    different                           19
    declined, falls back to raw text     1

Of the 19, most are the TARGET's name where the model took the bridge's, or
the model's filler dropped („contact", „introduction request", „and 8"); three
are goals where the model returned no name at all and found nobody, so the
local rule can only be better there. The one decline is the 19 September goal
quoted above — four sentences, the person being reached six words and a comma
from the phrase — and it falls back to the goal text as typed, which is this
module's existing path when the model fails. Slow, sometimes empty, never a
leak.

**What is NOT claimed:** that the local query finds the same PEOPLE. That is a
live measurement on a real book and it is with the tester.

### 5. The outage monitor is blind all night, and it took me until 22:41 to notice

`outage.sh` has three verdicts in its text and two in its exit codes. The third
— **NOTHING PROVEN**, meaning no errors AND no Anthropic call in the window —
exits 0, deliberately and with the reasoning written next to it: „a routine
that cries at every quiet hour gets ignored".

That reasoning is right for the day and it has a consequence nobody wrote down.
**At night, NOTHING PROVEN is the normal answer.** Three checks between 22:07
and 22:37 all reported 0 errors and 0 calls, because nobody is using the
product. The routine that runs this reads exit 0 as „the product answers" and
tells me to write nothing and end the turn.

So an outage that starts at midnight would be found by the first person awake.
That is the 22 September 12:04 blind spot — the one this file exists for —
stretched from fifty minutes to nine hours.

**What I did tonight:** the script now SAYS this in its own output, so nobody
reads a quiet night as a healthy one. That is honesty, not a fix.

**Why we cannot fix it overnight:** the fix is a positive probe — one cheap
model call when the window is empty, so that silence becomes evidence instead
of the absence of it. A probe costs money on every quiet check, and money is
Misho's. It also needs a number: how cheap, how often, and against which
account.

**And a habit of my own, worth admitting:** I have been running these checks as
`./scripts/ops/outage.sh 20 | tail -3; echo $?`, which prints TAIL's exit code
and not the script's. Nothing was missed — the verdict is also in the text and
I read it every time — but for hours I was quoting a number that came from the
wrong command. Fixed by capturing to a file and reading the code before the
text.

### 6. The ask reminder pushes a real person's phone at five in the morning

`sendDueAskReminders` writes the chat line AND fires `sendPushNotification`,
and it looks at no clock at all. It runs when the cron runs, 48 hours after
the question.

Measured over the whole history:

    reminders sent                              56
    to a non-test account                       46
    outside 08:00-22:00 Tbilisi                 13
      of those, to a real person                11

    the hours:  01 -> 1 · 04 -> 1 · 05 -> 3 · 06 -> 1 · 07 -> 3 · 23 -> 2

Eleven real people have had a lock-screen push in the middle of the night,
three of them at five in the morning. The wording is courteous — „if you have
a minute … if you do not know, tell me that too and I will stop bothering you"
— and the hour it arrives is not.

**Assumption named:** the hour is converted to Tbilisi. Most users are +995 and
not all, so 11 is close and not exact.

**Why we cannot decide it overnight:** this is behaviour that reaches real
people, which is one of the five things this file exists to hold back — and
the question is not „should there be quiet hours" but WHICH HOURS AND IN WHOSE
TIME ZONE. A person in Buenos Aires (+54, our second-largest group, 651
accounts) has a different night from a person in Tbilisi.

**What is blocked:** nothing else. Found at 23:19 by following up two replies
that had no model call behind them, which is the one thing `outage.sh`'s
NOTHING PROVEN branch asks a reader to do.

### 7. Rows 251 and 252 — both against the consent and privacy walls

Both specced tonight, neither built, each for a reason written into `TASKS.md`:
251 widens who the model may write to (an accepted introduction should put that
person inside that goal's plan), and 252 changes who is discoverable across
accounts (331 of 372 role facts are on a phone no tag can find). Neither is a
thing to change in the dark on my own reading, and today I proved the consent
wall had no tests at all until this afternoon.

**What is blocked:** nothing else waits on them.


### 8. A relayed question reaches a Georgian recipient in English

The seat found it in their own 00:03 stops and asked rather than filing it: on
a Georgian-framed ask thread the question itself sits in English inside the
Georgian frame — „Netai Test 3-ის ასისტენტი გეკითხება: \"Do you know a
reliable electrician…\"" — because the asker wrote in English.

**What the code says.** The FRAME is the recipient's, deliberately:
`openAskThread` takes their language and its comment says why („the caption
above this thread is the first thing they see of it, and it was Georgian on
every account in every country"). The QUESTION is `safeQuestion`, the asker's
own words, scrubbed for numbers and nothing else. There is no translation step
anywhere in the ask path — **and no comment saying there should not be.** Every
other deliberate choice in that file is argued in place. This one is not argued
anywhere, which in this codebase means nobody decided it.

**And the product says the opposite one path over.**
`goalQuestions.service.ts` instructs the model to relay a question „verbatim
(translate if the conversation is in another language)". The intent is already
written down — in the prompt for the neighbouring path, not in the code for
this one.

**ANSWERED AT 01:11 — THE VISION ALREADY DECIDES IT, so this is not a question
for the morning after all.** The seat quoted it: „the assistant … conveys its
meaning to the other assistant, which speaks to its own user in a suitable
tone. Meaning, conditions and agreements must be preserved accurately. Wording
and tone can be adapted to the recipient." Translate for the reader, meaning
exact. Filed as **row 254, Pr2, mine to build.**

**Why it is still not built tonight.** The night rule lists five things that
wait for daylight whatever the tester and I agree, and the fifth is „releasing
a behaviour that writes to real people in an owner's name". This changes the
words a stranger reads, in the asker's name. It is the one item on that list
this row lands on — and a founder's decision relayed through the box at one in
the morning is the least checkable kind of authority there is. Not about
doubting the seat; about the hour.

**Its price, measured so the row carries it:** 227 asks all time, 143 in the
last seven days, 64 in the last twenty-four. A model call per ask is real money
on the path we want to grow, and „it is only a few a day" stops being true this
week.

**Scope agreed with the seat at 01:43, all four points:** composed where the
frame is chosen; only when the two languages differ; the original always under
it, labelled, on BOTH hops; and on a failed translation the ORIGINAL goes out
rather than nothing — „an untranslated question beats a lost one".

**Their test, which makes the cost part of the done-when:** Test 3 asks in
English → Test 2 sees Georgian plus the original; Test 2 answers in Georgian →
Test 3 sees English plus the original; and a SAME-LANGUAGE control, Test 4 →
Test 3, makes **no translation call at all**. That last one is the one to write
the code around — the row is not done if it costs a model call on the majority
case where both sides already share a language.

**The source, checkable without either of us:**
`Netai_Vision_and_Action_Plan_EN_2026-09-08.docx`, section „Each person speaks
to their own assistant".

**The design risk that goes on the row:** translating the question means TWO
translations between two humans — ours outbound, and the one already working on
the answer's way back. Meaning survives one hop and drifts over two, and it
drifts exactly where the vision says it must not: a condition, a time, a price.
So „the original kept visible" is part of the feature on BOTH hops, not a
nicety on one.

**Recorded under it:** blemish 1 (the stop and cancellation lines following the
chat's language) is confirmed 11 of 11 by the seat, on every recipient thread
the five 00:03 stops touched — not a sample.

## Handed over, 22 September (07:15 UTC) — the 21/22 night

**All three were answered by Misho in one line at about 06:55 UTC —
„გააკეთე სამივე" — and all three are done. Nothing carried over.**

**1. A seventh fictional test account.** Asked for because rows 210 and 232
cannot be proved on the six: the assistant answers „already in motion" on a
pair that has been used, and all nine non-direct pairs were used on
21 September.

→ **Done, and no account was created.** Netai Test 7-11 already existed —
made 19 September in one batch, untouched since, unreachable only because the
hardcoded list stopped at six. Widened, verified first (§7a is why that is not
a formality), and registered as **§21 of ADMIN_WRITE_OPERATIONS.md**, which is
where the route, the reasoning and the undo now live.

**2. 3,000 tokens on 171872 for row 108's busy day.** Spend, so it waited.

→ **Done, 07:03.** 314 → 3,314, plus 250 each to Test 7, 8 and 9 for the chain.
Every row `admin_adjust` with its note, read back from the ledger. §19's route,
unchanged.

**3. What rows 229 and 231 actually say** — carried on the plate for days and
described in none of the versions I had.

→ **Answered, and the question should not have been asked.** Both are described
in full in the tester's message of 21 September (id 10825). I searched the box
from id 11000 and told everyone they were „described nowhere". They were in my
own inbox. 229: an invite link that does not attach the inviter, so no reward
can be computed. 231: two sends that failed and were reported to the owner as
under way.

## Handed over, 21 September (07:05 UTC) — the 20/21 night

Reported to Misho in his own conversation and cleared from here, so the next
night starts on a clean page. **Nothing was deleted to make the page look
finished:** each item says where it now lives.

- **A funded test account.** Still unanswered, and now asked twice. It lives in
  `ADMIN_WRITE_OPERATIONS.md` §14 (a zero-balance account, open since
  19 September) and §17 (the seat can now BE a test user and still cannot pay).
  **Blocks the seat's rows 210 and 217, both Pr1.**
- **The nine old messages carrying a private mobile with no source.** Moved to
  `ADMIN_WRITE_OPERATIONS.md` §18 — registered, not run, with the measurement,
  both arguments, the route it WOULD be, and an undo that is worse than most in
  that file. **A decision, not a task. Nothing is blocked on it.** The seat is
  putting the same item to the founder (their 384).
- **`POST /requests/:ref/:action` — three possible shapes.** Not a D44 item: no
  live data changes, it is an API design choice. It lives in `TASKS.md` with
  all three and their costs. The seat cannot reach that route today and knows
  it.
- **Lika's error.** Information, not a decision — the cause was my deploy and
  it is fixed (`e0bb608`). Kept in the section below.

## Handed over, 19 September — what came off the list and what did not

### Settled overnight and recorded elsewhere

- **The hybrid final-answer writer is off.** Misho's own direct word. Two
  variables, not one — `SEARCH_QUERY_MODEL` pinned to `gpt-5.6-terra` first so
  the search-query distiller could not be switched off by the same change.
  Route, method, body, undo and the measured saving are in
  `ADMIN_WRITE_OPERATIONS.md` section 6. **Not yet proven off**: nothing had
  run when it went live, so the first real run is the evidence, and the seat
  has been asked for it.
- **The undo value was never lost.** The list said it could not be read back.
  It could: `usage_events` records the model of every OpenAI call, one name
  across seven days. Corrected in place in section 6.
- **Row 10 / the case ending.** Shipped in `7f38e39`, live 07:12:09. Item 7
  above carries both the fix and the withdrawal of the wrong finding it
  replaced.
- **OpenAI's credits are back** — a successful call at 05:09:09 on the 19th,
  after the 429s of the 18th. It is no longer a reason to distrust a reading.

### Still open, ordered by what each one blocks

1. **The 49-character cut in `qa_rules_20_22`, item Twenty-four.** Needs the
   founder; sent to him through the seat's box (6899) with the exact before
   and after. Neither the seat nor I can PUT. **Blocks row 103**: if 103 ships
   first the six failures move from `task_step` into `quick_answer`, where that
   clause is waiting for them, and the fix will look as though it did not work.
2. **The base-prompt narrowing at character 13,101.** Founder's, same message,
   with the three questions that are genuinely his: which half does the damage,
   how wide the exception goes (as written it covers `ask_contact` and nothing
   else), and whether „anything irreversible" stays. Undo is free — the route
   versions. **Blocks** every remaining row 104 case that a goal block cannot
   reach.
3. **The false privacy sentence.** Misho has the corrected text; he has asked
   Lika about the screen name („the Data page in your profile") and will answer
   when she replies. Live and false in the meantime, which is the argument for
   not letting it sit.
4. **A narrow write capability for the three admin text routes.** Misho's
   decision, put to him on the 19th: today nobody can paste a 25,176-character
   prompt without hand-copying it, which is itself a way to break a prompt.
   **Blocks 1, 2 and 3 from being done by me at all.**
5. **The introduction follow-up — and it is bigger than the relayed ruling.**
   Misho's own design replaces „no second approval" with „ask the mediator once,
   up front, which way the answer should travel". Reading the code to build it
   turned up the thing that matters more: on accept, `deliverAcceptOutcome`
   takes the target's number out of the MEDIATOR's phonebook and hands it to
   the requester, and the mediator is never asked about that separately. The
   permissive default is the one nobody chose. Waiting on Misho for two things:
   whether „through me" means only withholding the number (half a day) or a
   real relay (days, and it writes to real people), and the Georgian wording of
   the question.
6. **Row 103 / the `as_goal` flag.** Frontend's to drop, after step 1 lands and
   after `looksLikeGoalRequest` learns the explicit „create a new goal" shape.
   Measured cost of dropping it today: 8 fixed, 6 lost.

   **NEW, 19 September 11:45 — the flag does not fire on every conversation,
   and the night's reading of the bundle said it did.** The seat typed a plain
   question into the live app at 11:27; thread 18448 was created at 11:27:22
   and the run stamped at 11:27:28, six seconds old and genuinely new, and it
   produced NO goal, in `quick_answer` mode. If the flag had reached the server
   there, `ensureGoalForRequest` creates a goal when `intent.asGoal` is true
   regardless of the sentence, so one should have appeared.

   Measured rather than left at one case — regular threads of the last three
   days:

       new threads                    249
       made a goal within 90 seconds  172   69%
       did not                         77   31%

   **What it does NOT settle, which is the part that decides the fix.** A
   thread with no goal may mean the flag was absent, or the run failed, or the
   path differs; a thread WITH one may be `looksLikeGoalRequest` doing its job
   rather than the flag. Separating them needs each of the 172 creating
   messages run through the rule — the seat's re-measurement, not mine to
   pre-empt.

   It matters before the fix is designed rather than after: the change that is
   right for „fires on everything" is not the change that is right for „fires
   on a button nobody presses", and 69% is neither.
7. **The missing Latin tag rows (7b).** 47 Georgian-only aliases across four
   accounts cannot be reached by a Latin query. A live-data write, so D44 and
   Misho's, and it needs a count across all accounts before it is proposed.

### Row 104's discriminator — measured properly this time, and it resolves

**Measurement only. Nothing is built and nothing is proposed; the founder
decides whether any of it becomes a rule.**

Re-run against 56 real goals of the last ten days, each joined to the message
that created it, using the product's own matcher instead of my eye — which is
what made the first pass wrong twice.

**The phonebook test ALONE is far worse than either of us thought.**

    caught     6 of 6 instructions
    wrong     34 goals called instructions
    precision 15%

Almost all of the 34 are one saved contact: owner 501 has an alias
`xatuna sologashvili tbilisi`, so **every** „I need a X in Tbilisi" matches a
name in his own phonebook. The seat's original worry — a contact saved under
an ordinary word turning a plain goal into an instruction — is real, and it is
worse than they feared. I reported on the 19th at 04:30 that it did not happen
once in fifty. That was the hand-comparison again, and it was wrong.

**With a contact verb required as well:**

    caught     6 of 6
    wrong      1
    precision 86%

**And the one remaining false positive is the seat's own safety phrasing.**
„I need a good bookshop in Tbilisi that sells English books. Search only,
write to nobody." — matched on „write to", inside a negation. The same shape
as row 215, where „no goal" was read as naming a goal.

**With a negation guard on the verb:**

    caught     6 of 6
    wrong      0

Three signals, each useless alone, exact together: the sentence names someone
in the owner's own phonebook, it carries a contact verb, and that verb is not
negated. 56 messages, three owners, no exceptions left over.

Two honest limits. Six instructions is a small positive class, and all six come
from two owners and two verbs („ჰკითხე", „მისწერე") — so this is evidence the
shape is right, not that the regex is finished. And the negation list was
written after seeing the one case it has to catch, which is the weakest kind of
rule; it needs cases nobody has seen yet before it is trusted.

### Not on this list, because they need nobody

Everything code-side is deployed. Live build **7f38e39**, `npm run verify`
clean at 2,840 tests, nothing held back on the branch.

## Older standing items — 18 September, kept for their evidence

The night list itself is cleared; these are what survived it and who holds
each one. Live build at the time of writing: **d086e9e**, plus the row 158
fix, all clean.

### Misho — money. RESOLVED 19 September, kept for the reading it spoils

**The OpenAI account had no credits.** From the live log, three times inside
the runs of 06:49-07:01 on the 18th:

    [search-query] not distilled (gpt-5.6-terra failed: 429 You have no
    credits remaining...)

What it broke while it lasted: the search-query distiller, so the opening
second circle was handed the whole goal sentence and timed out; and the hybrid
final-answer writer, so every reply fell back to Claude.

**Back as of 05:09:09 on the 19th** — a successful `gpt-5.6-terra` call in
`usage_events`. Left here because of what it means for anything measured on the
18th: a reading of „which model wrote this" taken that day was measuring an
outage, not the product. The hybrid has since been switched off deliberately,
so the question no longer arises for the final answer.

### Tornike — two decisions, neither urgent

- **The task_main language line.** The tester traced the Georgian-in-an-English-
  thread fault to their own block: 424 Georgian characters offered as examples
  of what to say, with no line saying they are wording rather than language.
  Their 176-character fix is written and unsaved, waiting on his word, and it
  takes the block to six characters under its ceiling — which they themselves
  call too tight, so it needs a view on where to find room.
- **Five sweep-sourced facts** are still matchable across the network on his
  account. His ruling of 17 September was about facts taken from a WEB PAGE; a
  guess drawn from his own conversation is different provenance, so his yes was
  not extended to them. Five rows, five calls, his word. Also: whether the
  hybrid stays on once credits return, on the two reasons that survive — a
  second final generated and discarded every run, and the reasoning leaks.

### Nobody — these came off the list overnight

- **The Maro Koshadze fact is down.** Misho's own word, executed and read back:
  5283 is private on both flags, its two siblings were already private, and no
  fact at confidence „mentioned" is public anywhere in the base. Recorded in
  `ADMIN_WRITE_OPERATIONS.md` section 5 with the route and the undo.
- **Row 108 is NOT waiting on Misho, and has not been since 17 September.** He
  ran the VACUUM (ANALYZE) on all three tables at 12:03-12:04 that day — the
  tables are clean, 309 dead rows of 21.3M on UserTags — and the searches are
  still slow. Every plate since, v45 and v47 included, still lists it as his.
  It is mine: my diagnosis was incomplete, he did exactly what I asked, and it
  did not fix it.
- **His app session** is back; he logged in at 09:52 Tbilisi.

### Row 108 — the one-scan rewrite. BUILT AND LIVE, and this entry said otherwise

**Corrected 19 September.** This section was headed „a measured candidate …
not yet built" and left standing after the thing it describes had already
shipped. It went out as `435746f` on 18 September at 09:14 and is in every
build since, including the live one. Anybody reading the file as it stood
would have gone and written it a second time.

**The change.** The second-degree search used to scan each bridge separately —
a LATERAL join, 305 of them on account 501. It is now one scan with
`"contactId" = ANY(<all the bridges>)`, in `searchSecondDegree.ts`, and the
code carries the measurement in its own comment:

    3 patterns   LATERAL 802.7 ms   one scan 802.3 ms    identical
    9 patterns   LATERAL TIMED OUT  one scan 4,114 ms
    9 patterns, ONE SCAN, BOTH tags AND aliases:  3,078 ms

The 9-pattern LATERAL was re-run three times and timed out every time, so it
was structural rather than load. Nine patterns is an ordinary distilled query.

**Equivalence was proven, not assumed:** same patterns, compared as sets both
ways, 23,711 rows each, zero rows unique to either side.

**Why this candidate and not the other two.** LIKE-first was 2,400x faster on a
rare term and 7x SLOWER on a common one. A single alternation was 4x faster at
three patterns and timed out at nine. Both were fast in the case tested first
and worse in the case that matters. This one is neutral in the small case and
decisive in the large one — no regime where it loses.

**Row 108 is still not closed.** 3,078 ms is the largest single cost in a goal
run. This turned a timeout into a slow search that returns, which is not the
same as fast.

### The real shape of row 108, found this morning and worth keeping

A query whose words actually MATCH this base is slow; one that matches nothing
is fast. From the tool log, with the distiller working and short queries going
in:

    English short queries    4.0 / 4.7 / 6.4 / 9.5 s    all returned
    Georgian short queries  16.3 / 17.0 / 17.4 s        all timed out

Both distilled, both short. „მცირე ბიზნესის ბუღალტერი" is three words and
dies; „licensed alpaca shearer Peru" is four and takes four seconds.

This matters for how the row is tested. Every impossible foreign goal the seat
uses to keep real people safe — Bhutan, Kyoto, Morocco, Patagonia — is by
construction a query that matches nobody, which is the one case that cannot
reproduce this. Those goals remain exactly right for row 203 and for anything
that must not reach a real person; they are the wrong instrument here.

### 9. Row 255 — D81 and D440 disagree, and one of them has to go

The night seat found a one-source note reaching another member as a flat
statement: Test 6's `occupation = 'tax accountant'`, written by Test 1 alone,
read back to Test 2 three times as fact. Their question was whether the
second-circle result carries how many members stand behind a fact.

**It does not** — each row carries one value per field and no count, so the
model cannot tell one source from ten. That part is server work.

**But the gate is not what its own comment claims, and that is the finding.**
`searchSecondDegree` gates those joins on `cf.is_public`, with a comment
reading „only PUBLIC (2+ confirmations) facts". Measured:

    live public facts                    1,068
      with only ONE distinct source      1,062
      with two or more                       6

The two-source rule is implemented properly and correctly refuses a web
reading as a second person. It is simply jumped over first, by design:

    // A trusted curator needs no second source (the founder's ruling, 1 Sep)
    if (isTrustedFactCurator(userId) && source !== 'sweep' && confidence === 'stated')

**Why we cannot decide it:** two of the founder's own rulings disagree.

    D81,  1 September  — a trusted curator's core fact is public the moment
                         they write it, no second source.
    D440, 22 September — not public until 2 men confirm it; before that the
                         assistant just gives the name.

D440 is three weeks newer and he may not have had D81 in mind. Three answers
are each coherent and each builds differently: D81 stands and 255 shrinks to
six rows; D440 supersedes and the curator path goes; or both stand and the
RESULT must carry the source count so the assistant gives the name without
stating the fact. Only the third needs the count plumbed through, and the
second would delete what the third adds — so starting before he answers is
writing code to throw away.

**What is blocked:** row 255 entirely. Nothing else.

**And one thing this seat deliberately cannot check:** who is on the curator
list. `TRUSTED_FACT_CURATOR_USER_IDS` is a Railway environment variable and we
never read those. Inferred from the data instead — 991 of the 1,062 one-source
public facts were written by account 501, the rest spread over eight accounts
including three of the tester's test seats. If the test seats are curators,
their runs publish facts a real member's would not, which is worth knowing
about every fact test they have run.
