#!/bin/bash
# Apply ONE pre-approved prompt edit. The three text routes and nothing else.
#
# WHY IT EXISTS. Three texts sat approved and unshipped for a day because
# nobody who had read them could paste them: every PUT from the tester's seat
# is refused structurally, and mine reached the box, the database read-only and
# the Railway variables — never the prompt. So an approved 49-character cut and
# an approved base-prompt narrowing queued behind one human hand, and the base
# prompt is 25,176 characters, which is not a thing to hand-copy.
#
# WHAT IT DELIBERATELY IS NOT. It is not "the assistant can edit the prompts".
# It applies a CHANGE FILE that is already in git — target, the exact before,
# the exact after, who approved it and when — and it refuses everything else.
# The route being open is not an approval of what goes down it.
#
# THE FOUR REFUSALS, which are the whole point:
#
#   1. THE LIVE TEXT MUST BE WHAT WAS APPROVED AGAINST. The change file carries
#      the sha256 of the text it was reviewed against; if production no longer
#      matches, somebody edited it in between and this stops. An approval is
#      for a diff, not for a file name.
#   2. PREREQUISITES MUST ALREADY BE LIVE. A change may name others that have
#      to be in first, and each is verified by its own after-hash being live —
#      not by a note saying it was done. Ticket 20's coupling is the case this
#      was written for: the 49-character cut has to land before or with the
#      goal-box change, and a hand that does it the other way round converts
#      six passes into six failures. In code, not in a head.
#   3. THE CHANGE FILE MUST BE COMMITTED AND UNMODIFIED. A dirty or untracked
#      change file is text nobody reviewed.
#   4. IT MUST ACTUALLY CHANGE SOMETHING. An after equal to the before is
#      either a mistake or an already-applied change, and both deserve a stop
#      rather than a silent no-op write.
#
# It prints lengths and hashes and never the text. --check runs every refusal
# and writes nothing, which is the right thing to run first, every time.
#
# usage:  ./scripts/ops/prompt.sh check <change-id>
#         ./scripts/ops/prompt.sh apply <change-id>
#         ./scripts/ops/prompt.sh live  <target>      (length + hash only)
#
# change files: ops/prompt-changes/<id>.json  +  <id>.after.txt
set -euo pipefail

OPS="${NETAI_OPS_DIR:-$HOME/.netai-ops}"
API="${NETAI_API:-https://api.netai.guru}"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CHANGES="$REPO/ops/prompt-changes"

die() { echo "prompt.sh: $*" >&2; exit 1; }
[ -d "$OPS" ] || die "no secrets directory at $OPS"

login() {
  [ -f "$OPS/.admin" ] || die "cannot log in: $OPS/.admin is missing"
  curl -sS -X POST -H 'Content-Type: application/json' \
    -d "$(python3 -c '
import json, sys
email, password = [l.strip() for l in open(sys.argv[1])][:2]
print(json.dumps({"email": email, "password": password}))' "$OPS/.admin")" \
    "$API/auth/admin/login" |
    python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["token"])' \
    > "$OPS/.admin_token"
  chmod 600 "$OPS/.admin_token"
}

token() { [ -f "$OPS/.admin_token" ] || login; cat "$OPS/.admin_token"; }

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
  [ "$code" -lt 400 ] || die "HTTP $code from the API"
}

# The live text of one target, on stdout. Targets are fixed here and nowhere
# else: this script can reach these three and no other route.
fetch_live() {
  local target="$1"
  case "$target" in
    prompt)
      call "$API/admin/system-prompt" |
        python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["system_prompt"], end="")'
      ;;
    info:*)
      call "$API/admin/netai-info" |
        TOPIC="${target#info:}" python3 -c '
import sys, json, os
rows = json.load(sys.stdin)["data"]
topic = os.environ["TOPIC"]
row = next((r for r in rows if r.get("topic") == topic), None)
if row is None:
    raise SystemExit("prompt.sh: no netai_info topic " + topic)
print(row["content"], end="")'
      ;;
    block:*)
      call "$API/admin/prompt-blocks" |
        NAME="${target#block:}" python3 -c '
import sys, json, os
data = json.load(sys.stdin)["data"]
rows = data["blocks"] if isinstance(data, dict) and "blocks" in data else data
name = os.environ["NAME"]
row = next((r for r in rows if r.get("name") == name), None)
if row is None:
    raise SystemExit("prompt.sh: no prompt block " + name)
print(row["content"], end="")'
      ;;
    *) die "unknown target '$target' (use prompt | info:<topic> | block:<name>)" ;;
  esac
}

sha() { python3 -c 'import hashlib,sys;print(hashlib.sha256(sys.stdin.buffer.read()).hexdigest())'; }

