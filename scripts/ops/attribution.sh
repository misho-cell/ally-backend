#!/bin/bash
# „Did the next registration carry its inviter?" — row 229, one question.
#
# WHY THIS IS A COMMAND AND NOT A NOTE TO MYSELF. Referral attribution was dead
# from 31 August to 22 September: 25 registrations, zero attributed, and nobody
# noticed for three weeks because nothing asked. The frontend found the cause on
# 22 September — `handlePhoneSubmit` cleared the field the link code was parked
# in, at the first step, before the OTP — and fixed it in build b84c521. They
# asked to be told what the next real registration does, either way.
#
# A promise to watch for something that happens twice a day is a promise I will
# break by being busy. So it is a command, and a Routine runs the command. Same
# reasoning as quiet.sh and outage.sh.
#
# EXIT CODE IS THE ANSWER:
#   0  nothing to report — no registration since the build. NOT „the fix works".
#   1  a registration arrived and was NOT attributed — the fix did not hold.
#   2  could not look. NOT „nothing is wrong".
#   3  a registration arrived AND carried its inviter — the fix held. Say so.
#
# „Could not look" and „looked and found nothing" are different facts, and this
# file exists because for three weeks they were indistinguishable.
set -uo pipefail
# scripts/ops -> the repo root is TWO levels up. outage.sh shipped with one and
# reported the database as silent when it was the script that was lost.
cd "$(dirname "$0")/../.."

# The frontend's fix reached main at 15:32 UTC on 22 September. A registration
# before that tells us nothing about it, so the window starts there. Override
# with an ISO timestamp to ask about a different one.
DEFAULT_SINCE="2026-09-22 15:32:00+00"
SINCE="${1:-$DEFAULT_SINCE}"

