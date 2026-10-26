import { query } from '../db/postgres/client';

/**
 * Giorgi's account, 26 Oct (Misho's yes): marked deleted on 20 Oct by
 * something outside Netai's own erasure — no erasure_log row, name, number and
 * 47 conversations intact — so every login opened an empty app and a fresh
 * sign-up was refused as „number already registered".
 *
 * Restoring clears deletedAt and nothing else. An account that went through
 * Netai's erasure is never restored: its data is gone, and the person asked.
 */
const RESTORE_TIMEOUT_MS = 5_000;

export enum RestoreOutcome {
  Restored = 'restored',
  NotFound = 'not_found',
  NotDeleted = 'not_deleted',
  Erased = 'erased',
}

export async function restoreDeletedAccount(userId: number): Promise<RestoreOutcome> {
  const found = await query<{ deleted: boolean; erased: boolean }>(
    `SELECT u."deletedAt" IS NOT NULL AS deleted,
            EXISTS (SELECT 1 FROM erasure_log e WHERE e.user_id = u.id) AS erased
       FROM "User" u WHERE u.id = $1 LIMIT 1`,
    [userId],
    RESTORE_TIMEOUT_MS,
  );
  const row = found.rows[0];
  if (!row) return RestoreOutcome.NotFound;
  if (row.erased) return RestoreOutcome.Erased;
  if (!row.deleted) return RestoreOutcome.NotDeleted;
  await query(
    `UPDATE "User" SET "deletedAt" = NULL, "updatedAt" = NOW()
      WHERE id = $1 AND "deletedAt" IS NOT NULL`,
    [userId],
    RESTORE_TIMEOUT_MS,
  );
  return RestoreOutcome.Restored;
}
