#!/bin/bash
# „Is the product answering people right now?" — one question, one answer.
#
# THE COUNT IS AN ALLOW-LIST NOW, AND THE TWO ATTEMPTS BEFORE IT WERE BOTH
# „NOT THE THING I JUST SAW". `usage_events` is every paid thing, and I have
# now had to learn twice what is in it.
#
#   FIRST, no filter at all. At 13:23, with the Anthropic balance empty and not
#   one inference going through, the count came back 1 — an `otp_whatsapp` row,
#   provider `whatsapp`, no model — and this file printed „1 model call(s) did
#   reach the provider, so it is not refusing everything."
#
#   SECOND, `model IS NOT NULL`, shipped at 13:57 and declared a fix. Read the
#   distinct values of that column and it holds TOOL NAMES: `search_contacts`
#   223 times, `get_contact_facts` 153, `update_task` 90, thirty more. A
#   connector user calling `search_contacts` during a total Anthropic outage
#   writes a row that column counts, and this file would have called it a model
#   call reaching the provider.
#
#   AND IT HOLDS A SECOND PROVIDER. `gpt-5.6-terra` answered at 12:13:47 today,
#   in the middle of an Anthropic outage that began at 11:15 — because the
#   Anthropic credit balance has nothing to do with it. That single row is why
#   I gave the tester a dark window an hour and a quarter short of the truth.
#
# So the question is asked positively: does this row represent an ANTHROPIC
# inference. `model LIKE 'claude%'`, an allow-list, because „not the thing I
# just saw" has now been wrong twice about the same column. The other provider
# is counted and PRINTED, never merged into the verdict — its calls say nothing
# about the one the chat and the engine run on.
#
# That is the fault this script exists to catch, committed by the script three
# times: a number that counts something other than what its name promises, read
# out as reassurance.
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
# ON BEHALF OF SOMEBODY, AND NOT MERELY BY THE SERVER. 23 September, 03:55:
# this file read „500 anthropic call(s) … OK — nobody saw an error" with ZERO
# replies in the same window. Every one of the 500 was the nightly enrichment
# job — Haiku, 03:40 to 03:49, $0.27, capped at 500, and it has run at about
# this hour since 16 September.
#
# That is worse than the quiet-hour blindness below, because „OK" is a claim
# rather than a shrug. For the nine minutes that job runs, every night, this
# check would report a healthy product with the user-facing half completely
# dead — which is the exact state of 22 September at 12:04 that the file was
# written for.
#
# The filter is `user_id IS NOT NULL` rather than a list of background kinds,
# deliberately. A list has to be kept in step with whatever gets added next,
# and a list that drifts is how this project produces its faults — „two lists
# of test account had drifted" cost the tester a run this week. Measured over
# seven days before changing it: chat, moderation, fact_extraction_sweep,
# thread_title and notification carry a user_id on EVERY row (8,673 of 8,673);
# enrichment, fact_moderation and fact_extraction carry one on none (2,055 of
# 2,055). „A call made for a person" needs no list.
#
# in that form, and the failure looks exactly like the database not answering.
SQL_TEXT="SELECT
  (SELECT COUNT(*) FROM conversations
    WHERE role = 'assistant' AND kind = 'error'
      AND created_at >= NOW() - INTERVAL '${WINDOW_MIN} minutes')  AS errors,
  (SELECT COUNT(*) FROM conversations
    WHERE role = 'assistant' AND kind = 'message' AND content <> ''
      AND created_at >= NOW() - INTERVAL '${WINDOW_MIN} minutes')  AS replies,
  (SELECT COUNT(*) FROM usage_events
    WHERE created_at >= NOW() - INTERVAL '${WINDOW_MIN} minutes'
      AND model LIKE 'claude%'
      AND user_id IS NOT NULL AND user_id <> '')                   AS anthropic_calls,
  (SELECT COUNT(*) FROM usage_events
    WHERE created_at >= NOW() - INTERVAL '${WINDOW_MIN} minutes'
      AND model IS NOT NULL AND model NOT LIKE 'claude%')          AS other_rows"

