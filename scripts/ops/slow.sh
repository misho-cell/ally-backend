#!/bin/bash
# „Is this tool slow, and did the change help?" — with the one question the
# numbers cannot answer for themselves built into the gate.
#
# EXIT CODES ARE THE ANSWER, and there are FOUR of them because there are four
# answers:
#
#   0  READY          — enough calls, and the same people made them
#   1  NOT YET        — not enough calls to read anything
#   2  COULD NOT READ — the window did not answer; never „nothing is wrong"
#   3  NOT COMPARABLE — enough calls on both sides, made BY DIFFERENT PEOPLE
#
# ════════ WHY THE FOURTH ONE EXISTS — 24 September, 07:20 ════════
#
# The last open row in TASKS.md is „confirm 9b29800 on live traffic", blocked
# since 20 September because account 501 has not run 50 searches in a day since
# the change. The account argument is optional, so I dropped it and asked
# across everybody. The gate answered:
#
#     READY - 5 day(s) since 2026-09-13 carry 50+ calls:
#       16 Sep    94   p50 6519   ratio 5.39x      before the change
#       17 Sep   183   p50 6870   ratio 4.55x
#       18 Sep   174   p50 7434   ratio 4.58x
#       22 Sep   585   p50 1829   ratio 1.77x      after
#       23 Sep   202   p50 2138   ratio 2.30x
#
# A four-fold improvement, with the control moving the right way. It is not
# true. Broken down by account:
#
#     16-18 Sep   501 (Tornike, 2,464 threads) makes 68 / 126 / 154 of them
#     22-23 Sep   ten accounts named „Netai Test 1..10", every one a test seat
#
# The population did not shift. It was REPLACED — the largest real network in
# the product on one side, ten fresh seats on the other — and a second-degree
# search costs what the network costs. The whole difference is whose contacts
# were being walked.
#
# 501 alone, which IS comparable: p50 7552/7448/7593 before, 4622 on 22 Sep,
# and calls over ten seconds 37% / 29% / 36% before against 3% after. That is a
# real and much smaller claim, on 39 calls, and 39 is not 50.
#
# This is the eighth time this codebase has produced a number whose POPULATION
# nobody asked for, and the first time the thing producing it was the gate
# written to stop it. So the population is now printed on every row and the
# verdict refuses to say READY when it changed.
#
# THE RATIO DID NOT CATCH IT, and could not have. It controls for „was the
# whole day slow", which is a different confound; both the subject and the
# control were the seats on 22 September, so the ratio was internally
# consistent and externally meaningless.

READY_PY='
import os, sys, json

# THE EXIT CODE IS THE ANSWER, so nothing about PRINTING may change it.
#
# Found by piping this gate through `head`: the reader closed the pipe, the
# print raised BrokenPipeError, and a READY day left with a non-zero status —
# which to any caller reads as NOT YET. The same shape as the PIPESTATUS trap
# noted below: a failure in the plumbing wearing the verdict of the thing being
# measured. The verdict is decided before any of it is printed, and a reader
# who walks away cannot change it.
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
tool = os.environ["READY_TOOL"]
need = os.environ["READY_MIN"]
since = os.environ["READY_FROM"]
who = os.environ.get("READY_USER", "")
whose = (" on account %s" % who) if who else ""

if not d.get("success"):
    emit("could not read: " + str(d.get("error", ""))[:160])
    raise SystemExit(2)

rows = d["data"]["rows"]
if not rows:
    VERDICT[0] = 1
    emit("NOT YET - no day since %s carries %s+ calls to %s%s." % (since, need, tool, whose))
    emit("         That says the measurement cannot be TAKEN, not that the")
    emit("         change did nothing. They are different answers.")
    raise SystemExit(1)

