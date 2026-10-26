import { PoolClient } from 'pg';
import { query, withTransaction } from '../db/postgres/client';

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

/**
 * #7761 (26 Oct): Giorgi's account came back, but signing in with his number
 * still opened an empty one. The deletion outside Netai had also rewritten his
 * number as „<number>_DELETED_<n>", and sign-in matches digits only; minutes
 * later the old Ally app registered the bare number as a new, empty account.
 * The number goes back to the restored account. An account that took it in
 * between is retired only when it never used Netai (no thread, no message);
 * otherwise nothing is changed and the conflict is reported.
 */
const DELETED_SUFFIX_RE = /_DELETED_\d+$/u;

export enum PhoneRepair {
  Repaired = 'repaired',
  NothingToRepair = 'nothing_to_repair',
  NumberInUse = 'number_in_use',
}

export interface PhoneRepairResult {
  readonly outcome: PhoneRepair;
  readonly retired_user_id: number | null;
}

interface TombstonedPhone {
  readonly id: number;
  readonly phone: string;
}

interface Holder {
  readonly user_id: number;
  readonly used_netai: boolean;
}

async function tombstonedPhoneOf(
  client: PoolClient,
  userId: number,
): Promise<TombstonedPhone | null> {
  const result = await client.query<TombstonedPhone>(
    `SELECT id, phone FROM "UserPhone" WHERE "userId" = $1 AND phone ~ '_DELETED_[0-9]+$' LIMIT 1`,
    [userId],
  );
  return result.rows[0] ?? null;
}

async function holderOf(
  client: PoolClient,
  realPhone: string,
  userId: number,
): Promise<Holder | null> {
  const result = await client.query<Holder>(
    `SELECT up."userId" AS user_id,
            (EXISTS (SELECT 1 FROM threads t WHERE t.user_id = up."userId")
             OR EXISTS (SELECT 1 FROM conversations c
                         WHERE c.user_id = up."userId" AND c.role = 'user')) AS used_netai
       FROM "UserPhone" up JOIN "User" u ON u.id = up."userId"
      WHERE up.phone = $1 AND up."userId" <> $2 AND u."deletedAt" IS NULL
      LIMIT 1`,
    [realPhone, userId],
  );
  return result.rows[0] ?? null;
}

/** The restored account gets its number back; an empty account that took it is retired. */
export async function repairRestoredPhone(
  userId: number,
  dryRun: boolean,
): Promise<PhoneRepairResult> {
  return withTransaction(async (client) => {
    await client.query(`SET LOCAL statement_timeout = ${RESTORE_TIMEOUT_MS}`);
    const tomb = await tombstonedPhoneOf(client, userId);
    if (tomb === null) return { outcome: PhoneRepair.NothingToRepair, retired_user_id: null };
    const realPhone = tomb.phone.replace(DELETED_SUFFIX_RE, '');
    const holder = await holderOf(client, realPhone, userId);
    if (holder?.used_netai) return { outcome: PhoneRepair.NumberInUse, retired_user_id: null };
    if (dryRun) return { outcome: PhoneRepair.Repaired, retired_user_id: holder?.user_id ?? null };
    if (holder !== null) {
      await client.query(
        `UPDATE "UserPhone" SET phone = phone || '_MERGED_' || $2::text, "updatedAt" = NOW()
          WHERE "userId" = $1 AND phone = $3`,
        [holder.user_id, userId, realPhone],
      );
      await client.query(
        `UPDATE "User" SET "deletedAt" = NOW(), "updatedAt" = NOW() WHERE id = $1`,
        [holder.user_id],
      );
    }
    await client.query(`UPDATE "UserPhone" SET phone = $2, "updatedAt" = NOW() WHERE id = $1`, [
      tomb.id,
      realPhone,
    ]);
    return { outcome: PhoneRepair.Repaired, retired_user_id: holder?.user_id ?? null };
  });
}
