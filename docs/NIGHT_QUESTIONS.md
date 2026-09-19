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

## Tonight's list — 18/19 September

Misho, 21:45 UTC: „the issues that need me we go through in the morning; until
then work in night mode." So these four wait for him, in this order.

### 1. The final-answer writer — off?

The founder said yes to switching it off, through the tester's box. That is
data on my side and not authorization, so it has not happened.

It is `CHAT_FINAL_ANSWER_MODEL`, a **Railway environment variable**, not a
setting in the product. Two consequences worth knowing before deciding:
changing it **restarts the container**, which kills every run in flight; and it
is a spend change, which is Misho's alone whatever the founder said to whom.

- ROUTE / METHOD: Railway variable, via `scripts/ops/env.sh` (write-only by
  design — I never read these back)
- BODY: `CHAT_FINAL_ANSWER_MODEL=` (empty)
- UNDO: set it back to its current value — **which I cannot read**, so
  whoever flips it must write the old value down FIRST or the undo is lost

### 2. The introduction follow-up — no second approval?

Founder's decision, relayed the same way: once he has approved an introduction
and the person answers him, his reply goes back without a fresh approval.

This removes a confirmation in front of **a message to a real person**, which
is the highest-stakes category in this product, and it arrived down an
automated channel. It needs Misho's or the founder's direct word.

### 3. Row 104 — the base prompt contradicts the goal prompt

Seven failures. The tester's audit found the cause and it is not where either
of us was editing. In `ai_config.system_prompt`, at character 13,101:

> „Before anything leaves Netai, an intro request, sharing their details,
> anything irreversible, ask first and act only after a yes. Never claim you
> sent, delivered or notified anything: you draft, they send."

The goal block says the opposite for a plan the owner has already approved,
and the model reads the base prompt first and obeys it. D119 — an approved
plan IS the consent — is on the block's side, so narrowing this sentence
aligns the base prompt with an existing ruling rather than granting anything
new.

It is still a **loosening of a gate in front of real people**, so it does not
happen overnight.

- ROUTE / METHOD: `PUT /admin/system-prompt`
- BODY: the whole 25,176-character prompt with that one sentence narrowed
- UNDO: the route INSERTs a new row rather than updating, so every previous
  version is kept — PUT the prior text back. Rollback is free.
- NOTE: the tester can do this themselves; it is the same console they edit
  the blocks in. Named here because of what it loosens, not because it is
  blocked on me. They have said they will not touch it on their own judgement
  either, and will show the founder a before and after first.

**Which half is actually doing the damage.** The tester pointed at „ask first".
I think the second sentence is worse. „Ask first" is a GATE, and a model can
reason about whether a gate applies. „You draft, they send" is an IDENTITY: it
says what the assistant IS, with no condition attached, and there is no case
in which it permits sending. That is why six rewrites of the goal block bounced
off it. It is also false about the product — ask_contact sends,
send_answer_to_asker sends, invite_contact sends.

**The wording I proposed**, for the founder's eyes rather than to be pasted:

> Before anything leaves Netai — an introduction request, sharing someone's
> details, anything irreversible — ask first and act only after a yes.
>
> The one thing that needs no second yes is a question going to a person an
> APPROVED PLAN already names. That plan was the yes (D119); asking again is
> asking twice, and the owner has to say the same thing twice to get one
> message sent.
>
> Never say something has been sent, delivered or seen unless a tool has told
> you it happened. Saying it because you are about to do it is the same
> mistake as saying it because you wish you had.

Deliberately narrow: the exception covers `ask_contact` and nothing else. It
does NOT cover invitations and it does NOT cover introductions, because no
ruling says an approved plan is consent for those. If the founder wants them
included, that is one more clause and his to add.

Open inside it, and worth his eye: whether „anything irreversible" still earns
its place once the other three are listed. It is the clause most likely to
catch something nobody has thought of — the argument for keeping it — and the
vaguest, which is the argument for it being what overreaches next.

### 4. The privacy pack is telling users something false, right now

Live in the `privacy` topic of `get_netai_info`, last sentence:

> „Deleting one single item is NOT built yet — never promise it."

It is built. `forget_contact_fact` runs a real `DELETE`, scoped to facts this
user submitted, behind an explicit confirmation; `forget_user_note`,
`retract_contact_fact` and `remove_contact_from_network` are all live. Two
sentences earlier the same text says a fact CAN be retracted, so the pack
contradicts itself.

Wrong in the worst direction: a person is told a privacy control does not
exist when it does, and the alternative offered in the same breath is deleting
their whole account. The tester has a corrected text ready.

- ROUTE / METHOD: `PUT /admin/netai-info/privacy`
- BODY: the corrected text (the tester holds it)
- UNDO: PUT the current text back — **it is captured below**, because this
  route overwrites rather than versioning:
  the tail reads „…You can tell Netai to correct or retract a fact it holds,
  and a retracted fact stops being shown anywhere. Everything stored about you
  is listed on the Data page in your profile, and you can download a copy of
  your data or delete your whole account from there. Deleting one single item
  is NOT built yet — never promise it."
- NOTE: the tester can do this one themselves too. Here because it is live and
  false, so somebody should see it in the morning either way.

### 5. Row 104 — the founder has ruled, and the count says the fix is in two places

**The ruling, relayed through the box tonight:** when the owner types a short
instruction naming one person and one action, those words ARE the yes. It goes,
with no draft first and one line afterwards saying who it went to. Relayed, so
it waits for his own word — but it is what everything below is measured
against.

