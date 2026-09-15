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
curl -sS -X POST "$API/internal/ro-sql" \
  -H 'Content-Type: application/json' \
  -H "x-ro-key: $(cat "$OPS/.ro_key")" \
  --data-binary "$(node -e 'process.stdout.write(JSON.stringify({sql: require("fs").readFileSync(0,"utf8")}))' <<< "$SQL")"
