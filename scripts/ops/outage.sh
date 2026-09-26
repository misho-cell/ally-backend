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
      AND user_id IS NOT NULL AND user_id <> ''
      -- A HEARTBEAT IS NOT THE PRODUCT ANSWERING. It proves the PROVIDER
      -- answers and nothing else: a completely broken product still has one.
      -- The user_id clause above already excludes it, because the probe
      -- records no user — but that clause is here for another reason, and a
      -- protection that holds by accident is one relaxation away from gone.
      -- Counting heartbeats in this number would build a new blindness in the
      -- act of closing an old one, so it is said out loud.
      AND kind <> 'heartbeat')                                     AS anthropic_calls,
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
  echo "  This window alone still cannot tell those apart — but the silence test"
  echo "  below can, and it runs at every hour now. Read that line, not this one."
  if [ "$OTHER" -gt 0 ]; then
    echo "  ${OTHER} other usage row(s) are NOT that proof: that column also holds"
    echo "  tool names and a second provider, neither of which touches Anthropic."
  fi

  # ────────────────────────────────────────────────────────────────────────
  # 23 SEPTEMBER, 20:28 — THE PROBE WAS ALREADY THERE AND ALREADY PAID FOR.
  #
  # NIGHT_QUESTIONS.md item D says the fix for this blindness "is a positive
  # probe — one cheap model call when the window is empty — and a probe costs
  # money, which is Misho's to authorise". That was written without asking one
  # question: DOES THE PRODUCT ALREADY CALL THE PROVIDER AT NIGHT BY ITSELF?
  #
  # It does. Measured over seven nights (20:00-07:00 UTC), by the hour:
  #
  #     02:00   886 calls on 7 of 7 nights      the nightly review
  #     03:00 1,706 calls on 5 of 7
  #     04:00    72 calls on 7 of 7
  #     05:00   176 calls on 7 of 7             the notification cron
  #
  # The crons ARE the heartbeat. Nobody has to spend anything.
  #
  # AND THE THRESHOLD IS MEASURED, NOT GUESSED — the longest silence inside
  # each of the last seven nights:
  #
  #     16 Sep 200 min · 17 Sep 100 · 18 Sep 205 · 19 Sep 121
  #     20 Sep  85 min · 21 Sep  77 · 22 Sep  89
  #
  # So 205 minutes of night silence is NORMAL here, and anything that cries
  # sooner cries most nights. 240 minutes is the first number that is above
  # every one of them with room to spare.
  #
  # WHAT THIS BUYS AND WHAT IT DOES NOT. It does not catch an outage in twenty
  # minutes; nothing free can, because the product genuinely goes silent for
  # three hours at a time. It turns "found by the first person awake" — nine
  # hours — into "found within four". That is half the harm for no money and
  # nobody's permission, and it is worth having while the paid probe is still
  # a question for Misho rather than instead of it.
  #
  # Re-measure the seven-night table if the crons move; the number is only as
  # good as the schedule it was taken from.
  #
  # ────────────────────────────────────────────────────────────────────────
  # 24 SEPTEMBER, 07:25 — 240 BECOMES 60, AND THE REASON ABOVE IS NO LONGER
  # THE REASON.
  #
  # Everything above justifies 240 by what is NORMAL: the longest silence in
  # seven nights was 205, so 240 is the first number that does not cry most
  # nights. That reasoning died at 07:13:08 this morning, when the heartbeat
  # made its first real call after 26 minutes of quiet.
  #
  # The probe fires at 25 minutes of silence and looks every 10, so the LONGEST
  # SILENCE THE LEDGER CAN NOW SHOW, with everything working, is about 35
  # minutes — and it no longer depends on whether anybody is awake. A night
  # silence of three hours is not normal any more; it is impossible unless
  # something is broken.
  #
  # So the threshold is not „above the normal night" any more. It is „long
  # enough that the probe must have failed", and the two numbers have nothing
  # to do with each other. 60 minutes leaves room for a deploy — a restart puts
  # the first check ten minutes out — and still finds an outage inside an hour
  # instead of four.
  #
  # KEEPING 240 WOULD HAVE BEEN WORSE THAN LEAVING IT ALONE, because the
  # sentence beside it would have gone on explaining a number by a fact that
  # had stopped being true. That is the failure this whole file is written
  # against, and it does not stop being it when the number is mine.
  #
  # IF THIS STARTS CRYING WRONGLY, the thing to check first is whether the
  # heartbeat is running at all — `[heartbeat] started` in the boot log, and a
  # `kind = 'heartbeat'` row in `usage_events`. A silent probe and a silent
  # provider look identical from here, which is the same confusion in a new
  # place, and it is the reason the alarm text below names both.
  # ────────────────────────────────────────────────────────────────────────
  # Overridable so the alarm branch can be PROVEN rather than assumed:
  #   NIGHT_SILENCE_LIMIT_MIN=1 ./scripts/ops/outage.sh 20
  # should shout on any quiet window. I ran exactly that before shipping it.
  NIGHT_SILENCE_LIMIT_MIN="${NIGHT_SILENCE_LIMIT_MIN:-60}"
  # ────────────────────────────────────────────────────────────────────────
  # AND IT RUNS AT EVERY HOUR NOW. This test used to be fenced behind
  # `HOUR_NOW >= 20 || < 7`, for the same reason the limit was 240: by day a
  # quiet window meant people were busy elsewhere, and silence proved nothing.
  #
  # That fence has the same hole the number did. The heartbeat does not know
  # what time it is — it probes after 25 minutes of quiet at noon exactly as it
  # does at four in the morning — so a long silence is now evidence at ANY
  # hour, and fencing it to the night would leave the daytime version of the
  # blindness this file was written for.
  #
  # It was visible immediately: at 07:25, one minute after the limit changed,
  # this script printed NOTHING PROVEN over a twenty-minute window in which the
  # heartbeat was the only thing calling the provider — and said nothing about
  # the silence, because 07 is not night. Half an hour outside the fence.
  # ────────────────────────────────────────────────────────────────────────
  # This one DOES count heartbeats, and must: the whole point of the probe
  # is that silence here means the provider is unreachable rather than that
  # nobody is awake. See services/heartbeat.cron.ts.
  QUIET_FOR="$(printf '%s' "SELECT COALESCE(ROUND(EXTRACT(EPOCH FROM (NOW() - MAX(created_at)))/60), 99999)::int AS quiet_min FROM usage_events WHERE provider = 'anthropic'" \
    | ./scripts/ops/ro.sh 2>/dev/null \
    | python3 -c 'import sys,json
