#!/bin/bash
# The tester's handoff box: read, post, mark read.
#
# A named capability rather than a raw curl, so a permission rule can be
# attached to THIS and not to "any HTTP request the assistant likes". What it
# can reach is fixed here and visible in git.
#
# Secrets live outside the repo, in $NETAI_OPS_DIR (default ~/.netai-ops):
#   .admin        two lines: admin email, admin password
#   .admin_token  a bearer token; re-minted from .admin when it expires
set -euo pipefail

OPS="${NETAI_OPS_DIR:-$HOME/.netai-ops}"
API="${NETAI_API:-https://api.netai.guru}"
ME="${NETAI_BOX_AUTHOR:-claude_backend}"

die() { echo "box.sh: $*" >&2; exit 1; }
[ -d "$OPS" ] || die "no secrets directory at $OPS"

login() {
  [ -f "$OPS/.admin" ] || die "cannot log in: $OPS/.admin is missing"
  local email pass
  email="$(head -1 "$OPS/.admin")"
  pass="$(sed -n 2p "$OPS/.admin")"
  curl -sS -X POST -H 'Content-Type: application/json' \
    -d "{\"email\":\"$email\",\"password\":\"$pass\"}" \
    "$API/auth/admin/login" |
    python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["token"])' \
    > "$OPS/.admin_token"
  chmod 600 "$OPS/.admin_token"
}

token() { [ -f "$OPS/.admin_token" ] || login; cat "$OPS/.admin_token"; }

# One retry on 401: the token lasts eight hours and a long session outlives it.
call() {
  local out code
  out="$(curl -sS -w '\n%{http_code}' -H "Authorization: Bearer $(token)" "$@")"
  code="$(tail -1 <<< "$out")"
  if [ "$code" = "401" ]; then
    login
    out="$(curl -sS -w '\n%{http_code}' -H "Authorization: Bearer $(token)" "$@")"
    code="$(tail -1 <<< "$out")"
  fi
  sed '$d' <<< "$out"
  [ "$code" -lt 400 ] || die "HTTP $code"
}

case "${1:-read}" in
  read)
    # Everything since an id, or the tail. Prints unread/latest first.
    since="${2:-}"
    url="$API/admin/handoff?reader=$ME&limit=${3:-20}"
    [ -n "$since" ] && url="$url&since_id=$since"
    call "$url"
    ;;
  post)
    # post <file.json> — the file holds {"author":..., "body":...}
    [ -f "${2:-}" ] || die "usage: box.sh post <file.json>"
    call -X POST -H 'Content-Type: application/json' --data-binary "@$2" "$API/admin/handoff"
    ;;
  mark)
    [ -n "${2:-}" ] || die "usage: box.sh mark <last_seen_id>"
    call -X POST -H 'Content-Type: application/json' \
      -d "{\"reader\":\"$ME\",\"last_seen_id\":$2}" "$API/admin/handoff/read"
    ;;
  *) die "unknown command: $1 (read|post|mark)" ;;
esac
