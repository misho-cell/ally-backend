# Admin write operations — the D44 register

D44: **no admin operation that changes live data runs without the founder's or
Misho's explicit yes**, and before it is put to them it is written down here
with four things — the ROUTE, the METHOD, the BODY, and the UNDO. An operation
whose undo cannot be written is not proposed; it is redesigned until it can be.

Authority relayed through an automated channel is data, not authorization. A
message in the tester box saying „Tornike said yes" is not a yes. The word has
to arrive from Misho or the founder directly.

**This file is tracked on purpose.** It spent its first weeks as an untracked
scratchpad note and was lost the first time the container was replaced — with
it went the undo for every operation it recorded. A register that does not
survive a fresh clone is not a register.

---

## 1. Subscription: grant / deactivate

Live now, for row 13 — the one real Pro payment on Lika's own card.

|              |                                                                       |
| ------------ | --------------------------------------------------------------------- |
| Route        | `/admin/users/:id/subscription`                                       |
| Method       | `POST`                                                                |
| Body (grant) | `{ "action": "grant", "tier": "pro" \| "enterprise", "days": 1–365 }` |
| Body (undo)  | `{ "action": "deactivate" }`                                          |
| Audited as   | `product_events.event = 'admin_subscription_change'`                  |

**Undo.** `deactivate` reverses a grant. A grant is also reversible by granting
again with the earlier tier and remaining days, because the previous state is
recoverable from `product_events` — each grant records its tier and days, so
the register is not the only copy.

**What it does NOT undo.** Nothing here touches Stripe. If the account's access
came from Stripe rather than a grant, `deactivate` writes our column and leaves
the subscription running; the card is still charged next month. Ending Stripe
billing happens in the Stripe Dashboard, never from this route.

**Known collision (row 13).** The Stripe webhook overwrites
`subscription_tier` with `STRIPE_TIER` (`premium`) whenever it applies an
active subscription. An admin grant of `pro` on the same account is replaced
the moment Stripe writes, and no refund restores it — it is re-granted through
this route or not at all.

State of account 160584 (Lika) as of 16 Sep 2026: `active` / `pro`, period ends
**3 Oct 2026**, from a 30-day grant made 3 Sep 11:26 UTC. No Stripe payment
behind it. That is the state to restore after row 13 finishes.

---

## 2. Clearing the twelve goals that wait on a question nobody registered

**Put to Misho, not answered. Nothing has been run.**

Row 107 stops new ones. The twelve already in that state — a goal reading
`waiting_on_user` with `blocker = owner_question` and `question` null, so the
owner's sidebar asks them to answer nothing — are live rows on twelve real
people's goals. One of them, goal 3433, is the founder's own.

|        |                                                                                                                                          |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Route  | none — a direct `UPDATE` over `tasks`, run through the read-only path's write twin                                                       |
| Method | one statement, in a transaction, `LIMIT`ed to the identified ids                                                                         |
| Body   | clear `pending_question_at` on exactly those ids, leaving `question` as it is                                                            |
| Undo   | the previous `pending_question_at` per id is captured to a file BEFORE the update; restoring is the same statement with the saved values |

The undo must be written before the statement runs, not after. Without the
captured timestamps there is no way back, and „it was null anyway" is a guess
about twelve rows rather than a record of them.

---

## 3. Row 108 — the database maintenance

**Misho's direct word, 17 September: steps 1, 2 and 4 yes; step 3 no.**

### Step 1 and 4 — VACUUM (ANALYZE). NOT MINE TO RUN.

|             |                                                                                                                                                                                                                                                                 |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Statement   | `VACUUM (ANALYZE) "UserTags";` `"UserAlias";` `"UserConnectionPhone";`                                                                                                                                                                                          |
| Who runs it | Misho, directly. My only database path is read-only — the endpoint refuses anything but one SELECT, on a connection the server opens with `default_transaction_read_only=on` — and VACUUM cannot go in a migration because migrations run inside a transaction. |
| Undo        | none needed and none possible; it writes no row                                                                                                                                                                                                                 |

NOT about reclaiming space, which is what the word suggests. Measured: UserTags
32,421 dead of 21.3M (0.15%), UserAlias 1,801 of 8.4M (0.02%). What VACUUM
refreshes is the VISIBILITY MAP, which decides whether an index-only scan can
answer from the index or must visit the table per row — the 10,607 heap fetches
and 5,164 ms of disk wait behind the slow tag search.

### Step 2 — the insert scale factor. MINE, as migration 155.

|            |                                                                      |
| ---------- | -------------------------------------------------------------------- |
| Statement  | `ALTER TABLE <t> SET (autovacuum_vacuum_insert_scale_factor = 0.02)` |
| Applied to | UserTags, UserAlias, UserConnectionPhone                             |
| Undo       | `ALTER TABLE <t> RESET (autovacuum_vacuum_insert_scale_factor);`     |

UserConnectionPhone was added beyond what was named, and the migration says so
in its own text: it is the table with 520,505 inserts since its last vacuum and
no manual vacuum ever, so leaving it out would apply the fix to the two tables
that are not the problem.

### Step 3 — shared_buffers. REFUSED, and the premise was wrong.

The board asked to raise it „from 256 MB (the default)". Read off the live
server: it is already 8 GB (1,048,576 × 8 kB), and effective_cache_size of
12.25 GB points to a machine of about 16 GB — so it is already half the RAM,
twice the quarter being asked for. It is also the only one of the three that
needs a restart. Not run, and the board was told why.

---

## 4. The five test accounts — REVIEW_PHONE and REVIEW_OTP

**Asked by Misho, 17 September: „the test accounts do not work, and I need
five to give the tester."** The numbers themselves are not chosen here; they
are his, and this records what setting them does.

|        |                                                                                                                                                      |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Route  | none — two Railway environment variables, set with `scripts/ops/env.sh`                                                                              |
| Method | `printf %s "<value>" \| ./scripts/ops/env.sh set REVIEW_PHONE` (and `REVIEW_OTP`)                                                                    |
| Body   | `REVIEW_PHONE`: the numbers, comma separated, E.164. `REVIEW_OTP`: one fixed code                                                                    |
| Undo   | set either variable to an empty-looking value, or delete it in the Railway dashboard. The list is OFF unless BOTH are set, so removing one is enough |

**What being on that list grants.** Four things, and they are worth reading
together because no single file made them visible before:

- no SMS is ever sent to the number
- it verifies with the fixed `REVIEW_OTP` instead of a real code
- it passes the INVITE GATE as „the company invited itself" (added 17 Sep)
- it gets a 365-day `pro` subscription the moment it registers

**Why the fourth door had to be added, and it is the reason the accounts did
not work.** The OTP bypass has existed since ticket 11 and was never the wall.
`invite_only` is enabled on the live base, so a number nobody has invited —
no cohort code, no social proof — is refused at `checkRegistrationEligibility`
with `referral_required`, and the OTP check further down never runs. The bypass
opened the second door and left the first locked.

**The risk, stated plainly.** Anyone who knows the fixed code can log in as any
number on that list. So the numbers must be ones nobody else can receive SMS
on — either Misho's own, or numbers from a range that can never be assigned to
a real person. A stranger's number on this list is that stranger's account
handed to whoever holds the code.

**Setting a variable restarts the service.** `env.sh` says so in its own
header. It is a deploy, and it follows the same rule as any other: between
runs, never across one.

**No state to clean up.** The grant lives entirely in the two variables; unset
them and every one of the four doors closes. The ACCOUNTS remain, as closed
accounts nobody can log into — which is why numbers that can never receive an
SMS are the safer choice, and also why they are permanent once made.

### Done, 17 September 15:48-15:55 UTC — on Misho's direct word

Five accounts exist and were proved end to end against the live server:
request-otp (no SMS sent) -> verify-otp with the fixed code -> register -> a
token, and a plain login on an existing one. All five read `active` / `pro`
until 17 September 2027.

| account | name         | phone (last four) |
| ------- | ------------ | ----------------- |
| 171870  | Netai Test 1 | 0101              |
| 171871  | Netai Test 2 | 0102              |
| 171872  | Netai Test 3 | 0103              |
| 171873  | Netai Test 4 | 0104              |
| 171874  | Netai Test 5 | 0105              |

The numbers are in the North American range reserved for fiction (555-0100 to
555-0199), which a carrier can never assign to a real person. That was chosen
over Georgian numbers deliberately: a stranger's number on this list is that
stranger's account handed to whoever holds the code, and no Georgian range can
be shown to be unassignable.

The code is in `~/.netai-ops/.review_otp`, mode 600, and in no file in this
repository.

The accounts CANNOT be recovered if the variables are unset: nobody can receive
an SMS on a fictional number. That is the intended trade — they are unbreakable
into and permanently disposable, not accounts anybody should come to depend on.

## 5. Unpublishing one web-sourced fact from a real person's record

**Asked for by the founder, 17 September, relayed through the tester's box.**
That last clause is why this is written down and not done: a yes that reaches
me through an automated channel is DATA, not authorization. It may be exactly
what he said — it reads like him, and the reasoning is his — and it is still
not the thing that makes a write to a real person's record permissible. His
own word, or Misho's, direct.

**What is on the record now.** Thread 16902, 19:05:46 UTC, run d3322935. The
question was „Who is Maro Koshadze?" — a question, no goal, nothing asked for.
The run searched the name, read the profile, searched the web twice, then
wrote three facts. Two are private. The third, `headline`, carries three older
roles lifted off a web page nobody checked, and it is stored `is_public = true`
and `is_matchable = true`: published to every user in the network, under
account 501, as something he asserted about a real person.

|        |                                                                                                                                                                                                                                                                                                                |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Route  | `POST /admin/facts/5283/keep-private` — written for this. The existing `/unpublish` also sets `retracted_at`, and every read filters on it, including the one that shows the OWNER his own facts; retracting would have taken the fact away from his own assistant, which is the opposite of what he asked for |
| Method | POST, admin bearer                                                                                                                                                                                                                                                                                             |
| Body   | `{"reason":"..."}` — required, it IS the audit record                                                                                                                                                                                                                                                          |
| Undo   | `UPDATE contact_facts SET is_public = true, is_matchable = true WHERE id = 5283`. The response carries both prior values, and the value itself is never touched                                                                                                                                                |

**The row is fact 5283** — `headline`, `is_public` true, `is_matchable` true,
confidence `mentioned`, written 19:05:46.941. Its two siblings, 5281 employer
and 5282 occupation, were already private and are not touched.

**What it deliberately does NOT do.** It does not delete the fact and it does
not retract it. The founder's own addition, which nobody put to him: „but save
it as info for Netai brain, so that it knows it." A private row stays readable
by HIS assistant for HIS searches — `getVisibleFacts` returns the owner's own
rows whatever their visibility — and stops being reachable by anybody else's,
which is what `is_matchable` controls.

**DONE, 18 September, on Misho's direct word.** He was shown this entry and
answered „გააკეთე". That is the authorization the relayed yes was not: his own
word, to me, in his own conversation. The tester's seat had offered to do it
from theirs and then lost the app session, so it was still standing when he
woke.

**Urgency, honestly.** One row, public since 19:05. The exposure is that
another user's search could match on it and surface a claim about a real
person that nobody verified. That is real and it is not on fire; waiting for a
direct word is the right trade.

