#!/bin/bash
# „Can a person without WhatsApp get in right now?"
#
# EXIT CODE IS THE ANSWER, and there are FOUR, because „no failures" and
# „nobody tried" are not the same fact and confusing them is how this one was
# found by a locked-out stranger instead of by us:
#
#   0  SENDING       — codes went out, and none was refused
#   1  REFUSED       — the provider turned a send away. Somebody is locked out.
#   2  COULD NOT LOOK— never „nothing is wrong"
#   3  NOBODY ASKED  — no send succeeded and none was refused in the window
#
# ════════ WHY THIS EXISTS — 25 September, 12:43 Tbilisi ════════
#
# The first real invitation the founder has ever sent. Valeri Chalabashvili has
# no WhatsApp, pressed „didn't get the code — send via SMS", and read the
# provider's own sentence: our sending account is not active. He did not get
# in, and the first anybody knew of it was him saying so.
#
# THERE WAS NOTHING TO FIND. Not a log line, not a row. `usage_events` writes
# `otp_sms` only AFTER a send succeeds, so a total outage and a quiet afternoon
# left identical evidence — the same shape as `push_deliveries` reporting
# `failed = 0` on endpoints that had stopped existing, and as `ok = false`
# meaning both a refusal and a fault.
#
# `twilio.service.ts` now writes one line per failure. This is the thing that
# reads it, because a log nobody greps is a log nobody has.
#
# THE THIRD ANSWER IS THE POINT. Registrations run at one or two a day, so most
# windows contain no SMS at all — and a script that called that „SENDING"
# would be reassuring on exactly the evidence that says nothing. Successes are
# counted from `usage_events`; refusals from the container's log; and when both
# are zero the answer is that nobody tried.
#
# Usage:  ./scripts/ops/sms.sh [minutes]     (default 120)
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"

MINUTES="${1:-120}"
case "$MINUTES" in
  ''|*[!0-9]*) echo "usage: sms.sh [minutes]" >&2; exit 2 ;;
esac

SINCE="$(python3 -c "
import datetime
print((datetime.datetime.now(datetime.timezone.utc)
       - datetime.timedelta(minutes=$MINUTES)).strftime('%Y-%m-%dT%H:%M:%SZ'))
")"

# The live container first: an old deployment's log is somebody else's history,
# and reading it as now is the mistake errors.sh's header is mostly about.
DEPLOY="$("$HERE/logs.sh" deployments 5 2>/dev/null \
  | awk '$2 == "SUCCESS" { print $1; exit }')"
if [ -z "$DEPLOY" ]; then
  echo "sms.sh: COULD NOT LOOK — no SUCCESS deployment came back from Railway."
  echo "        That is not „SMS is fine\"; it is „I could not read the log\"."
  exit 2
fi

REFUSALS="$("$HERE/logs.sh" logs "$DEPLOY" 200 "[otp-sms]" "$SINCE" 2>/dev/null)"

SENT="$("$HERE/ro.sh" <<SQL
SELECT COUNT(*) AS sent
FROM usage_events
WHERE kind = 'otp_sms'
  AND created_at > NOW() - INTERVAL '$MINUTES minutes'
SQL
)"

MINUTES="$MINUTES" SINCE="$SINCE" REFUSALS="$REFUSALS" SENT="$SENT" python3 <<'PY'
import json, os, sys

minutes = os.environ["MINUTES"]
since = os.environ["SINCE"]

try:
    log = json.loads(os.environ["REFUSALS"])
    lines = log["data"]["deploymentLogs"]
except Exception:
    print("sms.sh: COULD NOT LOOK — the deployment log did not come back as JSON.")
    print("        That is not „no refusals\"; it is „I could not read the log\".")
    raise SystemExit(2)

try:
    usage = json.loads(os.environ["SENT"])
    if not usage.get("success"):
        raise ValueError(usage.get("error"))
    sent = int(usage["data"]["rows"][0]["sent"])
except Exception as err:
    print("sms.sh: COULD NOT LOOK — %s" % str(err)[:120])
    raise SystemExit(2)

refused = [l for l in lines if "PROVIDER REFUSED" in (l.get("message") or "")]

if refused:
    print("REFUSED — %d SMS send(s) were turned away by the provider in the last %s"
          " minute(s), and %d went through." % (len(refused), minutes, sent))
    print()
    # The provider's own code is what separates „our account is not active\",
    # which is billing and somebody else's to settle, from „that number is
    # unreachable\", which is one person. The count cannot tell them apart.
    for line in refused[-10:]:
        print("  %s  %s" % (str(line.get("timestamp"))[:19], (line.get("message") or "").strip()[:200]))
    print()
    print("Every person WITHOUT WhatsApp is locked out while this lasts. WhatsApp is a")
    print("different provider (Meta Cloud API) and is not affected by it.")
    print("An account-level refusal is BILLING OR SUSPENSION and is the founder's or")
    print("Misho's to settle — name it, do not buy anything.")
    raise SystemExit(1)

if sent == 0:
    print("NOBODY ASKED — no SMS code was sent and none was refused in the last %s"
          " minute(s)." % minutes)
    print()
    print("This is NOT „SMS works\". Registrations run at one or two a day, so most")
    print("windows look like this one, and reading it as good news is exactly how the")
    print("25 September outage reached a real person before it reached us.")
    print("Since %s. To prove the path, somebody has to ask for a code." % since)
    raise SystemExit(3)

print("SENDING — %d SMS code(s) went out in the last %s minute(s) and none was"
      " refused." % (sent, minutes))
PY
