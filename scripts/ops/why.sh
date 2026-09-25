#!/bin/bash
# „What did the product say no to, and did anybody lose anything by it?"
#
# EXIT CODE IS THE ANSWER: 0 = read it, 1 = nothing said no in that window,
# 2 = could not look. „I could not look" is never reported as „nothing is
# wrong".
#
# `why.sh --new [days]` asks a NARROWER question that a Routine can act on:
# which reasons are being said for the FIRST TIME. Same three codes, and 0
# there means „something new, go and read it".
#
# ════════ WHY THIS EXISTS — 25 September ════════
#
# `slow.sh` has printed a column called `failed` since it was written. It is
# `COUNT(*) FILTER (WHERE NOT ok)`, and I read it all day as breakage. Then I
# went and looked at the rows behind the biggest number in it:
#
#     ask_contact    300 calls    122 „failed"
#
# Every one of the top eight reasons is a guard doing exactly its job — the
# same person was already asked today, the plan was approved in this same turn
# so day one is already writing, the recipient is on the never-contact list,
# the goal is closed. 76 of the 122 were test seats hammering the product on
# purpose. Nothing broke. The product declined, in Georgian, and was right to.
#
# `ok` in `tool_call_log` is written by `outcomeOf`, and it means „the call did
# not do the thing". A refusal did not do the thing. A fault did not do the
# thing. ONE BOOLEAN, TWO MEANINGS — and the one I acted on all day was the
# rarer of the two.
#
# AND THE CONFUSION ONLY RUNS ONE WAY, which makes it worse rather than better:
# a tool that THROWS is never written down at all. `runOneToolBlock` logs after
# the await, so an exception leaves no row behind. Every `ok = false` row in
# this table is therefore a result object some tool chose to return —
# overwhelmingly a guard. The column named `failed` cannot see a crash and is
# mostly counting the product working.
#
# ════════ SO THIS FILE CLASSIFIES NOTHING ════════
#
# The obvious next move is a third value — ok / refused / broke — decided here.
# I am not writing it, and the reason is the mistake this codebase keeps
# making: I would have to decide it from the error TEXT, and „is the message in
# Georgian" is a fact about who the sentence was written for, not about whether
# anything is wrong. Several of the English ones are guards too. A classifier
# built on that reads as authority and is a guess.
#
# What IS structural, and is the whole point of this script:
#
#   * THE REASON, printed as the product wrote it, so a person reads sentences
#     instead of a count. 122 ask_contact „failures" in a week are 32 distinct
#     sentences, and reading four of them answers the question the count only
#     raised.
#   * WHAT THE RUN DID NEXT. Did it call the SAME tool again in the SAME run,
#     and did that one work? Three outcomes, printed side by side: `→ok`,
#     `→no`, `stop`.
#
# ════════ AND `stop` IS NOT „SOMEBODY LOST SOMETHING" ════════
#
# The first version of this script had a fourth column called `lost`, defined
# as „the run never came back", and I believed it until I ran it: 148 of 271.
# The biggest single contributor was
#
#     „Nothing sent, and nothing is needed from you: you approved the plan in
#      this same turn, and day one is already starting behind your reply"
#
# — a refusal whose ENTIRE PURPOSE is to make the run stop calling that tool.
# 21 runs obeyed it, and my column called all 21 a loss.
#
# That is this month's recurring fault, committed inside the script written to
# stop it: the measurement was right and the question was different. „Did not
# retry" is a fact; „lost something" is an interpretation, and which one it is
# depends on what the refusal ASKED the run to do. So the three outcomes are
# printed and none of them is named a verdict. For a guard, `stop` is the
# correct outcome. For „route.name is required", `stop` is a run that gave up.
# The reason is on the same line; read them together.
#
# A connector call has no run, so it cannot be asked what its run did next.
# Those are counted and named, never folded into any of the three.
#
# WHERE THIS SITS. `slow.sh` counts the nos and times the calls. `errors.sh`
# has the failures a PERSON saw, which are a different table and a much
# smaller set. This one is in between: the calls that did not go through,
# in the product's own words, whether or not anybody ever noticed.
#
# ════════ AND WHY `--new` EXISTS, THE SAME AFTERNOON ════════
#
# The first thing this script found, over 30 days, was 51 rows of
# „canceling statement due to statement timeout" on the opening second-circle
# search, 16-18 September. **59% of the founder's opening searches died on a
# database timeout for three days and nothing anywhere said so.** The rows had
# been sitting in `slow.sh`'s `failed` column the whole time.
#
# Printing everything every run does not fix that: it hands a person 12 tools
# and 40 wordings and asks them to notice which one is new. So `--new` asks the
# one question a Routine can act on — **which reasons are being said for the
# first time** — and says nothing when the answer is none.
#
# IT ANSWERS FIRST APPEARANCE AND NOTHING ELSE. A reason that has been there
# all week and doubled today is invisible to it, deliberately: that is a
# different measurement and pretending one number does both is how this month
# went wrong. And „first ever" is bounded by the table's own oldest row, which
# is printed every run — a reason older than the table cannot be told from a
# new one, and that is a limit, not a result.
#
# Usage:  ./scripts/ops/why.sh [days] [tool]
#         ./scripts/ops/why.sh --new [days]
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"