try: print(json.load(sys.stdin)["data"]["rows"][0]["quiet_min"])
except Exception: print("x")')"
  # ────────────────────────────────────────────────────────────────────────
  # 26 SEPTEMBER, 20:05 — AND THE PROBE'S OWN VERDICT WAS NOT BEING READ.
  #
  # At 19:54:06 the heartbeat called the provider and was refused: „credit
  # balance is too low". That is the exact sentence this whole block exists to
  # obtain — it proves the probe is alive AND the provider is refusing, which
  # is the one distinction the text below says it cannot make.
  #
  # This script printed NOTHING PROVEN at 19:52, 20:03 and 20:07 anyway, and
  # returned 0 each time. Not because the silence test is wrong, but because
  # the silence test is a PROXY: it waits for 60 minutes of quiet to infer what
  # the log already said in plain words after 26.
  #
  # A REFUSED CALL NEVER BECOMES A `usage_events` ROW. That is why the database
  # cannot see it and why every number in this file was honestly zero. The
  # answer was in the deployment log the whole time, and this script — the one
  # thing whose job is to go and ask — was not asking.
  #
  # The same shape as the day's other five: the measurement was right and the
  # question was different. „Has a call succeeded lately" is not „has a call
  # been refused".
  #
  # It is checked FIRST because it is evidence rather than inference, and it
  # only counts when the refusal is NEWER than the last call that worked —
  # otherwise a recovered outage would cry forever.
  # ⚠️ THREE DEPLOYMENTS, NOT ONE — AND I SHIPPED THE ONE-DEPLOYMENT VERSION
  # FIRST. It exited 1 correctly at 20:09, I pushed it, the push replaced the
  # container, and at 20:12 — with the provider still refusing — it exited 0
  # again. A deploy cuts the log, so the refusal it had just found now lived in
  # a deployment this check no longer looked at.
  #
  # Which means the check would have gone quiet EXACTLY when somebody deploys a
  # fix and wants to know whether it worked. Found in three minutes only
  # because I ran it twice instead of trusting the run that agreed with me.
  HEARTBEAT_REFUSAL=""
  DEPLOY_ID=""
  if [ "$QUIET_FOR" != "x" ]; then
    for candidate in $(./scripts/ops/logs.sh deployments 3 2>/dev/null | awk 'NR>1 {print $1}'); do
      found="$(./scripts/ops/logs.sh logs "$candidate" 400 "PROVIDER DID NOT ANSWER" 2>/dev/null \
        | python3 -c 'import sys,json
