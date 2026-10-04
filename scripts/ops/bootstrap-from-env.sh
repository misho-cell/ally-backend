#!/bin/bash
# Recreate ~/.netai-ops from the cloud environment's variables.
#
# A fresh container (a new session, a new Claude account) has no ~/.netai-ops,
# and every ops script reads its credentials from there. The values live in the
# environment's settings, never in git and never in a chat. Run this once at the
# start of a session, or put it in the environment's setup script.
#
#   NETAI_ADMIN_EMAIL     the admin login the AI seats write through (box.sh, board)
#   NETAI_ADMIN_PASSWORD  its password
#   NETAI_RO_KEY          the server's RO_SQL_KEY (ro.sh: read-only SELECTs)
#   NETAI_RAILWAY_TOKEN   a Railway API token (logs.sh: deployments and logs, read-only use)
#
# Prints which files it wrote and which variables were missing — never a value.
set -euo pipefail
OPS="${NETAI_OPS_DIR:-$HOME/.netai-ops}"
mkdir -p "$OPS"
chmod 700 "$OPS"

missing=()
write() {
  local file="$1" value="$2" name="$3"
  if [ -z "$value" ]; then
    missing+=("$name")
    return
  fi
  printf '%s\n' "$value" > "$OPS/$file"
  chmod 600 "$OPS/$file"
  echo "wrote $OPS/$file"
}

if [ -n "${NETAI_ADMIN_EMAIL:-}" ] && [ -n "${NETAI_ADMIN_PASSWORD:-}" ]; then
  printf '%s\n%s\n' "$NETAI_ADMIN_EMAIL" "$NETAI_ADMIN_PASSWORD" > "$OPS/.admin"
  chmod 600 "$OPS/.admin"
  rm -f "$OPS/.admin_token"
  echo "wrote $OPS/.admin (the token is minted on first use)"
else
  missing+=("NETAI_ADMIN_EMAIL/NETAI_ADMIN_PASSWORD")
fi
write .ro_key "${NETAI_RO_KEY:-}" NETAI_RO_KEY
write .railway_token "${NETAI_RAILWAY_TOKEN:-}" NETAI_RAILWAY_TOKEN

if [ "${#missing[@]}" -gt 0 ]; then
  echo "missing: ${missing[*]} — add them in the environment's settings and start a new session" >&2
  exit 1
fi
echo "ok — ops access ready"
