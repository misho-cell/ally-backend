#!/bin/bash
# May I deploy right now? Exits 0 for yes, 1 for no, and says which.
#
# WHY THIS IS A COMMAND AND NOT A HABIT. `inFlightRuns.ts` has carried the rule
# since 17 September, in its own words:
#
#   „The real fix for the rest is operational, not code: do not deploy while
#    people are working. That is mine to hold to, and it does not belong in a
#    module."
#
# On 20 September at 10:02:08 I did not hold to it. Owner 171870 typed „I need
# a good carpenter in Tbilisi" at 10:01:48, the goal opened, the second-degree
# search returned at 10:01:55 — and twenty seconds later my deploy stopped the
# container. They were told „Something went wrong on our side and the answer
# did not finish."
#
# It was not once. Of the seven owner-facing run failures between 18 September
# and now that are NOT the credit-balance outage, FOUR sit inside a deploy
# window — 18 Sep 13:41, 18 Sep 18:01, 18 Sep 18:16, 20 Sep 10:03. My deploys
# are the largest identified cause of people seeing an error in this product.
#
# So the rule stops depending on my memory, which is the same move as splitting
# `slow.sh` by day: a plan that needs me to remember is not a plan.
#
# WHAT IT CHECKS — both, because either alone is blind:
#   * `threads.status = 'working'` — a run holds this for its whole life.
#   * the last `tool_call_log` row — a run between two tool calls is still a
#     run, and the status can lag.
#
# Usage:  ./scripts/ops/quiet.sh && git push origin HEAD:main
#         ./scripts/ops/quiet.sh 180     (a longer quiet window, in seconds)
set -euo pipefail

QUIET_SECONDS="${1:-110}"
HERE="$(cd "$(dirname "$0")" && pwd)"

"$HERE/ro.sh" <<SQL | QUIET_SECONDS="$QUIET_SECONDS" python3 -c '
import sys, json, os
quiet = int(os.environ["QUIET_SECONDS"])
d = json.load(sys.stdin)
if not d.get("success"):
    print("NO — could not read the database:", str(d.get("error", ""))[:140])
    raise SystemExit(1)
row = d["data"]["rows"][0]
working = int(row["working"])
idle = row["idle_seconds"]
idle = None if idle is None else int(float(idle))

if working > 0:
    print(f"NO — {working} thread(s) are working right now. Wait.")
    raise SystemExit(1)
if idle is not None and idle < quiet:
    print(f"NO — the last tool call was {idle}s ago, under the {quiet}s window. Wait.")
    raise SystemExit(1)
seen = "never" if idle is None else f"{idle}s ago"
print(f"YES — 0 threads working, last tool call {seen}. Safe to deploy.")
'
SELECT (SELECT COUNT(*) FROM threads WHERE status = 'working') AS working,
       (SELECT EXTRACT(EPOCH FROM (NOW() - MAX(created_at))) FROM tool_call_log) AS idle_seconds
SQL