OUT="$(printf '%s' "$SQL_TEXT" | ./scripts/ops/ro.sh 2>/dev/null)"

read -r ERRORS REPLIES CALLS OTHER <<< "$(
  python3 -c '
import sys, json
try:
    row = json.load(sys.stdin)["data"]["rows"][0]
except Exception:
    print("x x x x"); raise SystemExit
print(row["errors"], row["replies"], row["anthropic_calls"], row["other_rows"])
' <<< "$OUT"
)"

if [ "$ERRORS" = "x" ]; then
  echo "CANNOT TELL — the read-only window did not answer. That is not the same as 'nothing is wrong'." >&2
  exit 2
fi

# The other rows are printed and never counted: „N other" is a mixture of a
# second provider's inferences and bare tool calls, and this script has no way
# to tell those apart. Naming it as an unsorted remainder is the honest shape —
# the alternative is a second number that means as little as the first one did.
echo "last ${WINDOW_MIN}m: ${ERRORS} error(s), ${REPLIES} reply(ies), ${CALLS} anthropic call(s)" \
  "(+${OTHER} other usage row(s), not evidence either way)"

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
  echo "NOTHING PROVEN — no errors, and no Anthropic call went through in ${WINDOW_MIN} minutes."
  echo "  A product nobody is using and a product that cannot answer look"
  echo "  exactly alike from here. ${REPLIES} reply(ies) in the window were written"
  echo "  by the server, not by the model. If an outage is known to be open, it"
  echo "  is STILL OPEN until an Anthropic call succeeds."
  # 22 September, 22:41 — AND AT NIGHT THIS IS THE NORMAL ANSWER, which makes
  # the monitor blind for nine hours at a stretch. Three checks in a row
  # between 22:07 and 22:37 reported 0 errors and 0 calls, because nobody was
  # using the product. The routine that runs this reads „exit 0" as „the
  # product answers" and writes nothing — so an outage that began at midnight
  # would be found by the first person awake, which is the exact 50-minute
  # blind spot on 22 September that this file was written for, stretched to a
  # whole night.
  #
  # The exit code stays 0 on purpose (see above: a routine that cries at every
  # quiet hour gets ignored) and saying so here is not a fix. The fix is a
  # positive probe — one cheap model call when the window is empty, so silence
  # becomes evidence instead of the absence of it — and a probe costs money,
  # which is Misho's to authorise. Written into docs/NIGHT_QUESTIONS.md.
  echo "  NOTE: at night this is the NORMAL answer, so this check cannot see an"
  echo "  outage that starts after everyone goes to bed. See NIGHT_QUESTIONS.md."
  if [ "$OTHER" -gt 0 ]; then
    echo "  ${OTHER} other usage row(s) are NOT that proof: that column also holds"
    echo "  tool names and a second provider, neither of which touches Anthropic."
  fi
  exit 0
fi

# A quiet product is not a broken one — but it has to have DONE something.
if [ "$ERRORS" -eq 0 ]; then
  echo "OK — nobody saw an error, and ${CALLS} Anthropic call(s) went through."
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
    echo "  NO Anthropic call reached the provider in that window — refused before"
    echo "  inference, which is an account or key problem and not load."
    if [ "$OTHER" -gt 0 ]; then
      echo "  The ${OTHER} other usage row(s) do not soften that: today's outage had a"
      echo "  gpt-5.6-terra call succeed at 12:13:47 while Anthropic refused everything."
    fi
  else
    echo "  ${CALLS} Anthropic call(s) did reach the provider, so it is not refusing everything."
  fi
  echo "  Read the cause, do not guess it: [provider] lines in the container log name the"
  echo "  status and say ACCOUNT (no retry will pass) or LOAD (it may clear by itself)."
  exit 1
fi

if [ "$CALLS" -eq 0 ] && [ "$ERRORS" -ge 1 ]; then
  echo "NOT ANSWERING — ${ERRORS} error(s) and NO Anthropic call reached the provider at all."
  exit 1
fi

echo "OK — errors are present but the product is answering (${REPLIES} reply(ies))."
exit 0
