import { query } from '../db/postgres/client';

export async function markContactDeceased(userId: string, phone: string): Promise<void> {
  await query(
    `INSERT INTO "ContactDeceased" ("userId", phone, "createdAt")
     VALUES ($1, $2, NOW())
     ON CONFLICT ("userId", phone) DO NOTHING`,
    [userId, phone],
  );
}

export async function getDeceasedPhones(userId: string): Promise<string[]> {
  const result = await query<{ phone: string }>(
    `SELECT phone FROM "ContactDeceased" WHERE "userId" = $1`,
    [userId],
  );
  return result.rows.map((r) => r.phone);
}
