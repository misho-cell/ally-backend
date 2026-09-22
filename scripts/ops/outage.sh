#!/bin/bash
# „Is the product answering people right now?" — one question, one answer.
#
# WHY THIS EXISTS, 22 September. From 12:04 every run in the product died in
# 0.2-0.4 seconds on four different accounts, and nobody noticed until Misho
# sent me a screenshot of his own phone at 12:55. Fifty minutes.
#
# The evidence was all in the database the whole time. What was missing was
# somebody asking. So the asking is a command, and a Routine runs the command —
# the same reasoning as quiet.sh: a rule I have to remember is one I have
# already broken.
#
# EXIT CODE IS THE ANSWER: 0 = answering, 1 = NOT answering, 2 = could not look.
# „I could not look" is never reported as „nothing is wrong" — that confusion is
# the one this codebase keeps having to undo.
set -uo pipefail
# scripts/ops -> the repo root is TWO levels up. One level lands in scripts/,
# where ./scripts/ops/ro.sh does not exist — and the failure then reads as „the
# database did not answer", which is the one thing this script must never say
# when it is really the script that is wrong.
cd "$(dirname "$0")/../.."

WINDOW_MIN="${1:-15}"

# The SQL is built into a variable and PIPED, not fed by a heredoc inside a
# command substitution: the parentheses of COUNT(*) end the substitution early
# in that form, and the failure looks exactly like the database not answering.
SQL_TEXT="SELECT
  (SELECT COUNT(*) FROM conversations
    WHERE role = 'assistant' AND kind = 'error'
      AND created_at >= NOW() - INTERVAL '${WINDOW_MIN} minutes')  AS errors,
  (SELECT COUNT(*) FROM conversations
    WHERE role = 'assistant' AND kind = 'message' AND content <> ''
      AND created_at >= NOW() - INTERVAL '${WINDOW_MIN} minutes')  AS replies,
  (SELECT COUNT(*) FROM usage_events
    WHERE created_at >= NOW() - INTERVAL '${WINDOW_MIN} minutes')  AS model_calls"

OUT="$(printf '%s' "$SQL_TEXT" | ./scripts/ops/ro.sh 2>/dev/null)"

read -r ERRORS REPLIES CALLS <<< "$(
  python3 -c '
import sys, json
try:
    row = json.load(sys.stdin)["data"]["rows"][0]
except Exception:
    print("x x x"); raise SystemExit
print(row["errors"], row["replies"], row["model_calls"])
' <<< "$OUT"
)"

if [ "$ERRORS" = "x" ]; then
  echo "CANNOT TELL — the read-only window did not answer. That is not the same as 'nothing is wrong'." >&2
  exit 2
fi

echo "last ${WINDOW_MIN}m: ${ERRORS} error(s), ${REPLIES} reply(ies), ${CALLS} model call(s)"

# NOTHING HAPPENED AT ALL — and „no errors" is not „working".
#
# Caught on this script's FIRST firing, 13:12, during the outage it was written
# for. It printed „OK — nobody saw an error" over a window with zero errors,
# zero model calls and one server-written reply. True, and useless: after
# 12:51 nobody had tried. Silence and recovery look identical from here, and
# the whole point of this file is to stop me reading one as the other.
#
# Still exit 0, because it is not evidence of an outage either and a routine
# that cries at every quiet hour gets ignored. What changes is that it says
# WHAT IT SAW rather than pronouncing on what it did not.
#
# AND THE TEST IS THE MODEL CALL, NOT THE REPLY. The first version of this
# branch also required zero replies, and the window that caught it had ONE —
# written by the server, not by the model. A reply with no model call behind it
# is the product apologising, which is exactly the state being investigated.
if [ "$ERRORS" -eq 0 ] && [ "$CALLS" -eq 0 ]; then
  echo "NOTHING PROVEN — no errors, and no model call went through in ${WINDOW_MIN} minutes."
  echo "  A product nobody is using and a product that cannot answer look"
  echo "  exactly alike from here. ${REPLIES} reply(ies) in the window were written"
  echo "  by the server, not by the model. If an outage is known to be open, it"
  echo "  is STILL OPEN until a model call succeeds."
  exit 0
fi

# A quiet product is not a broken one — but it has to have DONE something.
if [ "$ERRORS" -eq 0 ]; then
  echo "OK — nobody saw an error, and ${CALLS} model call(s) went through."
  exit 0
fi

# THE SIGNATURE OF 22 SEPTEMBER: errors arriving while nothing succeeds. One
# error beside working replies is an ordinary failure and not an outage — the
# threshold is deliberately about the RATIO and not about the count.
if [ "$ERRORS" -ge 3 ] && [ "$REPLIES" -eq 0 ]; then
  echo "NOT ANSWERING — ${ERRORS} errors and not one reply in ${WINDOW_MIN} minutes."
  # The line used to read „Model calls: N. Zero means…" and printed that
  # sentence whatever N was — it said „Zero means" over a 1 on its second
  # firing. A sentence the number beside it contradicts is the fault this whole
  # file was written to catch, in the file itself. Two branches now.
  if [ "$CALLS" -eq 0 ]; then
    echo "  NO model call reached the provider in that window — refused before inference,"
    echo "  which is an account or key problem and not load."
  else
    echo "  ${CALLS} model call(s) did reach the provider, so it is not refusing everything."
  fi
  echo "  Read the cause, do not guess it: [provider] lines in the container log name the"
  echo "  status and say ACCOUNT (no retry will pass) or LOAD (it may clear by itself)."
  exit 1
fi

if [ "$CALLS" -eq 0 ] && [ "$ERRORS" -ge 1 ]; then
  echo "NOT ANSWERING — ${ERRORS} error(s) and NO model call reached the provider at all."
  exit 1
fi

echo "OK — errors are present but the product is answering (${REPLIES} reply(ies))."
exit 0