**The code half is separate and is already done** (`isAssistantsOwnReading` in
`contactFacts.service`): no NEW fact the assistant read on a web page can go
public or matchable, on any branch, and the moderator is no longer shown a web
line at all. That needed no live-data change and so needed nobody's yes.

## 6. Turning the hybrid final-answer writer off

**The decision is the founder's and the authorization is Misho's.** Tornike
said yes through the tester's box, which is data on my side and not
authorization; it is also a spend change, which is Misho's alone whatever was
said to whom. Misho gave his own word on 19 September: „გააკეთე და გაატესტინე
ტესტერს."

### What it is

`CHAT_FINAL_ANSWER_MODEL` is a Railway environment variable. When it holds a
model id, the last paragraph the user reads is written by OpenAI; everything
else in the run — every search, every guard, every decision — still runs on
Anthropic. Unset, the product behaves exactly as it did before that feature
existed.

### The undo was recoverable after all, and that is the main thing here

The night list said the old value „cannot be read back by me, so whoever flips
it must write it down FIRST or the undo is lost". That was true of the
variable and false of the fact. Every OpenAI call is recorded in
`usage_events` with the model it used:

    provider  model           calls (7d)   last
    openai    gpt-5.6-terra   465          2026-09-19T05:09:09Z

One model id and no other, across both `chat` and `search_query` kinds — which
also settles `SEARCH_QUERY_MODEL`, since a different value there would have
produced a second name. **The undo value is `gpt-5.6-terra`.** Read from the
ledger, not from the environment; `env.sh` still cannot list.

### The catch that would have broken something quietly

`searchQuery.service.queryModel()` is `SEARCH_QUERY_MODEL?.trim() ||
finalAnswerModel()`, and its own comment says „both unset = distillation off".
So emptying `CHAT_FINAL_ANSWER_MODEL` alone **also turns the search-query
distiller off** — the thing that stops a whole goal sentence, greeting and
all, being handed to the web search (row 126). It costs $0.041 a day against
the writer's $5.63 and nobody meant to switch it off.

So this is two operations in this order, and the order matters: the distiller
is never off in the window between them.

|        |                                                                                 |
| ------ | ------------------------------------------------------------------------------- |
| Route  | Railway variable, `scripts/ops/env.sh`                                          |
| Method | 1. `printf %s gpt-5.6-terra \| env.sh set SEARCH_QUERY_MODEL`                   |
|        | 2. `env.sh unset CHAT_FINAL_ANSWER_MODEL`                                       |
| Body   | above                                                                           |
| Undo   | `printf %s gpt-5.6-terra \| env.sh set CHAT_FINAL_ANSWER_MODEL`, and            |
|        | `env.sh unset SEARCH_QUERY_MODEL` to return it to its default                   |

`env.sh unset` did not exist before this operation and was written for it.
`set` refuses an empty value on purpose; the alternative was setting the
variable to a single space and relying on the `.trim()`, which works and
leaves a variable in the console that looks set to the next person who reads
it. The new verb is in the same shape as `set`: it cannot list, and it prints
the name and never a value.

### What it costs and what it saves

24 hours to 05:30 on 19 September:

    anthropic  chat          619 calls   $32.270
    openai     chat          125 calls   $5.632     ← this
    openai     search_query   48 calls   $0.041     ← stays on

Claude has ALREADY written a final by the time the hybrid runs and that one is
discarded — `chat.service.ts` says so in its own comment — so an enabled
hybrid pays for two finals and turning it off removes one of them. The saving
is the $5.63 and nothing moves to the Anthropic side.

### A set restarts the container. A REMOVAL DOES NOT.

`set SEARCH_QUERY_MODEL` triggered a rebuild at 05:30:06 and it went SUCCESS.
`unset CHAT_FINAL_ANSWER_MODEL` returned clean at 05:35 and produced **no
deployment at all** — three minutes of polling, nothing. The variable was gone
from the Railway console and still live in the running process, which is the
worst of the two states to be in without knowing it: the change looks done and
is not.

I had already written „Railway will redeploy" on that path, in this file and in
the script's own output, and the first wait loop I wrote was wrong in a way
that would have confirmed it — it watched the newest deployment for SUCCESS,
the 05:30 one was already SUCCESS, so it returned immediately and looked like a
successful wait. Both are corrected; `unset` now prints the opposite.

Forced with a push of `632b86c` to main, which carries only this file and the
script. Live at 05:39:37, clean boot, listening on 4000.

Run only when no thread is `working`. Checked before each command: zero
working, last activity 05:09:12.

## 7. Seeding the five test accounts with each other

**Not done. Waiting on Misho.** The seat put the shape to me and said it is my
hand and my call; the hand may be mine, the call is not. This entry exists so
that his yes costs him one reading.

### Why they are useless as they stand

    171870  Netai Test 1   aliases 0   created 17 Sep 15:49   never logged in
    171871  Netai Test 2   aliases 0   created 17 Sep 15:49   never logged in
    171872  Netai Test 3   aliases 0   created 17 Sep 15:49   never logged in
    171873  Netai Test 4   aliases 0   created 17 Sep 15:49   never logged in
    171874  Netai Test 5   aliases 0   created 17 Sep 15:49   never logged in

They were made for the introduction chain — one asks, one bridges, one answers
— and every step of that is contact-mediated. With an empty phonebook none of
them can see any of the others. Foreseeable when they were created, by me, and
not foreseen.

### The ordering question, answered from the code rather than guessed

The seat asked whether a first login even completes on an account with no
contacts, because if it stops at the contacts-permission step the seeding has
to land first.

**It does not stop.** `is_onboarding` is a STATE, not a gate, and there is an
explicit skip path (`markOnboardingSkipped`) — the product deliberately
supports „logged in, no contacts".

**But seeding still has to come first, for a better reason.**
`chat.service.ts:221`:

    return (await isOnboardingUser(userId)) ? 'onboarding' : 'quick_answer';

and `isOnboardingUser` is true for an account under seven days old with no
rows in `UserAlias`. All five are 17 September and all five have zero aliases,
so **every run on them today loads the ONBOARDING prompt**, not the mode the
chain rows are about. A chain test run before seeding would measure the wrong
prompt and look like a product fault.

Second-order, worth knowing before anyone plans around it: the window closes on
**24 September**, after which they drop out of onboarding mode by age alone.
That is a change in behaviour with nobody touching anything.

### The shape — the seat's, and the rule in it is the part I would have got wrong

A full mesh destroys the test. If everyone holds everyone, no introduction is
ever necessary and rows 210, 211, 125 and 205 become untestable in one stroke.
**The missing edges are the test.**

    A  171870  asker          holds  B, D, E      NOT C   <- the experiment
    B  171871  first bridge   holds  A, C
    C  171872  target         holds  B, D         NOT A
    D  171873  second bridge  holds  A, C, E
    E  171874  stranger       holds  A, D

A has two routes to C, through B and through D, which is what row 205 needs —
one approval must produce exactly one outgoing message — and nothing else in
the set provides it.

|        |                                                                      |
| ------ | -------------------------------------------------------------------- |
| Route  | No admin route exists for this. See „what it would take" below        |
| Method | INSERT into `"UserAlias"` only — 11 rows, one per edge                |
| Body   | The pairs above; every phone DERIVED from `"UserPhone"` by account id |
| Undo   | `DELETE FROM "UserAlias" WHERE "contactId" IN (…the five…)` — they had zero rows before, so the undo is exact and total |

**No phone number is written into this file or into the seed.** The five
already hold reserved fiction numbers (the +1 202 555 01xx range) and the seed
reads each one out of `UserPhone` by account id rather than repeating it. That
keeps D149 and is better engineering: a self-deriving seed cannot attach the
wrong number to the wrong account.

**No real person appears anywhere in it.** The seat's proposal to put two staff
numbers on A is NOT included here. Five people share one login code for these
accounts, so anyone holding that code could message those two — the same shape
as the phonebook-upload workaround the seat correctly refused, at smaller
scale. If a notification has to be watched arriving on real hardware, a
throwaway handset is the way, and it is the founder's to decide either way.

### What it would take, because I cannot run it today

`ro.sh` is read-only by construction and there is no admin route that writes
`UserAlias`. So this needs one of:

- **a migration** — deterministic, in git, reviewable before it runs, applied
  once at boot. My preference: it is the only option where the exact rows are
  read by a person before they exist.
- a new ops script, which is a second write capability on top of `prompt.sh`
  and should not be created for a one-off.
- somebody doing it by hand in a database console.

Nothing is written until Misho says which, and says yes.

### 7a. Before any seeding — one of the five numbers was already taken

**Found 19 September while checking the seat's report that the five are not
marked as staff. It is the more serious of the two findings and neither of us
was looking for it.**

The five test accounts hold numbers in the +1 202 555 range, chosen because it
is reserved for fiction. **In this database it is not unused.**

    rows in "UserAlias" on +1202555…    26
    all created                         22 August 2026, one day
    owners                              804 (10), 13926 (7), 18213 (7),
                                        5432 (1), 84246 (1)

That shape — one day, five owners, numbers scattered through the 01xx block —
reads as a seeded or imported test set from August rather than organic
phonebook data. Whatever it was, it is there.

**And one of them collides exactly.** Owner 5432 has a contact saved as
„Vigaca" on the number ending **0105**, created **22 August** — nearly a month
BEFORE `Netai Test 5` (171874) was created on that same number on 17 September.

So Test 5 is not a clean fictional account. It is a member account sitting on a
number a real owner already had in their phonebook, which means that owner's
assistant can see that contact as a Netai member, and anything ever sent from
or to Test 5 touches a real person's phonebook entry.

    0101  0102  0103  0104    clean
    0105                      TAKEN since 22 August

**Nothing should be seeded until this is decided.** The cheap fix is to move
Test 5 to a number checked for collisions first — and the general rule this
earns is that a „reserved" range is only reserved until somebody checks, so the
check runs before the accounts are created, not after.

### 7b. The five are not marked staff, and the fix cannot be applied blind

The seat is right: all five read `staff: false`, and row 50 says staff and test
accounts never appear in any list. `staff` is not a database column — it is
`STAFF_USER_IDS`, an environment variable, plus the review phones and the
curators (`src/services/staff.ts`). And it is a real filter rather than a
label: `targetScoring.service.ts` passes `account?.staff === true` into
`exclusionFor`, so an unmarked account is eligible where a marked one is
excluded.

|        |                                                                    |
| ------ | ------------------------------------------------------------------ |
| Route  | Railway variable, `scripts/ops/env.sh set STAFF_USER_IDS`          |
| Method | Append the five ids to the EXISTING value                          |
| Body   | the current value + `,171870,171871,171872,171873,171874`          |
| Undo   | set it back to the current value                                   |

**I cannot do this blind and will not.** `env.sh` cannot read, by design, and
this variable is a LIST: writing five ids over it would silently remove
whoever is in it now — the module's own doc says it exists because an ex-staff
member ranked first on a target list, so it is very unlikely to be empty.
Unlike `CHAT_FINAL_ANSWER_MODEL`, there is no ledger to recover it from.

So whoever flips this reads the current value first and appends to it. That is
the same failure I got wrong this morning in the other direction, and the
lesson generalises: **a write-only capability is safe for a scalar and unsafe
for a list.**

