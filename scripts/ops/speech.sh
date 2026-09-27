#!/bin/bash
# „Did a microphone press reach the server, and what happened to it?"
#
# EXIT CODE IS THE ANSWER, and there are FOUR, because „no failure" and
# „nobody pressed" are not the same fact — the same shape as sms.sh, learned
# the same way:
#
#   0  HEARD        — a press arrived and came back as text
#   1  REFUSED      — a press arrived and was turned away. The reason is named.
#   2  COULD NOT LOOK — never „it is fine"
#   3  NOBODY PRESSED — nothing arrived in the window
#
# ════════ WHY THIS EXISTS — 27 September ════════
#
# Row 226 has been open for a week on „the microphone catches nothing", and
# every reading of it so far has been a person describing a screen. The server
# has never once been asked what it saw, because until this morning the two
# 400s logged nothing and the log filter that would have found the rest could
# not match (a square bracket — see logs.sh).
#
# Today the tester proved the server path end to end without a phone (a
# one-second WAV came back as text), the front end fixed a screen that drew a
# transcription failure as „the microphone could not start", and Tornike asked
# Misho to make ONE PRESS on his own iPhone. I promised to read the log within
# the minute of it.
#
# ⚠️ A PROMISE TO READ SOMETHING WITHIN A MINUTE IS A PROMISE TO HAVE THE
# INSTRUMENT ALREADY BUILT. Improvising three greps while somebody holds a
# phone is how the wrong question gets asked — which is this week's entire
# subject.
#
# THE THIRD ANSWER IS THE POINT, again. If the client stands down before the
# microphone — which is exactly what it does when the flag reads false — then
# NOTHING arrives, and a script that called that „no failures" would be
# reassuring on the evidence that says nothing at all.
#
# Usage:  ./scripts/ops/speech.sh [minutes]     (default 30)
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"

MINUTES="${1:-30}"
case "$MINUTES" in
  ''|*[!0-9]*) echo "usage: speech.sh [minutes]" >&2; exit 2 ;;
esac

SINCE="$(python3 -c "
import datetime
print((datetime.datetime.now(datetime.timezone.utc)
       - datetime.timedelta(minutes=$MINUTES)).strftime('%Y-%m-%dT%H:%M:%SZ'))
")"

# The live container only: an older deployment's log is somebody else's
# history, and reading it as now is the fault errors.sh's header is about.
DEPLOY="$("$HERE/logs.sh" deployments 5 2>/dev/null \
  | awk '$2 == "SUCCESS" { print $1; exit }')"
if [ -z "$DEPLOY" ]; then
  echo "speech.sh: COULD NOT LOOK — no SUCCESS deployment came back from Railway."
  echo "        That is not „the microphone is fine\"; it is „I could not read the log\"."
  exit 2
fi

# ⚠️ NO SQUARE BRACKETS. The tag in the code is `[speech]`, and Railway's
# filter reads a bracket as its own syntax — logs.sh refuses one outright now.
LINES="$("$HERE/logs.sh" logs "$DEPLOY" 400 "speech" "$SINCE" 2>/dev/null)"

# A transcription that succeeded writes a ledger row before it answers; a
# refused one writes none. Two independent records that have to agree.
SPENT="$("$HERE/ro.sh" <<SQL
SELECT COUNT(*) AS heard
FROM usage_events
WHERE kind = 'speech'
  AND created_at > NOW() - INTERVAL '$MINUTES minutes'
SQL
)"

MINUTES="$MINUTES" SINCE="$SINCE" LINES="$LINES" SPENT="$SPENT" python3 <<'PY'
import json, os

minutes = os.environ["MINUTES"]
since = os.environ["SINCE"]

try:
    log = json.loads(os.environ["LINES"])
    lines = log["data"]["deploymentLogs"]
except Exception:
    print("speech.sh: COULD NOT LOOK — the deployment log did not come back as JSON.")
    print("        That is not „nothing arrived\"; it is „I could not read the log\".")
    raise SystemExit(2)

