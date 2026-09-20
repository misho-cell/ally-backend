#!/bin/bash
# Railway deployment logs and the deployment list. READ ONLY — this script
# sends queries, never mutations, and that is the whole reason it exists as its
# own capability: changing an environment variable stays a separate, prompted
# act.
set -euo pipefail
OPS="${NETAI_OPS_DIR:-$HOME/.netai-ops}"
[ -f "$OPS/.railway_token" ] || { echo "logs.sh: no $OPS/.railway_token" >&2; exit 1; }
TOKEN="$(cat "$OPS/.railway_token")"
PROJECT="${RAILWAY_PROJECT_ID:-07eb81d0-493f-444a-9ca4-6dd074552cf4}"
ENVIRONMENT="${RAILWAY_ENVIRONMENT_ID:-21ce6a81-4358-4546-918f-677e56f3f960}"
SERVICE="${RAILWAY_SERVICE_ID:-915022db-fcf9-43a5-91f3-135b48f89981}"
GQL=https://backboard.railway.com/graphql/v2

ask() { curl -sS -X POST "$GQL" -H "Project-Access-Token: $TOKEN" \
          -H 'Content-Type: application/json' -d "$1"; }

case "${1:-deployments}" in
  deployments)
    # SUMMARISED, and that is not cosmetic. `meta` carries the whole commit
    # message and the entire Nixpacks manifest for EVERY deployment, so asking
    # for five of them returns tens of thousands of characters of build
    # configuration to answer „which build is live". Read once on 20 September
    # at the cost of most of a context window. What anybody actually wants is
    # four columns. `raw` prints the original when the manifest is the question.
    ask "$(python3 - "$PROJECT" "$ENVIRONMENT" "$SERVICE" "${2:-5}" <<'PY'
import json,sys
p,e,s,n=sys.argv[1:5]
print(json.dumps({"query":"query { deployments(first: %s, input: { projectId: \"%s\", environmentId: \"%s\", serviceId: \"%s\" }) { edges { node { id status createdAt meta } } } }" % (n,p,e,s)}))
PY
)" | { [ "${3:-}" = raw ] && cat || python3 -c '
import sys, json
d = json.load(sys.stdin)
edges = d.get("data", {}).get("deployments", {}).get("edges")
if edges is None:
    print(json.dumps(d)[:400]); raise SystemExit(1)
print("%-38s %-9s %-21s %-9s %s" % ("deployment id", "status", "created", "commit", "subject"))
for e in edges:
    n = e["node"]
    meta = n.get("meta") or {}
    subject = (meta.get("commitMessage") or "").split("\n")[0][:58]
    print("%-38s %-9s %-21s %-9s %s" % (
        n["id"], n["status"], n["createdAt"][:19],
        (meta.get("commitHash") or "")[:7], subject))
'; } ;;
  logs)
    # logs <deploymentId> [limit] [filter] [startDate] [endDate]
    # The filter and the dates are Railway's own log-query arguments; without
    # them a busy hour does not fit in one page and the line you need is the
    # one that fell off the end.
    [ -n "${2:-}" ] || { echo "usage: logs.sh logs <deploymentId> [limit] [filter] [start] [end]" >&2; exit 1; }
    ask "$(python3 - "$2" "${3:-500}" "${4:-}" "${5:-}" "${6:-}" <<'PY'
import json,sys
d,n,f,start,end = sys.argv[1:6]
args = ['deploymentId: $d', 'limit: $n']
decl = ['$d: String!', '$n: Int']
vars = {'d': d, 'n': int(n)}
for name, value, gql_type in (
    ('filter', f, 'String'),
    ('startDate', start, 'DateTime'),
    ('endDate', end, 'DateTime'),
):
    if value:
        args.append('%s: $%s' % (name, name))
        decl.append('$%s: %s' % (name, gql_type))
        vars[name] = value
q = 'query(%s) { deploymentLogs(%s) { message timestamp } }' % (', '.join(decl), ', '.join(args))
print(json.dumps({'query': q, 'variables': vars}))
PY
)" ;;
  service)
    # How many instances actually run. A read, and it decides something real:
    # whether a boot-time sweep may assume the process that just died was the
    # only one that could have owned a running job.
    ask "{\"query\": \"query { service(id: \\\"$SERVICE\\\") { name serviceInstances { edges { node { numReplicas region } } } } }\"}" ;;
  *) echo "logs.sh: unknown command $1 (deployments|logs|service)" >&2; exit 1 ;;
esac
