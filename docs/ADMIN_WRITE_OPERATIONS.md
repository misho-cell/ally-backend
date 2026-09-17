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

| | |
|---|---|
| Route | `/admin/users/:id/subscription` |
| Method | `POST` |
| Body (grant) | `{ "action": "grant", "tier": "pro" \| "enterprise", "days": 1–365 }` |
| Body (undo) | `{ "action": "deactivate" }` |
| Audited as | `product_events.event = 'admin_subscription_change'` |

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

| | |
|---|---|
| Route | none — a direct `UPDATE` over `tasks`, run through the read-only path's write twin |
| Method | one statement, in a transaction, `LIMIT`ed to the identified ids |
| Body | clear `pending_question_at` on exactly those ids, leaving `question` as it is |
| Undo | the previous `pending_question_at` per id is captured to a file BEFORE the update; restoring is the same statement with the saved values |

The undo must be written before the statement runs, not after. Without the
captured timestamps there is no way back, and „it was null anyway" is a guess
about twelve rows rather than a record of them.

---

## 3. Row 108 — the database maintenance

**Misho's direct word, 17 September: steps 1, 2 and 4 yes; step 3 no.**

### Step 1 and 4 — VACUUM (ANALYZE). NOT MINE TO RUN.

| | |
|---|---|
| Statement | `VACUUM (ANALYZE) "UserTags";` `"UserAlias";` `"UserConnectionPhone";` |
| Who runs it | Misho, directly. My only database path is read-only — the endpoint refuses anything but one SELECT, on a connection the server opens with `default_transaction_read_only=on` — and VACUUM cannot go in a migration because migrations run inside a transaction. |
| Undo | none needed and none possible; it writes no row |

NOT about reclaiming space, which is what the word suggests. Measured: UserTags
32,421 dead of 21.3M (0.15%), UserAlias 1,801 of 8.4M (0.02%). What VACUUM
refreshes is the VISIBILITY MAP, which decides whether an index-only scan can
answer from the index or must visit the table per row — the 10,607 heap fetches
and 5,164 ms of disk wait behind the slow tag search.

### Step 2 — the insert scale factor. MINE, as migration 155.

| | |
|---|---|
| Statement | `ALTER TABLE <t> SET (autovacuum_vacuum_insert_scale_factor = 0.02)` |
| Applied to | UserTags, UserAlias, UserConnectionPhone |
| Undo | `ALTER TABLE <t> RESET (autovacuum_vacuum_insert_scale_factor);` |

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

| | |
|---|---|
| Route | none — two Railway environment variables, set with `scripts/ops/env.sh` |
| Method | `printf %s "<value>" \| ./scripts/ops/env.sh set REVIEW_PHONE` (and `REVIEW_OTP`) |
| Body | `REVIEW_PHONE`: the numbers, comma separated, E.164. `REVIEW_OTP`: one fixed code |
| Undo | set either variable to an empty-looking value, or delete it in the Railway dashboard. The list is OFF unless BOTH are set, so removing one is enough |

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

| account | name | phone (last four) |
|---|---|---|
| 171870 | Netai Test 1 | 0101 |
| 171871 | Netai Test 2 | 0102 |
| 171872 | Netai Test 3 | 0103 |
| 171873 | Netai Test 4 | 0104 |
| 171874 | Netai Test 5 | 0105 |

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