if [ "${1:-}" = --new ]; then
  NEW_DAYS="${2:-1}"
  case "$NEW_DAYS" in
    ''|*[!0-9]*) echo "usage: why.sh --new [days]" >&2; exit 2 ;;
  esac
  export NEW_DAYS

  NEW_PY='
import os, sys, json

VERDICT = [2]


def emit(line):
    try:
        print(line)
    except BrokenPipeError:
        try:
            sys.stdout.close()
        except Exception:
            pass
        os._exit(VERDICT[0])


d = json.load(sys.stdin)
days = os.environ["NEW_DAYS"]

if not d.get("success"):
    emit("could not read: " + str(d.get("error", ""))[:160])
    raise SystemExit(2)

rows = d["data"]["rows"]
if not rows:
    VERDICT[0] = 1
    # Nothing is printed on this path beyond the one line, because a Routine
    # runs this and „nothing new" written out every hour is the noise that
    # makes a real line unreadable.
    emit("No reason has been said for the first time in the last %s day(s)." % days)
    raise SystemExit(1)

VERDICT[0] = 0

# HOW FAR BACK „FIRST EVER" CAN SEE. The table starts where it starts, and a
# reason older than its oldest row is indistinguishable from a new one. Printed
# every run, never inferred away — the same treatment errors.sh gives Railway
# handing back only a hundred deployments.
horizon = str(rows[0]["table_starts"])[:10]

emit("%d reason(s) said for the FIRST TIME in the last %s day(s)." % (len(rows), days))
emit("")
emit("First-ever is bounded by the oldest row in tool_call_log, %s. A reason older" % horizon)
emit("than that cannot be told from a new one. This asks about FIRST APPEARANCE and")
emit("nothing else: a reason that has been there all week and doubled today does not")
emit("appear here, and that is a different measurement, not a quiet one.")
emit("")

for r in rows:
    seats = int(r["seat_calls"])
    emit("%s  %s" % (str(r["first_seen"])[:19].replace("T", " "), str(r["tool"])[:40]))
    emit("   %s call(s) since, %s account(s), %d from test seats%s"
         % (r["calls_ever"], r["accounts"], seats,
            "  <- ALL of them" if seats == int(r["calls_ever"]) else ""))
    emit("   %s" % str(r["reason"]).replace("\n", " ")[:200])
    emit("")

emit("-" * 78)
emit("A NEW REASON IS NOT A NEW FAULT. Most of these will be a guard meeting a case")
emit("it had not met yet, which is the guard working. Read the sentence: the product")
emit("wrote it to be read. Then why.sh <days> <tool> for what the runs did about it.")