# ════════ WAS IT THE SAME PEOPLE ════════
#
# Two days can each carry a thousand calls and still not be comparable, and
# nothing in a p50 says so. The tool under test walks a network, so its cost is
# a property of WHOSE network - which makes „who called" part of the
# measurement and not context around it.
#
# Two things are checked, and both are about the shape of the population rather
# than its size:
#
#   * the biggest caller changed between the first and the last qualifying day
#   * the share of calls made by TEST SEATS moved by more than 25 points
#
# The second is the one that fired on 24 September: 0% seats before the change,
# 100% after. The threshold is deliberately loose - it is there to catch a
# replacement, not to police a drift - and the first rule catches the narrower
# case where one account simply hands over to another.
SEAT_SHARE_POINTS = 25


def share(part, whole):
    return (100.0 * float(part) / float(whole)) if whole else 0.0


seat_shares = [share(r["seat_calls"], r["calls"]) for r in rows]
tops = [str(r["top_user"]) for r in rows]
changed = []
if len(rows) > 1:
    if tops[0] != tops[-1]:
        changed.append("the biggest caller changed: account %s on %s, account %s on %s"
                       % (tops[0], str(rows[0]["day"])[:10], tops[-1], str(rows[-1]["day"])[:10]))
    if max(seat_shares) - min(seat_shares) > SEAT_SHARE_POINTS:
        changed.append("test seats made %.0f%% of the calls on one qualifying day and %.0f%% on another"
                       % (min(seat_shares), max(seat_shares)))

VERDICT[0] = 3 if changed else 0
headline = "READY" if not changed else "READY BY VOLUME, NOT COMPARABLE"
emit("%s - %d day(s) since %s carry %s+ calls to %s%s:" % (headline, len(rows), since, need, tool, whose))
emit("  %-10s %7s %8s  %-20s %7s  %-8s %-14s %6s"
     % ("day", "calls", "p50", "rest-of-day", "ratio", "accounts", "biggest", "seats"))
for r, seats in zip(rows, seat_shares):
    phases = int(r["phase_rows"])
    mine = r["tool_p50"]
    rest = r["rest_p50"]
    # A day on which this account called nothing else has no control, and a
    # blank is the honest print. A ratio invented from one number is the fault
    # this whole gate exists to stop.
    ratio = ("%.2fx" % (float(mine) / float(rest))) if mine and rest else "-"
    emit("  %-10s %7s %8s  %-20s %7s  %-8s %-14s %5.0f%%%s" % (
        str(r["day"])[:10], r["calls"],
        mine if mine else "-",
        ("%s (%s calls)" % (rest, r["rest_calls"])) if rest else "no control",
        ratio,
        r["accounts"],
        "%s (%.0f%%)" % (r["top_user"], share(r["top_calls"], r["calls"])),
        seats,
        ("   +%d phase row(s), not counted" % phases) if phases else ""))
emit("")

if changed:
    emit("THE DAYS ARE NOT THE SAME POPULATION, so the numbers above cannot be read")
    emit("across the change:")
    for line in changed:
        emit("  * " + line)
    emit("")
    emit("This tool walks a NETWORK, so what it costs is a property of whose network")
    emit("it walked. Comparing a day of one large real account against a day of fresh")
    emit("test seats measures the difference between two people, not the deploy.")
    emit("")
    emit("Give an account as the fifth argument and ask again. If that account has")
    emit("no qualifying day, the honest answer is that the measurement cannot yet be")
    emit("taken - which is what this gate is for.")
    emit("")

emit("RATIO is the tool p50 against every OTHER tool the account called that")
emit("day. It is the column to read across days: a p50 that fell while the")
emit("ratio held is a quiet day, not a faster tool. A control tool picked by")
emit("hand is not a substitute - search_by_tag moved WITH the subject here,")
emit("and a tool that shares the bottleneck is a second subject.")
emit("")
emit("AND THE RATIO CANNOT SEE THE POPULATION. It controls for a slow day. When")
emit("the subject and the control are both a different set of accounts, it stays")
emit("internally consistent and says nothing - which is exactly how a fourfold")
emit("improvement was read off ten test seats on 24 September.")
emit("")
emit("Volume, one control, and one population. A qualifying day means the numbers")
emit("are worth reading; it does not mean they say what you hoped. Read them with")
emit("the tool name as the second argument.")

