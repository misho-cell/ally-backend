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

curl -sS -X POST "$API/internal/ro-sql" \
  -H 'Content-Type: application/json' \
  -H "x-ro-key: $(cat "$OPS/.ro_key")" \
  --data-binary "$(node -e 'process.stdout.write(JSON.stringify({sql: require("fs").readFileSync(0,"utf8")}))' <<< "$SQL")"
