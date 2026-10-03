import { query } from '../../db/postgres/client';

/** A one-row existence check on an indexed column; the greeting turn waits on it. */
const HAS_CONTACT_TIMEOUT_MS = 3_000;

export async function getContactCount(userId: string): Promise<object> {
  const result = await query<{ count: string }>(
    `SELECT COUNT(DISTINCT phone) AS count FROM "UserAlias" WHERE "contactId" = $1`,
    [userId],
  );
  return { count: Number(result.rows[0]?.count ?? 0) };
}

/** Whether the owner's phonebook holds at least one contact. */
export async function hasAnyContact(userId: string): Promise<boolean> {
  const result = await query<{ one: number }>(
    `SELECT 1 AS one FROM "UserAlias" WHERE "contactId" = $1 LIMIT 1`,
    [userId],
    HAS_CONTACT_TIMEOUT_MS,
  );
  return result.rows.length > 0;
}
