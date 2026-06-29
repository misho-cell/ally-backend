import { query } from '../db/postgres/client';

export async function blockContact(userId: string, phone: string): Promise<void> {
  await query(
    `INSERT INTO "UserBlock" ("blockerId", "blockedPhone", "createdAt", "updatedAt")
     VALUES ($1, $2, NOW(), NOW())
     ON CONFLICT ("blockerId", "blockedPhone") DO NOTHING`,
    [userId, phone],
  );
}

export async function unblockContact(userId: string, phone: string): Promise<void> {
  await query(`DELETE FROM "UserBlock" WHERE "blockerId" = $1 AND "blockedPhone" = $2`, [
    userId,
    phone,
  ]);
}

export async function getBlockedByUser(userId: string): Promise<string[]> {
  const result = await query<{ phone: string }>(
    `SELECT "blockedPhone" AS phone FROM "UserBlock" WHERE "blockerId" = $1`,
    [userId],
  );
  return result.rows.map((r) => r.phone);
}

/**
 * Returns every phone that must be hidden from this user's search results:
 * phones the user has blocked + all phones of users who have blocked the user.
 */
export async function getBlockedPhones(userId: string): Promise<string[]> {
  const result = await query<{ phone: string }>(
    `SELECT "blockedPhone" AS phone
     FROM "UserBlock"
     WHERE "blockerId" = $1

     UNION

     SELECT up2.phone
     FROM "UserPhone"  up_me
     JOIN "UserBlock"  ub   ON ub."blockedPhone" = up_me.phone
     JOIN "UserPhone"  up2  ON up2."userId"      = ub."blockerId"
     WHERE up_me."userId" = $1`,
    [userId],
  );
  return result.rows.map((r) => r.phone);
}

/**
 * Every phone that must be hidden from this user's search results:
 * blocked phones (both directions) plus contacts the user marked as deceased.
 */
export async function getExcludedPhones(userId: string): Promise<string[]> {
  const result = await query<{ phone: string }>(
    `SELECT "blockedPhone" AS phone
     FROM "UserBlock"
     WHERE "blockerId" = $1

     UNION

     SELECT up2.phone
     FROM "UserPhone"  up_me
     JOIN "UserBlock"  ub   ON ub."blockedPhone" = up_me.phone
     JOIN "UserPhone"  up2  ON up2."userId"      = ub."blockerId"
     WHERE up_me."userId" = $1

     UNION

     SELECT phone
     FROM "ContactDeceased"
     WHERE "userId" = $1`,
    [userId],
  );
  return result.rows.map((r) => r.phone);
}
