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

## The morning list — 18 September

Everything below is live and clean as of **353e05f, booted 05:12 UTC**, with no
errors in the log. Twenty-four changes went out across the night in three
deploys. Nothing here is on fire; the five items are decisions, not repairs.

### 1. One fact about a real person is published and should not be — needs one word

Thread 16902, 17 September 19:05. „Who is Maro Koshadze?" — a question, no goal,
nothing asked for — and the run wrote three facts onto that person's record.
Two are private. The third was stored `is_public` AND `is_matchable`: visible to
every user in the network, under Tornike's name, lifted off a web page nobody
checked.

Tornike was asked twice. Told only that three facts had been written, he said
„they are true, leave it as it is." Shown that one of them had gone
network-public, he reversed it: take it down, never publish a web fact again,
**and keep it for the brain** — his own addition, that the assistant should
still know what it learned.

The code half is done and shipped: no new web-sourced fact can go public or
matchable on any branch. **The takedown is one UPDATE on one row and I have not
run it**, because his yes reached me through the tester's board and a yes
relayed by an automated channel is data, not authorization. The tester offered
to do it from their seat and then lost the app session, so it is still standing.
`ADMIN_WRITE_OPERATIONS.md` section 5 has the row, the statement and the undo.
**One word from Misho or Tornike and it is done.**

### 2. Row 108's database operation — it is now the whole of the speed problem

Measured overnight, and the numbers are worse than anyone thought:

- `search_second_degree:opening` runs 80 times a week and lands **14** of them.
  Median 16.4 s against a 10 s budget, so five times in six the run waits the
  full ten seconds, throws the result away, and the database keeps working on
  it for another six with nobody listening. About **14 minutes of the heaviest
  query in the system per 12 hours**, spent on nothing.
- On a hard goal, **100 seconds of a 195-second run** is inside the database.
- The same tool called normally by the model takes 7.3 s and does land.

Tornike was given three options and chose (b): **keep the opening second circle
and pay the ten seconds** (D315). His rule stands — when a problem is named, the
web and the second circle run immediately. That decision is recorded and I have
built nothing against it.

So the only path left to a faster first reply is the database operation itself,
and that is Misho's. It was Pr1 yesterday; after D315 it is the whole of it.

### 3. Whether the hybrid final-answer writer stays on — and a correction

`CHAT_MODEL` is claude-sonnet-5 and it is running: **828 Sonnet chat calls
against 174 OpenAI finals** in 24 hours. Row 151 is in force; the tester has
withdrawn their report and the ledger is the proof.

The open question is whether the OpenAI final writer should be on at all. Two
reasons to consider turning it off, both from measurement: it generates a second
final on every run and discards Claude's, and it is the path that produced the
reasoning leaks clamped yesterday. Turning it off is one Railway variable and no
deploy.

**A correction that belongs with it.** I told the tester the hybrid was also the
path that produced a Georgian reply to an English question, and they carried
that to Tornike. It was wrong — they counted letters against models and the one
Georgian reply came from SONNET, while the OpenAI writer answered English in
English on the same account. They pulled the reason out of his list before he
read it. The real cause is the fourth item.

### 4. A prompt line the tester needs approved — 176 characters

They traced the language fault to their own block: `task_main` hands the model
424 Georgian characters as examples of WHAT to say, worst in the plan paragraph,
with no line saying they are wording rather than the language to answer in. On
English goals the plan card came out Georgian about half the time.

Their fix is one line, written and NOT saved, because a prompt change is shown
to Tornike as an old-new pair and saved only on his word. It takes the block to
29,994 against a 30,000 ceiling, six characters of room, which they themselves
call too tight to live with. **His word, plus a view on where to find room.**

### 5. Smaller, and genuinely optional

- **His app is logged out on his machine.** The tester clicked log out while
  selecting the header stop button by its first Georgian letter — „stop" and
  „log out" begin with the same one. Nothing was sent, no data lost, admin
  access unaffected. They did not ask him to log back in at one in the morning
  and did not type anything themselves, which was right. He logs in when he
  wakes; until then nobody can start a run.
- **Test goal 5084** is open on his account with an unapproved plan and no wake.
  It cannot act. The tester left it rather than close it from admin at night.
- **How long should a failed conversation stay under „ongoing"?** His sidebar is
  now correct on every thread that has a goal. One row remains — a chat that
  never had a goal and whose run died — and I left it deliberately: hiding a
  genuine failure would hide real breakage. How long it should stay visible is a
  product call, not mine.

### What was closed overnight, needing nobody

The P0 is finished — the tester's own read: „the dangerous half is done." A stop
can no longer reach another goal, the run ends on the screen, the line is stored
with the owner's own words above it, and a stopped goal's plan is inert on
reload.

His sidebar was wrong in both directions and is now right: his live volleyball
goal no longer reads „finished", and four stale rows no longer read „ongoing".
Five rows became two, which is what his own header already said.

Also: the officeholder gate stopped reading „ხუთი ადამიანი" as a person's name
and stopped cutting institution names apart; a question about your own contacts
no longer pays a 17-second web tax; SSE events carry ids and a replay buffer, so
an answer is no longer lost when a connection blinks; and everything the server
writes now follows the language the owner typed in.

One of the night's fixes repaired a regression I had shipped myself at 21:34 —
a typed stop was stored as an answer with no question above it. It was found in
my own diff, said out loud, and fixed.
