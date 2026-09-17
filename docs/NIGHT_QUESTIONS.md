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

**Three stop incidents in four hours, all on the founder's live data.** For
Misho, as a fact rather than a question — nothing is blocked on an answer.

  #3763 item 6  a stop in one goal's chat PAUSED its sibling in another thread
  #3764         a stop in a paused goal's chat CLOSED two of his real goals,
                one of which had two asks already sent to real people
  #3862         three minutes after my second fix, a stop in a chat that never
                had a goal closed his volleyball goal again

All three are the same resolver: when the chat had no live goal of its own, the
model went looking for a goal anywhere on the account and reasoned about which
one was meant. Everything is repaired — the tester reopened both goals through
the product's own tools and restored their wakes — and nothing was ever sent to
anybody because of it.

Fixed in three passes tonight (7020502, b5bf2d1, and the wake in f879788), and
the third is the one that removes the model's choice rather than narrowing it.
My first two reports on this said „fixed" and were incomplete; the tester found
both within minutes.

Worth his attention for one reason: the tester is spending his real goals to
find these. They have held four of six tests until the current build is proved.

### Closed tonight, not carried to the morning

**The two people on goal 3433** who were told their question was off while the
goal was running again. Put to the founder through the tester; his answer was
DO NOTHING — the goal is open and can reach them again the normal way when it
wakes. Nothing was sent and nothing was changed.
