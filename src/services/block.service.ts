import { query } from '../db/postgres/client';
import { normalizePhone } from './phone';

export async function blockContact(userId: string, phone: string): Promise<void> {
  await query(
    `INSERT INTO "UserBlock" ("blockerId", "blockedPhone", "createdAt", "updatedAt")
     VALUES ($1, $2, NOW(), NOW())
     ON CONFLICT ("blockerId", "blockedPhone") DO NOTHING`,
    [userId, normalizePhone(phone)],
  );
}

export async function unblockContact(userId: string, phone: string): Promise<void> {
  // Delete both the canonical row and any legacy raw-format row.
  await query(`DELETE FROM "UserBlock" WHERE "blockerId" = $1 AND "blockedPhone" IN ($2, $3)`, [
    userId,
    normalizePhone(phone),
    phone,
  ]);
}

export interface BlockedContact {
  phone: string;
  name: string | null;
}

/**
 * Contacts THIS user has blocked (one-directional — does not include users who
 * blocked them). Resolves a display name: the user's own alias for the contact,
 * falling back to the registered user's name.
 */
export async function getBlockedByUser(userId: string): Promise<BlockedContact[]> {
  const result = await query<{ phone: string; name: string | null }>(
    `SELECT ub."blockedPhone"          AS phone,
            COALESCE(ua.alias, u.name) AS name
     FROM "UserBlock" ub
     LEFT JOIN "UserAlias" ua ON ua.phone = ub."blockedPhone" AND ua."contactId" = ub."blockerId"
     LEFT JOIN "UserPhone" up ON up.phone = ub."blockedPhone"
     LEFT JOIN "User"       u ON u.id     = up."userId"
     WHERE ub."blockerId" = $1`,
    [userId],
  );
  return result.rows.map((r) => ({ phone: r.phone, name: r.name ?? null }));
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

/**
 * Excluded phones as a normalized Set, for format-independent comparison.
 * Callers normalize each candidate phone with normalizePhone() before checking
 * membership — so "+995…", "995…" and a bare local number all match.
 */
export async function getExcludedPhoneSet(userId: string): Promise<Set<string>> {
  const phones = await getExcludedPhones(userId);
  return new Set(phones.map((p) => normalizePhone(p)));
}
