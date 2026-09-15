# scripts/ops — the operator capabilities, and where the line is

These three scripts exist so that a permission can be attached to a **named,
readable capability** instead of to "any HTTP request". Each one can reach
exactly what is written in it, and the file is in git where anyone can read it.

| script | what it can do | can it change anything? |
|---|---|---|
| `box.sh` | read / post / mark-read on the tester's handoff box | writes MESSAGES, to two people |
| `ro.sh` | one SELECT against production | no — the server refuses anything else |
| `logs.sh` | Railway deployment list and logs | no — queries only, never mutations |

`ro.sh` being read-only is not a promise this script makes. It is a property of
`/internal/ro-sql`, which runs on a read-only connection and refuses anything
but a single SELECT. The script cannot lie about that.

`logs.sh` sends GraphQL **queries** only. Changing an environment variable is a
`variableUpsert` mutation and is deliberately NOT in here — see below.

## Secrets

Outside the repo, in `$NETAI_OPS_DIR` (default `~/.netai-ops`, mode 700):

```
.admin          two lines: admin email, admin password
.admin_token    bearer token, 8h; box.sh re-mints it from .admin on a 401
.ro_key         key for /internal/ro-sql
.railway_token  Railway project access token
```

Nothing here is committed and nothing here belongs in the repo. The container
is ephemeral, so these are re-created each session — `box.sh` recovers the
token by itself; the other two must be supplied.

## Where the line is, and why it is there

`.claude/settings.json` allows these three scripts, the test and lint commands,
and git. It does **not** allow raw `curl`, so anything not on this list still
asks.

That split is not squeamishness, it is the day of 15 September 2026:

- **Writing to people is free.** Answering the tester, telling the frontend
  what shipped — waiting for permission to send a message helps nobody and
  slows the work. That is what `box.sh` is for.
- **Changing data and opening access are not.** On one day: retracting five
  facts about five real people, opening one account's read access to other
  people's private conversations, and a switch that spends money on every
  search. Each of those was right to stop for, and each was a single line of
  someone's explicit yes.

So the rule is the shape of the risk, not the effort:

> A message can be corrected by another message.
> A retraction, an access grant and a spend cannot.

Anything in the second class keeps asking, and keeps a row in
`ADMIN_WRITE_OPERATIONS.md` with the route, the body, and the undo.
