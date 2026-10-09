"""Build the few tables `malformed.ts` needs, FROM THIS REPO'S OWN DDL.

⚠️ NOTHING HERE IS HAND-WRITTEN SQL, and that is the point. A schema I typed
from memory would prove a property of my memory. This walks the migration
files in order and applies every CREATE TABLE / ALTER TABLE / CREATE INDEX
that names one of the wanted tables, so the column types under test — `tasks.id`
is INTEGER, `user_profile_kv.key` and `.value` are TEXT NOT NULL under a UNIQUE
(user_id, key) — are the live ones or the run is wrong in a way that shows.

WHY NOT SIMPLY RUN THE MIGRATIONS. Because they cannot be run on an empty
database, which is itself worth writing down:

  * the legacy Ally tables — "User", "UserAlias", "UserTags" — have no DDL in
    this repo at all. The netai migrations index and reference them.
  * `contact_insights.sql` carries no number, so `readdir().sort()` puts it
    AFTER every numbered file — and `016_fix_contact_insights_user_id.sql`
    alters the table it creates. On the live database that never mattered,
    because the table was already there when 016 ran. On a fresh one the
    ordering is simply broken.
  * that same file references a lowercase `users` table with a UUID id, which
    is a third schema generation that no longer exists.

So „apply all migrations to a clean database" is not a thing this repo can do
today. That is a real finding and not this script's job to fix; it is recorded
here because the next person will reach for it and find out the slow way.
"""

import os
import re
import subprocess
import sys

MIGRATIONS = os.path.join(os.path.dirname(__file__), '..', '..', 'src', 'db', 'postgres', 'migrations')

# The tables the malformed-input guards actually touch. Anything wider drags in
# the legacy schema and stops being reproducible.
WANTED = re.compile(r'\b(tasks|task_asks|user_profile_kv|contact_facts|goal_feedback|pending_updates|threads|introduction_requests)\b')
DDL = re.compile(r'^\s*(CREATE TABLE|ALTER TABLE|CREATE INDEX|CREATE UNIQUE INDEX)', re.IGNORECASE)


def psql(statement: str, port: str, database: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        ['psql', '-h', '/tmp', '-p', port, '-U', 'netai', '-d', database,
         '-v', 'ON_ERROR_STOP=1', '-qc', statement],
        capture_output=True, text=True)


def main() -> int:
    port, database = sys.argv[1], sys.argv[2]
    applied, skipped = 0, []

    for name in sorted(f for f in os.listdir(MIGRATIONS) if f.endswith('.sql')):
        with open(os.path.join(MIGRATIONS, name), encoding='utf8') as handle:
            text = handle.read()
        # Comment lines are dropped first: a table named only in prose is not a
        # statement about it, and several migrations discuss tables they do not
        # touch.
        body = '\n'.join(l for l in text.split('\n') if not l.strip().startswith('--'))
        for statement in body.split(';'):
            if not DDL.match(statement) or not WANTED.search(statement):
                continue
            result = psql(statement + ';', port, database)
            if result.returncode == 0:
                applied += 1
            else:
                skipped.append((name, result.stderr.strip().split('\n')[0]))

    print('schema: %d statement(s) applied from the repo\'s own migrations' % applied)
    for name, err in skipped:
        print('schema: SKIPPED %s — %s' % (name, err[:120]))
    # A skipped statement is not fatal — some ALTERs depend on legacy tables —
    # but it is never silent, because a missing NOT NULL is exactly what would
    # make this whole run agree with a broken guard.
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
