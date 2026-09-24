#!/bin/bash
# „Can this person be reached, and does one send arrive once?" — rows 101 and
# 111, read-only, one command.
#
# WHY THIS EXISTS. On the night of 23 September both rows moved, and both moved
# because somebody finally read `push_deliveries`:
#
#   * ROW 111 („no notification on a locked phone") — 40 of the 45 people who
#     have used Netai have NO push subscription at all. The log holds not one
#     delivery attempt for them, so it is not „registered and died": the app
#     never registered them. Nothing on the server can fix that.
#
#   * ROW 101 („one approval sometimes sends the same work twice") — the server
#     sends ONCE, proved three ways. The duplication is in the fan-out: one
#     notification goes to EVERY row in `push_subscriptions`, and two people
#     have a stale Apple endpoint from an earlier install that never died.
#     205 events in seven days on one account.
#
# Both took ad-hoc SQL to find. The app team has to verify their fix and both
# rows have to be re-measured, so the SQL belongs in a command rather than in
# somebody's memory of a good evening.
#
# NO PHONE NUMBERS, EVER (D149). Names and account ids are the handles here.
# Endpoints are truncated: an endpoint plus its keys is a capability to push to
# somebody's phone, and a terminal scrollback is not where that belongs.
#
# READ-ONLY. It runs `ro.sh`, which is a single SELECT on a read-only
# connection enforced by the server. It cannot delete a stale subscription and
# that is deliberate: removing one is a write on a real person's data (D44).
#
# Usage:
#   ./scripts/ops/push.sh              who can be reached, and who has doubles
#   ./scripts/ops/push.sh <user_id>    one person, endpoint by endpoint, by day
set -uo pipefail
cd "$(dirname "$0")/../.."

WHO="${1:-}"

if [ -z "$WHO" ]; then
  # ────────────────────────────────────────────────────────────────────────
  # THE POPULATION IS „HAS USED NETAI", NOT A FLAG. `hasAccessToAlly` is the
  # ADMIN-LOGIN flag that registration also happens to set; 35 of the 45 real
  # people do not carry it. Asking it here would hide most of the pilot, which
  # is exactly the mistake this file's author made earlier the same evening.
  # ────────────────────────────────────────────────────────────────────────
  printf '%s' "SELECT u.name,
       (SELECT COUNT(*) FROM push_subscriptions ps WHERE ps.user_id = u.id) AS subs,
       (SELECT COUNT(*) FROM push_subscriptions ps
         WHERE ps.user_id = u.id AND ps.endpoint LIKE '%apple%')            AS apple,
       (SELECT COUNT(*) FROM push_subscriptions ps
         WHERE ps.user_id = u.id AND ps.endpoint LIKE '%fcm%')              AS fcm,
       (SELECT COUNT(*) FROM threads t WHERE t.user_id = u.id)              AS threads
  FROM \"User\" u
 WHERE NOT EXISTS (SELECT 1 FROM test_seats ts WHERE ts.user_id = u.id)
   AND EXISTS (SELECT 1 FROM threads th WHERE th.user_id = u.id)
 ORDER BY threads DESC
 LIMIT 60" | ./scripts/ops/ro.sh 2>/dev/null | python3 -c '
import sys, json
try:
    rows = json.load(sys.stdin)["data"]["rows"]
except Exception:
    print("CANNOT TELL — the read-only window did not answer. That is not \"nothing is wrong\".")
    raise SystemExit(2)

print("%-26s %5s %6s %4s %8s" % ("person", "subs", "apple", "fcm", "threads"))
unreachable = doubled = 0
for r in rows:
    subs, apple, fcm = int(r["subs"]), int(r["apple"]), int(r["fcm"])
    if subs == 0:
        unreachable += 1
    # Two endpoints on ONE push service is the row-101 SMELL and not the
    # finding. Tornike has three on FCM and they are three real machines — an
    # Android, a Windows desktop and one more — and his endpoints are live on
    # the SAME DAY, repeatedly, which is what two real devices look like.
    # So this column points; the per-person view decides.
    flag = "  <- two on one service, check" if apple > 1 or fcm > 1 else ""
    if apple > 1 or fcm > 1:
        doubled += 1
    print("%-26s %5d %6d %4d %8s%s" % ((r["name"] or "(no name)")[:26], subs, apple, fcm, r["threads"], flag))