raise SystemExit(VERDICT[0])
'

  "$HERE/ro.sh" <<SQL | python3 -c "$NEW_PY"
WITH said_no AS (
  SELECT tool, user_id, created_at,
         COALESCE(NULLIF(TRIM(error_text), ''),
                  '(no reason recorded - the row predates migration 148)') AS reason
    FROM tool_call_log
   WHERE ok IS FALSE
)
SELECT s.tool,
       LEFT(s.reason, 300)       AS reason,
       MIN(s.created_at)         AS first_seen,
       MAX(s.created_at)         AS last_seen,
       COUNT(*)                  AS calls_ever,
       COUNT(DISTINCT s.user_id) AS accounts,
       COUNT(*) FILTER (
         WHERE EXISTS (SELECT 1 FROM test_seats ts WHERE ts.user_id::text = s.user_id)
       )                         AS seat_calls,
       (SELECT MIN(created_at) FROM tool_call_log) AS table_starts
  FROM said_no s
 GROUP BY 1, 2
HAVING MIN(s.created_at) > NOW() - INTERVAL '$NEW_DAYS days'
 ORDER BY 3 DESC
 LIMIT 100
SQL
  exit "${PIPESTATUS[1]}"
fi

DAYS="${1:-7}"
TOOL="${2:-}"

case "$DAYS" in
  ''|*[!0-9]*) echo "usage: why.sh [days] [tool]" >&2; exit 2 ;;
esac

TOOL_CLAUSE=""
if [ -n "$TOOL" ]; then
  # Quoted into the SQL as a literal, like every other argument under
  # scripts/ops: this reaches a read-only endpoint with a fixed statement and
  # is not a query builder.
  case "$TOOL" in
    *"'"*) echo "why.sh: a tool name has no quote in it" >&2; exit 2 ;;
  esac
  TOOL_CLAUSE="AND tool = '$TOOL'"
fi

# How many (tool, reason) pairs are read back. A reason that carries a person's
# name in it — „person Avto Gegenava: route must name one of the plan's routes"
# — is a DIFFERENT pair every time, so this fills up far faster than the number
# of distinct faults suggests. If it fills, the script says so rather than
# printing a total that is quietly a partial one.
ROW_CAP=400

export WHY_DAYS="$DAYS" WHY_TOOL="$TOOL" WHY_CAP="$ROW_CAP"

WHY_PY='
import os, sys, json

# The verdict is decided before anything is printed, so a reader who walks away
# from the pipe cannot change it (slow.sh, 24 September: a BrokenPipeError on a
# READY day left with a non-zero status, which every caller reads as NOT YET).
VERDICT = [2]


def emit(line):
    try:
        print(line)
    except BrokenPipeError:
        try:
            sys.stdout.close()
        except Exception:
            pass
        os._exit(VERDICT[0])


d = json.load(sys.stdin)
days = os.environ["WHY_DAYS"]
tool = os.environ.get("WHY_TOOL", "")
cap = int(os.environ["WHY_CAP"])
whose = (" to %s" % tool) if tool else ""

if not d.get("success"):
    emit("could not read: " + str(d.get("error", ""))[:160])
    raise SystemExit(2)

rows = d["data"]["rows"]
if not rows:
    VERDICT[0] = 1
    emit("Nothing answered no%s in the last %s day(s)." % (whose, days))
    emit("")
    emit("That is a window with no refusals AND no faults in it. For this product that")
    emit("is far likelier to mean nobody called anything than to mean everything")
    emit("worked — check the volume in slow.sh before reading it as good news.")
    raise SystemExit(1)

VERDICT[0] = 0


def day(value):
    return str(value)[:10]


def span(row):
    first, last = day(row["first_day"]), day(row["last_day"])
    if first == last:
        return "%s only" % first[5:]
    return "%s..%s" % (first[5:], last[5:])