**Urgency, honestly.** Nobody has logged in to the five, so they have no
contacts and no activity to rank on. The one that can surface today is Test 5,
through the 0105 collision, on owner 5432's account. That is one row and it is
not on fire; it should be fixed before anyone logs in, not tonight.

#### The floor to check a read against — and why three is not enough

The seat offered {501, 160584, 167250} as a sanity check: if a read of the
variable comes back without them it is wrong. Right idea. **The list is
incomplete, and I only know that because I probed instead of accepting it.**

Every id that reads `staff: true` on the admin route, 19 September:

    501     160584    167250    116793    165699    118509    525

Seven, not three. A read validated against the seat's three would have passed
while dropping four people back onto target lists — which is the exact harm the
check exists to prevent.

**And even seven is a floor rather than the set.** There is no route that
LISTS staff; the only way to learn an id is staff is to ask about that id, so
this is „the ones I thought to try". Anybody doing the write should treat a
read that contains all seven as *not yet disproved*, not as confirmed.

**One more trap in using it as a check at all.** `isStaffUser` is the union of
TWO environment variables — `STAFF_USER_IDS` and
`TRUSTED_FACT_CURATOR_USER_IDS` (`staff.ts`, `contactFacts.service.ts`). So a
`staff: true` id may be a CURATOR and not in `STAFF_USER_IDS` at all. A read of
`STAFF_USER_IDS` that is missing one of the seven is therefore not necessarily
a bad read, and „fixing" it by adding curator ids into the staff variable would
be repairing a fault that does not exist. The seven validate the UNION; nothing
here validates either half on its own.

## 8. The two approved prompt texts — authorized and applied

**Misho's direct word, 19 September: „გაუშვი" on both, in his own
conversation.** The founder had approved the texts themselves the day the seat
put the exact before and after to him (handoff 6997); that yes arrived through
the box and was data on this side, which is why both sat ready and unapplied
for four hours.

Both go through `scripts/ops/prompt.sh`, whose four refusals and the change
files are documented in `scripts/ops/README.md`. The route, method, body and
undo for each live in the change file itself, committed before either was run:

    ops/prompt-changes/20-cut-item-twentyfour.{json,before.txt,after.txt}
    ops/prompt-changes/20-narrow-base-prompt.{json,before.txt,after.txt}

### Order, and it is not a preference

The cut lands FIRST. If the row 103 goal-box change ever ships before it, the
six failures move out of `task_step` into `quick_answer` where that clause is
waiting for them, and the fix looks as though it did not work. The narrowing
has no such coupling and follows.

|        | 1. the 49-character cut                  | 2. the base-prompt narrowing        |
| ------ | ---------------------------------------- | ----------------------------------- |
| Route  | `PUT /admin/prompt-blocks/qa_rules_20_22`| `PUT /admin/system-prompt`          |
| Method | `prompt.sh apply 20-cut-item-twentyfour` | `prompt.sh apply 20-narrow-base-prompt` |
| Body   | 15,176 chars, `ff1e80d9…`                | 25,542 chars, `32851709…`           |
| Undo   | PUT the captured before-text back, `3131aac5…` | free — the route INSERTs, so every prior version is kept; before-text `0cc31128…` |

Ran with zero threads working. Neither is a container restart; both take
effect on the next run that loads them.

### Outcome

**Both live, 19 September, and verified from the database rather than from the
script that wrote them.**

    1. block:qa_rules_20_22    15,225 -> 15,176 chars   ff1e80d9a567
         the clause is gone:  content LIKE '%a message sent without their
         yes on the wording%'  ->  false

    2. ai_config               25,176 -> 25,542 chars   328517097030
         new row id 2080; 2047 still present, so the undo is free
         'you draft, they send'      -> false   (gone)
         'APPROVED PLAN already names' -> true  (in)
         'irreversible' occurrences  -> 1       (survived exactly once)

**The read-back path is exercised for the first time and it held.** Until this
morning it was the one guard that could not be tested without a PUT; both
applies reported success only after re-reading the live text and matching it
against the after-hash.

### The boundary, which is now a query rather than a clock

    base_prompt_id   2047  ->  2080

Any run stamped 2080 saw the narrowed wording; any run stamped 2047 did not.
`block_versions` moves the same way for `qa_rules_20_22`. That is what
migration 157 was built for this morning, and it is why the seat asked for it —
so the fifty can be re-measured against the build boundary instead of against a
wall clock.

### What is NOT proven

That the change does what it is for. Nothing has run since the applies, so no
run has yet been served the new base prompt. Applied, verified, unproven — in
that order, and the first stamp carrying 2080 is the evidence.

## 9. Ten test accounts — and the second list variable nobody had noticed

**Misho, 19 September: Test 5 „პირველი" (retire and replace), and „ოკ იყოს 10".
Both his own word. Nothing below is done.**

### How the five were made, which decides how the next six are made

Section 4 records it: not through an admin route — through the ORDINARY
registration flow, which those numbers can complete because they are on
`REVIEW_PHONE` with the fixed `REVIEW_OTP`. That bypass is the only reason an
account can exist on a number that receives no SMS.

**So a new test account cannot be created until its number is on
`REVIEW_PHONE`. And `REVIEW_PHONE` is a LIST.** Same trap as `STAFF_USER_IDS`,
found the same way, an hour apart: `env.sh` cannot read it, so appending blind
would silently drop whatever is in it — and what is in it is the set of numbers
that can log in without an SMS. Dropping one there locks somebody out rather
than exposing them, which is a different failure and not a smaller one.

**Two list variables, one sitting.** Whoever appends `STAFF_USER_IDS` should
append `REVIEW_PHONE` at the same time, because each one restarts the service.

### The six new numbers, collision-checked before they exist

    +1 202 555 0106  0107  0108  0109  0110  0111

Checked against `UserAlias`, `UserTags` and `UserPhone` — zero rows on any of
the six, under digit normalisation and not only as a string match. That is the
check that was not run in September and is the reason Test 5 collided.

**And the range really is in use, measured both ways so the number is not
argued about later.** Rows whose normalised digits begin `1202555`: **26 rows
on 19 distinct numbers**. A looser `%202555%` substring match returns 96, but
that includes numbers merely containing those digits and is not the figure.

These are numbers a carrier can never assign to a person, so they are written
here in full rather than masked: D149 protects real people's numbers, and
masking a fiction number would only make the instruction unusable.

|        |                                                                        |
| ------ | ---------------------------------------------------------------------- |
| Route  | none — `scripts/ops/env.sh set REVIEW_PHONE`, then the public register flow |
| Method | append the six to the EXISTING value; then request-otp → verify-otp → register, once per number |
| Body   | current value + `,+12025550106,…,+12025550111`                          |
| Undo   | set `REVIEW_PHONE` back to its current value. The ACCOUNTS remain — they always do, which is why the numbers must be unassignable |

### Order

1. Misho appends `REVIEW_PHONE` and `STAFF_USER_IDS` in one sitting
2. I create six accounts through the registration flow, and verify each
3. Test 5 (171874) is retired — it keeps existing, as every account does; what
   changes is that it is never used and is marked
4. the ten are marked staff, and I verify id by id rather than checking a list
5. the contact graph is seeded, by migration, from a change file he approves

Steps 2 to 5 are all his word already; step 1 is the one that has to happen
first and is the one neither the seat nor I can do.

## 10. Goal 5314 — clearing the wake that a resume would fire

**Not done. Needs Misho.** The goal is paused and the pause holds; this is
about what happens the moment anybody un-pauses it.

### What happened, in one paragraph

19 September 12:03, on the founder's account. The seat typed „tell Tornike
Abuladze I can do Thursday" into a brand-new conversation. That run surfaced a
waiting question belonging to goal 5314 — an unrelated meeting — and then, in
the same run, called `answer_goal_question` with „Lika actually says she can
do Thursday (24 September)". A person nobody typed, a date nobody proposed.
The goal woke, rewrote its brief, armed a chase for the next day, and **sent a
real question to a real person** (ask 2443, 12:05:43, status `sent`). No plan,
no card, no yes.

### Why the row still needs a write

Pausing does NOT clear the wake. `goalDashboard.service.ts` renames the column
on a paused goal — `next_wake_at` reads null and the same value appears as
`wake_held_at` — but the column keeps its value, and the code says so
deliberately: „`updateTask` leaves it on a pause so a resumed goal picks its
schedule back up."

    tasks.id 5314   status paused   next_wake_at 2026-09-20T12:05:41.057Z

`getDueTasks` is `status = 'open' AND next_wake_at <= NOW()`. By tomorrow
lunchtime that time is past, so **resuming this goal sends the message again
within one tick — sixty seconds.** Not a risk; the behaviour.

|        |                                                                      |
| ------ | -------------------------------------------------------------------- |
| Route  | none — direct SQL, and I have no write path, so this needs a hand or a migration |
| Method | `UPDATE tasks SET next_wake_at = NULL WHERE id = 5314`               |
| Body   | above — one row, one column                                          |
| Undo   | `UPDATE tasks SET next_wake_at = '2026-09-20T12:05:41.057Z' WHERE id = 5314` |

**What it does not touch.** Not the brief, not the ask, not the status. The
false brief text stays exactly as written because it is evidence, and ask 2443
stays `sent` because it was.

**Why it is worth doing rather than relying on the warning.** Right now the
only thing protecting her is that three people have been told not to press
resume. That protection expires the moment somebody who has not read this
exchange opens the goal — and the dashboard will show them `next_wake_at:
null`, which reads as safe.


## 11. Seeding the test graph — chain one

**Not applied.** The file is `ops/pending-migrations/158_seed_test_graph.sql`.
Anything under `src/db/postgres/migrations` runs at the next boot, so it is
deliberately NOT there: **moving it into that directory is the act that needs
Misho's word**, and until then it is text to read.

### Why a migration and not the tool that was asked for

The seat asked for a seeding tool in `prompt.sh`'s shape — an allowlist, a
change file, `check`, `apply`, `undo`. That shape needs a write route to
`UserAlias` and none exists; building one adds a live contacts-write
capability for a job that runs once.

A migration keeps the part that actually matters — the exact rows are in git
and a person reads them before they exist — without the capability. If
re-seeding between test runs turns out to be needed, that is when the route
earns itself, with evidence rather than in advance. The seat has already said
they will come back with evidence rather than a preference on that.

### The graph, and the rule it comes from

**The missing edges are the test.** Seed everybody with everybody and no
introduction is ever necessary, which deletes rows 210, 211, 125 and 205 in one
stroke.

    A  171870  asker          holds  B, D, E      NOT C   <- the experiment
    B  171871  first bridge   holds  A, C
    C  171872  target         holds  B, D         NOT A
    D  171873  second bridge  holds  A, C, E
    E  171936  stranger       holds  A, D

A has two routes to C, through B and through D — the only thing in the set
that can exercise „one approval, exactly one message".

**E is 171936, not 171874.** Test 5 is condemned and is not in the ten.

|        |                                                                  |
| ------ | ---------------------------------------------------------------- |
| Route  | none — a migration, applied at boot once moved                   |
| Method | `git mv ops/pending-migrations/158_… src/db/postgres/migrations/` then deploy |
| Body   | 12 INSERTs into `"UserAlias"`, every phone DERIVED from `"UserPhone"` by account id |
| Undo   | `DELETE FROM "UserAlias" WHERE "contactId" IN (171870,171871,171872,171873,171936)` — exact and total, all ten had zero alias rows before |