# AND THE VERDICT LEAVES WITH IT. This line is the whole point of the change
# and it was missing on the first run: the text said NOT COMPARABLE in capital
# letters and the script exited 0, because the READY path had always simply
# fallen off the end. A caller that reads the exit code - which is every caller
# this file has, by its own contract four lines into the header - would have
# been told READY while the screen said the opposite.
#
# A gate whose printed answer and returned answer disagree is worse than no
# gate. That is the same shape as `quiet.sh | tail`, found two days ago.
raise SystemExit(VERDICT[0])

'

if [ "${1:-}" = --ready ]; then
  export READY_TOOL="${2:?usage: slow.sh --ready <tool> <min-calls> [since-date] [account]}"
  export READY_MIN="${3:?usage: slow.sh --ready <tool> <min-calls> [since-date] [account]}"
  export READY_FROM="${4:-2026-01-01}"
  # One account, or every account when it is left out. Quoted into the SQL as
  # a literal like every other argument here — this file reaches a read-only
  # endpoint with a fixed statement and is not a query builder.
  export READY_USER="${5:-}"
  USER_CLAUSE=""
  [ -n "$READY_USER" ] && USER_CLAUSE="AND user_id = '$READY_USER'"
  HERE="$(cd "$(dirname "$0")" && pwd)"
  "$HERE/ro.sh" <<SQL | python3 -c "$READY_PY"
WITH logged AS (
  SELECT DATE_TRUNC('day', created_at) AS day, user_id, tool, duration_ms
    FROM tool_call_log
   WHERE created_at >= '$READY_FROM'
     AND duration_ms IS NOT NULL
     $USER_CLAUSE
),
-- WHO MADE THE CALLS, per day. This is not decoration: the tool under test
-- walks a network, so its cost belongs to the caller and two days with
-- different callers are two different measurements wearing one name.
by_account AS (
  SELECT day, user_id, COUNT(*) AS n,
         EXISTS (SELECT 1 FROM test_seats ts WHERE ts.user_id::text = logged.user_id) AS seat
    FROM logged
   WHERE tool = '$READY_TOOL'
   GROUP BY day, user_id
),
population AS (
  SELECT day,
         COUNT(*)                                        AS accounts,
         SUM(n)                                          AS calls,
         MAX(n)                                          AS top_calls,
         COALESCE(SUM(n) FILTER (WHERE seat), 0)         AS seat_calls,
         (ARRAY_AGG(user_id ORDER BY n DESC))[1]         AS top_user
    FROM by_account
   GROUP BY day
)
SELECT p.day,
       p.calls,
       p.accounts,
       p.top_user,
       p.top_calls,
       p.seat_calls,
       (SELECT COUNT(*) FROM logged l
         WHERE l.day = p.day AND l.tool LIKE '$READY_TOOL:%')          AS phase_rows,
       (SELECT ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY l.duration_ms))
          FROM logged l WHERE l.day = p.day AND l.tool = '$READY_TOOL') AS tool_p50,
       -- The control: everything else that ran that day. Phase rows of the
       -- tool under test are excluded from BOTH sides — they are neither the
       -- subject nor independent of it.
       (SELECT ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY l.duration_ms))
          FROM logged l WHERE l.day = p.day AND l.tool <> '$READY_TOOL'
                          AND l.tool NOT LIKE '$READY_TOOL:%')          AS rest_p50,
       (SELECT COUNT(*) FROM logged l
         WHERE l.day = p.day AND l.tool <> '$READY_TOOL'
           AND l.tool NOT LIKE '$READY_TOOL:%')                         AS rest_calls
