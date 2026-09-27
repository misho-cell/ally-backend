#!/bin/bash
# „Can a tool call with a MISSING field reach the database?" — asked by running
# it against a real one, because that is the only place the answer lives.
#
# EXIT CODE IS THE ANSWER: 0 = every guard answered as documented. 1 = one or
# more did not, read them. 2 = could not look. „I could not look" is never
# reported as „nothing is wrong".
#
# ════════ WHY THIS EXISTS — 27 SEPTEMBER ════════
#
# Six of the night's nineteen verification items are guards on a tool call that
# arrives with a field missing, and NOBODY COULD TEST THEM. The tester cannot:
# driving a conversation will not make the model omit a required field, and
# calling the tools directly on a seat is refused by their own session's
# permission check. The unit tests cannot either, in the way that matters —
# what broke was `Number(undefined)` -> `NaN` -> `pg` sending the STRING „NaN"
# -> Postgres raising `invalid input syntax for type integer`, and every step of
# that is in the driver and the database. A test with a mocked `query` asserts
# that a function returned `false`, which it would also do if the guard were
# wrong and the crash were still sitting behind it.
#
# So: a throwaway Postgres, the tables built from this repo's own migration
# DDL, and the shipped functions run against it — twice per item. The raw query
# with the same malformed value, which must THROW, because that is what proves
# the bug was real rather than remembered; then the shipped function, which must
# answer and not throw. And the POSITIVE case each time, on a row that exists,
# because a guard that refuses everything is the same bug from the other side
# and the easier one to ship by accident.
#
# ════════ IT CANNOT REACH THE LIVE DATABASE ════════
#
# Not „it is careful not to" — it cannot. The service reads POSTGRES_HOST,
# PORT, DB, NAME and PASS; this container has none of them set and carries no
# `.env`; and the line at the bottom sets them to a unix socket in /tmp. There
# is no code path from here to Railway's credentials, which this container
# deliberately never reads.
#
# The other credentials in the import graph — Anthropic, Neo4j, WhatsApp — come
# from `src/test/setup.ts`, which jest loads for every run and which sets them
# to obvious placeholders. They exist only because those modules refuse to LOAD
# without them; every guard under test answers before any of them is used, and
# a call that somehow escaped would fail loudly on a bad credential rather than
# quietly reach something real.
#
# ════════ WHAT IT DOES NOT PROVE, SAID BEFORE ANYBODY ASKS ════════
#
# There is no model, no live database and no person in this. It cannot tell you
# that the tool wrapper passes the field through, and it cannot tell you what
# somebody sees on a screen. On the morning of this same day a „fix" of mine
# guarded a function that is never called, eleven tests went green, and two
# people were told it was done. GREEN HERE IS NOT THAT KIND OF GREEN EITHER:
# it is the half a conversation could never reach, and it is not the whole.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
PORT=55432
DATA=/var/lib/postgresql/netai-verify
DB=netai_verify
PG=/usr/lib/postgresql/16/bin

[ -x "$PG/initdb" ] || { echo "malformed.sh: no local Postgres at $PG — cannot look." >&2; exit 2; }
id postgres >/dev/null 2>&1 || { echo "malformed.sh: no postgres user — cannot look." >&2; exit 2; }

stop() { su postgres -c "$PG/pg_ctl -D $DATA -m immediate stop" >/dev/null 2>&1 || true; }
trap stop EXIT

stop
rm -rf "$DATA"
mkdir -p "$DATA"
chown postgres:postgres "$DATA"
chmod 700 "$DATA"

# `--auth=trust` on a unix socket in a container that exists for the length of
# this script. There is nothing in this database but the rows the next command
# writes.
su postgres -c "$PG/initdb -D $DATA -U netai --auth=trust -E UTF8" >/dev/null 2>&1 \
  || { echo "malformed.sh: initdb failed — cannot look." >&2; exit 2; }
su postgres -c "$PG/pg_ctl -D $DATA -o '-p $PORT -k /tmp' -l $DATA/log start" >/dev/null 2>&1 \
  || { echo "malformed.sh: the database did not start — cannot look." >&2; exit 2; }

for _ in 1 2 3 4 5 6 7 8 9 10; do
  psql -h /tmp -p "$PORT" -U netai -d postgres -qc 'SELECT 1' >/dev/null 2>&1 && break
  sleep 1
done
psql -h /tmp -p "$PORT" -U netai -d postgres -qc "CREATE DATABASE $DB;" >/dev/null 2>&1 \
  || { echo "malformed.sh: could not create the database — cannot look." >&2; exit 2; }

python3 "$HERE/malformed_schema.py" "$PORT" "$DB" || { echo "malformed.sh: schema build failed." >&2; exit 2; }

# The assertions live in a TEST FILE, not in this script — same `PG_INTEGRATION`
# convention `searchPg.integration.test.ts` already uses, so they run with the
# suite rather than beside it. All this does is stand up the database the
# convention needs and that nothing else in the repo provides. The placeholder
# credentials come from `src/test/setup.ts`, which jest loads for every run.
cd "$ROOT"
PG_INTEGRATION=1 \
POSTGRES_HOST=/tmp \
POSTGRES_PORT="$PORT" \
POSTGRES_DB="$DB" \
POSTGRES_NAME=netai \
POSTGRES_PASS= \
  npx jest aMissingFieldCannotReachTheDatabase --silent=false
