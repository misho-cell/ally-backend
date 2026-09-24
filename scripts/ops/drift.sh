#!/bin/bash
# „Does the subscription column still say what Stripe says?" — row 248's
# missing fourth fact, read-only.
#
# WHY THIS IS A NAMED CAPABILITY AND NOT A CURL. Same reasoning as box.sh: what
# it can reach is fixed here and visible in git, so a permission rule attaches
# to THIS and not to „any HTTP request the assistant likes". It calls one admin
# route, and that route writes nothing.
#
# ════════ WHAT IT IS FOR ════════
#
# A cancel-at-period-end moves none of the values Stripe normally moves: the
# status stays `trialing` or `active` and a flag is raised instead, which is why
# the app went on saying the payment was automatic. `cancel_at_period_end` and
# `cancels_at` were added and are now written on every subscription event.
#
# That fixes every cancellation from that day and NOTHING that had already
# happened, because those columns are only written when an event ARRIVES — and
# for a cancel-at-period-end the next event is the day the subscription ends.
#
# So the fix is real and the person it was reported for may still be seeing the
# bug. BUILT, DEPLOYED and VERIFIED are three facts in this codebase; the fourth
# is THE STATE THAT EXISTED BEFORE THE FIX, and nothing had asked for it.
#
# ════════ IT WRITES NOTHING, DELIBERATELY ════════
#
# Repairing the rows is an admin operation on live data (D44): register entry
# and a yes, first. HOW MANY rows are wrong needs neither, and it is the number
# that decision rests on. Answering it first also stops a backfill being built
# for a problem that turns out to be one account.
#
# Usage:  ./scripts/ops/drift.sh [limit]
set -euo pipefail
OPS="${NETAI_OPS_DIR:-$HOME/.netai-ops}"
API="${NETAI_API:-https://api.netai.guru}"
LIMIT="${1:-100}"

[ -d "$OPS" ] || { echo "drift.sh: no secrets directory at $OPS" >&2; exit 2; }

login() {
  [ -f "$OPS/.admin" ] || { echo "drift.sh: cannot log in: $OPS/.admin is missing" >&2; exit 2; }
  curl -sS -X POST -H 'Content-Type: application/json' \
    -d "{\"email\":\"$(head -1 "$OPS/.admin")\",\"password\":\"$(sed -n 2p "$OPS/.admin")\"}" \
    "$API/auth/admin/login" |
    python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["token"])' > "$OPS/.admin_token"
  chmod 600 "$OPS/.admin_token"
}

[ -f "$OPS/.admin_token" ] || login
OUT="$(curl -sS -w '\n%{http_code}' -H "Authorization: Bearer $(cat "$OPS/.admin_token")" \
  "$API/admin/stripe/drift?limit=${LIMIT}")"
if [ "$(tail -1 <<< "$OUT")" = "401" ]; then
  login
  OUT="$(curl -sS -w '\n%{http_code}' -H "Authorization: Bearer $(cat "$OPS/.admin_token")" \
    "$API/admin/stripe/drift?limit=${LIMIT}")"
fi

CODE="$(tail -1 <<< "$OUT")"
BODY="$(sed '$d' <<< "$OUT")"

# 503 IS ITS OWN ANSWER AND NOT A FAILURE OF THE PRODUCT. A server with no
# Stripe key cannot compare anything, and „I could not look" must not leave by
# the same door as „I looked and it agrees".
if [ "$CODE" = "503" ]; then
  echo "CANNOT TELL — the server says it cannot compare:"
  python3 -c 'import sys,json;print("  "+str(json.load(sys.stdin).get("error","")))' <<< "$BODY"
  exit 2
fi
if [ "$CODE" -ge 400 ]; then
  echo "CANNOT TELL — HTTP $CODE from the drift route. That is not 'nothing is wrong'." >&2
  exit 2
fi

python3 -c '
import sys, json
d = json.load(sys.stdin)
if not d.get("success"):
    print("CANNOT TELL —", str(d.get("error"))[:200]); raise SystemExit(2)
r = d["data"]

print("checked %d account(s) with a Stripe customer: %d agree, %d differ, %d unreadable"
      % (r["checked"], r["agreed"], len(r["drifted"]), len(r["unreadable"])))
print("%d of them have no subscription on OUR price (the Stripe account is shared)."
      % r["not_our_price"])
print()

for u in r["unreadable"]:
    print("COULD NOT READ account %s: %s" % (u["user_id"], u["why"]))
if r["unreadable"]:
    print("  Those are neither agreement nor drift. They are unread.")
    print()

if not r["drifted"]:
    print("NOTHING DIFFERS. Every column matches Stripe.")
else:
    for row in r["drifted"]:
        print("%s (account %s)" % (row["name"] or "(no name)", row["user_id"]))
        for line in row["differs"]:
            print("    " + line)
    print()
    print("Each line is a column that has not been told about something Stripe")
    print("already did. Repairing them is a write on live data and needs a yes.")
print()
print(r["note"])
' <<< "$BODY"
