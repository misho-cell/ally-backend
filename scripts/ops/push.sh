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
#   ./scripts/ops/push.sh reach        did anybody NEW become reachable (row 111)
#   ./scripts/ops/push.sh claims [d]   which rows a browser still claims (row 101)
set -uo pipefail
cd "$(dirname "$0")/../.."

WHO="${1:-}"

# ── „reach" — did anybody NEW become reachable? (row 111) ───────────────────
#
# 40 of the 45 people who have used Netai had NO push subscription at all, and
# `push_deliveries` held not one attempt for them. The frontend found why: the
# background pass began with `if (Notification.permission !== "granted")
# return;`, so it could only ever register people who had ALREADY agreed — and
# the two places that could ask were a small text button in one thread header
# and a line on a diagnostics card. Everything else fell into `catch {}`, which
# is why the log could not tell „refused" from „never asked".
#
# Their prompt shipped on 24 September. This is the before-and-after, and it is
# a COMMAND rather than a number in somebody's memory, because the whole point
# is to compare the same measurement on two different days.
#
# It counts PEOPLE, not rows. Five endpoints for one person is row 101 and it
# is not reach; one person who can be notified at all is what row 111 asks
# about.
if [ "$WHO" = reach ]; then
  printf '%s' "WITH real AS (
    SELECT u.id FROM \"User\" u
     WHERE NOT EXISTS (SELECT 1 FROM test_seats ts WHERE ts.user_id = u.id)
       AND EXISTS (SELECT 1 FROM threads th WHERE th.user_id = u.id)
  ),
  days AS (
    SELECT generate_series(CURRENT_DATE - 13, CURRENT_DATE, INTERVAL '1 day')::date AS d
  )
  SELECT days.d AS day,
         (SELECT COUNT(DISTINCT ps.user_id) FROM push_subscriptions ps
           WHERE ps.user_id IN (SELECT id FROM real)
             AND ps.created_at::date <= days.d)                       AS people_reachable,
         (SELECT COUNT(*) FROM push_subscriptions ps
           WHERE ps.user_id IN (SELECT id FROM real)
             AND ps.created_at::date = days.d)                        AS rows_added,
         (SELECT COUNT(*) FROM push_subscriptions ps
           WHERE ps.user_id IN (SELECT id FROM real)
             AND ps.created_at::date = days.d
             AND ps.endpoint LIKE '%apple%')                          AS apple_added,
         (SELECT COUNT(*) FROM push_subscriptions ps
           WHERE ps.user_id IN (SELECT id FROM real)
             AND ps.created_at::date = days.d
             AND ps.endpoint LIKE '%fcm%')                            AS fcm_added,
         (SELECT COUNT(*) FROM real)                                  AS real_people
    FROM days ORDER BY 1 LIMIT 30" | ./scripts/ops/ro.sh 2>/dev/null | python3 -c '
import sys, json
try:
    rows = json.load(sys.stdin)["data"]["rows"]
except Exception:
    print("CANNOT TELL — the read-only window did not answer. That is not \"nothing changed\".")
    raise SystemExit(2)

total = int(rows[-1]["real_people"]) if rows else 0
print("%-12s %17s %10s %7s %5s" % ("day", "people reachable", "rows added", "apple", "fcm"))
for r in rows:
    print("%-12s %10s of %-4s %10s %7s %5s"
          % (str(r["day"])[:10], r["people_reachable"], total,
             r["rows_added"], r["apple_added"], r["fcm_added"]))
print()
if rows:
    first, last = int(rows[0]["people_reachable"]), int(rows[-1]["people_reachable"])
    print("Over these 14 days: %d -> %d of %d people the server can reach at all." % (first, last, total))
    if last == first:
        print("NOBODY NEW. If the prompt is live, that is the frontend\x27s bug to find and")
        print("it is worth saying at once rather than as a slow suspicion.")
    else:
        print("%d person(s) became reachable who were not before." % (last - first))
print()
print("PEOPLE, not rows. One person with five endpoints is row 101, not reach.")
print("A row appearing here means the app registered them; whether a notification")
print("then ARRIVES is push_deliveries, which is  ./scripts/ops/push.sh <user_id>.")
'
  exit $?
fi

