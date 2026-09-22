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

# Nothing happened at all. A quiet product is not a broken one.
if [ "$ERRORS" -eq 0 ]; then echo "OK — nobody saw an error."; exit 0; fi

# THE SIGNATURE OF 22 SEPTEMBER: errors arriving while nothing succeeds. One
# error beside working replies is an ordinary failure and not an outage — the
# threshold is deliberately about the RATIO and not about the count.
if [ "$ERRORS" -ge 3 ] && [ "$REPLIES" -eq 0 ]; then
  echo "NOT ANSWERING — ${ERRORS} errors and not one reply in ${WINDOW_MIN} minutes."
  echo "  Model calls in the same window: ${CALLS}. Zero means the provider refused before"
  echo "  inference — an account or key problem, not load. Check the provider's balance."
  echo "  Look for [provider] lines in the container log; they now name the status."
  exit 1
fi

if [ "$CALLS" -eq 0 ] && [ "$ERRORS" -ge 1 ]; then
  echo "NOT ANSWERING — ${ERRORS} error(s) and NO model call reached the provider at all."
  exit 1
fi

echo "OK — errors are present but the product is answering (${REPLIES} reply(ies))."
exit 0
