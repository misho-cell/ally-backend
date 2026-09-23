#!/bin/bash
# Create ONE fictional test seat — §see „POST /admin/test-accounts" in
# docs/ADMIN_WRITE_OPERATIONS.md.
#
# A named capability rather than a raw curl, for the same reason as the others:
# a permission rule attaches to THIS, and what it can reach is fixed here and
# visible in git.
#
# WHAT IT CANNOT DO, and none of it is this script's promise — every line is
# enforced by the route and the service under it:
#
#   * touch an existing account. Every write is an INSERT of a new row.
#   * choose a number. There is no phone argument, because a number handed in
#     by a caller is a number nobody checked. The service takes the first slot
#     in the range reserved for fiction that is registered to NOBODY and saved
#     in NOBODY's phonebook — Netai Test 5 sits on a number a real owner had
#     had since August, which is why the second half is there.
#   * put a real person in the new seat's phonebook. Every --holds entry must
#     itself be a seat, and one that is not is refused by name.
#
# THE UNDO IS NOT A DELETE (D245): empty it with tokens.sh and leave it.
#
#   ./scripts/ops/seat.sh "Netai Test 12" "row 251 triangle" 500 +12025550113
#   ./scripts/ops/seat.sh --list
set -euo pipefail
OPS="${NETAI_OPS_DIR:-$HOME/.netai-ops}"
API="${NETAI_API:-https://api.netai.guru}"
[ -f "$OPS/.admin_token" ] || { echo "seat.sh: no $OPS/.admin_token" >&2; exit 1; }
TOKEN="$(cat "$OPS/.admin_token")"

if [ "${1:-}" = "--list" ]; then
  curl -sS -H "Authorization: Bearer $TOKEN" "$API/admin/test-accounts"; echo; exit 0
fi

[ $# -ge 3 ] || { echo 'usage: seat.sh "<name>" "<why>" <tokens> [holds-phone ...]' >&2; exit 1; }
NAME="$1"; NOTE="$2"; TOKENS="$3"; shift 3

BODY="$(python3 - "$NAME" "$NOTE" "$TOKENS" "$@" <<'PY'
import json, sys
name, note, tokens, *holds = sys.argv[1:]
print(json.dumps({"name": name, "note": note, "tokens": int(tokens), "holds": holds}))
PY
)"

curl -sS -X POST "$API/admin/test-accounts" \
  -H 'Content-Type: application/json' -H "Authorization: Bearer $TOKEN" \
  --data-binary "$BODY"
echo
