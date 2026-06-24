import { query } from '../../db/postgres/client';

export async function getContactCount(userId: string): Promise<object> {
  const result = await query<{ count: string }>(
    `SELECT COUNT(DISTINCT phone) AS count FROM "UserAlias" WHERE "contactId" = $1`,
    [userId],
  );
  return { count: Number(result.rows[0]?.count ?? 0) };
}