# The tool-level rows come from a GROUPING SET, so their run, account and reason
# counts are computed over the tool and not summed across reasons — a run that
# hit two different reasons is one run, and adding the per-reason numbers up
# would have counted it twice.
totals = [r for r in rows if r["reason"] is None]
reasons = [r for r in rows if r["reason"] is not None]


# The three outcomes, and not a verdict between them. `stop` is the CORRECT one
# for a guard that told the run to go away, and the WRONG one for a malformed
# argument the run should have fixed and resent. Which it is depends on the
# reason, which is printed on the same line.
def outcomes(row):
    runs = int(row["runs"])
    again_ok = int(row["runs_recovered"])
    again_no = int(row["runs_tried_again"]) - again_ok
    return again_ok, again_no, runs - int(row["runs_tried_again"])


by_tool = {}
for r in reasons:
    by_tool.setdefault(r["tool"], []).append(r)

calls = sum(int(t["calls"]) for t in totals)
again_no_total = sum(outcomes(t)[1] for t in totals)

emit("%d call(s)%s answered no in the last %s day(s), over %d tool(s)."
     % (calls, whose, days, len(totals)))
emit("")
emit("A NO IS NOT A BREAKAGE. `ok = false` means the call did not do the thing, and a")
emit("guard doing its job did not do the thing either. NOTHING HERE IS CLASSIFIED —")
emit("read the reason, in the words the product used, next to what the run did after")
emit("it. A count of failures is not an answer to anything.")
emit("")
emit("WHAT THE RUN DID NEXT, per reason:  ->ok  called the same tool again and it")
emit("worked   ->no  called again and got another no   stop  never called it again.")
emit("STOP IS NOT A LOSS. Most of these refusals exist precisely to make the run")
emit("stop, and a run that obeyed one did what it was told.")
emit("")

for t in sorted(totals, key=lambda x: int(x["calls"]), reverse=True):
    mine = by_tool.get(t["tool"], [])
    again_ok, again_no, stopped = outcomes(t)
    emit("%-28s %4s call(s) over %3s run(s)   ->ok %-4s ->no %-4s stop %-4s  %s"
         % (str(t["tool"])[:28], t["calls"], t["runs"],
            again_ok, again_no, stopped, span(t)))
    emit("   %s account(s), %d of the calls from test seats, %d distinct wording(s)"
         % (t["accounts"], int(t["seat_calls"]), len(mine)))
    if int(t["no_run_calls"]):
        # Never folded into any of the three: a connector call has no run, so
        # „what did the run do next" is unanswerable for it, and answering
        # anyway would be inventing a verdict.
        emit("   %d came through the CONNECTOR, which has no run, so what happened next"
             % int(t["no_run_calls"]))
        emit("   cannot be asked of them and they are in none of the three counts.")
    for r in sorted(mine, key=lambda x: int(x["calls"]), reverse=True)[:4]:
        r_ok, r_no, r_stop = outcomes(r)
        emit("   %4s  ->ok %-3s ->no %-3s stop %-3s  %s"
             % (r["calls"], r_ok, r_no, r_stop,
                str(r["reason"]).replace("\n", " ")[:110]))
    if len(mine) > 4:
        emit("   ...and %d more wording(s). A reason that carries a person’s NAME in it is"
             % (len(mine) - 4))
        emit("   a new wording every time, so that is not a number of faults.")
    emit("")

emit("-" * 78)
if again_no_total:
    emit("%d run(s) TRIED THE SAME CALL AGAIN AND GOT ANOTHER NO. That one is not a")
    emit("matter of interpretation — the run did not accept the answer, so either the")
    emit("refusal did not say what to do instead, or it said it and was not followed:")
    emit("")
    for r in sorted(reasons, key=lambda x: outcomes(x)[1], reverse=True):
        r_no = outcomes(r)[1]
        if r_no:
            emit("  %3d  %-24s %s" % (r_no, str(r["tool"])[:24],
                                      str(r["reason"]).replace("\n", " ")[:110]))
    emit("")
