# scripts/ops — the operator capabilities, and where the line is

These three scripts exist so that a permission can be attached to a **named,
readable capability** instead of to "any HTTP request". Each one can reach
exactly what is written in it, and the file is in git where anyone can read it.

| script | what it can do | can it change anything? |
|---|---|---|
| `box.sh` | read / post / **sync** / mark-read on the tester's handoff box | writes MESSAGES, to two people |
| `ro.sh` | one SELECT against production | no — the server refuses anything else |
| `logs.sh` | Railway deployment list and logs | no — queries only, never mutations |

`ro.sh` being read-only is not a promise this script makes. It is a property of
`/internal/ro-sql`, which runs on a read-only connection and refuses anything
but a single SELECT. The script cannot lie about that.

`logs.sh` sends GraphQL **queries** only. Changing an environment variable is a
`variableUpsert` mutation and is deliberately NOT in here — see below.

### Use `sync`, not `read` then `mark`

`box.sh sync` prints everything unread and marks it in the same command. Reach
for that one.

The two-step version is how a message gets lost, and it did. On 16 September a
`post` and a `mark 1290` went out on one shell line; 1290 was the tester's row
114 result — the clearance this session was waiting for — and it was marked read
without ever being displayed. A finished change then sat unpushed for thirty
minutes waiting for permission that had already been given, and it only came to
light because the tester mentioned it in their next message.

> Never pass an id to `mark` that you have not just read on screen.

`mark` stays for the case where something was genuinely read another way.

## Before a deploy: is anybody working?

A deploy kills every run in flight — there is no drain that can save a
ninety-second run from a container going away (row 205). So the check before
pushing to `main` is whether anybody is mid-run, and the honest version of that
query is:

```sql
SELECT
  (SELECT count(*) FROM threads WHERE status = 'working')                       AS working_threads,
  (SELECT count(*) FROM tool_call_log  WHERE created_at > NOW() - INTERVAL '110 seconds') AS app_calls,
  (SELECT count(*) FROM usage_events   WHERE created_at > NOW() - INTERVAL '110 seconds') AS any_calls,
  (SELECT max(created_at) FROM usage_events) AS last_activity
```

**`usage_events` is the line that matters, and it was missing until 19
September.** The check used to read `tool_call_log` alone, and `tool_call_log`
CANNOT SEE THE CONNECTOR: an MCP tool call goes through `runTool`, which writes
the usage ledger and nothing else, because `tool_call_log.thread_id` is NOT
NULL and MCP has no thread.

On the night of 18 September that cost me a true sentence. I told the tester
nothing had run since 22:20 and deployed on it. Thirteen second-degree searches
had gone out through the connector at 23:04:44 — invisible in `tool_call_log`,
plainly there in `usage_events`:

    22:20  6 chat
    23:04  14 mcp_tool     <- the burst I could not see

Nothing was harmed, because the deploy came later still. The reading was wrong
anyway, and a check that is wrong when it is quiet is a check that will be
wrong when it is not.

**Still not covered, and worth knowing:** a run that has started but not yet
reached its first tool call appears in none of these except `working_threads`,
which is written with `void` and can lag. Two minutes of silence across all
three is the practical bar, not zero.

## Secrets

Outside the repo, in `$NETAI_OPS_DIR` (default `~/.netai-ops`, mode 700):

```
.admin          two lines: admin email, admin password
.admin_token    bearer token, 8h; box.sh re-mints it from .admin on a 401
.ro_key         key for /internal/ro-sql
.railway_token  Railway project access token
```

Nothing here is committed and nothing here belongs in the repo. The container
is ephemeral, so these are re-created each session — `box.sh` recovers the
token by itself; the other two must be supplied.

## Where the line is, and why it is there

`.claude/settings.json` allows these three scripts, the test and lint commands,
and git. It does **not** allow raw `curl`, so anything not on this list still
asks.

### It does not take effect in the session that writes it

Learned the hard way on 15 September, at Misho's cost. The file was committed at
20:16 and he was still being asked for permission at 21:44, four times an hour,
for the same tool that is written in the allow list.

