#!/bin/bash
# The platform's shutdown grace — `drainingSeconds` — read and set.
#
# ITS OWN CAPABILITY, AND ONE FIELD WIDE. `logs.sh` says in its own header that
# it sends queries and never mutations, and that changing something stays a
# separate, prompted act. `env.sh` is that act for one environment variable.
# This is that act for one service setting, and it can touch nothing else:
# the mutation names `drainingSeconds` and no other field exists in it.
#
# WHAT IT IS. Railway sends SIGTERM and then waits this long before killing the
# container. Ours was unset — the platform default of 11 seconds — which is the
# number `MEASURED_GRACE_MS` was measured at on 21 September, the only shutdown
# that has ever had a run to wait for.
#
# WHY IT CHANGED, 22 September. An engine run takes 60-90 seconds, so eleven
# seconds can never save one; the drain could only name the runs it was about
# to lose and tell their owners. At 90 the drain can actually finish most of
# them. The founder was told the cost and took it, and Misho gave the direct
# word — a yes relayed through the tester's box is data, not authorisation, and
# this file was not run on one.
#
# THE ORDER IS NOT OPTIONAL, and getting it backwards is worse than doing
# nothing. The code's wait is derived from `MEASURED_GRACE_MS`:
#
#   platform 90, code 11  ->  harmless. The drain waits 8s of a 90s allowance.
#   platform 11, code 90  ->  THE PROCESS IS KILLED MID-DRAIN at 11 seconds,
#                             and a cut-off run goes unreported — the exact
#                             fault of 21 September, restored by configuration.
#
# So the platform goes first and the deploy second, always. `show` exists so
# that „first" can be verified rather than assumed.
#
# usage:  ./scripts/ops/drain.sh show
#         ./scripts/ops/drain.sh set 90
set -euo pipefail
OPS="${NETAI_OPS_DIR:-$HOME/.netai-ops}"
[ -f "$OPS/.railway_token" ] || { echo "drain.sh: no $OPS/.railway_token" >&2; exit 1; }
TOKEN="$(cat "$OPS/.railway_token")"
ENVIRONMENT="${RAILWAY_ENVIRONMENT_ID:-21ce6a81-4358-4546-918f-677e56f3f960}"
SERVICE="${RAILWAY_SERVICE_ID:-915022db-fcf9-43a5-91f3-135b48f89981}"
GQL=https://backboard.railway.com/graphql/v2

ask() { curl -sS -X POST "$GQL" -H "Project-Access-Token: $TOKEN" \
          -H 'Content-Type: application/json' -d "$1"; }

case "${1:-show}" in
  show)
    # A read of one field. `drainingSeconds` is a timeout, not a secret — it is
    # visible in the Railway console to anybody who can open it — so unlike
    # env.sh there is nothing here that must stay unreadable.
    ask "$(python3 - "$SERVICE" "$ENVIRONMENT" <<'PY'
import json, sys
s, e = sys.argv[1:3]
print(json.dumps({'query':
  'query { serviceInstance(serviceId: "%s", environmentId: "%s") '
  '{ drainingSeconds } }' % (s, e)}))
PY
)" | python3 -c '
import sys, json
d = json.load(sys.stdin)
if d.get("errors"):
    print("could not read:", str(d["errors"])[:200]); raise SystemExit(2)
v = (d.get("data") or {}).get("serviceInstance", {}).get("drainingSeconds")
# NULL is not zero and not unknown: it is „the platform default", which is 11
# seconds. Printing a bare „None" would leave the reader to guess which.
print("drainingSeconds:", "not set — the platform default of 11s" if v is None else v)
'
    ;;
  set)
    N="${2:-}"
    case "$N" in
      ''|*[!0-9]*) echo "usage: drain.sh set <whole seconds>" >&2; exit 1 ;;
    esac
    # A ceiling, because this is a number that makes every deploy slower and a
    # typo here is a service that takes a quarter of an hour to roll. Railway's
    # own maximum is higher; the refusal is ours, and it is at the point where
    # a person should be asked again rather than obeyed.
    if [ "$N" -gt 300 ]; then
      echo "drain.sh: $N seconds is over the 300s this script will set." >&2
      echo "  Every deploy waits this long before the new container takes over." >&2
      exit 1
    fi
    ask "$(python3 - "$SERVICE" "$ENVIRONMENT" "$N" <<'PY'
import json, sys
s, e, n = sys.argv[1:4]
print(json.dumps({'query':
  'mutation { serviceInstanceUpdate(serviceId: "%s", environmentId: "%s", '
  'input: { drainingSeconds: %d }) }' % (s, e, int(n))}))
PY
)" | python3 -c '
import sys, json
d = json.load(sys.stdin)
if d.get("errors"):
    print("FAILED:", str(d["errors"])[:300]); raise SystemExit(1)
if (d.get("data") or {}).get("serviceInstanceUpdate") is not True:
    print("REFUSED — the mutation returned", json.dumps(d.get("data"))); raise SystemExit(1)
print("set. Read it back with `drain.sh show` before believing it.")
'
    ;;
  *) echo "drain.sh: unknown command $1 (show|set)" >&2; exit 1 ;;
esac