Twelve edges, not the eleven section 7 estimated; recounted from the table.

### The other five, from the seat, 15:40

    F  171937  second asker    holds  G, I      NOT H   <- the experiment again
    G  171938  second bridge   holds  F, H
    H  171939  second target   holds  G         NOT F
    I  171940  the receiver    holds  F
    J  171941  wallet account  HOLDS NOBODY, AND NOBODY HOLDS IT

**F, G, H are a complete second chain**, to the same rule, so a retry does not
have to reset chain one first.

**I is spent on purpose.** The daily-cap row needs somebody asked until they
are over the limit; the „later" pair needs somebody who leaves a postponed
request lying around. Both dirty whoever they touch, so they touch a dedicated
account and neither chain.

**J is empty on purpose.** The token-out row is about the owner's own typed
text surviving when the allowance runs out — it needs no network, so an empty
phonebook is the cleanest read. **J having no alias rows after the migration is
the correct outcome, not a failure**, and the file says so in as many words so
nobody later reads it as one.

They dropped their own request for an untouched control pair to pay for I and
J, and said so rather than quietly asking for it back. If the wallet row gets
its own account later, J converts back at no cost — it has no edges to unpick.

**Eighteen edges** across nine owners; J appears nowhere. The undo is unchanged
in shape and now names all ten owners.


## 12. The graph, re-seeded through the product's own path

**Done, 19 September, on Misho's word („სამივეზე კის გეუბნები").** Section 11's
migration was the wrong instrument and this replaces it.

### Why the SQL seed did not work

A contact in this product is THREE writes, and `importContacts` does them in
this order, per contact:

    saveToPostgres()     alias + tags, one transaction
    saveToNeo4j()        MERGE (u)-[:CONTACT]->(c)
    triggerEnrichmentAsync()

**The second-degree search's bridges come from Neo4j**, not from Postgres —
`searchSecondDegree` returns `no_contacts_in_graph` two hundred lines before
any SQL runs. A migration can only ever do the first write, so the eighteen
edges were correct in Postgres and invisible to the product.

### What was actually run

No delete was needed, and that is worth recording because I had asked for one.
The import's alias INSERT is guarded by `WHERE NOT EXISTS (phone, contactId,
alias)`, so it skipped the rows the migration had already written and went on
to create the tags and the Neo4j edge regardless. The SQL seed turned out to be
a harmless head start rather than something to undo.

|        |                                                                    |
| ------ | ------------------------------------------------------------------ |
| Route  | `POST /contacts/import`, one call per owner, nine owners           |
| Method | log in as each test account (REVIEW_PHONE + fixed OTP), then import |
| Body   | the same eighteen edges as section 11, by name and phone           |
| Undo   | `DELETE FROM "UserAlias" WHERE "contactId" IN (…the ten…)` removes the Postgres half; the Neo4j edges would need a separate Cypher delete, which I have no route for |

    imported 3 2 2 3 2 2 2 1 1     skipped 0 everywhere

### Verified the way the seat asked — not by row count

    account  contacts  tags  firstDegree  secondDegree
    171870      3        6        3            4
    171871      2        4        2            3
    171872      2        4        2            3
    171873      3        6        3            4
    171936      2        4        2            4
    171937      2        4        2            1
    171938      2        4        2            1
    171939      1        2        1            1
    171940      1        2        1            1
    171941      0        0        0            0     <- correct, by design

`firstDegree` now equals `contactsCount` on every seeded account, tags exist
where there were none, and second degree is non-zero — which is the whole
thing that was missing.

**The acceptance test is the seat's and is deliberately not run here:** Test 1
asks for an introduction to Test 3, and PASS is Test 2 or Test 4 being named.
A count passing while the feature fails is what this section exists because of.

### One correction to my own earlier claim

I told Misho twice that seeding needed his hand for a session per account. It
did not. The test numbers are on `REVIEW_PHONE` with a fixed OTP, which is how
the accounts were created in the first place — `request-otp` → `verify-otp` →
`complete-login` returns a token for an EXISTING account too. I never tried it
and asserted it was impossible, twice.

---

## 13. Topping up the test accounts' token allowance — REGISTERED, NOT RUN

**Waiting on Misho's word. Nothing below has been executed.**

### Why it is being asked for

Test 1 (171870) spent its own allowance across 19 September's testing and
stopped at **balance -1** at about 18:16 UTC. That was not staged: the seat had
171941 reserved as the zero-wallet account and never needed it. Two live goals
(6205, 6238) can no longer run, and the seat's remaining paths are blocked.

**The -1 is not a fault.** `checkRunAllowance` allows a run whenever the balance
is above zero and the cost is only known after it: *"A run in flight may take
the balance slightly negative — that is deliberate grace; the next run gets
blocked."* One token over is that grace, working.

### What it costs, in real money, because tokens here are not play money

Today on Test 1: **97 provider calls, $2.2484**, for 251 tokens. So a token is
about **$0.009** and a full day of this seat's testing is about **$2.25**.

    1000 tokens  ~= $9    ~= four days at today's rate
    2000 tokens  ~= $18   ~= eight days

### ROUTE / METHOD / BODY

**There is no admin route for this.** No endpoint on `adminRouter` grants
tokens, and I am not adding one to solve a test-account problem — a route that
mints balance is a permanent capability, and this is a one-off. So it is SQL,
run by Misho in DataGrip exactly as goal 5314's `next_wake_at` was:

```sql
INSERT INTO token_transactions (user_id, amount, reason, external_id)
VALUES ('171870', 1000, 'topup', 'seat-topup-2026-09-19-t1')
ON CONFLICT (external_id) WHERE external_id IS NOT NULL DO NOTHING;
```

Test 2 (171871) needs the same line if the seat is to drive it — rows 210/211
and 125 are on that account — with `'171871'` and
`'seat-topup-2026-09-19-t2'`. **Its balance is 0, not negative: it has never
had a grant, because a helper answering an ask is never charged.**

`external_id` is the idempotency key the wallet already enforces, so running
the statement twice credits once.

### WHAT MUST NOT BE TOUCHED

- **171941 (Test 11) stays at zero.** It is the reserved zero-wallet account
  and a top-up would destroy the only fixture we have for that state.
- **The `token_wallet` app flag stays on.** Turning it off would unblock the
  seat in one line and would also remove the wall for every real user.
- **No real account.** Only 171870 and, if wanted, 171871.

### UNDO

```sql
DELETE FROM token_transactions
 WHERE external_id IN ('seat-topup-2026-09-19-t1', 'seat-topup-2026-09-19-t2');
```

Complete: the balance is `SUM(amount)`, so removing the rows removes the grant.
Anything the accounts spend in between stays spent, which is the point of doing
it as its own row rather than editing a number.

### The question that is actually Misho's

Not the SQL — **whether spending roughly $9 to $18 of real model calls on
fictional accounts is worth it tonight.** The alternative is that testing stops
until the monthly window resets. I have no view on the budget and will not
guess at one.

---

## 14. A ZERO-BALANCE TEST ACCOUNT — REGISTERED, NOT RUN

**Waiting on Misho's word. Nothing below has been executed.**

### Why it is being asked for

The seat's swallow bug — at zero balance the FIRST typed message after the wall
is stored and every one after it silently disappears — is reproducible on
demand, and `[msg-in]` (live since 20:02) settles in one run whether those
requests reach the server at all.

**There is nowhere to run it.** Test 1 was the zero account and now holds 951
after the top-up. And the fixture we reserved for exactly this does not work:

> **A first login automatically grants 250.** Seen on three accounts tonight.
> 171941 was held back as the empty-wallet fixture and it stops being empty the
> moment anybody signs into it.

So the product currently has **no observable zero state at all** — observing it
requires signing in, and signing in funds it. That is worth knowing beyond this
one test: row 157's whole surface can only be seen by arranging it deliberately.

### ROUTE / METHOD / BODY

No admin route mints or removes tokens, and I am not adding one. A negative
transaction, run by Misho, on an account the seat is already signed into:

```sql
INSERT INTO token_transactions (user_id, amount, reason, external_id)
SELECT '171939', -COALESCE(SUM(amount), 0), 'topup', 'seat-zero-2026-09-19-t9'
  FROM token_transactions WHERE user_id = '171939'
