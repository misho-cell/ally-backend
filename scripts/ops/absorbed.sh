#!/bin/bash
# What the HOUSE paid, because the wallet was not allowed to go below zero.
#
# Row 271 (B), Misho's word on 25 September: „so that it can NOT exceed the
# token count under any circumstance." The floor obeys him, and a floor moves
# the cost rather than deleting it — a run that costs 29 on a balance of 0
# still cost 29, and from that day somebody else pays it.
#
# ⚠️ SO THIS EXISTS BECAUSE THE NUMBER IS OURS AND NOBODY IS BILLED FOR IT.
# Everything else in the ledger has somebody who would notice if it were
# wrong. This one has nobody, and a cost with no reader is the kind that is
# found in six months as a total.
#
# WHAT IT CANNOT TELL YOU, because the column is new: nothing before the
# deploy of 25 September has an `absorbed` value — those runs really did take
# the balance below zero, and the eight accounts sitting there are the record
# of it. Use `--before` for that older shape, which is reconstructed from the
# running balance rather than read from a column.
#
# EXIT CODES, because „nothing was absorbed" and „I could not look" are
# different facts and this script is read by a routine:
#   0  looked, and something was absorbed (printed)
#   1  looked, and nothing was absorbed
#   2  could not look
#
# Usage:  ./scripts/ops/absorbed.sh [days]       what the floor has paid
#         ./scripts/ops/absorbed.sh --before     what it would have paid before
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
SCRATCH="$(mktemp -d)"
trap 'rm -rf "$SCRATCH"' EXIT

MODE="${1:-}"
DAYS="${1:-30}"
case "$MODE" in --before) DAYS=3650 ;; esac
case "$DAYS" in ''|*[!0-9]*) DAYS=30 ;; esac

if [ "$MODE" = --before ]; then
  # The reconstruction: a debit's overshoot is what it charged beyond the
  # balance that stood before it. Ordered by (created_at, id) because two rows
  # in the same second are ordered by nothing else, and a running balance read
  # in the wrong order is a different number.
  "$HERE/ro.sh" > "$SCRATCH/out.json" <<'SQL' || exit 2
WITH tx AS (
  SELECT user_id, amount, created_at, id,
         SUM(amount) OVER (PARTITION BY user_id ORDER BY created_at, id
                           ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS before
    FROM token_transactions
), overshoot AS (
  SELECT user_id, created_at,
         GREATEST(0, (-amount) - GREATEST(0, COALESCE(before, 0))) AS absorbed
    FROM tx WHERE amount < 0
)
SELECT COALESCE(NULLIF(TRIM(u.name), ''), '(no name)') AS person,
       SUM(o.absorbed)                                 AS tokens
  FROM overshoot o LEFT JOIN "User" u ON u.id::text = o.user_id
 WHERE o.absorbed > 0
 GROUP BY 1 ORDER BY 2 DESC LIMIT 40
SQL
else
  "$HERE/ro.sh" > "$SCRATCH/out.json" <<SQL || exit 2
SELECT COALESCE(NULLIF(TRIM(u.name), ''), '(no name)') AS person,
       SUM(t.absorbed)                                 AS tokens
  FROM token_transactions t LEFT JOIN "User" u ON u.id::text = t.user_id
 WHERE t.absorbed > 0
   AND t.created_at >= NOW() - make_interval(days => $DAYS)
 GROUP BY 1 ORDER BY 2 DESC LIMIT 40
SQL
fi

# ⚠️ THE ANSWER'S PATH IS AN ARGUMENT, NOT STDIN. `python3 -` reads its PROGRAM
# from stdin, so a heredoc and a `< file` on the same line are two things
# fighting for it: the heredoc wins, the program runs, and `json.load(stdin)`
# reads the empty remainder. It fails as „could not look", which is the safe
# direction and still the wrong answer.
python3 - "$MODE" "$DAYS" "$SCRATCH/out.json" <<'PY' || exit $?
import json, sys

mode, days, answer = sys.argv[1], sys.argv[2], sys.argv[3]
try:
    with open(answer, encoding='utf-8') as fh:
        rows = json.load(fh)["data"]["rows"]
except Exception as err:                       # noqa: BLE001 — any shape but ours
    print(f"absorbed.sh: could not read the answer ({err})", file=sys.stderr)
    raise SystemExit(2)

total = sum(int(r["tokens"]) for r in rows)
when = "before the floor existed" if mode == "--before" else f"in the last {days} days"
if total == 0:
    print(f"NOTHING ABSORBED {when} — every run was paid for out of a balance.")
    raise SystemExit(1)

print(f"{total} token(s) absorbed by the house {when}, across {len(rows)} account(s):")
for row in rows:
    print(f"  {int(row['tokens']):>6}  {row['person']}")
print("\nA test seat's tokens are ours either way. The line that matters is the")
print("real people's, and it is the one to read to the founder.")
PY
