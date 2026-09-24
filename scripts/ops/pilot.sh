#!/bin/bash
# The pilot's own numbers, read from the live route — row 256.
#
# A NAMED CAPABILITY, not a curl: what it can reach is fixed here and visible
# in git, so a permission rule attaches to THIS and not to „any HTTP request
# the assistant likes". Same reasoning as box.sh and drift.sh. Both routes it
# calls are read-only.
#
# WHY IT EXISTS. The app team is building the screen over
# `GET /admin/pilot/report` and asked for the field names rather than guessing
# them — „if I guess, either the screen shows empty and reads as the pilot
# having done nothing, or I tell you it is ready the way I did for the handoff
# box when both POSTs were broken". That is the right instinct and it deserves
# a real payload rather than a description of one.
#
# ⚠️ AND TWO SENTENCES TRAVEL WITH EVERY NUMBER THIS PRINTS.
#
#   `population` — who is counted. „Not a test seat AND (carries the admin flag
#   OR has threads)". The flag alone was the first version and it hid 35 of the
#   45 real users, including the second most active person in the product. It
#   shipped wrong and was verified by the tester before I noticed.
#
#   `closures_dated_since` — a DATE, the first day a closure could be dated at
#   all. 422 goals were closed before the column existed and cannot be
#   backfilled. A „solved" column that shows empty for last week without this
#   sentence tells the reader the pilot solved nothing.
#
# NO PHONE NUMBERS (D149). The report is aggregates; the people list is names
# and ids, which is what a screen needs and all it needs.
#
# Usage:
#   ./scripts/ops/pilot.sh [days]     the report (default 7)
#   ./scripts/ops/pilot.sh people     who the pilot's people are
#   ./scripts/ops/pilot.sh keys       just the field names, for the screen
set -euo pipefail
OPS="${NETAI_OPS_DIR:-$HOME/.netai-ops}"
API="${NETAI_API:-https://api.netai.guru}"
WHAT="${1:-7}"

[ -d "$OPS" ] || { echo "pilot.sh: no secrets directory at $OPS" >&2; exit 2; }

login() {
  [ -f "$OPS/.admin" ] || { echo "pilot.sh: cannot log in: $OPS/.admin is missing" >&2; exit 2; }
  curl -sS -X POST -H 'Content-Type: application/json' \
    -d "{\"email\":\"$(head -1 "$OPS/.admin")\",\"password\":\"$(sed -n 2p "$OPS/.admin")\"}" \
    "$API/auth/admin/login" |
    python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["token"])' > "$OPS/.admin_token"
  chmod 600 "$OPS/.admin_token"
}

get() {
  local out code
  [ -f "$OPS/.admin_token" ] || login
  out="$(curl -sS -w '\n%{http_code}' -H "Authorization: Bearer $(cat "$OPS/.admin_token")" "$1")"
  code="$(tail -1 <<< "$out")"
  if [ "$code" = "401" ]; then
    login
    out="$(curl -sS -w '\n%{http_code}' -H "Authorization: Bearer $(cat "$OPS/.admin_token")" "$1")"
    code="$(tail -1 <<< "$out")"
  fi
  # „I could not look" is not „there is nothing there", and a 403 here has its
  # own meaning: the pilot reader gate is off or has expired.
  if [ "$code" = "403" ]; then
    echo "CANNOT TELL — 403. The pilot reader gate is closed (off, expired, or a different admin)." >&2
    exit 2
  fi
  if [ "$code" -ge 400 ]; then
    echo "CANNOT TELL — HTTP $code from the pilot route. That is not 'nothing is wrong'." >&2
    exit 2
  fi
  sed '$d' <<< "$out"
}

case "$WHAT" in
  people)
    get "$API/admin/pilot/people" | python3 -m json.tool
    ;;
  keys)
    # The field names and the TYPE of each, which is what somebody drawing a
    # screen actually needs: „is closures_dated_since a date or a count" writes
    # two different sentences on the page.
    get "$API/admin/pilot/report?days=7" | python3 -c '
import sys, json

def kind(v):
    if v is None: return "null (see the note — null is a fact here, not a gap)"
    if isinstance(v, bool): return "boolean"
    if isinstance(v, (int, float)): return "number"
    if isinstance(v, list): return "array[%d]" % len(v)
    if isinstance(v, dict): return "object"
    return "string" if len(str(v)) < 60 else "string (long — a sentence, not a label)"

def walk(node, prefix=""):
    for k, v in node.items():
        path = prefix + k
        if isinstance(v, dict):
            print("%-40s object" % path)
            walk(v, path + ".")
        elif isinstance(v, list) and v and isinstance(v[0], dict):
            print("%-40s array of object, %d row(s)" % (path, len(v)))
            for kk, vv in v[0].items():
                print("%-40s   %s" % (path + "[].".rstrip() + kk, kind(vv)))
        else:
            print("%-40s %s" % (path, kind(v)))

walk(json.load(sys.stdin)["data"])
'
    ;;
  *)
    get "$API/admin/pilot/report?days=${WHAT}" | python3 -m json.tool
    ;;
esac
