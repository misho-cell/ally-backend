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