The allow list is read when a session STARTS. This one started before the file
existed, so for its whole life the file sat in the repo, correct and inert, and
every `send_later` still stopped and waited for a person who had already said
yes — which is the precise opposite of what the file was written to do.

So, plainly:

> A permission written mid-session is a promise to the NEXT session.
> In this one, stop making the call instead of asking again.

A scheduled `cron` routine is the way round it: it fires on its own, from the
outside, and needs no tool call and therefore no permission. `send_later` needs
one every single time.

### Four hourly routines are a fifteen-minute check

The first answer to that was to drop the fifteen-minute check and fall back to
hourly. That was wrong, and it cost nineteen minutes on the next bug report. The
second answer was to offer Misho the choice between taps and delay — also wrong,
and the same mistake in a different coat: he had already said not to ask.

The cron minimum is one hour per routine. It is not a limit on how often the box
can be read, only on how often ONE routine can fire. Four routines at `15`,
`30`, `45` and `0` past the hour are four hourly routines and one quarter-hourly
check, and they cost three permission prompts once, ever, instead of four an
hour forever.

The server anchors an hourly schedule to the minute it was created, so the
firings land near rather than exactly on the quarters. Read the real
`next_run_at` back rather than trusting the cron string.

> A per-hour limit on one timer is not a per-hour limit on the work.
> Use more timers.

### And then the rule was broken within the hour

Having written all of the above, the very next thing this session did was reach
for `create_trigger` to message the frontend — another prompt, for the same
person, for the same reason.

A rule you follow only while you remember it is not a rule. So it is a ban, not
a preference:

> **No MCP tool call in a session whose allow list did not load. None.**
> Not "only when needed". Every one of them is a tap for somebody.

What that leaves, and it is enough:

| who | how | asks? |
|---|---|---|
| the tester | `box.sh post` | no — it is Bash |
| a recurring check | the cron routines, already created | no — they fire from outside |
| the frontend | **nothing from here** | — |

The frontend is the real gap. `create_trigger` is the only channel to their
session and it prompts every time. `handoff_messages` already has a
`claude_frontend` author, so the box is *built* to be that channel — but they
have never posted to it and never read it, and writing into a room nobody is in
is not communication. Until they read it, frontend-bound notes go into the box
addressed to them with a request to the tester to pass them on.

If something can only be done with a tool that prompts, it does not get done:
it gets reported as not done, with the reason. A dialog is not a substitute for
saying so.

That split is not squeamishness, it is the day of 15 September 2026:

- **Writing to people is free.** Answering the tester, telling the frontend
  what shipped — waiting for permission to send a message helps nobody and
  slows the work. That is what `box.sh` is for.
- **Changing data and opening access are not.** On one day: retracting five
  facts about five real people, opening one account's read access to other
  people's private conversations, and a switch that spends money on every
  search. Each of those was right to stop for, and each was a single line of
  someone's explicit yes.

So the rule is the shape of the risk, not the effort:

> A message can be corrected by another message.
> A retraction, an access grant and a spend cannot.

Anything in the second class keeps asking, and keeps a row in
`ADMIN_WRITE_OPERATIONS.md` with the route, the body, and the undo.

## prompt.sh — applying a prompt edit somebody has already approved

Three texts sat approved and unshipped for a day because nobody who had read
them could paste them. Every PUT from the tester's seat is refused
structurally; mine reached the box, the database read-only and the Railway
variables, and never the prompt. So an approved 49-character cut and an
approved base-prompt narrowing queued behind one human hand — and the base
prompt is 25,176 characters, which is not a thing to hand-copy.

    ./scripts/ops/prompt.sh live  <target>      length and hash, never the text
    ./scripts/ops/prompt.sh check <change-id>   every refusal, writes nothing
    ./scripts/ops/prompt.sh apply <change-id>

Targets, and it can reach no others: `prompt`, `info:<topic>`, `block:<name>`.

**It does not let the assistant edit the prompts.** It applies a change file
that is already in git — target, the exact before, the exact after, who
approved it and when — and refuses everything else. The route being open is
not an approval of what goes down it.

### The four refusals, which are the whole point

