#!/bin/bash
# Set or remove ONE Railway environment variable. Write-only, by construction.
#
# Its own capability, separate from logs.sh, because logs.sh says in its own
# header that it never sends a mutation and that changing a variable stays a
# separate act. This is that separate act, and it is deliberately the smallest
# possible one:
#
#   - it WRITES and it cannot LIST. Railway's variables query returns every
#     variable at once, so reading one to answer a question would pull
#     DATABASE_URL, the JWT secret and the Stripe key into whatever session
#     asked. Nothing here can do that.
#   - the VALUE arrives on stdin, never in argv, so it does not reach the
#     process list, the shell history, or this script's own error output.
#   - it prints the variable NAME and never the value, on success or failure.
#
# Setting a variable triggers a Railway redeploy. That is the point of using
# it, but it means this is not a quiet operation: the service restarts.
#
# REMOVING ONE DOES NOT. Measured 19 September: `unset` returned clean, no new
# deployment appeared in three minutes, and the running container kept the old
# environment — so the variable was gone from the console and still in force in
# the process. Whoever unsets something must then cause a restart themselves
# (any push to main will do it) and confirm the new deployment is SUCCESS
# before believing the change is live. `unset` says so on its own last line.
#
# WHY `unset` EXISTS, added 19 September. `set` refuses an empty value on
# purpose — an empty string arriving from an unquoted expansion is a mistake,
# not an instruction, and blanking a variable by accident is how a service
# loses its database URL. But some flags are turned OFF by having no value:
# CHAT_FINAL_ANSWER_MODEL is read as `?.trim() ?? ''` and an empty string means
# „behave as before this feature existed". Without `unset` the only way to
# reach that state through this script was to set the variable to a single
# space and rely on the trim — which works, and which leaves a variable in the
# Railway console that LOOKS set to the next person who reads it. Removing it
# says what happened. `set` keeps its refusal; turning a flag off is a
# different act with a different word for it.
#
# usage:  printf %s "$SECRET" | ./scripts/ops/env.sh set VAR_NAME
#         ./scripts/ops/env.sh unset VAR_NAME
set -euo pipefail
OPS="${NETAI_OPS_DIR:-$HOME/.netai-ops}"
[ -f "$OPS/.railway_token" ] || { echo "env.sh: no $OPS/.railway_token" >&2; exit 1; }
TOKEN="$(cat "$OPS/.railway_token")"
PROJECT="${RAILWAY_PROJECT_ID:-07eb81d0-493f-444a-9ca4-6dd074552cf4}"
ENVIRONMENT="${RAILWAY_ENVIRONMENT_ID:-21ce6a81-4358-4546-918f-677e56f3f960}"
SERVICE="${RAILWAY_SERVICE_ID:-915022db-fcf9-43a5-91f3-135b48f89981}"
GQL=https://backboard.railway.com/graphql/v2

die() { echo "env.sh: $*" >&2; exit 1; }

# A name is an identifier; refusing anything else keeps a stray shell expansion
# from becoming a mutation against a variable nobody meant.
check_name() {
  [ -n "$1" ] || die "no variable name given"
  [[ "$1" =~ ^[A-Z_][A-Z0-9_]*$ ]] || die "name must be UPPER_SNAKE_CASE, got '$1'"
}

# POST one mutation and report by NAME only. The request body may carry the
# value, so it is never printed — on success or on failure.
send() {
  local body="$1" what="$2" name="$3" out
  out="$(curl -sS -X POST "$GQL" -H "Project-Access-Token: $TOKEN" \
           -H 'Content-Type: application/json' --data-binary "$body")"
  if printf %s "$out" | grep -q '"errors"'; then
    echo "env.sh: FAILED to $what $name" >&2
    printf %s "$out" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("errors"), file=sys.stderr)'
    exit 1
  fi
}

case "${1:-}" in
  set)
    NAME="${2:-}"
    check_name "$NAME"
    VALUE="$(cat)"
    # Deliberate, and `unset` is the way past it — see the header.
    [ -n "$VALUE" ] || die "empty value on stdin for $NAME — refusing (use: env.sh unset $NAME)"

    BODY="$(NAME="$NAME" VALUE="$VALUE" P="$PROJECT" E="$ENVIRONMENT" S="$SERVICE" python3 <<'PY'
import json, os
print(json.dumps({
    "query": "mutation ($i: VariableUpsertInput!) { variableUpsert(input: $i) }",
    "variables": {"i": {
        "projectId": os.environ["P"],
        "environmentId": os.environ["E"],
        "serviceId": os.environ["S"],
        "name": os.environ["NAME"],
        "value": os.environ["VALUE"],
    }},
}))
PY
)"
    send "$BODY" set "$NAME"
    echo "env.sh: set $NAME (value not shown) — Railway will redeploy"
    ;;
  unset)
    NAME="${2:-}"
    check_name "$NAME"
    # Nothing is read back first: this script cannot list, and adding a read to
    # confirm what is about to be removed would be the one thing it must not be
    # able to do. Whoever runs it writes the old value down beforehand — that
    # is the undo, and it lives in ADMIN_WRITE_OPERATIONS.md, not here.
    BODY="$(NAME="$NAME" P="$PROJECT" E="$ENVIRONMENT" S="$SERVICE" python3 <<'PY'
import json, os
print(json.dumps({
    "query": "mutation ($i: VariableDeleteInput!) { variableDelete(input: $i) }",
    "variables": {"i": {
        "projectId": os.environ["P"],
        "environmentId": os.environ["E"],
        "serviceId": os.environ["S"],
        "name": os.environ["NAME"],
    }},
}))
PY
)"
    send "$BODY" unset "$NAME"
    echo "env.sh: unset $NAME — Railway does NOT redeploy on a removal."
    echo "env.sh: the running container keeps the old value until it restarts."
    ;;
  *)
    die "usage: printf %s \"\$VALUE\" | env.sh set <NAME>   |   env.sh unset <NAME>"
    ;;
esac