# A SEAT IS NOT A REGISTRATION, and on 23 September this check said it was.
#
# At 14:37 it reported „6 registration(s), NONE carried an inviter" and the
# Routine behind it was one step from telling the frontend their fix had not
# held. All six were FICTIONAL TEST SEATS — three I made at 13:14 and three the
# tester made at 14:15 through the route built that afternoon. Not one real
# person had registered; the number was entirely my own doing, two hours old.
#
# That is the exact fault this whole file was written about — a measurement
# claiming more than happened — arriving inside the measurement itself. It
# would have cost the frontend an afternoon chasing a bug that was not there.
#
# So the count excludes anything the seat route recorded in `test_seats`. It
# does NOT try to guess from the name: „Netai Test 14" is a convention and a
# real person may one day be called anything. `test_seats` is a row that only
# exists because a seat went through the creation checks, which is the only
# honest way to know.
# AND A SECOND POPULATION THAT IS NOT A NETAI REGISTRATION EITHER — FOUND THE
# SAME EVENING, BY THIS CHECK RAISING ITS SECOND FALSE ALARM IN FOUR HOURS.
#
# 23 September 18:37: „1 registration since 22 Sep 15:32, and NONE carried an
# inviter." The Routine's own text then says to tell the frontend their fix did
# not hold. Account 172167, 17:57:51.
#
# IT NEVER TOUCHED THE NETAI REGISTRATION SCREEN. The proof is a column and not
# a judgement: `registerUser` INSERTs `"hasAccessToAlly"` as a LITERAL `true`,
# on every path, with no branch — and that account has it FALSE. Two log lines
# that every Netai registration prints („[register] referral code arrived
# under: …" and „[invite-gate] attribution: …") are also absent from every
# container log covering that minute, and the log stream for that window is
# provably complete: the database records exactly one chat run in it and the
# log shows exactly that one.
#
# WHAT IT IS: the legacy ALLY app registering somebody into the SAME DATABASE.
#
#     hasAccessToAlly = false   62,200 accounts     4 in the last 7 days
#     hasAccessToAlly = true        33 accounts    20 in the last 7 days
#
# The 62,200 are the Ally base — the product's own language calls them
# „ally_account: has never opened Netai". They are targets, not members, and
# people are still joining that one. Counting them here reads another app's
# signups as ours.
#
# So the window asks for accounts the NETAI path created. A registration this
# code makes cannot be missed by it: the column is a literal in the INSERT, not
# something a caller can pass.
#
# 📌 TWICE IN ONE EVENING THIS FILE COUNTED THE WRONG POPULATION — six fictional
# seats at 14:37, one other product's user at 18:37 — and both times the next
# step was telling somebody their work had failed. The lesson is not „add
# another filter": it is that a count of PEOPLE needs a definition of which
# people, written down, and both of these are now columns rather than guesses.
SQL_TEXT="SELECT
  COUNT(*)                                                       AS registrations,
  COUNT(*) FILTER (WHERE u.\"inviterReferralUserId\" IS NOT NULL) AS attributed,
  COALESCE(MAX(TO_CHAR(u.\"createdAt\", 'MM-DD HH24:MI')), '-')   AS latest
FROM \"User\" u
WHERE u.\"createdAt\" >= TIMESTAMPTZ '${SINCE}'
  AND u.\"hasAccessToAlly\" = true
  AND NOT EXISTS (SELECT 1 FROM test_seats ts WHERE ts.user_id = u.id)"

OUT="$(printf '%s' "$SQL_TEXT" | ./scripts/ops/ro.sh 2>/dev/null)"

read -r TOTAL ATTRIBUTED LATEST <<< "$(
  python3 -c '
import sys, json
try:
    row = json.load(sys.stdin)["data"]["rows"][0]
except Exception:
    print("x x x"); raise SystemExit
print(row["registrations"], row["attributed"], row["latest"])
' <<< "$OUT"
)"

if [ "$TOTAL" = "x" ]; then
  echo "CANNOT TELL — the read-only window did not answer. That is not 'nothing is wrong'." >&2
  exit 2
fi

if [ "$TOTAL" -eq 0 ]; then
  echo "NOTHING TO REPORT — no registration since ${SINCE}."
  echo "  The fix is UNTESTED, not working. Nobody has registered through it yet,"
  echo "  so there is nothing to read."

  # ────────────────────────────────────────────────────────────────────────
  # AND HERE IS THE HALF THIS CHECK COULD NOT SEE UNTIL 24 SEPTEMBER.
  #
  # „No registration" has two readings and the Routine's own text says the
  # script cannot tell them apart: nobody came through a link at all, OR
  # somebody came and could not be credited. They call for opposite actions —
  # one says „send an invite", the other says „the fix did not hold".
  #
  # `referral_link_events` already knew. It records `issued`, `sent` and
  # `opened`, and an OPEN is somebody standing at the door. If no link has been
  # opened, the funnel was never entered and no conclusion about the fix is
  # available at any price. If links WERE opened and nobody registered, that is
  # a different and much more interesting fact.
  #
  # Nothing new had to be built. The table has existed all along and this file
  # never asked it — the same shape as the three weeks of silence it was
  # written about.
  # ────────────────────────────────────────────────────────────────────────
  OPENS="$(printf '%s' "SELECT COUNT(*) AS n, COALESCE(MAX(created_at)::text, '') AS newest
     FROM referral_link_events WHERE event = 'opened' AND created_at >= '${SINCE}'" \
    | ./scripts/ops/ro.sh 2>/dev/null \
    | python3 -c 'import sys,json
try:
    r = json.load(sys.stdin)["data"]["rows"][0]
    print(r["n"], r["newest"][:19] if r["newest"] else "-")
except Exception: print("x -")')"
  read -r OPEN_COUNT OPEN_NEWEST <<< "$OPENS"

  if [ "$OPEN_COUNT" = "x" ]; then
    echo "  AND I COULD NOT READ THE LINK EVENTS — so I cannot say whether anybody"
    echo "  even opened a link. That is a third fact, not a reassurance."
  elif [ "$OPEN_COUNT" -eq 0 ]; then
    LAST_OPEN="$(printf '%s' "SELECT COALESCE(MAX(created_at)::text, 'never') AS newest FROM referral_link_events WHERE event = 'opened'" \
      | ./scripts/ops/ro.sh 2>/dev/null \
      | python3 -c 'import sys,json
try: print(json.load(sys.stdin)["data"]["rows"][0]["newest"][:19])
except Exception: print("unknown")')"
    echo "  AND NOBODY HAS OPENED A LINK EITHER — zero opens in the same window."
    echo "  The last invite link anybody opened was ${LAST_OPEN}. So this is not the"
    echo "  fix failing quietly; the funnel has not been entered. Sending one invite"
    echo "  to somebody who has never registered is the whole of what is missing."
  else
    echo "  ⚠️ BUT ${OPEN_COUNT} INVITE LINK(S) WERE OPENED IN THAT WINDOW, the last at"
    echo "  ${OPEN_NEWEST} — somebody stood at the door and no registration followed."
    echo "  That is NOT the same as nobody coming, and it is the more interesting of"
    echo "  the two. Read the container log for that minute: '[register] referral code"
    echo "  arrived under: …' tells you whether the code reached the server at all."
    echo "  An open with no registration can also be a person who ALREADY has an"
    echo "  account — login takes no referral code, so they log in and nothing is"
    echo "  recorded anywhere. 62,163 accounts are in that position."
  fi
  # „About two a day" stood here until 23 September and it was the Ally base's
  # rate, not Netai's. Netai's own: THIRTEEN people ever, the newest on
  # 9 SEPTEMBER, none in the last fourteen days. „Wait for the next one" is
  # therefore not a plan — somebody has to bring a person in.
  echo "  Netai's own rate, for whoever reads this next: 13 people have ever"
  echo "  registered through it, the newest on 9 September. Waiting is not a plan."
  exit 0
fi

if [ "$ATTRIBUTED" -eq 0 ]; then
  echo "NOT ATTRIBUTED — ${TOTAL} registration(s) since ${SINCE}, latest ${LATEST}, and NONE carried an inviter."
  echo "  The frontend fix did not hold, or that person did not arrive through an"
  echo "  invite link at all — those are different and this cannot tell them apart."
  echo "  Read the container log for: [register] referral code arrived under: <key>"
  echo "  'NO KEY AT ALL' means the code still is not reaching registration."
  exit 1
fi

# „First since 31 August" is true of the DEFAULT window and false of any other,
# and the first version printed it over both — including a test window that
# deliberately reached back to include the old ones. A sentence that is true
# only for the default argument is the fault this file was written about.
echo "ATTRIBUTED — ${ATTRIBUTED} of ${TOTAL} registration(s) since ${SINCE} carried an inviter (latest ${LATEST})."
if [ "$SINCE" = "$DEFAULT_SINCE" ]; then
  echo "  This window starts at the frontend fix, so this is the first attribution"
  echo "  since 31 August 14:36. Tell the frontend: they asked to be told either"
  echo "  way, and this is the 'it held' half."
else
  echo "  NOT necessarily the first since 31 August — this window was given on the"
  echo "  command line and may reach back past the fix."
fi
exit 3
