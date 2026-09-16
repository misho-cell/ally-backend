#!/bin/bash
# Set ONE Railway environment variable. Write-only, by construction.
#
# Its own capability, separate from logs.sh, because logs.sh says in its own
# header that it never sends a mutation and that changing a variable stays a
# separate act. This is that separate act, and it is deliberately the smallest
# possible one:
#
#   - it SETS and it cannot LIST. Railway's variables query returns every
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
# usage:  printf %s "$SECRET" | ./scripts/ops/env.sh set VAR_NAME
set -euo pipefail
OPS="${NETAI_OPS_DIR:-$HOME/.netai-ops}"
[ -f "$OPS/.railway_token" ] || { echo "env.sh: no $OPS/.railway_token" >&2; exit 1; }
TOKEN="$(cat "$OPS/.railway_token")"
PROJECT="${RAILWAY_PROJECT_ID:-07eb81d0-493f-444a-9ca4-6dd074552cf4}"
ENVIRONMENT="${RAILWAY_ENVIRONMENT_ID:-21ce6a81-4358-4546-918f-677e56f3f960}"
SERVICE="${RAILWAY_SERVICE_ID:-915022db-fcf9-43a5-91f3-135b48f89981}"
GQL=https://backboard.railway.com/graphql/v2

die() { echo "env.sh: $*" >&2; exit 1; }

case "${1:-}" in
  set)
    NAME="${2:-}"
    [ -n "$NAME" ] || die "usage: printf %s \"\$VALUE\" | env.sh set <NAME>"
    # A name is an identifier; refusing anything else keeps a stray shell
    # expansion from becoming a mutation against a variable nobody meant.
    [[ "$NAME" =~ ^[A-Z_][A-Z0-9_]*$ ]] || die "name must be UPPER_SNAKE_CASE, got '$NAME'"
    VALUE="$(cat)"
    [ -n "$VALUE" ] || die "empty value on stdin for $NAME — refusing"

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
    OUT="$(curl -sS -X POST "$GQL" -H "Project-Access-Token: $TOKEN" \
             -H 'Content-Type: application/json' --data-binary "$BODY")"
    # The response is echoed only after being checked for an error, and the
    # request body — which holds the value — is never printed.
    if printf %s "$OUT" | grep -q '"errors"'; then
      echo "env.sh: FAILED to set $NAME" >&2
      printf %s "$OUT" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("errors"), file=sys.stderr)'
      exit 1
    fi
    echo "env.sh: set $NAME (value not shown) — Railway will redeploy"
    ;;
  *)
    die "usage: printf %s \"\$VALUE\" | env.sh set <NAME>"
    ;;
esac