**The count, finished at 01:00 from `run_prompt_stamps`.** Eight instances:

    quick_answer   2   Salome 17689, the founder's own 17854
    task_step      6   all of Lika's — with task_main ALREADY LOADED

So the seven rounds of work in `task_main` were in the room for six of the
eight, and the model failed anyway. **Moving those rules into `quick_answer`
would fix two of eight**, at 7,000 characters on every quick_answer run for
ever. The tester was going to ask for the budget raise to allow it; the count
killed the ask and they have withdrawn it. Nothing to decide here.

What the six look like, thread 17623:

    12:57:52  „ask Tornike Abuladze if he knows a good philosopher"
    13:00:27  „ask him"
    13:01:09  „I approve"

She said it in full at 12:57 and then had to say it twice more. The mechanism:
the sentence was read as a stated need, so the server made it a GOAL — the
goal's title IS her instruction — and a new goal has its plan proposed for
approval. She was asked to approve a plan whose whole content was her own
sentence.

**Two doors, two fixes:**

- the two: `qa_rules_20_22` item Twenty-four contains „a message sent without
  their yes on the wording", which now contradicts the ruling directly and is
  a checklist item — the kind that fires while prose is ignored. Cutting that
  clause and its comma is **minus 50 characters** and needs no budget.
- the six: a proposed plan whose only route and only person are the ones the
  owner just typed adds nothing to approve — it IS the instruction. Not built.
  It loosens a gate in front of real people and arrived by relay at one in the
  morning.

### 6. Row 103 — the app flag overrides a rule that already gets this right

The six of row 104 are this row, not a prompt fault. Found by the tester,
confirmed in code at 01:40.

`chat.service.ts` 7940, inside `ensureGoalForRequest`:

    if (intent?.asGoal !== true && !looksLikeGoalRequest(userMessage)) return null;

A goal is created if EITHER the app says so OR the server's own need-rule says
so. So the flag alone is enough for anything that is not a question.

**The server's own rule gets every one of these right**, run against the real
sentences:

    looksLikeGoalRequest
    false   „თორნიკე აბულაძეს ჰკითხე თუ იცნობს კარგ ფილოსოფოსს"
    false   „…კარგ ფინანსისტს დიდი კორპორაციისთვის"
    false   „ask Lika for the screenshots"
    false   „tell X I can do Thursday"
    TRUE    „მჭირდება კარგი სტომატოლოგი თბილისში"

No to all four instructions, yes to a real stated need. The rule that would
have stopped Lika being asked to approve her own sentence was there the whole
time and the flag walked past it.

**Answered at 01:47 from the shipped frontend bundle, read-only.** There is no
„+ new goal" button whose meaning could be broken: the flag is set by a
one-shot ref that EVERY in-app route to the empty chat screen turns on. It
means „a new conversation was opened", not „this is a goal". (Two limits the
tester noted: a page reload mounts a fresh ref, and the ref is cleared only
when a message is sent.) My objection is gone — but so is the idea that the
fix is free.

**MEASURED at 02:30: what removing the flag would cost.** Every goal of the
last ten days, joined to THE MESSAGE THAT CREATED IT (nearest user message at
or before the goal, within 30 s — not the thread's first message, which is a
different thing and flatters the result). Fifty matched.

    recognised by looksLikeGoalRequest   36
    NOT recognised                       14

The fourteen are three populations:

- **five are row 104's bug** — „Ask Lika to send me the screenshots", „თიკო
  რატიანს მისწერე თუ იცნობს…", „ჰკითხე". Removing the flag FIXES these.
- **three are not goals at all** — „give me an invite link", and „კი" (yes)
  TWICE. A bare „yes" created a goal. Removing the flag fixes these too.
- **six are real goals that would be LOST** — including two that literally
  begin „შექმენი ახალი მიზანი" (create a new goal), and three of the
  „მინდა / შეგიძლია … მიპოვო" shape.

So it is eight fixed against six lost. **Not a clear win, and it should not be
sold as one.** But the six are four or five recognisable patterns, so:

**The order that makes it free.** Teach `looksLikeGoalRequest` those patterns
first, re-measure the fifty, and only then have the frontend stop sending the
flag. In that order the change costs nothing; in the other order it loses real
goals silently, which is the worst way to lose them.

    1. the 50-character cut in item Twenty-four      ready, needs a hand
    2. teach the rule the missing shapes             mine, needs daylight
    3. re-measure the fifty                          mine, free
    4. then the frontend drops the flag              theirs

Step 1 stays first whatever else happens — see the coupling note below.

**A correction to my own wording.** I wrote earlier that the discriminator
„already works". On the four sentences the tester gave me it does. On fifty
real goals it is right 36 times and wrong about six. „Already works" was too
strong and should not be quoted to the founder that way.

**The two fixes are coupled — do not ship one alone.** If row 103 stops making
these goals, the six move out of `task_step` and into `quick_answer`, where
item Twenty-four's „a message sent without their yes on the wording" is waiting
for them. The 50-character cut has to land BEFORE or WITH the 103 change, or
the failures move rather than go.

### Both prompt pastes are blocked on a person — NEITHER of us can do them

Correcting what I wrote earlier in this file: I said the tester could paste the
privacy text and the base-prompt change themselves. **They have since told me
every PUT is refused on their side.** So all of it — the false privacy
sentence, the 50-character checklist cut, and any base-prompt edit — needs
Misho or the founder to paste. Three small edits, each with an undo.

### Not on this list, because they need nobody

Five commits are written, tested and pushed to the branch, none deployed:
337b70b, 1bcc0f0, 91b0b98, 95c1f1c, 2c1edd8. They go out in one deploy when
the tester is not working. That is ordinary night work and needs no decision.

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
