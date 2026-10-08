#!/bin/bash
# ship_one.sh <commit> — one change to production, alone (D710).
#
# Cherry-picks ONE commit onto origin/main in a scratch branch, runs the full
# verify, then pushes only at a moment when no conversation is working (so a
# tester's or a person's run is never cut by the restart), waits for the
# deploy, and runs the outage check. Exit codes:
#   0 deployed · 2 cherry-pick or fetch failed · 3 verify failed
#   4 push failed or never found a quiet moment · 5 deploy failed · 6 deploy not seen
# Run from the repository root. Reads production only through scripts/ops/ro.sh.
set -uo pipefail
[ $# -eq 1 ] || { echo "usage: ship_one.sh <commit>"; exit 2; }
LOG="${TMPDIR:-/tmp}/ship_one_verify.log"
QUIET_TRIES=90      # × 20 s = 30 minutes of looking for a quiet moment
DEPLOY_TRIES=40     # × 20 s = 13 minutes for the deploy to show

git fetch -q origin main || exit 2
git checkout -q -B ship-one origin/main || exit 2
git cherry-pick "$1" >/dev/null 2>&1 || { echo "CHERRY-PICK FAILED $1"; git cherry-pick --abort; exit 2; }
npm run verify > "$LOG" 2>&1 || { echo "VERIFY FAILED"; grep -E "^Tests:|✕" "$LOG" | head; exit 3; }
grep -E "^Tests:" "$LOG"

working() {
  echo "SELECT count(*) AS n FROM threads WHERE status='working';" | scripts/ops/ro.sh |
    python3 -c 'import json,sys;print(json.load(sys.stdin)["data"]["rows"][0]["n"])'
}
pushed=no
for _ in $(seq 1 $QUIET_TRIES); do
  if [ "$(working)" = "0" ]; then
    git push origin HEAD:main || { echo "PUSH FAILED"; exit 4; }
    echo "pushed at $(date -u +%H:%M:%S)"; pushed=yes; break
  fi
  sleep 20
done
[ "$pushed" = yes ] || { echo "NO QUIET MOMENT IN 30 MINUTES — not pushed"; exit 4; }

head=$(git rev-parse --short=7 HEAD)  # the deploy list shows 7 characters
for _ in $(seq 1 $DEPLOY_TRIES); do
  line=$(./scripts/ops/logs.sh deployments 1 2>&1 | sed -n 2p)
  if echo "$line" | grep -q "$head"; then
    if echo "$line" | grep -q SUCCESS; then
      echo "DEPLOYED $head"; ./scripts/ops/outage.sh 20 >/dev/null 2>&1; echo "outage=$?"; exit 0
    fi
    if echo "$line" | grep -qE 'FAILED|CRASHED'; then echo "DEPLOY FAILED $head"; exit 5; fi
  fi
  sleep 20
done
echo "DEPLOY NOT SEEN $head"; exit 6
