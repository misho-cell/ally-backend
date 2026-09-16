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

## 3. `ANALYZE` on four tables

**Put to Misho, not answered.**

| | |
|---|---|
| Statement | `ANALYZE "UserPhone"; "UserAlias"; "UserTags"; "UserConnectionPhone";` |
| Undo | none needed — it writes no row, only statistics |

Included here even though it changes no data, because it is the one case where
the honest answer to „what is the undo" is that none is required, and saying so
explicitly is better than leaving it off the register and having somebody
wonder whether it was skipped.

Statistics ages when measured: UserPhone 175 days, UserAlias and UserTags 40
days. The earlier advice to `VACUUM` was wrong and was corrected — UserTags
measured 0.2% dead rows, so there was nothing to reclaim.
