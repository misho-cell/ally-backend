#!/bin/bash
# „Did a tool CRASH, rather than decline?" — and it is a different question
# from everything else in this directory.
#
# EXIT CODE IS THE ANSWER: 0 = something threw, read it. 1 = nothing threw in
# that window. 2 = could not look. „I could not look" is never reported as
# „nothing is wrong".
#
# ════════ WHY THIS EXISTS — 27 SEPTEMBER, AND IT IS MY OWN DOING ════════
#
# Until this evening a tool that THREW ended the run. `processToolBlocks` runs
# a turn's calls in a bare `Promise.all` with no catch, so one bad argument
# rejected the whole turn and the person got a salvage artifact instead of an
# answer. That was the bug, Misho approved the fix, and the fix is right.
#
# BUT LOOK WHAT THE FIX DID TO THE WATCHING. Before it, such a failure reached
# a person, so `outage.sh` — which runs every fifteen minutes — counted it as
# an error. After it, the model receives a tool result, apologises or retries,
# and the run COMPLETES. `outage.sh` now sees a healthy window. The loud thing
# was made quiet on purpose, and quiet is exactly what nothing was watching
# for.
#
# What was left: `why.sh --new`, which catches a reason said for the FIRST
# time, once a day. A thrown tool that repeats — the same exception, every
# morning, on twenty runs — is new exactly once and then invisible forever.
#
# So the fix traded a fifteen-minute signal for a one-day signal, and then only
# for the first occurrence. I did not notice that while making it. This script
# is the question nobody was asking afterwards.
#
# ════════ WHAT IT COUNTS, AND WHAT IT DELIBERATELY DOES NOT ════════
#
# ONLY rows written by the throw path: `result_keys` carries `failed` and the
# row is not ok. A tool that DECLINED — „the same person was already asked
# today", „the goal is closed" — is a guard doing its job and belongs to
# `why.sh`, not here. Reading those two as one number is the mistake `slow.sh`
# taught on 25 September, where 122 „failures" were 122 correct refusals.
#
# A crash and a refusal are different events about different things, and a
# script that adds them up tells you neither.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MINUTES="${1:-60}"

case "$MINUTES" in
  '' | *[!0-9]*) echo "threw.sh: minutes must be a whole number" >&2; exit 2 ;;
esac

READ_PY='
import json, sys

try:
    body = json.load(sys.stdin)
except Exception:
    print("COULD NOT LOOK — the read did not return JSON.")
    sys.exit(2)

if not body.get("success"):
    print("COULD NOT LOOK — " + str(body.get("error", "the read was refused.")))
    sys.exit(2)

rows = body["data"]["rows"]
if not rows:
    print("Nothing threw in the last " + sys.argv[1] + " minute(s).")
    print("That is not the same as \"every tool worked\" — a tool that DECLINED")
    print("is why.sh, not this. This says no tool crashed.")
    sys.exit(1)

total = sum(int(r["n"]) for r in rows)
print("A TOOL THREW — " + str(total) + " time(s) in the last " + sys.argv[1] + " minute(s).")
print()
# No single quotes anywhere in this block: it lives inside a single-quoted
# bash string, and an f-string with one in it closes that string early. The
# first version did exactly that and died with a bash syntax error.
print("tool".ljust(28) + "times".rjust(6) + "  " + "people".rjust(6) + "  latest")
for r in rows:
    print(
        r["tool"][:28].ljust(28)
        + r["n"].rjust(6)
        + "  "
        + r["people"].rjust(6)
        + "  "
        + r["latest"][:19]
    )
print()
print("The exception text is on the row (error_text) — this prints the shape,")
print("not the sentence, because one of these is usually twenty of the same.")
print()
print("READ IT AS: the run did NOT die (that is the 27 September change), so")
print("nobody necessarily saw an error. What they saw is a step that silently")
print("did not happen, or an apology. `people` is how many that reached.")
sys.exit(0)
'

# ⚠️ `result_keys` IS A COMMA-JOINED SORTED STRING, NOT AN ARRAY. The first
# version of this file asked `result_keys @> ARRAY['failed']` and would have
# errored on every run — caught by reading the column's type before trusting
# the query rather than after.
#
# The wrapper writes `{ failed: true, error }`, so its signature is exactly
# `error,failed`. Measured against three days of real rows: the refusals carry
# `error,reason,sent`, `approved,error`, `error`, `error,proposed` and so on.
# None of them is this, which is what keeps a tool that DECLINED out of a count
# about tools that CRASHED.
"$HERE/ro.sh" <<SQL | python3 -c "$READ_PY" "$MINUTES"
SELECT tool,
       COUNT(*)::text                    AS n,
       COUNT(DISTINCT user_id)::text     AS people,
       MAX(created_at)::text             AS latest
  FROM tool_call_log
 WHERE created_at > NOW() - INTERVAL '$MINUTES minutes'
   AND ok = false
   AND result_keys = 'error,failed'
 GROUP BY tool
 ORDER BY COUNT(*) DESC, tool
 LIMIT 20
SQL
