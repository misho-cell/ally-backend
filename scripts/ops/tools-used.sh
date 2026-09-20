#!/bin/bash
# Which of the tools we offer on every run are actually being called.
#
# WHY. Introductions stopped happening in the first week of September and
# nobody noticed for two weeks. The EARLIEST signal was not the empty table —
# it was `request_introduction` going quiet, and `respond_to_introduction`
# never firing at all. A tool that used to be chosen and is not any more is a
# feature dying, and it shows here before it shows anywhere else.
#
# The list is READ OUT OF THE SOURCE, not copied, so it cannot drift: every
# constant in ALWAYS_ON_TOOLS, resolved to the tool name the model actually
# sees. If that block is renamed this script says so instead of quietly
# reporting on a shorter list.
#
# HOW TO READ THE „NEVER" COLUMN, because most of it is correct. Twenty-nine of
# sixty-four had never fired the first time this ran, and the great majority
# SHOULD be zero — mark_contact_deceased, block_contact, stop_contacting_me.
# Zero is the right answer for those and a product where they fire often is a
# worse product.
#
# What to look for instead is an ASYMMETRY. On the first run:
#
#   get_user_notes    31 calls in 5 days
#   save_user_note     0 calls ever — the table holds 13 rows in its whole life
#
# Read at the start of every conversation, written thirteen times. That is the
# shape worth chasing; „block_contact: 0" is not.
#
# Usage:  ./scripts/ops/tools-used.sh [days]     (default: the whole log)
set -euo pipefail

DAYS="${1:-}"
HERE="$(cd "$(dirname "$0")" && pwd)"
SRC="$HERE/../../src/services/chat.service.ts"

[ -f "$SRC" ] || { echo "tools-used.sh: cannot find $SRC" >&2; exit 1; }

TOOLS="$(python3 - "$SRC" <<'PY'
import re, sys
src = open(sys.argv[1]).read()
marker = 'const ALWAYS_ON_TOOLS'
if marker not in src:
    sys.exit('tools-used.sh: ALWAYS_ON_TOOLS is gone from chat.service.ts — '
             'this script is reporting on nothing until it is pointed at the new list')
block = src[src.index(marker):]
block = block[: block.index('];')]
names, unresolved = [], []
for const in re.findall(r'^\s*([A-Z0-9_]+),\s*$', block, re.M):
    m = re.search(re.escape('const ' + const) + r'[^=]*=\s*\{\s*\n\s*name:\s*[\'"]([a-z_0-9]+)[\'"]', src)
    (names if m else unresolved).append(m.group(1) if m else const)
if unresolved:
    print('# could not resolve a name for: ' + ', '.join(unresolved), file=sys.stderr)
print(','.join(names))
PY
)"

WINDOW=""
[ -n "$DAYS" ] && WINDOW="AND created_at > NOW() - INTERVAL '$DAYS days'"

IN_LIST="$(python3 -c "print(','.join(\"'\"+t+\"'\" for t in '$TOOLS'.split(',')))")"

"$HERE/ro.sh" <<SQL | TOOLS="$TOOLS" python3 -c '
import sys, json, os
wanted = os.environ["TOOLS"].split(",")
d = json.load(sys.stdin)
if not d.get("success"):
    print("could not read:", d.get("error", "")[:160]); raise SystemExit(1)
seen = {r["tool"]: (int(r["calls"]), r["last"][:16]) for r in d["data"]["rows"]}
never = [t for t in wanted if t not in seen]
print("%d tools offered on every run · %d called · %d never\n" % (len(wanted), len(seen), len(never)))
for t in sorted(seen, key=lambda t: -seen[t][0]):
    calls, last = seen[t]
    print("  %5d  %-34s last %s" % (calls, t, last))
print("\nNEVER CALLED — most of these SHOULD be zero; look for an asymmetry,")
print("not for a long list (see the header of this script):")
for t in never:
    print("      -  " + t)
'
SELECT tool, COUNT(*) AS calls, MAX(created_at) AS last
FROM tool_call_log
WHERE tool IN ($IN_LIST) $WINDOW
GROUP BY tool
SQL