# ── „claims" — which rows has a browser said it still owns? (row 101) ───────
#
# THE FACT THAT MAKES THIS THE ONLY HONEST TEST. A push service accepts a push
# to a dead address and answers „delivered": fourteen days of `push_deliveries`
# read on 24 September carried `failed = 0` on every endpoint on every day,
# INCLUDING two that had visibly stopped existing. So nothing the SERVER does
# can tell a dead row from a live one. Only the browser can, by turning up.
#
# `last_seen_at` (migration 176) is stamped every time a browser re-posts its
# subscription. The rule below is written so it cannot be wrong in the
# direction that silences somebody:
#
#   STALE  = this row has not been claimed for the window
#            AND another row of the SAME PERSON has been claimed inside it.
#
# The second half is the whole safety. It proves that claims are arriving for
# that person at all — so silence on one row means that browser is gone, not
# that the client never reports. Without it, a client that only posts on a NEW
# subscription would make every row look dead and the rule would delete
# somebody's only phone.
#
# ⚠️⚠️ AND THE TRAP THIS TOOL WALKED INTO EIGHT MINUTES AFTER IT WAS WRITTEN.
#
# Migration 176 backfilled `last_seen_at = created_at`, because seeding from
# NOW() would have erased the very difference the column exists to record.
# Correct — and it means that until a browser actually re-posts, EVERY
# `last_seen_at` IS A CREATION DATE WEARING A CLAIM'S NAME. The first run of
# this command read those dates as claims and named three rows STALE, two of
# them on the account the whole row exists for. Not one browser had said
# anything. Had that reading been acted on, somebody's phone would have gone
# quiet on the strength of the day a row was inserted.
#
# It is the same fault as every other wrong number this month: a column read
# without asking what populates it. So a value at or before CLAIMS_BEGAN is not
# a claim, and the tool says plainly when it has nothing to go on.
#
# IT DELETES NOTHING. A row named here is a candidate for §36 of the register,
# decided by a person (D44).
CLAIMS_BEGAN='2026-09-24'   # stamping started here; anything earlier is backfill
#
# ⚠️⚠️ AND THE TRAP THE APP TEAM CAUGHT BEFORE IT COST ANYBODY ANYTHING.
#
# „Not claimed for thirty days" cannot be true of ANY row until thirty days
# after stamping began. Before that, a row that simply has not been opened yet
# is indistinguishable from a row whose browser is gone — and the rule would
# call it STALE the moment some OTHER row of that person claimed. Two days
# after the column was born, that would have named three of Lika's five.
#
# Their words, 24 September: „26 September is good for seeing WHETHER claims
# appear at all — whether the mechanism works. It is no good for deleting."
#
# So the window must have ELAPSED since stamping began before this tool is
# allowed to name anything. Their suggested bar is two weeks with one endpoint
# claiming repeatedly and another claiming never; the floor below enforces the
# time half of that, and the „another row claimed" clause the rest.
MIN_OBSERVATION_DAYS=14
if [ "$WHO" = claims ]; then
  DAYS="${2:-30}"
  printf '%s' "SELECT u.name,
       LEFT(MD5(s.endpoint), 8)                                   AS ep,
       CASE WHEN s.endpoint LIKE '%apple%' THEN 'apple'
            WHEN s.endpoint LIKE '%fcm%'   THEN 'fcm'
            ELSE 'other' END                                      AS svc,
       s.created_at::date                                         AS created,
       s.last_seen_at::date                                       AS claimed,
       (s.device_id IS NOT NULL)                                  AS named,
       (SELECT MAX(o.last_seen_at)::date FROM push_subscriptions o
         WHERE o.user_id = s.user_id AND o.id <> s.id)             AS other_claimed
  FROM push_subscriptions s
  JOIN \"User\" u ON u.id = s.user_id
 ORDER BY u.name, s.created_at
 LIMIT 200" | ./scripts/ops/ro.sh 2>/dev/null | DAYS="$DAYS" BEGAN="$CLAIMS_BEGAN" FLOOR="$MIN_OBSERVATION_DAYS" python3 -c '
import sys, json, os, datetime
try:
    rows = json.load(sys.stdin)["data"]["rows"]
except Exception:
    print("CANNOT TELL — the read-only window did not answer. That is not \"nothing is stale\".")
    raise SystemExit(2)

window = int(os.environ["DAYS"])
began = datetime.date.fromisoformat(os.environ["BEGAN"])
floor_days = int(os.environ["FLOOR"])
today = datetime.date.today()
# A row cannot have been silent for longer than the column has existed.
observed = (today - began).days
needed = min(window, floor_days)

def day(value):
    return None if not value else datetime.date.fromisoformat(str(value)[:10])

def a_real_claim(value):
    """Anything at or before the day stamping started is migration 176 backfill
    — the creation date copied across — and saying so is the whole point."""
    return value is not None and value > began

print("%-22s %-10s %-6s %-11s %-11s %s" % ("person", "endpoint", "service", "created", "claimed", "verdict"))
stale = real_claims = 0
for r in rows:
    claimed, other = day(r["claimed"]), day(r["other_claimed"])
    if a_real_claim(claimed):
        real_claims += 1
    quiet = not a_real_claim(claimed) or (today - claimed).days >= window
    person_reports = a_real_claim(other) and (today - other).days < window
    if quiet and person_reports and observed >= needed:
        verdict, stale = "STALE — the person claims another row, never this one", stale + 1
    elif quiet and person_reports:
        verdict = "silent, but the column is only %d day(s) old — TOO EARLY" % observed
    elif quiet:
        verdict = "not claimed yet — PROVES NOTHING"
    else:
        verdict = "claimed"
    print("%-22s %-10s %-6s %-11s %-11s %s"
          % ((r["name"] or "?")[:22], r["ep"], r["svc"],
             str(r["created"])[:10],
             str(r["claimed"])[:10] if a_real_claim(claimed) else "(backfill)",
             verdict))

print()
if observed < needed:
    print("TOO EARLY TO DELETE ANYTHING. last_seen_at began %s, %d day(s) ago;" % (began, observed))
    print("a row cannot have been silent longer than the column has existed. This")
    print("run can show WHETHER claims are arriving at all — which is worth")
    print("knowing — but it may not name a row stale before %d days." % needed)
    print()
if real_claims == 0:
    print("NO BROWSER HAS CLAIMED ANYTHING YET. Every date above is migration 176")
    print("copying created_at, not a browser turning up — so this run proves")
    print("NOTHING about any row, and none may be deleted on it.")
    print("Come back once people have opened the app; if it still reads zero in a")
    print("few days, the client is not re-posting and that is FOR_FRONTEND item 5.")
elif stale == 0:
    print("NOTHING PROVEN STALE in a %d-day window (%d real claim(s) recorded)." % (window, real_claims))
    print("Note the middle verdict: a row nobody has claimed, on an account where")
    print("NOTHING has been claimed, is not evidence. It means the client has not")
    print("re-posted for that person at all — which says nothing about the browser.")
else:
    print("%d row(s) PROVEN STALE. Deleting one is a write on a real person\x27s data:" % stale)
    print("register entry first (ADMIN_WRITE_OPERATIONS.md §36), then a named yes.")
'
  exit $?
fi


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