try:
    usage = json.loads(os.environ["SPENT"])
    if not usage.get("success"):
        raise ValueError(usage.get("error"))
    heard = int(usage["data"]["rows"][0]["heard"])
except Exception as err:
    print("speech.sh: COULD NOT LOOK — %s" % str(err)[:120])
    raise SystemExit(2)

ours = [l for l in lines if "[speech]" in (l.get("message") or "")]
# The route logs one line per outcome: a refusal names its reason, a success
# says how many characters came back and from which mime.
refused = [l for l in ours if "chars from" not in (l.get("message") or "")]
heard_lines = [l for l in ours if "chars from" in (l.get("message") or "")]


def show(rows):
    for line in rows[-10:]:
        print("  %s  %s" % (str(line.get("timestamp"))[:19], (line.get("message") or "").strip()[:200]))


# ⚠️ THE TWO SOURCES CAN DISAGREE, AND THE FIRST RUN OF THIS SCRIPT DID.
#
# 27 September, minutes after writing it: „HEARD — 0 press(es) came back as
# text; the ledger records 1." Both halves were true and the headline was
# false. The ledger had the tester's 12:41:34 transcription; the log did not,
# because I deployed at 12:49:06 and a deploy takes the container's log with
# it. The script read the LIVE container, correctly, and the press had happened
# on the previous one.
#
# A tool that prints the optimistic half of a disagreement is the fault this
# whole directory exists against, so the disagreement is now its own answer.
# The ledger is the durable record and it is believed; what cannot be produced
# is the DETAIL, and „I cannot tell you which mime, how many bytes or how long
# it took" is not the same as „it worked".
if heard > 0 and not heard_lines:
    print("HEARD, BUT NOT HERE — the ledger records %d transcription(s) in the last %s "
          "minute(s) and this container's log has none." % (heard, minutes))
    print()
    print("That is not a contradiction: a deploy replaces the container and takes its")
    print("log with it, so a press before the most recent deploy leaves the ledger row")
    print("and no line. The spend is proof it worked; the line is where the mime, the")
    print("size and the duration would have been, and those are gone.")
    print("Look at an older deployment with:  ./scripts/ops/logs.sh deployments 10")
    raise SystemExit(0)

if heard_lines:
    print("HEARD — %d press(es) came back as text in the last %s minute(s); the ledger "
          "records %d." % (len(heard_lines), minutes, heard))
    if heard != len(heard_lines):
        print("⚠️ The two counts disagree. The ledger is the durable one; a deploy inside")
        print("   the window explains a log that has fewer.")
    print()
    show(heard_lines)
    if refused:
        print()
        print("AND %d refusal(s) in the same window:" % len(refused))
        show(refused)
    raise SystemExit(0)

if refused:
    print("REFUSED — %d press(es) reached the server and were turned away in the last "
          "%s minute(s)." % (len(refused), minutes))
    print()
    show(refused)
    print()
    print("The reason is the payload, and each one means a different half:")
    print("  not_enabled         the flag is off for that client — not the microphone")
    print("  unsupported_format  no mime, or one we do not take — the CLIENT's upload")
    print("  bad_upload          nothing arrived in the file part")
    print("  no_speech           we listened and heard no words — the microphone worked")
    print("  recognizer_failed   the recogniser refused — the key or the provider")
    print("  too_large/too_long  a ceiling, not a fault")
    raise SystemExit(1)

print("NOBODY PRESSED — no speech request reached the server in the last %s minute(s)."
      % minutes)
print()
print("This is NOT „the microphone works\" and NOT „the microphone is broken\".")
print("The client asks GET /speech/limits first and stands down BEFORE the microphone")
print("when the flag reads false — so a press that never arrives is a press that was")
print("stopped on the phone, and the screen is the only place that can say which.")
print("Since %s. To prove the path, somebody has to press and say when." % since)
raise SystemExit(3)
PY
