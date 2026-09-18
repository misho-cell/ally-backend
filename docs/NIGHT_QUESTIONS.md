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

_Nothing yet._

## Open with a person — 18 September, standing after the night handover

The night list itself is cleared; these are what survived it and who holds
each one. Live build at the time of writing: **d086e9e**, plus the row 158
fix, all clean.

### Misho — money, and it is stopping two things right now

**The OpenAI account has no credits.** From the live log, three times inside
the runs of 06:49-07:01:

    [search-query] not distilled (gpt-5.6-terra failed: 429 You have no
    credits remaining...)

Last successful call in the usage ledger: the 02:00 hour today. What it breaks
while it lasts: the search-query distiller, so the opening second circle is
handed the whole goal sentence and times out; and the hybrid final-answer
writer, so every reply falls back to Claude. The fallback is by design and
harmless — but any reading of „which model wrote this" taken today is
measuring an outage, not the product.

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

### Row 108 — a measured candidate, 18 September, not yet built

**The change is one shape.** The second-degree search scans each bridge
separately today — a LATERAL join, 305 of them on account 501. The alternative
is one scan with `"contactId" = ANY(<all the bridges>)`.

    3 patterns   LATERAL 802.7 ms   one scan 802.3 ms    identical
    9 patterns   LATERAL TIMED OUT  one scan 4,114 ms
    9 patterns, ONE SCAN, BOTH tags AND aliases:  3,078 ms

The 9-pattern LATERAL was re-run three times — timed out every time, so it is
structural rather than load. Nine patterns is an ordinary distilled query.

**Equivalence proven, not assumed.** Same patterns, compared as sets both ways:
23,711 rows each, zero rows unique to either side.

**Why this one and not the other two.** LIKE-first was 2,400x faster on a rare
term and 7x SLOWER on a common one. A single alternation was 4x faster at three
patterns and timed out at nine. Both were fast in the case tested first and
worse in the case that matters. This one is neutral in the small case and
decisive in the large one — no regime where it loses.

**Not a claim that row 108 is solved.** 3,078 ms is still the largest single
cost in a goal run. It turns a timeout into a slow search that returns.

**Left to do:** the two CTEs feed the ranking and the bridge count, so the
rewrite must carry `"contactId"` through exactly as the LATERAL does. Checked
that it can; the equivalence test above already selects both columns.

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
