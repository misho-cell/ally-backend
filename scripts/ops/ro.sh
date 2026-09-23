#!/bin/bash
# One read-only SELECT against production, from stdin.
#
# The read-only-ness is enforced by the SERVER (/internal/ro-sql refuses
# anything but a single SELECT, on a read-only connection). This script is the
# named capability a permission rule can be attached to; it cannot write, and
# that is not a promise made here — it is a property of the endpoint.
set -euo pipefail
OPS="${NETAI_OPS_DIR:-$HOME/.netai-ops}"
API="${NETAI_API:-https://api.netai.guru}"
[ -f "$OPS/.ro_key" ] || { echo "ro.sh: no $OPS/.ro_key" >&2; exit 1; }
SQL="$(cat)"

# A TRAP THAT LIVES IN TYPESCRIPT AND CANNOT BE SEEN FROM A SHELL QUERY.
#
# `UserAlias.created_at` was added by migration 068 with DEFAULT NOW(), which
# backfilled every row that already existed. 8,406,858 of them — 99.99% of the
# table — carry the SAME timestamp, 2026-08-22 11:40, and it is the migration
# running, not anybody saving a contact.
#
# `labelParser.service.ts` knows: it holds ALIAS_PROVENANCE_BACKFILL_AT and
# refuses to quote a date equal to it, with the comment „a date equal to it is
# not when the label was written, so it is never quoted as one".
#
# On 20 September I read the column from here, in an ad-hoc query, and told two
# people that 59,111 rows „were written in August 2026 by 809 savers". The
# savers were real. The month was the migration's. The guard existed and this
# path could not see it — so now it can.
case "$SQL" in
  *UserAlias*created_at*|*useralias*created_at*)
    echo "ro.sh: NOTE — UserAlias.created_at is 2026-08-22T11:40:18 for 8,406,858" >&2
    echo "        rows: that is migration 068 backfilling, not when anything was" >&2
    echo "        written. Only rows AFTER that timestamp carry a real date." >&2
    ;;
esac

# ────────────────────────────────────────────────────────────────────────────
# AND THE TWO TRAPS THAT COST ME FOUR WRONG NUMBERS IN ONE DAY, 23 SEPTEMBER.
#
# Every one of them was the same move: a count whose DEFINITION I had not
# asked for, read out of a query that looked obviously correct.
#
#   14:37  six fictional test seats counted as six registrations — one step
#          from telling the frontend their fix had failed
#   18:37  one LEGACY ALLY account counted as a Netai registration; that base
#          is 62,200 people and four of them joined last week
#   20:32  MIN(error_text) read as „the common reason" — it is the
#          alphabetically first one; 98 failures became 2
#   20:45  „held" read as „never shown", for a kind that is HELD BY DESIGN.
#          That one reached the board twice and the app team once.
#
# The first, second and fourth are queries, so they get a note here — the same
# treatment as UserAlias.created_at above, and for the same reason: a trap that
# lives in TypeScript cannot be seen from a shell query, so the query has to
# carry it. (MIN(error_text) is a habit, not a column, and no note can catch
# it; it lives on the board instead.)
#
# These print to stderr BEFORE the answer, so the definition arrives before the
# number does.
case "$SQL" in
  *'"User"'*|*' User '*)
    case "$SQL" in
      # ⚠️ 22:05 — THE GUARD I WROTE AT 20:50 WOULD HAVE STAYED SILENT ON THE
      # WORST QUERY OF THE NIGHT, WHICH WAS MINE AND NAMED THIS VERY COLUMN.
      #
      # It treated `hasAccessToAlly` as evidence that the asker had thought
      # about populations. At 21:31 I used that column to mean „is a Netai
      # person", shipped it, and had it verified by somebody else before I
      # noticed. The column does not mean that:
      #
      #   * `adminLogin` READS it — it is the admin-login permission
      #   * `setAdminAccess` WRITES it
      #   * `registerUser` also sets it true for every Netai registrant
      #   * and 35 of the 45 people who have USED Netai do not carry it,
      #     including the second most active account in the product
      #
      # So naming it is not reassurance. It is the moment to say what it is.
      *hasAccessToAlly*)
        echo 'ro.sh: NOTE — "hasAccessToAlly" is the ADMIN-LOGIN flag (adminLogin reads it,' >&2
        echo '        setAdminAccess writes it), which registerUser ALSO sets true for every' >&2
        echo '        Netai registrant. It is not „uses Netai": 35 of the 45 people who have' >&2
        echo '        used this product do not carry it, including the second most active' >&2
        echo '        account. For USE, ask for a row in `threads`.' >&2
        ;;
      *test_seats*) ;;
      *)
        echo 'ro.sh: NOTE — "User" holds THREE populations and this query names none:' >&2
        echo '        62,200 legacy ALLY accounts (hasAccessToAlly = false) who have' >&2
        echo '        never opened Netai and are still signing up; 20 fictional test' >&2
        echo '        seats (a row in test_seats); and 13 real Netai people.' >&2
        echo '        A count of „users" that does not say which one is probably wrong.' >&2
        ;;
    esac
    ;;
esac
case "$SQL" in
  *pending_updates*)
    case "$SQL" in
      *held*|*status*)
        echo "ro.sh: NOTE — in pending_updates, 'held' does NOT mean unseen." >&2
        echo "        goal_question is STICKY by design: it describes a state, so it is" >&2
        echo "        shown, left held, and re-offered after a 24h cooldown. A sticky row" >&2
        echo "        that HAS been shown has release_at pushed past created_at — that is" >&2
        echo "        the only way to tell 'never shown' from 'shown, still unanswered'." >&2
        ;;
    esac
    ;;
esac

curl -sS -X POST "$API/internal/ro-sql" \
  -H 'Content-Type: application/json' \
  -H "x-ro-key: $(cat "$OPS/.ro_key")" \
  --data-binary "$(node -e 'process.stdout.write(JSON.stringify({sql: require("fs").readFileSync(0,"utf8")}))' <<< "$SQL")"