else:
    emit("No run tried the same call twice and got the same no twice. Every refusal in")
    emit("this window was either accepted or resolved on the next attempt.")
    emit("")
emit("A reason is truncated here at 110 characters; the column holds 300. For the")
emit("runs behind any line: ro.sh, tool_call_log, run_id, joined to \"User\". A test")
emit("seat hitting a guard is the guard being tested. A real person hitting one is")
emit("the product declining to somebody, and worth reading in full.")
emit("")
if len(rows) >= cap:
    emit("*** THE READ WAS CAPPED AT %d ROW(S) AND FILLED IT. The totals above are" % cap)
    emit("*** therefore a FLOOR and not a count. Narrow it: why.sh %s <tool>." % days)

raise SystemExit(VERDICT[0])
'

"$HERE/ro.sh" <<SQL | python3 -c "$WHY_PY"
WITH win AS (
  SELECT id, run_id, user_id, tool, ok, error_text, created_at
    FROM tool_call_log
   WHERE created_at > NOW() - INTERVAL '$DAYS days'
     $TOOL_CLAUSE
),
said_no AS (
  SELECT id, run_id, user_id, tool, created_at,
         COALESCE(NULLIF(TRIM(error_text), ''),
                  '(no reason recorded - the row predates migration 148)') AS reason
    FROM win
   WHERE ok IS FALSE
),
-- DID THE RUN COME BACK. The one question in this file that is about rows and
-- not about wording: a later call to the SAME tool, in the SAME run, that
-- worked. A null run_id is a connector call, which has no run to come back in,
-- so the EXISTS is false for it by construction and it is counted apart below.
-- (No semicolon anywhere in here, comments included: isReadOnlySql rejects an
-- interior one by plain text search and cannot tell a comment from a second
-- statement. That is the right guard and it cost ten minutes to remember.)
came_back AS (
  SELECT n.id,
         EXISTS (SELECT 1 FROM win w
                  WHERE w.run_id = n.run_id
                    AND w.tool = n.tool
                    AND w.id > n.id) AS tried_again,
         EXISTS (SELECT 1 FROM win w
                  WHERE w.run_id = n.run_id
                    AND w.tool = n.tool
                    AND w.ok IS TRUE
                    AND w.id > n.id) AS ok_later
    FROM said_no n
)
SELECT n.tool,
       LEFT(n.reason, 300)                                  AS reason,
       COUNT(*)                                             AS calls,
       COUNT(*) FILTER (WHERE n.run_id IS NULL)             AS no_run_calls,
       COUNT(DISTINCT n.run_id)                             AS runs,
       COUNT(DISTINCT n.run_id) FILTER (WHERE c.tried_again) AS runs_tried_again,
       COUNT(DISTINCT n.run_id) FILTER (WHERE c.ok_later)   AS runs_recovered,
       COUNT(DISTINCT n.user_id)                            AS accounts,
       COUNT(*) FILTER (
         WHERE EXISTS (SELECT 1 FROM test_seats ts WHERE ts.user_id::text = n.user_id)
       )                                                    AS seat_calls,
       MIN(n.created_at)::date                              AS first_day,
       MAX(n.created_at)::date                              AS last_day
  FROM said_no n
  JOIN came_back c ON c.id = n.id
 -- Both levels in one read. The tool-level row carries its OWN distinct counts
 -- rather than a sum of the reason rows, because one run can hit two reasons
 -- and adding them up would count that run twice.
 GROUP BY GROUPING SETS ((n.tool, LEFT(n.reason, 300)), (n.tool))
 ORDER BY 1, 2 NULLS FIRST, 3 DESC
 LIMIT $ROW_CAP
SQL
# The pipeline's EXIT CODE is python's, never curl's — the same trap that let a
# red `npm run verify` through a `| tail` on 20 September.
exit "${PIPESTATUS[1]}"