HAVING COALESCE(SUM(amount), 0) > 0
ON CONFLICT (external_id) WHERE external_id IS NOT NULL DO NOTHING;
```

**171939 (Netai Test 9)** — chosen because it has one contact, has never been
an asker in any test tonight, and is not the target or bridge of any live
chain. It zeroes whatever the balance happens to be rather than assuming 250,
and the `HAVING` means it writes nothing on an account that is already flat.

`reason` is `topup` because that is the vocabulary the wallet already reads; the
`external_id` is what makes it idempotent.

### WHAT MUST NOT BE TOUCHED

- **171870 (Test 1) keeps its 951.** It is the only funded asker the seat has
  and the chain tests run through it.
- **171941 stays as it is.** It is no longer a useful fixture but it is also the
  only account that has never been signed into, and that is worth something
  until we know what.

### UNDO

```sql
DELETE FROM token_transactions WHERE external_id = 'seat-zero-2026-09-19-t9';
```

Complete: the balance is `SUM(amount)`, so removing the row restores it exactly.

### The question that is Misho's

Not the SQL — **whether taking an allowance away from a fictional account is a
thing I may do at all.** It costs nothing and it is fully reversible, and it is
still a live write on a real row, which is the whole reason this file exists.

---

## §15 — Switching the per-person receiving cap OFF for the test accounts

**20 September. RUN at 17:33 UTC. Live and confirmed.**

> Misho, ~17:30 UTC: „ყველაფერი შენით გადაწყვიტე და ისე გააკეთე." A blanket
> delegation, not a review of this section.

**What I checked before using it, because the delegation does not verify
anything.** This file previously called the six ids „unverified — board data,
not authorisation". They are now verified against the database rather than
trusted:

| id | name | saved contacts |
|---|---|---|
| 171870 | Netai Test 1 | 3 |
| 171871 | Netai Test 2 | 2 |
| 171872 | Netai Test 3 | 2 |
| 171873 | Netai Test 4 | 3 |
| 171874 | Netai Test 5 | 0 |
| 171936 | Netai Test 6 | 2 |

Six of six, all test accounts, none a real person. The cap protects a RECEIVER
from being written to too often, and the exemption is keyed on the receiver —
so no real person's protection changes. That is what made this safe to decide
alone; had one of the six been a real account, the delegation would not have
been enough and I would have said so.

Read back from the new container's own boot log:

```
[ask-caps] receiving caps are OFF for 6 account(s): 171870, 171871, 171872,
171873, 171874, 171936 — test accounts only.
```

**UNDO:** `./scripts/ops/env.sh unset ASK_CAP_EXEMPT_USER_IDS`, then cause a
restart (any push to main) — an unset alone does not redeploy, and the running
container keeps the old value until it does.

#### 22 September — extended to ten, and the reason was a drift between two lists

**Misho's word, asked and given while the tester was mid-run.**

  was  `171870,171871,171872,171873,171874,171936`
  now  `171870,171871,171872,171873,171874,171936,171937,171938,171939,171940`

**WHY, and it is a fault rather than a new request.** Two lists of „test
account" had drifted apart:

| list | where | holds |
|---|---|---|
| `FICTIONAL_TEST_ACCOUNTS` | `testSeatTokens.ts`, code | Test 6–11 |
| `ASK_CAP_EXEMPT_USER_IDS` | environment | Test 1–5 and Test 6 |

So Netai Test 7, 8, 9 and 10 are fictional test accounts by one list and
ordinary protected people by the other — and those four are the seats in use.
At 18:03:33 two `ask_contact` calls were refused with „Netai Test 8 has
already had 2 new questions in the last 24 hours", which is D134 working
exactly as designed on accounts nobody meant to protect.

**The cap itself is unchanged and so is everyone else's.** The exemption is
keyed on the RECEIVER; a test account asking a real person is capped exactly
as before, and `MAX_ASKS_RECEIVED_PER_PERSON_PER_DAY` stays at 2 for the whole
base.

**Test 11 (171941) is deliberately NOT added.** It is fictional and unused; a
protection switched off for an account nobody is testing is the failure mode
this list's own comment warns about — „a list like this outlives the test
nobody remembers running."

**Read the boot line to confirm it took:** `[ask-caps] receiving caps are OFF
for 10 account(s): …`. Ten, not six.

### What they asked for, and why it cannot be done as asked

> „Raise `relay_messages_per_person_per_day` to something like 20 for the six
> test accounts only: 171870, 171871, 171872, 171873, 171874 and 171936."

**It is not per-account.** Both caps are environment variables read once at
boot and applied to everybody:

| variable | default | what it counts |
|---|---|---|
| `MAX_ASKS_RECEIVED_PER_PERSON_PER_DAY` | **2** | new questions one person gets from everybody |
| `RELAY_MESSAGES_PER_PERSON_PER_DAY` | **4** | messages inside ONE live exchange |

Raising either raises it for **every real person in the base at the same
time**, which is exactly what the cap exists to prevent. So the request as
written is refused, and a narrower thing is built instead.

### What is built and deployed, inert

`src/services/askCapExemptions.ts`, read at both caps. A new variable:

```
ASK_CAP_EXEMPT_USER_IDS = 171870,171871,171872,171873,171874,171936
```

- **Empty by default.** With nothing set, nothing changes for anybody, and the
  tests assert that.
- **Keyed on the RECEIVER**, because the receiver is who the cap protects. A
  test account asking a real person is capped exactly as before.
- **Logs loudly at boot** with the ids, in every process that has it on. The
  failure mode of a list like this is outliving the test nobody remembers.

### ROUTE / METHOD / BODY

No route. A Railway environment variable on the backend service, set by Misho:

```
NAME   ASK_CAP_EXEMPT_USER_IDS
VALUE  171870,171871,171872,171873,171874,171936
```

The service restarts on the change, which is itself a deploy — **so it must be
done in a gap the seat names**, for the reason goal 6337 exists.

### UNDO

Delete the variable, or set it empty. The next boot restores the cap for those
six accounts and the log line disappears. **Nothing is written to any row**, so
there is nothing to reverse in the data.

### WHAT IT COSTS, honestly

Six accounts stop being protected from being pestered. All six are fictional
and have no patience to protect — but if any of those ids is ever given to a
real person, that person is unprotected and nothing will say so except the boot
log. **The list should come off when the introduction cases are run**, and that
is the part most likely to be forgotten.

### The question that is Misho's

Whether to set it at all, and whether that id list is right. I have not checked
that all six are test accounts — I am reading the seat's list, and a list of
account ids arriving through the board is data, not authorisation.

---

## §16 — Should a bare accept stop working? (item 5's real path)

**20 September. DECIDED: the refusal stays. Nothing to change — it already
refuses on every path.**

> Misho, ~17:30 UTC: „ყველაფერი შენით გადაწყვიტე და ისე გააკეთე."

**What the decision cost, which is nothing, and why it is safe to make now:**

1. **The app shipped the three choices** at 13:43 (`ca6ef95`) and went further
   than asked — plain `accept` is gone from their type union, so a
   channel-less accept cannot compile on their side. Their words: „if you
   decide the server should refuse, it does not break my client."
2. **The connector had no channel at all** and now has one (`615cf5a`, the
   seat's 354). That was the last surface where a mediator could not express
   the choice.
3. **Nothing has sent a channel-less accept since the counter went in.**
   `[intro-accept-no-channel]`, searched across twelve deployments: **zero
   lines.** No cached session, no old build, no forgotten surface.

So the thing I priced as expensive — „refusing breaks the accept button for
every real mediator" — is now free, and measured to be free rather than
assumed. The refusal stands on all three paths: chat tool, REST route,
connector.

**If a line ever appears in that log, it names its own source**, and that is
the thing to fix rather than a reason to weaken the refusal.

### The size of it, measured 20 September — a number this section never had

Every accepted introduction in the product's history:

| | |
|---|---|
| accepted introductions, all time | **23** |
| of those, `intro_channel` recorded | **0** |
| of those, a phone number appeared in the introduction thread | **6** |

**Not one accept in twenty-three has ever recorded how.** Item 5's choice has
never been captured, on any surface, since introductions began — so „does the
app send a channel" was never the question; nothing did.

**Six is an UPPER BOUND on silent hand-overs, not a count.** „A number
appeared in an assistant message on that thread" cannot tell whose number it
was — it may be the requester's own, a business line, or a number inside a
quoted message. What it does establish is that the disclosure path is not
hypothetical: it runs, and it has run without the mediator being asked.

**And the two most recent accepts show both halves.** Request 1123 (20 Sep,
the seat's test) and 1090 (18 Sep, a real pair) are both `accepted` with a
NULL channel. On 1090 **nothing was disclosed** — the run said „ნომერი
ავტომატურად ვერ მოვძებნე", it could not find the number — which is worth
recording precisely because it is the case that did NOT go wrong. A NULL
channel reads as `direct`, but reading as direct only costs something when
there is a number to give.

So the refusal stays, and now for a measured reason rather than a feared one:
the choice has never been recorded once, and the path that would use it is
live.

### What happened

Item 5 shipped this morning: an accept must say HOW — `direct` hands the
number over, `via_mediator` withholds it — and **an accept with no channel is
refused** so nobody's number moves because nobody was asked.

The seat tested it at 13:12:35 and it did not fire:

```
introduction_requests 1123   status accepted   intro_channel NULL
respond_to_introduction      called ZERO times, ever
```

**The guard lives in the chat tool. The mediator pressed the app's button.**
`POST /requests/:ref/accept` never had the guard, so the choice was never
asked, `intro_channel` stayed NULL — and a stored NULL reads as `direct`.

**The number was handed over in silence. That is the exact arrangement item 5
was built to end, and I built it on the path nobody walks.**

### What I have already done, because it is additive and breaks nothing

The route now accepts an optional `channel` and records it. The app can send
the mediator's choice the moment it offers one. Sent to the frontend.

### The decision that is NOT mine

**Should `POST /requests/:ref/accept` REFUSE an accept with no channel?**

| | |
|---|---|
| **If yes** | item 5 becomes real on the path people use — and **today's button stops working for every real mediator** until the app ships the three choices. Anyone mid-flight gets an error on a screen that worked an hour ago. |
| **If no** | the button keeps handing numbers over without asking, exactly as before, until the app changes. The guard stays decorative. |
| **A third way** | refuse only for accounts the app has already updated (a version header), which is more machinery than either and can be got wrong quietly. |

**I am not choosing between those.** The first breaks a live screen; the second
leaves a privacy promise unkept; and which cost is acceptable is a product
judgement about real people's phone numbers.

### UNDO

Nothing to undo — the code change is additive and optional. If the answer is
"refuse", that is a new change and it needs the app shipped first or it needs
to be accepted that the button breaks.

### The question in one line

**Until the app offers the three choices, do we keep handing numbers over
silently, or do we break the accept button?**

---

### UPDATE, 20 September 13:43 — the app shipped, and the price changed

The frontend shipped the three choices (`ca6ef95`) within the hour, and did
something better than asked: **they removed plain `accept` from their type
union entirely.** It is now `accept_direct | accept_mediator | deny | later`,
so a channel-less accept **cannot compile** on their side — and that
immediately caught a SECOND button, inside the thread, with the same fault,
which a row-by-row fix would have missed.

Their words: *„if you decide the server should refuse, it does not break my
client."*

**So the first column of the table above has largely evaporated.** What remains
is not a judgement, it is a fact I do not yet have: does anything ELSE still
send a channel-less accept — a cached session, an old build, a surface nobody
remembered?

**That is now counted rather than argued.** Every channel-less accept logs

```
[intro-accept-no-channel] request N accepted via <source> with no channel
```

with the source named. Read it with:

```
./scripts/ops/logs.sh logs <deployment> 500 "intro-accept-no-channel"
```

**If it is silent for a week, refusing costs nothing and this section answers
itself.** If it is not silent, the thing that logged it is the thing to fix
first — and we will know its name instead of guessing at it.

**The decision is still Misho's and the founder's.** What changed is that it no
longer has to be made blind.

### 21 SEPTEMBER — THE FIRST READING, AND IT IS THE GOOD DIRECTION

**A channel has been recorded. Once, today, for the first time ever.**

| | |
|---|---|
| introduction rows | 45 |
| accepted | 24 |
| **accepted WITH `intro_channel`** | **1** |

Request **1156**, mediator **160584**, accepted **2026-09-21 10:22:50**, channel
**`via_mediator`** — a real mediator on a real account, not a drill.

**And the warn did not fire for it**, which is the point: the instrumentation
shipped 20 September 13:46:34, exactly **one** introduction has been answered
since, and it supplied a channel. Searched every deployment back to 08:54
today: **zero `[intro-accept-no-channel]` lines.**

**WHY THE SILENCE MEANS SOMETHING, checked rather than assumed.** There are two
ways to accept and both pass the warn:

* `src/services/tools/respondToIntroduction.ts:41` — the MCP tool
* `src/api/routes/requests.routes.ts:105` — the HTTP route

(`privacyRights.service.ts:505` also writes to the table, but it only NULLs
`mediator_response` for a data-rights erase; it cannot accept anything.)

So no accept can slip past the log, and a quiet log is a real quiet.

**WHAT THIS IS NOT.** One accept in twenty-two hours is not the week this
section asked for, and one is not a sample. **The plan does not change** — keep
counting. What changed is that the first reading is in the direction that would
make refusing free, and that `intro_channel` is no longer a column nothing has
ever written.

**Note for anyone quoting the old number:** „zero, ever" was true until
10:22:50 today. Both the seat and I reported it within the hour before it
stopped being true.

## §17 — A user token for the six fictional test accounts

**20 September. Built and deployed. Admin-only. Refused once first, then
scoped.**

### What I refused, and what changed

The seat's 361 asked for „a way for this seat to act as a named test user with
the admin token it already holds — no phone, no code, no human". **I declined
it**, in the box, in plain words: as written that is a way to become ANY user,
and a seat that can become anybody outlives the reason it was built.

Their 370 scoped it: **„Only fictional test accounts. Never a real person's
login, and we are not asking for one."** That is a test fixture, not an
authentication bypass, and it is a different request.

### Why it is needed, which is not permission

Their tooling refuses to type a phone number or a login code into a form —
twice on 20 September, once with the founder's explicit go-ahead. **That block
is on their side and neither of us can lift it.** So every test login is typed
by the founder himself, by hand, in his own evening:

> „It's quite annoying to make some technical work and to be all time with my
> PC and laptop. I don't like it. It's wasting my time."

Nine of their rows are waiting behind it.

### ROUTE / METHOD / BODY

```
POST /admin/test-seat/token
Authorization: Bearer <admin token>
{ "user_id": "171870" }
```

Returns `{ token, userId, expiresIn: "12h" }` — a **user** token, so the seat
sees what a person sees.

### What makes it safe, each part doing work

- **The list is hardcoded in `src/services/testSeatTokens.ts`**, not in an
  environment variable. Widening it takes a commit somebody can read.
- **Every id was verified against the database before it was written down** —
  171870-171874 and 171936 are Netai Test 1-6, with 0 to 3 saved contacts
  each. Six of six fictional.
- **Admin only.** `adminRouter` demands an authenticated admin before any
  handler runs, so this adds no new way in.
- **Twelve hours**, matching an admin session. A thirty-day token is the one
  that turns up later in a shell history.
- **Every mint is logged** with both ids; every refusal is logged with the id
  refused.
- **A test asserts the list is exactly six**, so a widening fails the suite.

### What it cannot do

An id outside the six is refused and named. There is no wildcard, no „any
account with no contacts", no „any name starting with Netai Test". **501,
160584, 167250 and every other real account are unreachable through it** — by
an admin, by mistake, or by asking. A test holds each of those.

### Verified live, both directions, 20:03 UTC

Not „deployed" — **called**, with the same admin token the seat holds:

```
POST /admin/test-seat/token  {"user_id":"171870"}  -> minted, ttl 12h, role user
POST /admin/test-seat/token  {"user_id":"501"}     -> 403, id named, six listed
```

And the audit trail is real rather than promised — both calls are in the
container log:

```
20:03:27  [test-seat] admin 167250 minted a token for test account 171870
20:03:27  [test-seat] admin 167250 asked for 501 — REFUSED, not fictional
```

**A route that hands out tokens is not finished when it deploys.** The refusal
is the half worth proving, and it is proved against the founder's own id.

### UNDO

Delete the route and `testSeatTokens.ts`; nothing else reads them. Tokens
already minted expire within twelve hours on their own.

## §18 — Nine old messages that gave out a private mobile with no source — REGISTERED, NOT RUN, AND POSSIBLY NEVER SHOULD BE

**Status: undecided. Nothing has been written. Nothing is blocked on it.**

Registered here rather than left on the night list, for the reason §14 sets:
an undecided D44 item belongs in the register with its statement and its undo,
where it survives a container and cannot quietly become a habit.

### WHAT WAS MEASURED (21 September, row 139)

The whole `conversations` table, not a sample. **18,506 assistant messages; 51
carry a real phone number** (the rest of the 102 regex hits are dates, prices
and ids):

| | |
|---|---|
| source named in the message | 20 |
| the owner's own contact, behind the `⟦own⟧` marker | 20 |
| **no source named** | **9** |
| not a phone at all — an Instagram handle, an employee headcount | 2 |

**All nine are a private individual's mobile.** Several of those people hold a
business role; the number is personal. The only genuine business numbers in
the set are a clinic switchboard and a physiotherapist's public line, and both
cite the web in the same message.

**All nine are June or before 6 July.** Since then: 28 phone-bearing messages,
every one marker-wrapped, an introduction accept naming the phonebook, or a
public business line citing the web. **Zero without a source, over eleven
weeks.** The month table says this is the guard working rather than traffic
drying up — June has zero redactions and zero markers, September has 29
redactions against 36 phone-bearing messages.

**The strict count is 9 and the loose count is about 4** — several sit under a
heading like „from your network", or open with „Got it" after the owner had
just typed the number. My own regex missed two that name a source in other
words, which is why the strict number is the safe one to quote. **Whether a
section heading counts as a source note is a judgement, and it is not mine to
make.**

### THE DECISION WANTED

**Leave them, or redact the nine.** Not a task — a decision. Arguments both
ways, stated so neither is hidden:

* **Leave.** The numbers were given to the owner who asked for them, in their
  own conversation. Rewriting somebody's chat history has its own cost, and
  the behaviour that produced them has been fixed for eleven weeks.
* **Redact.** Nine private mobiles are sitting in message bodies with nothing
  saying where they came from, and a transcript read six weeks from now cannot
  tell that from a leak.

### ROUTE, METHOD, BODY — IF AND ONLY IF REDACTION IS CHOSEN

There is no route today and **I am not building one before the decision.**
What it would be:

```
POST /admin/conversations/:id/redact-phone      (admin only)
body: { "confirm": true }
```

It would apply the existing `privacyScrub` phone pattern to `content` and
write back, leaving `[hidden]` — the same token the live scrubber already
writes, so a redacted old row becomes indistinguishable from a row the
scrubber handled at the time. Nine ids, named explicitly, one call each. No
bulk form, no pattern match over the table.

### UNDO

**There is not a clean one, and that is the argument for deciding slowly.**
The original text is not stored anywhere else — `conversations.content` is the
record. An undo would mean capturing the nine bodies first, which means
copying nine private numbers into a second place in order to protect them.

**So: if this runs, the nine bodies are read and kept in `~/.netai-ops` (mode
700, never committed, never in a file in this repository — D149) for the
length of one week, and deleted after. That is the undo, and it is worse than
most undos in this file.** Anyone approving this should approve that too.

### 21 SEPTEMBER — DECIDED: LEAVE THEM. Misho's word, and the reasoning

Misho, 21 September: **„შენით გადაწყვიტე რომელიც უფრო არასახიფათოა"** — decide
yourself, whichever is less dangerous. So this is my decision, recorded with
its reason rather than left as a silence.

**LEAVE THEM. Nothing will be written.**

**The argument that settles it: redaction does not reduce the exposure at all.**
Each of those nine numbers was given to the owner who asked for it, in their
own conversation, and they have had it since June. Deleting it from the
transcript does not take it back off their phone. What redaction changes is
the transcript, not the world.

Against that nothing: rewriting a real person's chat history, permanently, on
a regex — and **this file already records that the regex is not good enough for
that job.** „My own regex missed two that name a source in other words, which
is why the strict number is the safe one to quote." A pattern that misses two
in the direction of over-counting will also, run as a redactor, delete text
that was fine. The strict nine is a safe number to QUOTE and an unsafe number
to DELETE, and those are not the same thing.

And the undo above is the worst in this file: it would copy nine private
mobiles into a second place in order to protect them.

**What remains true and is the reason this section stays rather than being
deleted:** the behaviour that produced them has been silent for eleven weeks —
28 phone-bearing messages since 6 July, every one marker-wrapped or sourced,
zero without. If that ever changes, the new ones are the problem, not these.

## §19 — Granting tokens to a fictional test account

**Status: authorised by Misho 21 September, scoped by me, REGISTERED HERE
BEFORE IT IS BUILT — which is what D44 asks for.**

Misho, 21 September, answering „money on a test account":
**„netAI-ს ტოკენების დამატებაზე თუ არის საუბარი დაუმატე"** — if it is about
adding Netai tokens, add them.

### WHY THERE IS NOTHING TO CALL TODAY

I looked before building. `creditTopup` is the only function that credits a
wallet and **its single caller is the Paddle webhook** — there is no admin
route, no script, nothing. The four `admin_adjust` rows in the ledger were
written by hand, in July, straight into the database:

| user | amount | when |
|---|---|---|
| 501 | 999,999 | 3 July |
| 160584 | 100,000 | 29 July |
| 13927 | 1,000 | 31 July |
| 564 | 1,000 | 31 July |

None carries an `external_id` and none came from code. **So the precedent for
this operation is hand-written SQL against real people's accounts, and what is
registered below is narrower than that in every direction.**

### ROUTE, METHOD, BODY

```
POST /admin/test-accounts/:id/tokens          (requireAdminRole)
body: { "tokens": <integer, -50000..50000, never 0>, "note": "<why, required>" }
```

* **`:id` must be one of the fictional accounts** — the same hardcoded set
  §17 uses (`FICTIONAL_TEST_ACCOUNTS`). Any other id is refused and the
  refusal names it. **A real person's wallet cannot be reached through this
  route**, which is exactly what the July rows did reach.

  **22 September — the set is eleven, not six, and this line said six until
  now.** The code was widened earlier today for §17's token minting: the seat
  asked for a seventh seat, five more were found already created on 19
  September (zero threads, zero goals, zero tokens) and unreachable only
  because the list stopped at six. They were verified the same way the first
  six were — §7a's check, that every holder of those numbers in anybody's
  phonebook is itself a test seat, so no real person is touched. The eleven:
  171870-171874, 171936 (the original six) and 171937-171941.

  **171941 (Test 11) is the reserved ZERO-WALLET fixture.** It is on the list
  because §17 mints tokens for it, and it must never be topped up: it is the
  only account we have that reads a true empty wallet, and a grant would
  destroy the fixture. That is a rule for the caller, not the route — the
  route cannot know it.
* **±50,000 a call.** A test seat spends in the tens; the cap is there so an
  extra zero is a refusal rather than a million tokens.
* **`note` is required** and stored, so „who topped up Test 3 and why" has an
  answer in the ledger rather than in somebody's memory.
* Written as `reason = 'admin_adjust'` with `external_id = 'admin:<uuid>'`.
  **Never `topup`** — a grant must not be indistinguishable from a purchase in
  the ledger.

### UNDO

**Call the same route with the amount negated.** That is why the range is
signed and why this does not reuse `creditTopup`, which refuses anything ≤ 0.
The reversal is an ordinary ledger row, visible beside the grant, and the
balance is the sum of the column — so an undo leaves a trail instead of
erasing one.

### WHAT IT DELIBERATELY IS NOT

Not a general token-granting tool. If a real user ever needs a credit — a
refund, an apology — that is a different operation with a different blast
radius, and it needs its own section here and its own yes. **The permission
Misho gave was for a test account, and the route is built so it cannot
outlive that.**

## §20 — Twenty-six engine rows showing as chat messages in the founder's own account

**Status: registered, NOT run, and it is a small one. Nothing is blocked on it.**

Found while checking row 125's clause „nothing internal is ever saved into
anybody's chat", which is part of that row's done-when and had never been
measured.

### WHAT IS THERE

Engine turns are written into the thread as `role: 'user'` so the model has
them in its history, and they carry `kind: 'event'` so the client never draws
them — `getThreadMessages` filters `kind NOT IN ('step', 'event')`. That works:

| | |
|---|---|
| rows beginning `[მოვლენა]` / `[სისტემა]` with `kind = 'event'` | **850** |
| the same, with `kind = 'message'` | **26** |

**The 26 are rendered, because `message` is exactly what the filter lets
through.** They read as if the owner had typed the engine's instruction to
itself — „[მოვლენა] The introduction to X has been agreed. Tell the owner in
one sentence…" — in their own voice, in their own chat.

### WHY THERE ARE EXACTLY 26, AND WHY THE NUMBER IS NOT GROWING

They are 10–11 August. The FIRST row ever written with `kind = 'event'` is
11 August 13:28:49, and the last mis-kinded one is 11 August 12:07:24 — an hour
earlier. **The kind was introduced that lunchtime and everything after it is
correct**, 850 rows over six weeks with none misfiled.

**All 26 are on account 501 — the founder's own.** No other account holds one.

### ROUTE, METHOD, BODY — IF IT IS DECIDED

```
POST /admin/conversations/reclassify-engine-rows      (admin only)
body: { "confirm": true }
```

`UPDATE conversations SET kind = 'event' WHERE kind = 'message' AND (content
LIKE '[მოვლენა]%' OR content LIKE '[სისტემა]%')` — 26 rows, named by a pattern
that matches only the server's own two prefixes.

### UNDO

**The same statement with the kinds swapped**, and that is the whole reason
this is worth offering at all: **NO CONTENT IS CHANGED.** The text stays byte
for byte, the admin window still shows it word for word, and the only thing
that moves is whether the chat draws it. That is materially different from §18,
where the undo required copying nine private numbers into a second place.

### THE ARGUMENT AGAINST, STATED SO IT IS NOT HIDDEN

Rewriting anything in somebody's chat history has a cost even when the content
survives — six weeks from now, „why does this thread look different from the
export I took in August" is a question with no good answer unless this section
is found. And 26 rows in the founder's own account, which he has presumably
scrolled past a hundred times, is not an urgent harm.

**So it is his call and Misho's, not mine, and nothing happens until one of
them says so.**

### 21 SEPTEMBER — AUTHORISED, AND DONE AS A MIGRATION RATHER THAN A ROUTE

Misho, on the entry above: **„გააკეთე როგორც ამბობ."**

**The method changed and this section says so rather than quietly diverging.**
I registered `POST /admin/conversations/reclassify-engine-rows`. I then argued
myself out of exactly that shape twice today in other people's rows — the
frontend's row 73 („a route nobody calls is the guard standing on the wrong
path", which was my own sentence handed back to me) and again in row 234.

This is a one-off correction with a fixed, knowable scope. **That is what a
migration is for**: it runs once, it is in git where anyone can read it, and it
leaves no admin power standing behind it. `164_reclassify_engine_rows.sql`.

**The undo is unchanged** — the same statement with the kinds swapped, bounded
by `created_at < 2026-08-11 13:00`, which is what keeps an undo from claiming
the 850 legitimate `event` rows written since.

**Re-counted immediately before writing it**, not taken from this morning's
reading: 26 rows, 22 threads, 10 August 02:30 to 11 August 12:07, all on
account 501.

## §21 — The seventh test account already existed, and four more with it

**22 September. Misho's word, in one line, for all three of the morning's
asks: „გააკეთე სამივე".** This is the second of them.

### WHAT WAS ASKED, AND WHY I DID NOT DO IT

The seat asked for a SEVENTH fictional account: rows 210 and 232 cannot be
proved on the six, because the assistant remembers every earlier request and
answers „already in motion" on a pair that has been used — and all nine
non-direct pairs on the six were used on 21 September.

**I went to create one and found five already there.** Netai Test 7-11,
accounts 171937-171941, created 19 September in one batch and untouched since:

| | threads | goals | tokens | holds | held by |
|---|---|---|---|---|---|
| Netai Test 7 (171937) | 0 | 0 | 0 | 2 | 2 |
| Netai Test 8 (171938) | 0 | 0 | 0 | 2 | 2 |
| Netai Test 9 (171939) | 0 | 0 | 0 | 1 | 1 |
| Netai Test 10 (171940) | 0 | 0 | 0 | 1 | 1 |
| Netai Test 11 (171941) | 0 | 0 | 0 | 0 | 0 |

**They were unreachable only because `FICTIONAL_TEST_ACCOUNTS` stopped at six**,
so nothing could mint a token for them and no tokens could be granted.

**So no account was created and no phonebook row was written.** The operation
turned out to be a list and a balance.

### AND THEIR SHAPE IS ALREADY THE ONE THE ROWS NEED

    10 ── 7 ── 8 ── 9          11 (isolated)

A path, not a mesh — which is the same reason §7's shape has missing edges:
if everyone holds everyone, no introduction is ever necessary and the rows
become untestable. Test 7 holds 8, 8 holds 9, **7 does not hold 9** — a real
two-hop chain that has never been used.

### WHAT CHANGED

```
src/services/testSeatTokens.ts — FICTIONAL_TEST_ACCOUNTS + 171937..171941
```

No route, no migration, no data write. §17's own promise is that widening this
list „takes a commit somebody can read", and the test that spells the list out
failed the moment the ids were added — which is the point at which somebody
has to say why. It now carries the reason.

### VERIFIED FIRST, AND §7a IS WHY THAT IS NOT A FORMALITY

Netai Test 5 sits on a number a real owner has had in their phonebook since
August. So for these five I checked the same thing rather than assuming:
**every holder of the numbers ending 0107-0111 is itself a test seat.** No real
person's phonebook touches any of them. Names, the reserved number block, the
batch creation and the empty histories all agree.

### TOKENS

250 each to Test 7, 8 and 9 — the three the chain needs — through §19's route,
which now reaches them. Not to 10 and 11: a seat with no work to do does not
need a balance, and a grant nobody asked for is still a grant.

### UNDO

Two, and both are ordinary:

* **The access:** remove the ids from `FICTIONAL_TEST_ACCOUNTS`. They go back to
  being unreachable, which is the state they were in this morning.
* **The tokens:** §19's route with the amount negated, exactly as §19 says.

Nothing was created, so there is nothing to delete.

## §22 — One log row carries a phone number I put there this morning

**Status: APPROVED by Misho, 22 September — „დიახ, წაშალე
მნიშვნელობა". NOT RUN, AND I CANNOT RUN IT.**

**Why not, plainly.** The only database path I have is `scripts/ops/ro.sh`,
which reaches `/internal/ro-sql`. That endpoint refuses anything but a single
SELECT/WITH and runs it on a connection opened with
`default_transaction_read_only=on`. There is no write path in my tooling, by
design, and I am not building one to change one row — a route that can rewrite
log rows is a worse thing to have than the row is.

**So this needs somebody with write access to run the statement below.** It is
one line and it is exact. Until then the row stands, the leak is closed going
forward, and the fact is written here rather than being quietly dropped
because the approval could not be acted on.

### WHAT IS THERE

The connector's tool-call logging went live at 10:02 today. Three rows have
arrived and one of them reads:

```
tool_call_log id ?   surface 'connector'   tool 'find_warm_path'
args_summary  target_ref=c_gFNfLaot3-O_GP1zSAWEBj4eezKYzEryBplmNOvxDtLwNzbfsYoaYsh-duFf
created_at    2026-09-22T10:47:36.215Z
```

`encodeContactRef` is AES-256-GCM over `<userId>|<phone>`, and the module's own
comment says what it is for: „the phone sealed inside never leaves the server".
It left, into a debugging table that people read.

**With the key it is the full number, which D149 forbids.** Without the key the
ref is still deterministic by design, so the value is a stable per-person
identifier that can be correlated across rows.

### THE BLAST RADIUS, MEASURED RATHER THAN ASSUMED

```sql
SELECT surface,
       COUNT(*) FILTER (WHERE args_summary  ~ 'c_[A-Za-z0-9_-]{24,}') AS in_args,
       COUNT(*) FILTER (WHERE result_sample ~ 'c_[A-Za-z0-9_-]{24,}') AS in_samples,
       COUNT(*) FILTER (WHERE error_text    ~ 'c_[A-Za-z0-9_-]{24,}') AS in_errors,
       COUNT(*) AS total