FROM population p
WHERE p.calls >= $READY_MIN
ORDER BY 1
LIMIT 60
SQL
  # The pipeline's EXIT CODE is python's, never curl's — the same trap that let
  # a red `npm run verify` through a `| tail` on 20 September.
  exit "${PIPESTATUS[1]}"
fi

SINCE="${1:-7 days}"
TOOL="${2:-}"
HERE="$(cd "$(dirname "$0")" && pwd)"

if [ -n "$TOOL" ]; then
  # One tool, one row per day. The prefix match is deliberate: a phase-tagged
  # tool („search_second_degree:opening") and its untagged self are different
  # populations and both are wanted.
  "$HERE/ro.sh" <<SQL | python3 -c '
import sys, json
d = json.load(sys.stdin)
if not d.get("success"):
    print("could not read:", d.get("error", "")[:160]); raise SystemExit(1)
rows = d["data"]["rows"]
if not rows:
    print("no calls to that tool in that window"); raise SystemExit
print("%-12s %-30s %6s %7s %8s %8s %8s" % (
    "day", "tool", "calls", "failed", "p50", "p90", "max"))
for r in rows:
    print("%-12s %-30s %6s %7s %7sms %7sms %7sms" % (
        str(r["day"])[:10], r["tool"], r["calls"], r["failed"],
        r["p50"], r["p90"], r["max_ms"]))
print()
print("A change is judged against the days either side of it, on days with")
print("COMPARABLE VOLUME. Calls that fell to a handful explain a p50 on their")
print("own, and no deploy is needed to produce one.")
'
SELECT DATE_TRUNC('day', created_at) AS day,
       tool,
       COUNT(*) AS calls,
       COUNT(*) FILTER (WHERE NOT ok) AS failed,
       percentile_disc(0.5) WITHIN GROUP (ORDER BY duration_ms) AS p50,
       percentile_disc(0.9) WITHIN GROUP (ORDER BY duration_ms) AS p90,
       MAX(duration_ms) AS max_ms
FROM tool_call_log
WHERE created_at > NOW() - INTERVAL '$SINCE'
  AND duration_ms IS NOT NULL
  AND (tool = '$TOOL' OR tool LIKE '$TOOL:%')
GROUP BY 1, 2
ORDER BY 2, 1
LIMIT 100
SQL
  exit 0
fi

"$HERE/ro.sh" <<SQL | python3 -c '
import sys, json
d = json.load(sys.stdin)
if not d.get("success"):
    print("could not read:", d.get("error", "")[:160]); raise SystemExit(1)
rows = d["data"]["rows"]
if not rows:
    print("no tool calls in that window"); raise SystemExit
print("%-32s %6s %8s %8s %8s %7s" % ("tool", "calls", "p50", "p90", "max", "failed"))
for r in rows:
    print("%-32s %6s %7sms %7sms %7sms %7s" % (
        r["tool"], r["calls"], r["p50"], r["p90"], r["max_ms"], r["failed"]))
print()
print("Compare against the header of this file. A p90 that has not moved after")
print("a change made on a bench means the bench measured the wrong thing — and")
print("one that HAS moved means nothing until you re-run with the tool name as")
print("the second argument and check the volume moved with it.")
'
SELECT tool,
       COUNT(*) AS calls,
       percentile_disc(0.5) WITHIN GROUP (ORDER BY duration_ms) AS p50,
       percentile_disc(0.9) WITHIN GROUP (ORDER BY duration_ms) AS p90,
       MAX(duration_ms) AS max_ms,
       COUNT(*) FILTER (WHERE NOT ok) AS failed
FROM tool_call_log
WHERE created_at > NOW() - INTERVAL '$SINCE'
  AND duration_ms IS NOT NULL
GROUP BY tool
HAVING COUNT(*) >= 3
ORDER BY percentile_disc(0.9) WITHIN GROUP (ORDER BY duration_ms) DESC
LIMIT 25
SQL
