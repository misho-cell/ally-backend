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
SQL_TEXT="SELECT
  COUNT(*)                                                       AS registrations,
  COUNT(*) FILTER (WHERE u.\"inviterReferralUserId\" IS NOT NULL) AS attributed,
  COALESCE(MAX(TO_CHAR(u.\"createdAt\", 'MM-DD HH24:MI')), '-')   AS latest
FROM \"User\" u
WHERE u.\"createdAt\" >= TIMESTAMPTZ '${SINCE}'
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
  echo "  The fix is UNTESTED, not working. Nobody has registered through it yet"
  echo "  (registrations run about two a day), so there is nothing to read."
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
