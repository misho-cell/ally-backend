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
# ROWS ARE NOT EVENTS, and the first thing this file measured proved it.
# `curiosity_surfacing_log` looked like a collapse — 108 · 86 · 8 · 14 — and it
# is not one. Split by write burst (one user, one second):
#
#   week      bursts  rows  singletons  multi  biggest
#   24 Aug         7   108           3      4       50
#   31 Aug        12    86           6      6       15
#   07 Sep         6     8           5      1        3
#   14 Sep        14    14          14      0        1
#
# The number of surfacing EVENTS went UP. What vanished is the multi-item
# burst — the `get_curiosity_queue` TOOL, which asks for many at once and has
# been called zero times in five days. The per-conversation path, which asks
# for exactly one, is working and firing more often than ever.
#
# So the count in the ROWS column would have had me chasing a broken feature
# that is not broken. Both numbers are printed for that reason: a burst is an
# action, a row is whatever that action happened to write.
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

# table:timestamp:owner. The owner column is what makes a BURST — one person,
# one second — so it differs per table and is spelled out rather than guessed.
# Only things that should recur on their own; a campaign table is deliberately
# absent, because a campaign ending at zero is a campaign ending.
TABLES=(
  "introduction_requests:created_at:requester_user_id"
  "task_asks:created_at:from_user_id"
  "curiosity_surfacing_log:surfaced_at:user_id"
  "debrief_arms:armed_at:user_id"
  "outcome_events:created_at:user_id"
  "warmth_events:created_at:user_id"
  "pending_updates:created_at:user_id"
  "contact_facts:created_at:submitted_by_user_id"
  "invites:created_at:user_id"
  "answer_rules:created_at:user_id"
  "thanks_loop_offers:offered_at:inviter_user_id"
  "research_findings:found_at:step_id"
)

for entry in "${TABLES[@]}"; do
  IFS=':' read -r table column owner <<< "$entry"
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
    written = int(r["rows_written"])
    # rows only when it differs — one action that wrote fifty rows is one action
    extra = "" if written == n else "  (%d rows)" % written
    print("   %s  %6d%s  %s" % (week, n, extra, bar))
'
WITH bursts AS (
  SELECT date_trunc('week', $column) AS week,
         $owner AS who, date_trunc('second', $column) AS at, COUNT(*) AS items
  FROM $table
  WHERE $column > NOW() - INTERVAL '$WEEKS weeks'
  GROUP BY 1, 2, 3
)
SELECT week, COUNT(*) AS n, SUM(items) AS rows_written
FROM bursts GROUP BY 1 ORDER BY 1
SQL
done

printf '\nThe number counts ACTIONS (one user, one second). "(n rows)" appears when\n'
printf 'one action wrote several — a burst is the event, a row is its output.\n'
printf 'A STEADY rate going to zero is a regression. A spiky one dropping is weather.\n'
