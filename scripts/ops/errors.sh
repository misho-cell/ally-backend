#!/bin/bash
# Every run failure a PERSON saw, with the last thing that happened before it
# and whether one of my own deploys was landing at the time.
#
# WHY IT EXISTS. On 20 September I found, by accident, while chasing something
# else, that of the seven owner-facing run failures since 18 September that are
# not the credit-balance outage, FOUR sat inside a deploy window. My deploys
# were the largest identified cause of somebody seeing an error in this product
# and nothing anywhere said so — the count was reachable, and nobody was
# reaching for it.
#
# Three separate measurements were needed to see it and none of them lived
# together: the error rows in `conversations`, the tool calls around them, and
# the deployment times, which are not in the database at all. This joins them.
#
# THE DEPLOY COLUMN IS A COINCIDENCE, NOT A VERDICT. A failure inside the
# window may be unrelated; one outside it may still be a deploy that took
# longer to bite. It says „look here first", which is all a correlation can
# honestly say. What settles it is the container's own log around that minute
# — `logs.sh logs <deploymentId>`.
#
# WHAT COUNTS AS OWNER-FACING: a row with `kind='error'`, which is the client's
# system-styled failure with a retry. A tool that failed inside a run is not
# here; `slow.sh` has those.
#
# Usage:  ./scripts/ops/errors.sh ['7 days']
set -euo pipefail

SINCE="${1:-7 days}"
HERE="$(cd "$(dirname "$0")" && pwd)"
SCRATCH="$(mktemp -d)"
trap 'rm -rf "$SCRATCH"' EXIT

# The deploy times first, so a database that is slow to answer does not make
# the Railway call look like the problem.
"$HERE/logs.sh" deployments 100 > "$SCRATCH/deploys.txt" 2>/dev/null || true

"$HERE/ro.sh" <<SQL > "$SCRATCH/errors.json"
SELECT c.created_at, c.thread_id, t.user_id,
       (SELECT l.tool FROM tool_call_log l
         WHERE l.thread_id = c.thread_id AND l.created_at <= c.created_at
         ORDER BY l.created_at DESC LIMIT 1) AS last_tool,
       (SELECT l.duration_ms FROM tool_call_log l
         WHERE l.thread_id = c.thread_id AND l.created_at <= c.created_at
         ORDER BY l.created_at DESC LIMIT 1) AS last_ms
FROM conversations c
JOIN threads t ON t.id = c.thread_id
WHERE c.role = 'assistant' AND c.kind = 'error'
  AND c.created_at > NOW() - INTERVAL '$SINCE'
ORDER BY c.created_at DESC
LIMIT 200
SQL

SCRATCH="$SCRATCH" python3 <<'PY'
import datetime, json, os, re

scratch = os.environ["SCRATCH"]

# A deploy replaces the container a minute or two after it is created, and the
# run it kills dies a little after that. Wide enough to catch the sequence,
# narrow enough that an ordinary failure does not land in it by chance.
WINDOW_BEFORE = datetime.timedelta(seconds=60)
WINDOW_AFTER = datetime.timedelta(minutes=7)

deploys = []
try:
    with open(f"{scratch}/deploys.txt", encoding="utf-8") as handle:
        for line in handle:
            found = re.search(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}", line)
            if found:
                deploys.append(datetime.datetime.fromisoformat(found.group(0)))
except OSError:
    pass

with open(f"{scratch}/errors.json", encoding="utf-8") as handle:
    payload = json.load(handle)
if not payload.get("success"):
    print("could not read:", str(payload.get("error", ""))[:160])
    raise SystemExit(1)
rows = payload["data"]["rows"]
if not rows:
    print("no owner-facing run failures in that window — which is the good answer")
    raise SystemExit

if not deploys:
    print("NOTE: no deployment times (logs.sh failed) — the deploy column is blank,")
    print("      which is NOT the same as 'no deploy was landing'.\n")

# HOW FAR BACK THE DEPLOY COLUMN CAN SEE. Railway hands back the last hundred
# deployments and no more, and on a busy day that is barely two days. An error
# older than the oldest one we hold is UNCHECKED, not cleared — the same
# distinction the six search tools had to be taught on 20 September, and it
# would be absurd to lose it in the script that came out of that week.
horizon = min(deploys) if deploys else None

print("%-19s %-7s %-8s %-26s %9s  %s" % (
    "when", "thread", "owner", "last tool before", "ms", "deploy"))
in_window = 0
unchecked = 0
for row in rows:
    when = datetime.datetime.fromisoformat(row["created_at"].replace("Z", "")).replace(tzinfo=None)
    near = [d for d in deploys if -WINDOW_BEFORE <= (when - d) <= WINDOW_AFTER]
    if horizon is not None and when < horizon:
        # Older than the oldest deployment we were handed: not checked.
        mark = "?"
        unchecked += 1
    elif near:
        closest = min(near, key=lambda d: abs((when - d).total_seconds()))
        mark = "DEPLOY +%ds" % int((when - closest).total_seconds())
        in_window += 1
    else:
        mark = ""
    print("%-19s %-7s %-8s %-26s %9s  %s" % (
        row["created_at"][:19], row["thread_id"], row["user_id"],
        row["last_tool"] or "-", row["last_ms"] or "-", mark))

print()
print(f"{len(rows)} owner-facing failure(s); {in_window} inside a deploy window.")
if unchecked:
    print(f"{unchecked} marked ? are older than the oldest deployment Railway still lists")
    print(f"({horizon}) — those are UNCHECKED, not cleared.")
print("A deploy window is a place to look, not a verdict — read the container's")
print("own log for that minute with logs.sh before blaming or clearing it.")
print("Before pushing, ./scripts/ops/quiet.sh answers whether it is safe.")
PY