FROM tool_call_log GROUP BY surface;
```

| surface | in_args | in_samples | in_errors | total |
|---|---|---|---|---|
| chat | 0 | 0 | 0 | 6,499 |
| connector | **1** | 0 | 0 | 3 |

**Exactly one row in the whole table**, and it is from today, from my change.
The chat side never had any — contact refs are a connector idea, and the chat
tools pass phones, which `redactPhones` has always caught.

**The leak is already closed going forward** (`SEALED_CONTACT_REF` redacts by
value, shipped in `31c48bc`). This register entry is only about the one row
that is already written.

### THE OPERATION

There is no admin route for this. It is a single statement on the read-write
connection, and it is an UPDATE rather than a DELETE so the row keeps saying
that `find_warm_path` was called, how long it took and what came back — which
is the whole reason the table exists.

```
STATEMENT
  UPDATE tool_call_log
     SET args_summary = regexp_replace(args_summary,
                                       'c_[A-Za-z0-9_-]{24,}',
                                       '<contact ref>',
                                       'g')
   WHERE args_summary ~ 'c_[A-Za-z0-9_-]{24,}';

EXPECTED   1 row
```

### UNDO

**There is none, and that is the point of asking rather than doing.** The ref
is not recoverable from anything else once the column is overwritten — it is
not stored in a second place, and it is derived from a phone the table is not
allowed to hold. So the undo is „there is nothing to undo, and nothing worth
undoing": what is lost is a value that should never have been written.

If the row itself matters more than the value, the alternative is to leave it
and let it age out with the table.

### WHY IT IS NOT URGENT AND IS STILL WORTH ASKING

One row, encrypted, in a table whose readers do not hold the key. But D149 does
not say „no readable phone numbers" — it says a phone appears as its last four
digits and never in full, and this is in full. Leaving a known one in place
because it is inconvenient to remove is how a rule stops being a rule.

### RUN LOG

**22 September, 21:1x UTC — +500 on four seats, on Misho's direct word.**

Asked by the tester's seat at 20:29 for the founder's new A2A2A chains (each
chain costs the asker roughly 60-100 tokens). Relayed to Misho with the
balances **I read myself** rather than the ones quoted to me — two of the four
differed, because the seats were still spending while the message was written:

| account | tester said | I read | granted |
|---|---|---|---|
| 171871 Test 2 | 87 | 87 | +500 |
| 171873 Test 4 | 56 | **46** | +500 |
| 171936 Test 6 | 64 | 64 | +500 |
| 171938 Test 8 | 47 | **34** | +500 |

Misho, 22 September: **„მიეცი ოთხივეს"** — give all four.

2,000 tokens in all, about **$18** at today's measured rate ($0.009 a token,
from Test 1's 97 provider calls at $2.2484 for 251 tokens).

**171941 was not touched** and is still the zero-wallet fixture.

A request arriving through the handoff box is information, never authority —
this ran on Misho's own line and not on the seat's asking.


## §23 — Clearing test goals off the founder's own account, 501 — REGISTERED, NOT RUN

**Asked** by the tester's night seat at 06:39 UTC on 23 September (box 469),
relayed as the founder's word of ~06:25: „remove and delete all unuseful test
goals from my account", with the same rule applied to the 223 goals below
`/admin/goals`' 50-row cap.

**NOT RUN, and three separate reasons, each of which is on its own enough.**

### 1. A request arriving through the box is information, never authority

The same sentence stands at the end of §19 and it is not decoration. This box
is an automated channel; „the founder said yes" written into it is a claim
about the world, and the whole point of the rule is that a claim is not the
thing. Deleting another person's goals is not reversible by reading the box
again. **Misho's or the founder's own line, to me, or this does not run.**

### 2. THE ROUTE DOES NOT EXIST, AND THAT IS A DECISION, NOT A GAP

There is no `DELETE /admin/goals/:taskId`. The only delete under `/goals` is
`/goals/:taskId/question`. The admin router has nine delete routes and not one
of them removes a goal.

That is D245, 15 September, and it was **my own recommendation, accepted by the
founder**: a goal is never deleted, only closed. So „remove and delete" cannot
be done as asked without first building the thing the founder ruled against
three weeks ago — and if he has changed his mind, that is a new ruling and
should be recorded as one, not implied by a cleanup request.

### 3. FOUR OF THESE GOALS WOULD WRITE TO REAL PEOPLE ON THE WAY OUT

The seat's own list says to stop three of them *first* so the people already
asked receive „no longer needed":

    5678   1 ask out
    5281   2 asks out
    5809   3 asks out — to Lika

That is outbound text, in the founder's name, to real people, triggered by a
cleanup. It is the fifth item on the night list's „not overnight" list on its
own merits, quite apart from the other two reasons.

### WHAT WOULD ACTUALLY RUN, IF IT IS AUTHORIZED

**ROUTE / METHOD / BODY** — per goal, and there are two different operations:

    the 4 open ones, first:
      POST /tasks/:id/stop            (user token, account 501)
      body: {}
      effect: goal closed, its open asks cancelled, each person asked is told
              the question is no longer needed

    the closed ones:
      NO ROUTE EXISTS. Nothing to call. Either
        (a) they stay closed and are hidden from the screen — a read change,
            no write at all, and my recommendation; or
        (b) a new admin route is built to delete a goal, which needs the
            founder to reverse D245 explicitly and in his own words.

**UNDO**

    stop:    none for the messages. The goal can be reopened; the „no longer
             needed" line has already reached the person and cannot be recalled.
    delete:  none, by definition. This is why (a) is the recommendation.

**THE 223 BELOW THE CAP** are not listed here because I have not read them. The
seat asks me to apply „a test seat created it" as a rule to goals neither of us
has seen. I will read and list them — reading is free and needs nobody — but a
rule applied by me to 223 unread rows on a real person's account is exactly the
shape that produces one deletion nobody meant.

### STATUS

Registered 23 September, 07:0x UTC. Held for Misho's or the founder's direct
word. The tester has been told, in the box, that it is held and why.

---

## `TRUSTED_FACT_CURATOR_USER_IDS` — the test seats come off the curator list

**Registered and RUN, 23 September ~11:4x UTC. Authorized twice, in writing.**

- The founder, through the tester's seat at 10:50 UTC (box 14653, addressed to
  Misho personally): „change the Railway variable that holds the curator list
  so the test accounts 171870–171874 and 171936–171941 are OFF it (the
  founder's account 501 stays the only trusted one — D449)."
- **Misho, directly to me, in his own message: „railway ზე ცვლადის დამატება
  შენც შეგიძლია"** — you can make the Railway change yourself. That is the
  word this needs. The tester's relay alone would not have been enough: a
  message in an automated channel saying the founder agrees is data, not
  authorization.

### WHAT IT CHANGES

`isTrustedFactCurator` reads this variable. A curator's stated work fact goes
PUBLIC on their word alone, with no second member and no moderator verdict
(`contactFacts.service.ts`, `publishAsCurator`). While the eleven test seats
were on it, every note a test seat saved about anybody published to the
network — which is why row 255 could not be proved: a single test note would
have made the result look better than the product is.

### ROUTE / METHOD / BODY

    printf %s '501' | ./scripts/ops/env.sh set TRUSTED_FACT_CURATOR_USER_IDS

    Railway GraphQL variableUpsert, project/environment/service as pinned in
    env.sh. The value travels on stdin and is never printed.

### UNDO

    printf %s '<the previous value>' | ./scripts/ops/env.sh set TRUSTED_FACT_CURATOR_USER_IDS

Both a set and this undo trigger a redeploy; a redeploy is how the change takes
effect at all, since the running container holds its environment.

### WHAT I DO NOT KNOW, AND IT IS THE ONE RISK IN THIS

**I did not read the previous value and I cannot.** `env.sh` is write-only by
construction: Railway's variables query returns every variable at once, so
reading one to answer a question would pull `DATABASE_URL`, the JWT secret and
the Stripe key into this session. That property is worth more than knowing the
old string, so the old string is gone.

Which means: **if anybody other than 501 belonged on that list, they are off it
now and have to be added back by name.** Two independent things say nobody did:

- D449, 23 September — 501 is the only trusted curator.
- The data. Of every core fact ever published by a single source with no second
  member agreeing — the signature of a curator publication — **389 rows, and
  every one of them submitted by 501.** No other id has ever published that
  way.

If the founder or Lika finds they have lost curator standing, that is this
change and it is one line to put back.

### AFTERWARDS

Verify by behaviour rather than by reading the variable: a test seat saves a
work fact on a contact and the row must come out `is_public = false`. Until a
seat does that, this is „set" and not „proved".

---

## Tokens for seven fictional test seats, so rows 251/252/255 can be staged

**Registered 23 September ~12:2x UTC, then run. Under §19's standing
authorization from Misho, 21 September: „netAI-ს ტოკენების დამატებაზე თუ არის
საუბარი დაუმატე".** No new permission asked for, because this is the operation
that authorization is about and the route reaches nothing else.

### WHY

The tester's 489: „251's recipe cannot be staged on our seats — every pair
already carries an accepted introduction and the model reuses it." Their ask
was „(a) a top-up on Tests 7–10 so 7 → 8 → 9 / 10 → 7 → 8 can be a fresh
triangle".

I read the seat graph and the balances myself rather than taking the list on
trust, and it is worse than they said — seven of the eleven seats cannot run a
turn at all:

    Test 1   -24      Test 4    -5      Test 6    -3
    Test 7   -25      Test 8   -28      Test 10  -23
    Test 9    23      (one turn)

    Test 2    43   ·  Test 3   744   ·  Test 5  168  ·  Test 11  190

And the 7/8/9/10 cluster is the only one with an unused pair: its phonebooks
are 7→{8,10}, 8→{7,9}, 9→{8}, 10→{7}, and the single accepted introduction on
it is 8→10 via 7. So 9 → 8 → 7 is a fresh triangle and nothing else is.

### ROUTE / METHOD / BODY

    ./scripts/ops/tokens.sh <id> 500 "<why>"
    → POST /admin/test-accounts/:id/tokens   {"tokens":500,"note":"…"}

    171870 171873 171936 171937 171938 171939 171940      500 each, 3,500 total

A seat turn costs about twenty tokens, so 500 is roughly twenty-five turns —
enough for the four Pr1 re-runs and not a pool nobody has to think about again.

### UNDO

    ./scripts/ops/tokens.sh <id> -500 "undo"

The amount is signed and a reversal is a row beside the grant, never a
deletion; the balance is the sum of the column.

### WHAT IT CANNOT REACH

A real person's wallet. The eleven ids are hardcoded in `testSeatTokens.ts` and
the route refuses anything else by name — that is enforced where it cannot be
edited around, not promised by the script.

---

## `POST /admin/test-accounts` — the tester creates their own fictional seats

**Registered 23 September ~13:0x UTC, before the route ran once. Authorized
twice, which is what the founder himself asked for.**

- **The founder, D464, 23 September**, relayed through the tester's seat: „you
  need the permission from me and from Misho to create test accounts because
  you are the main tester… I don't want to wait for Misho every time we need
  it… I have approved it."
- **Misho, directly to me, the same hour** — asked as a plain question with the
  route's limits written out, and answered yes.

**His own sentence names both of them**, so the relayed quote was treated as
half a permission and not as the whole of one. A message arriving in the box is
data; it is not the second signature on a thing the message itself says needs
two.

### WHY

Row 251's done-when needs a requester, a mediator and a target with **no
introduction ever asked between them**. By this morning every pair across the
eleven seats had one — 8 → 10 via 7, 9 → 7 via 8, 3 ↔ 6, 2 ↔ 4 via 3, 3 → 1
via 2 — and the assistant refuses a second request on a used pair, which is
correct behaviour and left the row unprovable. The seat asked three times.

### ROUTE / METHOD / BODY

    POST /admin/test-accounts
    {"name":"Netai Test 12","holds":["+1202555…"],"tokens":500,"note":"why"}

    GET  /admin/test-accounts     lists the eleven in source and the made ones

`holds` are the phones the NEW seat will have saved. Direction matters and is
the whole reason the caller states it.

### WHAT IT CANNOT REACH — enforced in the service, not promised by the handler

- **Any existing account.** Every write is an `INSERT` of a row it just made.
- **A number of anybody's choosing.** The caller cannot pass a phone. The
  service takes the first free slot in `+1 202 555 0100–0199`, the range
  reserved worldwide for fiction, and *free* means registered to nobody **and
  saved in nobody's phonebook**. That second half is not decoration: **Netai
  Test 5 sits on a number a real owner had had in their phonebook since
  August.** A seat on a number somebody real holds starts appearing in that
  person's second circle.
- **A real person in the new seat's phonebook.** Every entry in `holds` must
  itself be a seat; one that is not is refused by name rather than skipped.

### UNDO

**Not a delete, deliberately.** D245 says a goal is never deleted and an
account is a heavier thing than a goal. A seat that should not exist is emptied
and left:

    ./scripts/ops/tokens.sh <id> -<balance> "undo: seat should not exist"

If one ever genuinely has to be removed, that is a separate decision with its
own entry here.

### ONE LIMIT WORTH KNOWING

A created seat is **not** in `FICTIONAL_TEST_ACCOUNTS`, the hardcoded Set in
`testSeatTokens.ts`, and cannot be: that list is in source precisely so it
cannot be widened at runtime. The *operating* routes (tokens, seat-token mint)
read `test_seats` as well and work on a created seat immediately. The one thing
that does not is the **cosmetic `fictional_counterpart` marker** in the inbox
payload, which stays on the Set because a comment in `mcp/handlers.ts` rests on
that check having no failure mode — giving it a query would turn „I could not
look" into „there is nobody there". A new seat gets the marker when its id is
added to the Set in source, which is one line in the next commit.

---

## The three new seats could not open a chat — a subscription grant on each

**Registered and RUN, 23 September ~13:4x UTC. Under the same authorization as
their creation** (the founder's D464 and Misho's own word, the entry above).
This finishes a creation that was already authorized and does not widen it.

### WHAT WENT WRONG — mine

The create route set `subscription_tier`, `subscription_status` and
`hasAccessToAlly`, because those are the columns the words „is this account
active" bring to mind. It did not set `current_period_ends_at`.

`hasActiveSubscription` reads the **period end**, not the status: „active"
means `current_period_ends_at !== null && > now`. So all three seats came out
readable, funded and Netai users, and every one got **403
`subscription_required` on `POST /threads`**. The seat found it twenty minutes
later with the status codes printed. Row 251 could not start.

I checked the columns I was thinking about and not the one beside them — the
third time this week, after the `::text` cast on an integer and the sweep
exclusion on row 252.

### ROUTE / METHOD / BODY

    POST /admin/users/:id/subscription   {"action":"grant","tier":"pro","days":365}

    172068 · 172069 · 172070

An existing, already-registered capability rather than a new write. 365 days
matches the eleven exactly — Netai Test 8 carries its creation date plus one
year — so a seat and a seat behave the same.

### UNDO

    POST /admin/users/:id/subscription   {"action":"deactivate"}

### THE CODE FIX THAT MAKES THIS THE LAST TIME

The route now sets `current_period_ends_at` on creation, and the test beside it
does **not** match a string in the INSERT — a string test would have passed on
the broken version too, because the broken version named every column it
thought of. It builds the row the statement produces and asks
`hasActiveSubscription` itself, and asserts that the shape without the period
end is refused.