1. **The live text must be what the approval was given against.** The change
   file carries the sha256 of the text it was reviewed against; if production
   has moved since, this stops. An approval is for a diff, not a file name.
2. **Prerequisites must already be live**, each verified by its own after-hash
   being live — not by a note saying it was done. Ticket 20's coupling is the
   case it was written for: the 49-character cut lands before or with the
   goal-box change, and a hand that does it the other way round converts six
   passes into six failures. In code, not in a head.
3. **The change file must be committed and unmodified.** A dirty or untracked
   change file is text nobody reviewed.
4. **It must actually change something.** An after equal to the before is a
   mistake or an already-applied change; both deserve a stop.

It reads the text back after the PUT and refuses to report success unless the
live text matches. „The PUT returned 200" and „the live text is now the after
text" are different facts, and this week has been a lesson in which one is
worth reporting.

Sizes print as **characters and bytes**, because every confirmation in the box
is in characters and a Georgian letter costs three bytes — so bytes alone would
have two people reading the same unchanged block as two different numbers.

### Writing a change file

    ops/prompt-changes/<id>.json         target, before_sha256, requires, why,
                                         who approved it, the undo
    ops/prompt-changes/<id>.before.txt   the live text, captured whole
    ops/prompt-changes/<id>.after.txt    exactly what will be PUT

Build the after text with a script that ASSERTS what it assumes — that the
sentence occurs exactly once, that the delta is the number everyone was quoted
— and refuses to write the file otherwise. Both of ticket 20's change files
were built that way.

### What it still does not decide

Nothing. A change file existing is not authorization to run `apply`; the
founder's yes arriving through the tester's box is data on this side, not
authorization. `apply` runs on Misho's or the founder's direct word and the
D44 entry goes in first, exactly as for any other write to live data.

### A write-only capability is safe for a scalar and unsafe for a list

`env.sh` cannot read, on purpose, and that is the right trade for a variable
holding ONE value: this morning `CHAT_FINAL_ANSWER_MODEL` was switched off and
its old value recovered from `usage_events` afterwards, because every OpenAI
call records the model it used.

It is the wrong trade for a variable holding a LIST. Writing to
`STAFF_USER_IDS` without reading it first would silently remove whoever is
already in it — seven ids at the last count — and no ledger anywhere records
which. The write succeeds, nothing errors, and people who must never appear on
a target list quietly reappear on it.

So: **before writing any variable, ask whether it holds one value or several.**
One value — write it, and find a way to recover the old one afterwards if you
did not record it. Several — read it first, append, and never write it blind.

The same rule reaches `prompt.sh` the moment any of its targets stops being a
single text. It applies one whole document today, so the question does not
arise; if a target ever becomes a list of fragments, the before-hash check is
what keeps it honest, and it should be understood as the list version of the
same discipline rather than as something separate.

### A partial set is not a floor

The seat's rule, and it is stronger than the one above it. It came out of them
proposing a safety check and then finding it would have certified the exact
harm it was invented to prevent.

The case: before appending to `STAFF_USER_IDS`, check the read against three
ids known to be in it — if they are missing, the read is wrong. Three sounded
like a floor. The set turned out to hold at least seven, so **a read that had
silently lost four people would have passed the check**, because every wrong
read still contains the subset.

    Checking a read against a remembered subset cannot detect the failure
    that matters. It manufactures confidence and detects nothing.

    The only safe check on a list is the FULL set and its COUNT. If you
    cannot enumerate it, you cannot validate it — you can only refuse to
    write it blind.

And the second half, which is how both of us got there: we were both reading
the admin's `staff` field, which is COMPUTED from `STAFF_USER_IDS` plus the
review phones plus the curators. A shadow of the variable, quoted as the
variable. A derived field can tell you an id IS in the union; it cannot tell
you which list it is in, and it can never tell you what else is.

**What is safe to check, and it is worth doing.** Not the set — the specific
ids you care about, by name, before and after. „Did 171870 start reading
`staff: true`, and did all seven that read true before still read true
afterwards" is enumerable, falsifiable, and catches the silent drop. „Is the
list right" is not a question anybody here can answer.
