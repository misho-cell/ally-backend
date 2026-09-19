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

### 1. A zero-balance test account, so the swallow bug can be observed at all

**What.** Set one test account's token balance to zero — the statement, the
account and the undo are in `ADMIN_WRITE_OPERATIONS.md` §14, written and NOT
run.

**Why we cannot.** It is an admin write on live rows, which is Misho's word
whatever the hour, and the hour is exactly when a relayed yes is least
checkable. It costs nothing and reverses completely, and that is not the point.

**Why it is worth his morning.** The seat has made the swallow bug reproducible
on demand — at zero balance the FIRST message after the wall is stored and
every one after it disappears with no error — and the `[msg-in]` log line that
settles whether those requests reach the server at all has been live since
20:02. One run answers it.

**And the fixture problem underneath it, which is its own small finding.** We
reserved 171941 as the empty-wallet account and it cannot serve: **a first
login automatically grants 250**, seen on three accounts tonight. So the
product currently has no observable zero state — looking at it requires signing
in, and signing in funds it. Row 157's whole surface can only be reached by
arranging it deliberately.

**What is blocked:** the swallow test, and nothing else. It was the last open
item on my own list rather than a gate on anything.

The 18/19 September list was worked through with Misho item by item between
05:00 and 07:30 on the 19th, in his own conversation, and is cleared from here
so the next night starts on a clean page. Nothing was deleted to make it look
finished: what was DONE moved to `ADMIN_WRITE_OPERATIONS.md`, what is still
open moved to the section below with who holds it.

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
