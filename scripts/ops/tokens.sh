#!/bin/bash
# Tokens for ONE fictional test account — §19 of docs/ADMIN_WRITE_OPERATIONS.md.
#
# A named capability rather than a raw curl, for the same reason as the others:
# a permission rule attaches to THIS, and what it can reach is fixed here and
# visible in git.
#
# WHAT IT CANNOT DO, and none of it is this script's promise — every line is
# enforced by the route, which is where it cannot be edited around:
#
#   * a real person's wallet. The six ids are hardcoded in testSeatTokens.ts
#     and anything else is refused by name, with the id in the refusal.
#   * more than ±50,000 in one call. A test seat spends in the tens.
#   * a silent grant. `note` is required, stored on the row, and printed here.
#
# THE UNDO IS THIS SAME COMMAND WITH A MINUS. That is why the amount is signed:
# a reversal is a row beside the grant, not a deletion, and the balance is the
# sum of the column.
#
#   ./scripts/ops/tokens.sh 171872 500 "row 217 — seat driven to -7 on drills"
#   ./scripts/ops/tokens.sh 171872 -500 "undo: not needed after all"
set -euo pipefail
OPS="${NETAI_OPS_DIR:-$HOME/.netai-ops}"
API="${NETAI_API:-https://api.netai.guru}"
[ -f "$OPS/.admin_token" ] || { echo "tokens.sh: no $OPS/.admin_token" >&2; exit 1; }

[ $# -eq 3 ] || { echo 'usage: tokens.sh <test-account-id> <amount> "<why>"' >&2; exit 1; }
ACCOUNT="$1"; AMOUNT="$2"; NOTE="$3"

BODY="$(python3 - "$AMOUNT" "$NOTE" <<'PY'
import json, sys
print(json.dumps({"tokens": int(sys.argv[1]), "note": sys.argv[2]}))
PY
)"

curl -sS -X POST "$API/admin/test-accounts/$ACCOUNT/tokens" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $(cat "$OPS/.admin_token")" \
  --data-binary "$BODY"
echo
