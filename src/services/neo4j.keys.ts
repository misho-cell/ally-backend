import { query } from '../db/postgres/client';

export function buildCompositeKey(phones: readonly string[]): string {
  if (phones.length === 0) throw new Error('Cannot build composite key from empty phones array');
  return [...phones].sort().join('-');
}

export async function getCompositeKeysForUsers(
  userIds: readonly number[],
): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  if (userIds.length === 0) return map;

  const result = await query<{ user_id: number; composite_key: string }>(
    `SELECT "userId" AS user_id,
            STRING_AGG(phone, '-' ORDER BY phone) AS composite_key
     FROM "UserPhone"
     WHERE "userId" = ANY($1)
     GROUP BY "userId"`,
    [userIds],
  );

  for (const row of result.rows) {
    map.set(Number(row.user_id), row.composite_key);
  }
  return map;
}

export async function getCompositeKeyForUser(userId: number): Promise<string> {
  const map = await getCompositeKeysForUsers([userId]);
  const key = map.get(userId);
  if (!key) throw new Error(`No phones found for userId ${userId}`);
  return key;
}

export async function getCompositeKeysForPhones(
  phones: readonly string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (phones.length === 0) return map;

  const registered = await query<{ phone: string; user_id: number }>(
    'SELECT phone, "userId" AS user_id FROM "UserPhone" WHERE phone = ANY($1)',
    [phones],
  );

  const userIds = [...new Set(registered.rows.map((r) => Number(r.user_id)))];
  const userKeys = await getCompositeKeysForUsers(userIds);
  const phoneToUserId = new Map(registered.rows.map((r) => [r.phone, Number(r.user_id)]));

  for (const phone of phones) {
    const userId = phoneToUserId.get(phone);
    if (userId !== undefined) {
      const key = userKeys.get(userId);
      if (key) {
        map.set(phone, key);
        continue;
      }
    }
    map.set(phone, phone);
  }

  return map;
}

export async function getCompositeKeyForPhone(phone: string): Promise<string> {
  const map = await getCompositeKeysForPhones([phone]);
  return map.get(phone) ?? phone;
}
