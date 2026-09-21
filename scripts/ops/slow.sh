#!/bin/bash
# How long each tool actually takes, from tool_call_log, after the fact.
#
# WHY IT IS A FILE AND NOT A QUERY I REMEMBER. My own rule, written after
# apologising to the tester with figures on 19 September:
#
#   „a performance claim is made from tool_call_log, AFTER the fact — never
#    from EXPLAIN, before it."
#
# I broke the spirit of it again on 20 September: the `search_second_degree`
# pre-filter (row 108, fifth cut) shipped on a bench of my own running, with
# „I will read the p90 tomorrow" as the plan. A plan that depends on me
# remembering is not a plan. This is the reading, as a command.
#
# WHAT TO COMPARE IT AGAINST — the figures that sent me looking, 7 days to
# 20 September, BEFORE the pre-filter:
#
#   search_second_degree   503 calls   p50  6,470   p90 15,161   max 33,995
#   search_by_tag          676 calls   p50  3,989   p90 10,417   max 22,853
#   web_search             297 calls   p50  4,321   p90  6,237
#   search_by_insight      414 calls   p50  1,994   p90  3,505
#
# The bench said 12,517 ms -> 999 ms on the cold case. If the p90 for
# search_second_degree has not moved once real searches have run on the new
# build, the bench was measuring something the product does not do, and the
# change should be judged on that rather than on my arithmetic.
#
# READ THE DAYS, NEVER THE WEEK — and this file is the reason that rule exists.
# Its own first run said `search_second_degree:opening` had failed 51 times in
# seven days, and I shipped a change to fix it. Split by day, 45 of the 51 are
# 16–17 September and there are ZERO on the 19th and 20th — the count reached
# the target before the change existed. Worse, the call VOLUME runs 3 / 81 / 56
# / 6 / 7 across those days, so the week's average is an average over two busy
# days and three quiet ones, and a summary row cannot tell a fix from a quiet
# Saturday. Pass a tool name as the second argument to get that split.
#
# `--since` takes anything Postgres reads as an interval: '2 hours', '3 days'.
#
# IS THE MEASUREMENT READY YET — `--ready`, added 21 September.
#
# Three rows in TASKS.md are parked on the same sentence: „judge it on a day
# with comparable volume." That is the right rule and it has no owner. Nothing
# watches for the day to arrive, so the answer depends on me remembering to
# look — and a plan that depends on me remembering is not a plan, which is the
# sentence at the top of this very file.
#
# `--ready <tool> <min-calls> [since]` answers it: since the date given, has
# there been a day carrying at least that many calls? It prints the qualifying
# days and exits non-zero for „not yet", so it can gate something.
#
# It answers about VOLUME and nothing else. A qualifying day means the numbers
# from it are worth reading; it does not mean they say what you hoped.
#
# Usage:  ./scripts/ops/slow.sh ['7 days']                 every tool, summary
#         ./scripts/ops/slow.sh '10 days' search_by_tag    one tool, by day
#         ./scripts/ops/slow.sh --ready search_by_tag 150 2026-09-19
set -euo pipefail

READY_PY='
import os, sys, json
d = json.load(sys.stdin)
tool = os.environ["READY_TOOL"]
need = os.environ["READY_MIN"]
since = os.environ["READY_FROM"]
if not d.get("success"):
    print("could not read:", d.get("error", "")[:160])
    raise SystemExit(2)
rows = d["data"]["rows"]
if not rows:
    print("NOT YET - no day since %s carries %s+ calls to %s." % (since, need, tool))
    print("         That says the measurement cannot be TAKEN, not that the")
    print("         change did nothing. They are different answers.")
    raise SystemExit(1)
print("READY - %d day(s) since %s carry %s+ calls to %s:" % (len(rows), since, need, tool))
for r in rows:
    print("  %s  %s calls" % (str(r["day"])[:10], r["calls"]))
print("")
print("Volume only. A qualifying day means the numbers are worth reading; it")
print("does not mean they say what you hoped. Read them with the tool name as")
print("the second argument.")
'

if [ "${1:-}" = --ready ]; then
  export READY_TOOL="${2:?usage: slow.sh --ready <tool> <min-calls> [since-date]}"
  export READY_MIN="${3:?usage: slow.sh --ready <tool> <min-calls> [since-date]}"
  export READY_FROM="${4:-2026-01-01}"
  HERE="$(cd "$(dirname "$0")" && pwd)"
  "$HERE/ro.sh" <<SQL | python3 -c "$READY_PY"
SELECT DATE_TRUNC('day', created_at) AS day, COUNT(*) AS calls
FROM tool_call_log
WHERE created_at >= '$READY_FROM'
  AND duration_ms IS NOT NULL
  AND (tool = '$READY_TOOL' OR tool LIKE '$READY_TOOL:%')
GROUP BY 1
HAVING COUNT(*) >= $READY_MIN
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
