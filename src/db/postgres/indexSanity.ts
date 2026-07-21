import { query } from './client';

// Indexes every hot search path depends on. The prod database predates the
// migration runner (it is shared with the old app), so its _migrations baseline
// can claim a file ran while the object is actually missing — exactly how
// idx_user_alias_trgm was absent for months and alias search seq-scanned into
// timeouts. This check can't fix drift, but it makes it loud at every deploy
// instead of silent until a tester hits it.
const CRITICAL_INDEXES: readonly string[] = [
  'idx_user_alias_trgm', // alias LIKE candidates (searchByTag / searchContactByName)
  'idx_user_tags_norm_trgm', // normalized fuzzy tag pass
  'idx_user_alias_contact', // the "mine" CTE owner filter
  'idx_user_tags_contact', // the "mine" CTE owner filter
  'idx_user_alias_phone', // invite gate / phone lookups
];

const CHECK_TIMEOUT_MS = 5_000;

/** Warn loudly (never throw) when a search-critical index is missing or invalid. */
export async function checkCriticalIndexes(): Promise<void> {
  try {
    const result = await query<{ relname: string; indisvalid: boolean }>(
      `SELECT c.relname, i.indisvalid
       FROM pg_class c
       JOIN pg_index i ON i.indexrelid = c.oid
       WHERE c.relname = ANY($1)`,
      [CRITICAL_INDEXES],
      CHECK_TIMEOUT_MS,
    );
    const valid = new Set(result.rows.filter((r) => r.indisvalid).map((r) => r.relname));
    const missing = CRITICAL_INDEXES.filter((name) => !valid.has(name));
    if (missing.length > 0) {
      // eslint-disable-next-line no-console
      console.error(
        `[index-sanity] MISSING/INVALID search-critical index(es): ${missing.join(', ')} — ` +
          'searches will seq-scan and may time out. Rebuild with CREATE INDEX CONCURRENTLY ' +
          '(see migrations 004/027/028/036).',
      );
    }
  } catch (err) {
    // Diagnostics must never block startup.
    // eslint-disable-next-line no-console
    console.error('[index-sanity] check failed:', (err as Error).message);
  }
}