from datetime import datetime,timezone
try:
    rows = json.load(sys.stdin)["data"]["deploymentLogs"]
except Exception:
    rows = []
if rows:
    stamp = rows[-1]["timestamp"].replace("Z", "+00:00").split(".")[0] + "+00:00"
    age = (datetime.now(timezone.utc) - datetime.fromisoformat(stamp)).total_seconds() / 60
    print(int(age))
' 2>/dev/null)"
      # The newest refusal across the three is the smallest age.
      if [ -n "$found" ]; then
        if [ -z "$HEARTBEAT_REFUSAL" ] || [ "$found" -lt "$HEARTBEAT_REFUSAL" ]; then
          HEARTBEAT_REFUSAL="$found"
          DEPLOY_ID="$candidate"
        fi
      fi
    done
  fi
  if [ -n "${HEARTBEAT_REFUSAL:-}" ] && [ "$QUIET_FOR" != "x" ] \
     && [ "$HEARTBEAT_REFUSAL" -lt "$QUIET_FOR" ]; then
    echo ""
    echo "THE PROBE ASKED AND WAS REFUSED — ${HEARTBEAT_REFUSAL} minutes ago, against"
    echo "  ${QUIET_FOR} minutes since the last call that worked."
    echo "  This is NOT the silence test and NOT an inference. The heartbeat made a"
    echo "  real call to the provider and the provider said no, which settles both"
    echo "  questions at once: the probe is running, and the product cannot answer."
    echo ""
    echo "  The refusal's own words are in the deployment log:"
    echo "    ./scripts/ops/logs.sh logs ${DEPLOY_ID} 400 \"PROVIDER DID NOT ANSWER\""
    echo "  Read them before reporting a cause — a balance, a key and a rate limit"
    echo "  are three different problems and only one of them is money."
    exit 1
  fi
  if [ "$QUIET_FOR" = "x" ]; then
    echo "  AND I COULD NOT READ THE LAST CALL'S AGE — that is not reassurance either."
  elif [ "$QUIET_FOR" -gt "$NIGHT_SILENCE_LIMIT_MIN" ]; then
    echo ""
    echo "SILENT LONGER THAN THE PROBE ALLOWS — ${QUIET_FOR} minutes since the last"
    echo "  Anthropic call, against a limit of ${NIGHT_SILENCE_LIMIT_MIN}."
    echo "  The heartbeat calls the provider after 25 minutes of silence and looks"
    echo "  every 10, so with everything working the ledger cannot show more than"
    echo "  about 35 minutes. This is not a quiet night; a quiet night is no longer"
    echo "  possible."
    echo ""
    echo "  TWO THINGS LOOK LIKE THIS AND THEY ARE NOT THE SAME:"
    echo "    * the provider is refusing — the outage this file exists for"
    echo "    * the heartbeat is not running — check for '[heartbeat] started' in the"
    echo "      boot log and a kind='heartbeat' row in usage_events"
    echo "  Say which one you found. Do not report the first without ruling out the"
    echo "  second: a silent probe and a silent provider are indistinguishable here."
    exit 1
  else
    echo "  Last Anthropic call: ${QUIET_FOR} min ago. The heartbeat probes at 25 min"
    echo "  and looks every 10, so up to about 35 is ordinary — at ${NIGHT_SILENCE_LIMIT_MIN} it would mean"
    echo "  the probe itself has stopped or the provider is refusing."
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
