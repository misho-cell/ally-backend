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
  sync)
    # Read everything UNREAD, print it, and only then mark it. One command,
    # because the two-command version is how a message gets lost.
    #
    # 16 September: `box.sh post` and `box.sh mark 1290` went out on the same
    # shell line. 1290 was the tester's row 114 result — the clearance I was
    # waiting for — and it was marked read without ever being displayed. I then
    # held a finished change for thirty minutes waiting for permission I already
    # had, and only found out because they mentioned it in the next message.
    #
    # `mark` stays for the case where something was genuinely read another way.
    # `sync` is the one to reach for.
    head="$(call "$API/admin/handoff?reader=$ME&limit=1")"
    read -r unread seen latest <<< "$(python3 -c 'import sys,json;d=json.load(sys.stdin)["data"];print(d["unread"], d["last_seen_id"], d["latest_id"])' <<< "$head")"
    if [ "$unread" = "0" ]; then
      echo "box.sh: nothing unread (latest $latest)" >&2
      exit 0
    fi
    # Only what has not been seen — never the whole box.
    call "$API/admin/handoff?reader=$ME&since_id=$seen&limit=${2:-50}"
    call -X POST -H 'Content-Type: application/json' \
      -d "{\"reader\":\"$ME\",\"last_seen_id\":$latest}" "$API/admin/handoff/read" >/dev/null
    echo "box.sh: marked read to $latest ($unread unread)" >&2
    ;;
  *) die "unknown command: $1 (read|post|mark|sync)" ;;
esac
