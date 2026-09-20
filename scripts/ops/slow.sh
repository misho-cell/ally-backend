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
# `--since` takes anything Postgres reads as an interval: '2 hours', '3 days'.
#
# Usage:  ./scripts/ops/slow.sh ['7 days']
set -euo pipefail

SINCE="${1:-7 days}"
HERE="$(cd "$(dirname "$0")" && pwd)"

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
print("a change made on a bench means the bench measured the wrong thing.")
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