print()
print("%d of %d have NO subscription — the server cannot reach them at all (row 111)." % (unreachable, len(rows)))
print("%d have two or more endpoints on ONE push service. That is a smell, NOT a verdict —" % doubled)
print("run  ./scripts/ops/push.sh <user_id>  and read the days:")
print("  two endpoints NEVER live on the same day  = one phone, id changed, every push twice")
print("  two endpoints live on the SAME day        = two real devices, working correctly")
print()
print("Both were seen on 23 September: one pair never overlapped (one phone), and")
print("another three overlap constantly (three machines). One column, opposite answers.")
'
  exit $?
fi

# ── One person, by endpoint and by day ──────────────────────────────────────
#
# `skipped` is the server saying „that device had a stream open, so no push".
# It is the column that answers „is this one phone or two devices" WITHOUT
# asking anybody: two registrations of the SAME phone are never live on the
# same day, because the client reports one device key at a time. Two real
# devices overlap. That is how row 101 was settled on 23 September.
#
# ⚠️ THE FIRST VERSION OF THIS PRINTED `LEFT(endpoint, 34)` AND THAT WAS WRONG,
# in the one direction that makes the whole table lie. Apple endpoints differ
# early, so they separated and looked right. EVERY FCM endpoint begins
# `https://fcm.googleapis.com/fcm/send/…` — thirty-four characters lands inside
# that shared prefix, so all of a person's Android and desktop registrations
# COLLAPSED INTO ONE ROW.
#
# Read on 24 September it showed account 160584 with „fcm 51, apple 17, apple
# 17" and the fcm number three times the others, which is what one row hiding
# three endpoints looks like. This file's whole job is to count endpoints, and
# it was under-counting them — the same fault it was written to catch, in the
# tool that catches it.
#
# The label is now the push service plus eight characters of a hash, which is
# unique per endpoint and, unlike a prefix, carries nothing (D149: an endpoint
# and its keys are a capability to push to somebody's phone; a digest is not).
# The GROUP BY is on the FULL endpoint, so the display can never merge two
# again.
printf '%s' "SELECT CASE WHEN d.endpoint LIKE '%apple%'  THEN 'apple  '
                   WHEN d.endpoint LIKE '%fcm%'    THEN 'fcm    '
                   WHEN d.endpoint LIKE '%mozilla%' THEN 'mozilla'
                   ELSE 'other  ' END || LEFT(MD5(d.endpoint), 8) AS endpoint,
       d.created_at::date              AS day,
       COUNT(*) FILTER (WHERE d.status = 'sent')    AS pushed,
       COUNT(*) FILTER (WHERE d.status = 'skipped') AS was_live,
       COUNT(*) FILTER (WHERE d.status = 'failed')  AS failed
  FROM push_deliveries d
 WHERE d.user_id = '${WHO}' AND d.created_at > NOW() - INTERVAL '14 days'
 GROUP BY 1, 2 ORDER BY 2, 1
 LIMIT 200" | ./scripts/ops/ro.sh 2>/dev/null | python3 -c '
import sys, json
try:
    rows = json.load(sys.stdin)["data"]["rows"]
except Exception:
    print("CANNOT TELL — the read-only window did not answer.")
    raise SystemExit(2)
if not rows:
    print("No delivery attempts in 14 days. If they have no subscription, that is row 111")
    print("and the app never registered them — not a delivery failure.")
    raise SystemExit(0)

print("%-18s %-12s %7s %8s %7s" % ("endpoint", "day", "pushed", "was live", "failed"))
byday = {}
for r in rows:
    print("%-18s %-12s %7s %8s %7s"
          % (r["endpoint"], str(r["day"])[:10], r["pushed"], r["was_live"], r["failed"]))
    if int(r["pushed"]) > 0:
        byday.setdefault(str(r["day"])[:10], []).append(r["endpoint"])
print()
# HOW MANY COPIES OF ONE NOTIFICATION, on the most recent day that had any.
# The per-endpoint rows above answer "is this one phone or two"; they do not
# answer "how many times does this person hear it", and that is the question
# row 101 is actually about. Counting it here rather than leaving it to be
# eyeballed - three endpoints in a column of nine rows is easy to miss.
if byday:
    last = max(byday)
    live = byday[last]
    print("ON %s THIS PERSON WAS PUSHED TO ON %d ENDPOINT(S): %s" % (last, len(live), ", ".join(live)))
    if len(live) > 1:
        print("That is %d copies of every notification unless those are %d real devices." % (len(live), len(live)))
    print()
print("TWO ENDPOINTS NEVER LIVE ON THE SAME DAY = one phone whose device_id changed,")
print("and every notification reaches it twice. Two real devices overlap.")
'
