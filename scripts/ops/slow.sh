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

VERDICT[0] = 0
emit("READY - %d day(s) since %s carry %s+ calls to %s%s:" % (len(rows), since, need, tool, whose))
emit("  %-10s %7s %8s  %-20s %7s" % ("day", "calls", "p50", "rest-of-day", "ratio"))
for r in rows:
    phases = int(r["phase_rows"])
    mine = r["tool_p50"]
    rest = r["rest_p50"]
    # A day on which this account called nothing else has no control, and a
    # blank is the honest print. A ratio invented from one number is the fault
    # this whole gate exists to stop.
    ratio = ("%.2fx" % (float(mine) / float(rest))) if mine and rest else "-"
    emit("  %-10s %7s %8s  %-20s %7s%s" % (
        str(r["day"])[:10], r["calls"],
        mine if mine else "-",
        ("%s (%s calls)" % (rest, r["rest_calls"])) if rest else "no control",
        ratio,
        ("   +%d phase row(s), not counted" % phases) if phases else ""))
emit("")
emit("RATIO is the tool p50 against every OTHER tool the account called that")
emit("day. It is the column to read across days: a p50 that fell while the")
emit("ratio held is a quiet day, not a faster tool. A control tool picked by")
emit("hand is not a substitute - search_by_tag moved WITH the subject here,")
emit("and a tool that shares the bottleneck is a second subject.")
emit("")
emit("Volume and one control. A qualifying day means the numbers are worth")
emit("reading; it does not mean they say what you hoped. Read them with the")
emit("tool name as the second argument.")

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
SELECT DATE_TRUNC('day', created_at) AS day,
       COUNT(*) FILTER (WHERE tool = '$READY_TOOL') AS calls,
       COUNT(*) FILTER (WHERE tool LIKE '$READY_TOOL:%') AS phase_rows,
       ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY duration_ms)
             FILTER (WHERE tool = '$READY_TOOL')) AS tool_p50,
       -- The control: everything else this account ran that day. Phase rows of
       -- the tool under test are excluded from BOTH sides — they are neither
       -- the subject nor independent of it.
       ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY duration_ms)
             FILTER (WHERE tool <> '$READY_TOOL'
                       AND tool NOT LIKE '$READY_TOOL:%')) AS rest_p50,
       COUNT(*) FILTER (WHERE tool <> '$READY_TOOL'
                          AND tool NOT LIKE '$READY_TOOL:%') AS rest_calls
FROM tool_call_log
WHERE created_at >= '$READY_FROM'
  AND duration_ms IS NOT NULL
  $USER_CLAUSE
GROUP BY 1
HAVING COUNT(*) FILTER (WHERE tool = '$READY_TOOL') >= $READY_MIN
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