# „15,225 chars / 17,099 bytes". Both, always: every confirmation in the box is
# in CHARACTERS, and a Georgian letter costs three bytes — so printing bytes
# alone would have two people reading the same unchanged block as two different
# numbers, which is the kind of thing that gets called a regression.
size() { python3 -c '
import sys
raw = sys.stdin.buffer.read()
print(f"{len(raw.decode()):,} chars / {len(raw):,} bytes")'; }

# Every refusal, in order, writing nothing. Prints what it found either way.
# Returns 0 when the change is safe to apply.
check_change() {
  local id="$1" spec="$CHANGES/$1.json" after="$CHANGES/$1.after.txt"
  [ -f "$spec" ]  || die "no change file at ops/prompt-changes/$id.json"
  [ -f "$after" ] || die "no after text at ops/prompt-changes/$id.after.txt"

  # (3) committed and unmodified — a dirty change file is unreviewed text.
  if ! git -C "$REPO" diff --quiet --exit-code -- "$spec" "$after" 2>/dev/null; then
    die "$id: the change file has uncommitted edits — commit them so they can be read"
  fi
  if ! git -C "$REPO" ls-files --error-unmatch "$spec" "$after" >/dev/null 2>&1; then
    die "$id: the change file is not tracked by git — nobody can review it"
  fi

  local target before_sha requires
  target="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["target"])' "$spec")"
  before_sha="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["before_sha256"])' "$spec")"
  requires="$(python3 -c '
import json, sys
print(" ".join(json.load(open(sys.argv[1])).get("requires", [])))' "$spec")"

  # (2) prerequisites live, verified by their own after-hash rather than a note.
  for req in $requires; do
    local req_spec="$CHANGES/$req.json" req_after="$CHANGES/$req.after.txt"
    [ -f "$req_spec" ] && [ -f "$req_after" ] || die "$id requires '$req', which has no change file"
    local req_target req_live_sha req_want_sha
    req_target="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["target"])' "$req_spec")"
    req_live_sha="$(fetch_live "$req_target" | sha)"
    req_want_sha="$(sha < "$req_after")"
    if [ "$req_live_sha" != "$req_want_sha" ]; then
      die "$id REFUSED: it requires '$req' to be live first, and it is not.
     This ordering is a safety property, not a preference — see the change file."
    fi
    echo "  requires $req  LIVE" >&2
  done

  local live live_sha live_size after_sha after_size
  live="$(fetch_live "$target")"
  live_sha="$(printf '%s' "$live" | sha)"
  live_size="$(printf '%s' "$live" | size)"
  after_sha="$(sha < "$after")"
  after_size="$(size < "$after")"

  {
    echo "  target    $target"
    echo "  live      $live_size  ${live_sha:0:12}"
    echo "  after     $after_size  ${after_sha:0:12}"
    echo "  approved  ${before_sha:0:12}"
  } >&2

  # (1) the live text must be the text the approval was given against.
  if [ "$live_sha" != "$before_sha" ]; then
    if [ "$live_sha" = "$after_sha" ]; then
      die "$id: ALREADY APPLIED — the live text is already the after text."
    fi
    die "$id REFUSED: the live text is not what this change was approved against.
     Somebody edited it after the approval. Re-read it, re-approve the diff,
     and update before_sha256 — an approval is for a diff, not a file name."
  fi
  # (4) it must change something.
  [ "$after_sha" != "$before_sha" ] || die "$id: the after text is identical to the before"

  echo "  OK — every refusal passed" >&2
  printf '%s' "$target"
}

case "${1:-}" in
  live)
    t="${2:-}"; [ -n "$t" ] || die "usage: prompt.sh live <target>"
    live="$(fetch_live "$t")"
    echo "$t  $(printf '%s' "$live" | size)  $(printf '%s' "$live" | sha)"
    ;;
  check)
    id="${2:-}"; [ -n "$id" ] || die "usage: prompt.sh check <change-id>"
    echo "check $id"
    check_change "$id" > /dev/null
    echo "check $id: would apply"
    ;;
  apply)
    id="${2:-}"; [ -n "$id" ] || die "usage: prompt.sh apply <change-id>"
    echo "apply $id"
    target="$(check_change "$id" | tail -1)"
    after="$CHANGES/$id.after.txt"
    case "$target" in
      prompt)
        body="$(python3 -c 'import json,sys;print(json.dumps({"system_prompt":open(sys.argv[1]).read()}))' "$after")"
        call -X PUT -H 'Content-Type: application/json' --data-binary "$body" \
          "$API/admin/system-prompt" > /dev/null
        ;;
      info:*)
        body="$(python3 -c 'import json,sys;print(json.dumps({"content":open(sys.argv[1]).read()}))' "$after")"
        call -X PUT -H 'Content-Type: application/json' --data-binary "$body" \
          "$API/admin/netai-info/${target#info:}" > /dev/null
        ;;
      block:*)
        body="$(python3 -c 'import json,sys;print(json.dumps({"content":open(sys.argv[1]).read()}))' "$after")"
        call -X PUT -H 'Content-Type: application/json' --data-binary "$body" \
          "$API/admin/prompt-blocks/${target#block:}" > /dev/null
        ;;
    esac
    # Read it back. "The PUT returned 200" and "the live text is now the after
    # text" are different facts, and this week has been a lesson in which one
    # is worth reporting.
    now_sha="$(fetch_live "$target" | sha)"
    want_sha="$(sha < "$after")"
    [ "$now_sha" = "$want_sha" ] ||
      die "$id: the PUT returned OK and the live text does NOT match. Nothing further will run."
    echo "apply $id: LIVE and read back  ${now_sha:0:12}"
    ;;
  *)
    die "usage: prompt.sh check <id> | apply <id> | live <target>"
    ;;
esac
