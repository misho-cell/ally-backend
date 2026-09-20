#!/bin/bash
# Weekly row counts for the features that are supposed to keep happening.
#
# WHY THIS EXISTS. On 20 September the tester found that introductions had
# stopped being created. `introduction_requests`, by week:
#
#   15 Jun 6 · 22 Jun 2 · 29 Jun 7 · 06 Jul 4 · 13 Jul 4 · 20 Jul 4
#   10 Aug 1 · 17 Aug 4 · 24 Aug 7 · 31 Aug 3 · 07 Sep 0 · 14 Sep 1
#
# Three to seven a week for three months, then nothing — for TWO WEEKS, while
# I shipped a migration into that path and called it done. Nothing in this
# product said so. A tester had to sign in as a mediator and notice that a
# button was missing.
#
# That is the failure this file is about. The routing fix is in the code; this
# is the thing that would have caught it in a day.
#
# HOW TO READ IT, and this matters more than the numbers. A STEADY rate going
# to zero is a regression. A SPIKY one dropping is weather. Running this sweep
# for the first time produced three false alarms in one pass:
#
#   question_bank         43 rows, all in one week      a seed, not a rate
#   identity_candidates   56 then 2,260, then nothing   a bulk scan
#   contact_facts         754·5·38·1·7·55·106·376·54    backfills, swings 100x
#
# None of those is a feature that stopped. The heuristic „last week against a
# four-week average" cannot tell a feature from a batch, so it is not applied
# here — the weekly series is printed and a person reads the shape.
#
# Usage:  ./scripts/ops/rates.sh [weeks]      (default 12)
set -euo pipefail

WEEKS="${1:-12}"
HERE="$(cd "$(dirname "$0")" && pwd)"

# table:timestamp column. Only things that should recur on their own — a
# campaign table is deliberately absent, because a campaign ending at zero is
# a campaign ending.
TABLES=(
  "introduction_requests:created_at"
  "task_asks:created_at"
  "curiosity_surfacing_log:surfaced_at"
  "debrief_arms:armed_at"
  "outcome_events:created_at"
  "warmth_events:created_at"
  "pending_updates:created_at"
  "contact_facts:created_at"
  "invites:created_at"
  "answer_rules:created_at"
  "thanks_loop_offers:offered_at"
  "research_findings:found_at"
)

for entry in "${TABLES[@]}"; do
  table="${entry%%:*}"
  column="${entry##*:}"
  printf '\n== %s (%s)\n' "$table" "$column"
  "$HERE/ro.sh" <<SQL | python3 -c '
import sys, json
d = json.load(sys.stdin)
if not d.get("success"):
    print("   could not read:", d.get("error", "")[:120]); raise SystemExit
rows = d["data"]["rows"]
if not rows:
    print("   no rows in the window"); raise SystemExit
counts = [int(r["n"]) for r in rows]
width = max(counts) or 1
for r, n in zip(rows, counts):
    bar = "#" * max(1, round(n * 40 / width)) if n else ""
    week = r["week"][:10]
    print("   %s  %6d  %s" % (week, n, bar))
'
SELECT date_trunc('week', $column) AS week, COUNT(*) AS n
FROM $table
WHERE $column > NOW() - INTERVAL '$WEEKS weeks'
GROUP BY 1 ORDER BY 1
SQL
done

printf '\nA STEADY rate going to zero is a regression. A spiky one dropping is weather.\n'
