import { backgroundQuery } from '../db/postgres/client';

/**
 * ROW 278 — THE SECOND HALF OF MIGRATION 184, RUN ON THE FOUNDER'S WORD.
 *
 * Migration 184 teaches `normalize_search_token` to fold Georgian capitals
 * (Mtavruli). PostgreSQL does not re-evaluate an expression index when its
 * function changes, so until each index built on the function is rebuilt it
 * holds the OLD output while every query computes the new one. The rebuild has
 * to follow the function, and it cannot live in the migration: CONCURRENTLY is
 * illegal inside the runner's transaction, and a plain REINDEX would lock
 * writes on twenty-one million rows during a deploy.
 *
 * THREE indexes, not the two the migration's comment names. Measured on the
 * live base before running: `idx_user_name_norm_trgm` on "User".name is built
 * on the same function and would have been left holding the old output.
 *
 * Misho, 30 September: „3 — გაუშვი ახლავე". Registered as §70 first (D44).
 */

export const NORMALIZED_INDEXES: readonly string[] = [
  'idx_user_name_norm_trgm',
  'idx_user_alias_norm_trgm',
  'idx_user_tags_norm_trgm',
];

/** One rebuild of twenty-one million rows can take many minutes; this bounds a stuck one. */
const REINDEX_TIMEOUT_MS = 45 * 60 * 1000;
const CHECK_TIMEOUT_MS = 5_000;

/** A letter only the folding version of the function contains. */
const FOLD_MARK = 'Ა';

export type RebuildRefusal = 'already_running' | 'function_not_folding';

export interface RebuildStart {
  readonly started: true;
  readonly indexes: readonly string[];
}

let rebuildInFlight = false;

/** Has migration 184 reached the live function? Rebuilding before it would rebuild the old output. */
async function functionFoldsCapitals(): Promise<boolean> {
  const result = await backgroundQuery<{ def: string }>(
    `SELECT pg_get_functiondef('normalize_search_token(text)'::regprocedure) AS def`,
    [],
    CHECK_TIMEOUT_MS,
  );
  return (result.rows[0]?.def ?? '').includes(FOLD_MARK);
}

async function rebuildOne(index: string): Promise<void> {
  const startedAt = Date.now();
  // The name comes from the fixed list above, never from a request.
  await backgroundQuery(`REINDEX INDEX CONCURRENTLY ${index}`, [], REINDEX_TIMEOUT_MS);
  // eslint-disable-next-line no-console
  console.log(`[search-index] rebuilt ${index} in ${Date.now() - startedAt} ms`);
}

async function rebuildAll(): Promise<void> {
  try {
    for (const index of NORMALIZED_INDEXES) {
      await rebuildOne(index);
    }
    // eslint-disable-next-line no-console
    console.log('[search-index] all normalized indexes rebuilt');
  } catch (err) {
    // A failed CONCURRENTLY leaves an invalid `<name>_ccnew` index behind, which
    // must be dropped by hand before a retry — so the failure is named loudly.
    // eslint-disable-next-line no-console
    console.error(
      '[search-index] rebuild FAILED — check pg_index for an invalid *_ccnew index:',
      (err as Error).message,
    );
  } finally {
    rebuildInFlight = false;
  }
}

/** Starts the rebuild in the background and answers at once; progress is in the log. */
export async function startSearchIndexRebuild(): Promise<RebuildStart | RebuildRefusal> {
  if (rebuildInFlight) return 'already_running';
  if (!(await functionFoldsCapitals())) return 'function_not_folding';
  rebuildInFlight = true;
  void rebuildAll();
  return { started: true, indexes: NORMALIZED_INDEXES };
}
