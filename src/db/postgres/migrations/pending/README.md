# Migrations that must NOT run on their own

`runMigrations` reads this directory's PARENT and applies every `.sql` file it
finds there, in one transaction, on every boot. `readdir` is not recursive and
the filter is `.endsWith('.sql')`, so a file in here is never picked up.

That is the whole purpose of this folder: **a migration lives here when
deploying it alone would be wrong**, and moving it up one level is the act of
scheduling it.

## Why a migration would ever be in that position

A migration that changes a function used by an expression index cannot be
deployed by itself. PostgreSQL does not re-evaluate a functional index when the
function changes — it cannot know — so between the deploy and the REINDEX the
index holds one function's output while every query computes another's. For the
rows that differ, search silently stops matching, and it stops matching in the
direction that reads as "the fix made it worse".

The REINDEX cannot go in the migration either: `CONCURRENTLY` is illegal inside
a transaction and `runMigrations` is one, and a non-concurrent rebuild would
lock writes across millions of rows during a deploy.

So the two halves are one operation performed by a person, off-peak, and this
folder is where the first half waits until the second can follow it.

## How to run one

1. Read the file. Every one in here states which indexes it invalidates and the
   exact commands, in order.
2. Run the `REINDEX INDEX CONCURRENTLY` commands it names, one at a time, and
   wait for each.
3. `git mv` the file up one level. The next deploy applies it.

Steps 2 and 3 in the other order is the failure this folder exists to prevent.
